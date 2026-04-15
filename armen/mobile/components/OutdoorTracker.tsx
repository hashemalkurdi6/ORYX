/**
 * OutdoorTracker — full-screen modal for GPS outdoor activity tracking.
 *
 * State machine:
 *   permission_check → type_select → ready → tracking → paused → summary
 *
 * Map: Leaflet.js + OpenStreetMap (Carto Dark tiles) via react-native-webview.
 * Works in Expo Go with no API key required.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import {
  createTracker,
  requestLocationPermission,
  checkLocationPermission,
  LocationPoint,
  Tracker,
} from '@/services/locationTracking';
import {
  buildSummary,
  ActivitySummary,
  formatDuration,
  formatDistance,
  formatPace,
  formatSpeed,
  LatLng,
} from '@/services/activityMetrics';

// ── Types ─────────────────────────────────────────────────────────────────────

type TrackingScreen =
  | 'permission_check'
  | 'type_select'
  | 'ready'
  | 'tracking'
  | 'paused'
  | 'summary';

interface OutdoorActivityType {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  unit: 'pace' | 'speed';
}

const OUTDOOR_TYPES: OutdoorActivityType[] = [
  { id: 'running',  label: 'Running',  icon: 'body-outline',       unit: 'pace' },
  { id: 'jogging',  label: 'Jogging',  icon: 'walk-outline',       unit: 'pace' },
  { id: 'walking',  label: 'Walking',  icon: 'footsteps-outline',  unit: 'pace' },
  { id: 'hiking',   label: 'Hiking',   icon: 'trail-sign-outline', unit: 'pace' },
  { id: 'cycling',  label: 'Cycling',  icon: 'bicycle-outline',    unit: 'speed' },
];

export interface SavedOutdoorActivity {
  activityType: string;
  durationS: number;
  distanceM: number;
  calories: number;
  elevationGainM: number;
  summary: ActivitySummary;
  routePoints: LatLng[];
  startTime: Date;
  endTime: Date;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSave: (activity: SavedOutdoorActivity) => void;
}

const { width: SW } = Dimensions.get('window');

// ── Leaflet HTML builder ──────────────────────────────────────────────────────

/**
 * liveMode = true  → map starts empty, route is extended via injectJavaScript
 * liveMode = false → all points are baked in, map fits the full route
 */
function buildLeafletHtml(points: LatLng[], liveMode: boolean): string {
  const coordsJson = JSON.stringify(
    points.map((p) => [p.latitude, p.longitude]),
  );
  const initialCenter =
    points.length > 0
      ? `[${points[points.length - 1].latitude}, ${points[points.length - 1].longitude}]`
      : '[0, 0]';
  const initialZoom = points.length > 0 ? 16 : 2;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #0a0a0a; width: 100%; height: 100%; }
    #map { width: 100%; height: 100%; }
    .leaflet-control-attribution { display: none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false });
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(map);

    var coords = ${coordsJson};
    var polyline = L.polyline(coords, {
      color: '#27ae60', weight: 5, opacity: 0.95,
      lineCap: 'round', lineJoin: 'round'
    }).addTo(map);

    ${liveMode ? `
      map.setView(${initialCenter}, ${initialZoom});

      var dotIcon = L.divIcon({
        className: '',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#27ae60;border:3px solid #0a0a0a;box-shadow:0 0 6px #27ae60;"></div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      });
      var dot = null;

      function addPoint(lat, lng) {
        coords.push([lat, lng]);
        polyline.setLatLngs(coords);
        map.panTo([lat, lng], { animate: true, duration: 0.5 });
        if (dot) { map.removeLayer(dot); }
        dot = L.marker([lat, lng], { icon: dotIcon }).addTo(map);
      }

      document.addEventListener('message', function(e) {
        try { var d = JSON.parse(e.data); if (d.lat) addPoint(d.lat, d.lng); } catch(ex){}
      });
      window.addEventListener('message', function(e) {
        try { var d = JSON.parse(e.data); if (d.lat) addPoint(d.lat, d.lng); } catch(ex){}
      });
    ` : `
      var startIcon = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#27ae60;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:800;">S</div>',
        iconSize: [18, 18], iconAnchor: [9, 9]
      });
      var endIcon = L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#c0392b;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:800;">F</div>',
        iconSize: [18, 18], iconAnchor: [9, 9]
      });

      if (coords.length > 0) {
        L.marker(coords[0], { icon: startIcon }).addTo(map);
      }
      if (coords.length > 1) {
        L.marker(coords[coords.length - 1], { icon: endIcon }).addTo(map);
        map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
      } else if (coords.length === 1) {
        map.setView(coords[0], 16);
      } else {
        map.setView([0, 0], 2);
      }
    `}
  </script>
</body>
</html>`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OutdoorTracker({ visible, onClose, onSave }: Props) {
  const { theme: t } = useTheme();
  const s = styles(t);

  const [screen, setScreen]             = useState<TrackingScreen>('permission_check');
  const [selectedType, setSelectedType] = useState<OutdoorActivityType>(OUTDOOR_TYPES[0]);
  const [elapsedS, setElapsedS]         = useState(0);
  const [routePoints, setRoutePoints]   = useState<LocationPoint[]>([]);
  const [liveMetrics, setLiveMetrics]   = useState({ distanceM: 0, paceOrSpeed: '--' });
  const [summary, setSummary]           = useState<ActivitySummary | null>(null);
  const [startTime, setStartTime]       = useState<Date>(new Date());
  const [gpsFix, setGpsFix]             = useState(false);

  const trackerRef   = useRef<Tracker | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveMapRef   = useRef<WebView | null>(null);

  // ── Permission check on open ──────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    checkLocationPermission().then((granted) => {
      setScreen(granted ? 'type_select' : 'permission_check');
    });
  }, [visible]);

  // ── Reset when closed ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) {
      stopTimer();
      trackerRef.current?.stop();
      trackerRef.current = null;
      setRoutePoints([]);
      setElapsedS(0);
      setLiveMetrics({ distanceM: 0, paceOrSpeed: '--' });
      setSummary(null);
      setGpsFix(false);
    }
  }, [visible]);

  // ── Timer ─────────────────────────────────────────────────────────────────

  const startTimer = () => {
    timerRef.current = setInterval(() => setElapsedS((v) => v + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // ── GPS point handler ─────────────────────────────────────────────────────

  const onNewPoint = useCallback(
    (point: LocationPoint) => {
      if (!gpsFix) setGpsFix(true);

      // Push point to live map via WebView message
      liveMapRef.current?.injectJavaScript(
        `addPoint(${point.latitude}, ${point.longitude}); true;`,
      );

      setRoutePoints((prev) => {
        const next = [...prev, point];

        if (next.length > 1) {
          const dist = next.reduce((acc, p, i) => {
            if (i === 0) return acc;
            const dlat = (p.latitude  - next[i - 1].latitude)  * 111320;
            const dlon = (p.longitude - next[i - 1].longitude) * 111320 *
              Math.cos((p.latitude * Math.PI) / 180);
            return acc + Math.sqrt(dlat * dlat + dlon * dlon);
          }, 0);

          setLiveMetrics(() => {
            const durationS = Math.max(1, elapsedS);
            let paceOrSpeed = '--';
            if (selectedType.unit === 'pace') {
              const secPerKm = (durationS / dist) * 1000;
              if (secPerKm > 0 && secPerKm < 1200) {
                const m = Math.floor(secPerKm / 60);
                const sec = Math.round(secPerKm % 60);
                paceOrSpeed = `${m}'${sec < 10 ? '0' : ''}${sec}"`;
              }
            } else {
              paceOrSpeed = `${((dist / durationS) * 3.6).toFixed(1)}`;
            }
            return { distanceM: dist, paceOrSpeed };
          });
        }

        return next;
      });
    },
    [elapsedS, selectedType.unit, gpsFix],
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleRequestPermission = async () => {
    const granted = await requestLocationPermission();
    if (granted) {
      setScreen('type_select');
    } else {
      Alert.alert(
        'Location Required',
        'ORYX needs location access to track outdoor activities. Please enable it in Settings.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleStartTracking = async () => {
    const tracker = createTracker(onNewPoint);
    trackerRef.current = tracker;
    try {
      await tracker.start();
      setStartTime(new Date());
      setElapsedS(0);
      setRoutePoints([]);
      setLiveMetrics({ distanceM: 0, paceOrSpeed: '--' });
      setGpsFix(false);
      startTimer();
      setScreen('tracking');
    } catch {
      Alert.alert('Error', 'Could not start GPS. Please ensure location is enabled.');
    }
  };

  const handlePause = () => {
    trackerRef.current?.pause();
    stopTimer();
    setScreen('paused');
  };

  const handleResume = () => {
    trackerRef.current?.resume();
    startTimer();
    setScreen('tracking');
  };

  const handleFinish = () => {
    const points = trackerRef.current?.stop() ?? [];
    stopTimer();
    trackerRef.current = null;

    if (points.length < 3) {
      Alert.alert(
        'Too Short',
        'Not enough GPS data. Track for at least 30 seconds outdoors.',
        [{ text: 'OK', onPress: () => setScreen('type_select') }],
      );
      return;
    }

    const actSummary = buildSummary(points, elapsedS, selectedType.id);
    setSummary(actSummary);
    setRoutePoints(points);
    setScreen('summary');
  };

  const handleSave = () => {
    if (!summary) return;
    onSave({
      activityType: selectedType.id,
      durationS: elapsedS,
      distanceM: summary.distanceM,
      calories: summary.calories,
      elevationGainM: summary.elevationGainM,
      summary,
      routePoints,
      startTime,
      endTime: new Date(),
    });
  };

  const handleDiscard = () => {
    Alert.alert(
      'Discard Activity',
      'Are you sure you want to discard this activity?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            setSummary(null);
            setRoutePoints([]);
            setElapsedS(0);
            setScreen('type_select');
          },
        },
      ],
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={s.root}>

        {/* ── Permission Screen ── */}
        {screen === 'permission_check' && (
          <View style={s.centeredScreen}>
            <Ionicons name="location-outline" size={64} color="#27ae60" style={{ marginBottom: 24 }} />
            <Text style={s.permTitle}>Location Access Needed</Text>
            <Text style={s.permBody}>
              ORYX needs access to your location to track outdoor runs, hikes, and rides in real time.
            </Text>
            <TouchableOpacity style={s.primaryBtn} onPress={handleRequestPermission}>
              <Text style={s.primaryBtnText}>Allow Location Access</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={onClose}>
              <Text style={s.ghostBtnText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Type Select Screen ── */}
        {screen === 'type_select' && (
          <View style={s.centeredScreen}>
            <View style={s.topBarRow}>
              <Text style={s.screenTitle}>Track Activity</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={24} color={t.text.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>ACTIVITY TYPE</Text>
            <View style={s.typeGrid}>
              {OUTDOOR_TYPES.map((type) => {
                const active = selectedType.id === type.id;
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[s.typeCard, active && s.typeCardActive]}
                    onPress={() => setSelectedType(type)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={type.icon} size={28} color={active ? '#27ae60' : t.text.secondary} />
                    <Text style={[s.typeLabel, active && s.typeLabelActive]}>{type.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 'auto' as any }]}
              onPress={() => setScreen('ready')}
            >
              <Ionicons name="navigate-outline" size={18} color="#0a0a0a" />
              <Text style={s.primaryBtnText}>  Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Ready Screen ── */}
        {screen === 'ready' && (
          <View style={s.centeredScreen}>
            <View style={s.topBarRow}>
              <TouchableOpacity onPress={() => setScreen('type_select')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={24} color={t.text.secondary} />
              </TouchableOpacity>
              <Text style={s.screenTitle}>{selectedType.label}</Text>
              <View style={{ width: 24 }} />
            </View>

            <View style={s.readyIconWrap}>
              <Ionicons name={selectedType.icon} size={72} color="#27ae60" />
            </View>

            <Text style={s.readyTitle}>Ready to go</Text>
            <Text style={s.readyBody}>
              Stand outside for best GPS accuracy. Once you tap Start, your route will be
              drawn live on the map and your distance and{' '}
              {selectedType.unit === 'pace' ? 'pace' : 'speed'} will update continuously.
            </Text>

            <View style={s.readyHints}>
              {[
                { icon: 'navigate-circle-outline' as const, text: 'GPS locks in ~5 seconds outdoors' },
                { icon: 'battery-half-outline'    as const, text: 'Keep screen on for best tracking' },
                { icon: 'wifi-outline'            as const, text: 'Map tiles need internet — GPS works offline' },
              ].map((hint, i) => (
                <View key={i} style={s.hintRow}>
                  <Ionicons name={hint.icon} size={16} color={t.text.muted} />
                  <Text style={s.hintText}>{hint.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s.startBtn} onPress={handleStartTracking}>
              <Ionicons name="play" size={24} color="#0a0a0a" />
              <Text style={s.startBtnText}>Start</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Tracking / Paused Screen ── */}
        {(screen === 'tracking' || screen === 'paused') && (
          <View style={s.trackingRoot}>
            {/* Live map */}
            <WebView
              ref={liveMapRef}
              style={s.map}
              source={{ html: buildLeafletHtml(routePoints, true) }}
              originWhitelist={['*']}
              javaScriptEnabled
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            />

            {/* Paused badge */}
            {screen === 'paused' && (
              <View style={s.pausedOverlay}>
                <Text style={s.pausedLabel}>PAUSED</Text>
              </View>
            )}

            {/* GPS acquiring badge */}
            {screen === 'tracking' && !gpsFix && (
              <View style={[s.pausedOverlay, { backgroundColor: 'rgba(39,174,96,0.85)' }]}>
                <Text style={s.pausedLabel}>ACQUIRING GPS…</Text>
              </View>
            )}

            {/* HUD */}
            <View style={s.hud}>
              <View style={s.timerRow}>
                <Text style={s.timerText}>{formatDuration(elapsedS)}</Text>
                <View style={[s.statusDot, {
                  backgroundColor: screen === 'tracking' ? '#27ae60' : '#e67e22',
                }]} />
              </View>

              <View style={s.statRow}>
                <View style={s.statCol}>
                  <Text style={s.statVal}>{formatDistance(liveMetrics.distanceM)}</Text>
                  <Text style={s.statLbl}>Distance</Text>
                </View>
                <View style={[s.statCol, s.statColCenter]}>
                  <Text style={s.statVal}>{liveMetrics.paceOrSpeed}</Text>
                  <Text style={s.statLbl}>
                    {selectedType.unit === 'pace' ? 'Avg Pace' : 'Avg km/h'}
                  </Text>
                </View>
                <View style={s.statCol}>
                  <Text style={s.statVal}>{selectedType.label}</Text>
                  <Text style={s.statLbl}>Type</Text>
                </View>
              </View>

              <View style={s.controlRow}>
                <TouchableOpacity style={s.finishBtn} onPress={handleFinish}>
                  <Ionicons name="stop" size={24} color="#c0392b" />
                </TouchableOpacity>
                {screen === 'tracking' ? (
                  <TouchableOpacity style={s.pauseBtn} onPress={handlePause}>
                    <Ionicons name="pause" size={32} color="#f0f0f0" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.pauseBtn} onPress={handleResume}>
                    <Ionicons name="play" size={32} color="#f0f0f0" />
                  </TouchableOpacity>
                )}
                <View style={{ width: 52 }} />
              </View>
            </View>
          </View>
        )}

        {/* ── Summary Screen ── */}
        {screen === 'summary' && summary && (
          <ScrollView style={s.summaryScroll} contentContainerStyle={s.summaryContent}>

            {/* Route map */}
            {routePoints.length > 0 && (
              <View style={s.summaryMapWrap}>
                <WebView
                  style={{ flex: 1 }}
                  source={{ html: buildLeafletHtml(routePoints, false) }}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {/* Header */}
            <View style={s.summaryHeader}>
              <Ionicons name={selectedType.icon} size={20} color="#27ae60" />
              <Text style={s.summaryTitle}>{selectedType.label}</Text>
            </View>

            {/* Primary metrics */}
            <View style={s.primaryMetrics}>
              <View style={s.primaryMetricItem}>
                <Text style={s.primaryMetricVal}>{formatDistance(summary.distanceM)}</Text>
                <Text style={s.primaryMetricLbl}>Distance</Text>
              </View>
              <View style={[s.primaryMetricItem, s.primaryMetricCenter]}>
                <Text style={s.primaryMetricVal}>{formatDuration(summary.durationS)}</Text>
                <Text style={s.primaryMetricLbl}>Duration</Text>
              </View>
              <View style={s.primaryMetricItem}>
                <Text style={s.primaryMetricVal}>{summary.calories}</Text>
                <Text style={s.primaryMetricLbl}>Cal</Text>
              </View>
            </View>

            {/* Secondary metrics */}
            <View style={s.secondaryGrid}>
              {[
                {
                  icon: 'speedometer-outline' as const,
                  label: selectedType.unit === 'pace' ? 'Avg Pace' : 'Avg Speed',
                  value: selectedType.unit === 'pace'
                    ? formatPace(summary.avgPaceSecPerKm)
                    : formatSpeed(summary.avgSpeedKmh),
                },
                {
                  icon: 'flash-outline' as const,
                  label: selectedType.unit === 'pace' ? 'Best Pace' : 'Max Speed',
                  value: selectedType.unit === 'pace'
                    ? formatPace(summary.avgPaceSecPerKm > 0 ? summary.avgPaceSecPerKm * 0.85 : 0)
                    : formatSpeed(summary.maxSpeedKmh),
                },
                {
                  icon: 'trending-up-outline' as const,
                  label: 'Elevation Gain',
                  value: `${Math.round(summary.elevationGainM)} m`,
                },
                {
                  icon: 'trending-down-outline' as const,
                  label: 'Elevation Loss',
                  value: `${Math.round(summary.elevationLossM)} m`,
                },
              ].map((m, i) => (
                <View key={i} style={s.secondaryItem}>
                  <Ionicons name={m.icon} size={16} color={t.text.muted} />
                  <Text style={s.secondaryVal}>{m.value}</Text>
                  <Text style={s.secondaryLbl}>{m.label}</Text>
                </View>
              ))}
            </View>

            {/* Splits */}
            {summary.splits.length > 0 && (
              <>
                <Text style={s.splitsTitle}>SPLITS</Text>
                <View style={s.splitsTable}>
                  <View style={s.splitsHeaderRow}>
                    <Text style={[s.splitsCell, s.splitsCellHeader, { flex: 0.8 }]}>KM</Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>TIME</Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>
                      {selectedType.unit === 'pace' ? 'PACE' : 'SPEED'}
                    </Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>ELEV+</Text>
                  </View>
                  {summary.splits.map((split) => (
                    <View key={split.splitNumber} style={s.splitRow}>
                      <Text style={[s.splitsCell, { flex: 0.8 }]}>{split.splitNumber}</Text>
                      <Text style={s.splitsCell}>{formatDuration(split.durationS)}</Text>
                      <Text style={s.splitsCell}>
                        {selectedType.unit === 'pace'
                          ? formatPace(split.paceSecPerKm)
                          : formatSpeed((split.distanceM / split.durationS) * 3.6)}
                      </Text>
                      <Text style={s.splitsCell}>{Math.round(split.elevationGainM)}m</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Actions */}
            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
              <Ionicons name="checkmark" size={20} color="#0a0a0a" />
              <Text style={s.saveBtnText}>Save Activity</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discardBtn} onPress={handleDiscard}>
              <Text style={s.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function styles(t: ThemeColors) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    centeredScreen: {
      flex: 1,
      padding: 28,
      paddingTop: 60,
    },
    topBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 32,
    },
    screenTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    permTitle: {
      fontSize: 26,
      fontWeight: '800',
      color: t.text.primary,
      textAlign: 'center',
      marginBottom: 16,
    },
    permBody: {
      fontSize: 15,
      color: t.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 40,
    },
    sectionLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      marginBottom: 16,
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    typeCard: {
      width: (SW - 56 - 12) / 2,
      alignItems: 'center',
      paddingVertical: 20,
      borderRadius: 14,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      gap: 10,
    },
    typeCardActive: {
      borderColor: '#27ae60',
      backgroundColor: 'rgba(39,174,96,0.07)',
    },
    typeLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: t.text.secondary,
    },
    typeLabelActive: {
      color: '#27ae60',
    },
    readyIconWrap: {
      alignSelf: 'center',
      marginVertical: 32,
    },
    readyTitle: {
      fontSize: 28,
      fontWeight: '800',
      color: t.text.primary,
      textAlign: 'center',
      marginBottom: 12,
    },
    readyBody: {
      fontSize: 15,
      color: t.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
      marginBottom: 28,
    },
    readyHints: {
      gap: 10,
      marginBottom: 40,
    },
    hintRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    hintText: {
      fontSize: 13,
      color: t.text.muted,
    },
    startBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#27ae60',
      borderRadius: 14,
      paddingVertical: 18,
      gap: 8,
    },
    startBtnText: {
      fontSize: 18,
      fontWeight: '700',
      color: '#0a0a0a',
    },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#27ae60',
      borderRadius: 14,
      paddingVertical: 16,
      gap: 6,
    },
    primaryBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0a0a0a',
    },
    ghostBtn: {
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 8,
    },
    ghostBtnText: {
      fontSize: 15,
      color: t.text.muted,
    },

    // Tracking
    trackingRoot: {
      flex: 1,
    },
    map: {
      flex: 1,
      backgroundColor: '#0a0a0a',
    },
    pausedOverlay: {
      position: 'absolute',
      top: 56,
      alignSelf: 'center',
      backgroundColor: 'rgba(230,126,34,0.9)',
      borderRadius: 8,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    pausedLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: '#ffffff',
      letterSpacing: 2,
    },
    hud: {
      backgroundColor: 'rgba(10,10,10,0.97)',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: 48,
      gap: 16,
      borderTopWidth: 1,
      borderColor: '#1e1e1e',
    },
    timerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    timerText: {
      fontSize: 52,
      fontWeight: '800',
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      marginBottom: 8,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    statCol: {
      flex: 1,
      gap: 2,
    },
    statColCenter: {
      alignItems: 'center',
    },
    statVal: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
    },
    statLbl: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    controlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    pauseBtn: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#1e1e1e',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: '#3a3a3a',
    },
    finishBtn: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: 'rgba(192,57,43,0.15)',
      borderWidth: 1,
      borderColor: '#c0392b',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Summary
    summaryScroll: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    summaryContent: {
      padding: 24,
      paddingBottom: 60,
    },
    summaryMapWrap: {
      height: 240,
      borderRadius: 16,
      overflow: 'hidden',
      marginBottom: 20,
      borderWidth: 1,
      borderColor: t.border,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 20,
    },
    summaryTitle: {
      fontSize: 24,
      fontWeight: '800',
      color: t.text.primary,
    },
    primaryMetrics: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 12,
    },
    primaryMetricItem: {
      flex: 1,
      gap: 4,
    },
    primaryMetricCenter: {
      alignItems: 'center',
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 16,
      marginHorizontal: 8,
    },
    primaryMetricVal: {
      fontSize: 22,
      fontWeight: '800',
      color: t.text.primary,
    },
    primaryMetricLbl: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    secondaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 24,
    },
    secondaryItem: {
      flex: 1,
      minWidth: (SW - 58) / 2,
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      padding: 14,
      gap: 4,
    },
    secondaryVal: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
    },
    secondaryLbl: {
      fontSize: 11,
      color: t.text.muted,
    },
    splitsTitle: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    splitsTable: {
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      overflow: 'hidden',
      marginBottom: 28,
    },
    splitsHeaderRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderColor: t.border,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    splitRow: {
      flexDirection: 'row',
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: t.border,
    },
    splitsCell: {
      flex: 1,
      fontSize: 13,
      color: t.text.primary,
    },
    splitsCellHeader: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      letterSpacing: 1,
    },
    saveBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#27ae60',
      borderRadius: 14,
      paddingVertical: 16,
      gap: 8,
      marginBottom: 12,
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0a0a0a',
    },
    discardBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    discardBtnText: {
      fontSize: 15,
      color: t.text.muted,
    },
  });
}
