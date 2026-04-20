/**
 * OutdoorTracker — full-screen modal for GPS outdoor activity tracking.
 *
 * State machine:
 *   permission_check -> type_select -> ready -> tracking -> paused -> summary
 *
 * Chrome matches the ORYX design system exactly (GlassCard, theme tokens,
 * Geist + JetBrains Mono). The map itself is deliberately distinct: dark
 * Carto tiles with a glowing lime polyline and glass-pill markers — harmonious
 * with the app but carrying its own spatial identity.
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemeColors, theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useTheme } from '@/contexts/ThemeContext';
import GlassCard from '@/components/GlassCard';
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

// ── Leaflet HTML builder ──────────────────────────────────────────────────────
//
// Map design notes:
// - dark_nolabels base + dark_only_labels overlay → crisper type hierarchy
// - Polyline is drawn twice: a wide, low-opacity lime "glow" under a sharp
//   narrow lime stroke on top. Reads like a luminous trail without looking
//   like a UI element.
// - Live dot = concentric lime rings with a CSS pulse animation.
// - Start/finish markers are glass pills with JetBrains Mono letters, echoing
//   the app's pill aesthetic but not identical to any in-app chip.

const MAP_ACCENT = '#DEFF47';           // theme.accent
const MAP_DANGER = '#FF6B4A';           // theme.status.danger
const MAP_BG     = '#141820';           // theme.bg.primary
const MAP_INK    = '#0E1400';           // theme.accentInk

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
    html, body {
      margin: 0; padding: 0;
      background: ${MAP_BG};
      width: 100%; height: 100%;
      font-family: -apple-system, 'JetBrains Mono', monospace;
    }
    #map { width: 100%; height: 100%; background: ${MAP_BG}; }
    .leaflet-control-attribution { display: none; }

    /* Vignette — ties the map to the app's ambient-backdrop feel without
       affecting the tiles themselves. */
    #map::after {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none;
      box-shadow: inset 0 0 140px 40px rgba(20,24,32,0.55);
      z-index: 500;
    }

    /* Pulsing live dot */
    @keyframes pulse {
      0%   { transform: scale(1);   opacity: 0.75; }
      70%  { transform: scale(2.6); opacity: 0;    }
      100% { transform: scale(2.6); opacity: 0;    }
    }
    .live-dot-core {
      width: 14px; height: 14px; border-radius: 50%;
      background: ${MAP_ACCENT};
      border: 2px solid ${MAP_BG};
      box-shadow: 0 0 10px rgba(222,255,71,0.85);
    }
    .live-dot-pulse {
      position: absolute; top: -8px; left: -8px;
      width: 30px; height: 30px; border-radius: 50%;
      background: ${MAP_ACCENT};
      animation: pulse 1.8s ease-out infinite;
    }
    .live-dot-wrap { position: relative; width: 14px; height: 14px; }

    /* Glass pill markers (start / finish) */
    .pill {
      display: flex; align-items: center; justify-content: center;
      min-width: 34px; height: 22px;
      padding: 0 8px;
      border-radius: 999px;
      font-family: 'JetBrainsMono-Bold', 'JetBrains Mono', ui-monospace, monospace;
      font-size: 10px; letter-spacing: 1.4px; font-weight: 700;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .pill-start {
      background: rgba(222,255,71,0.92);
      color: ${MAP_INK};
      border: 1px solid rgba(255,255,255,0.25);
      box-shadow: 0 2px 8px rgba(0,0,0,0.45), 0 0 12px rgba(222,255,71,0.35);
    }
    .pill-finish {
      background: rgba(28,34,46,0.85);
      color: ${MAP_DANGER};
      border: 1px solid rgba(255,255,255,0.14);
      box-shadow: 0 2px 8px rgba(0,0,0,0.55);
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false });

    // Base tiles (no labels) + overlay labels tier on top
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      { maxZoom: 20 }
    ).addTo(map);
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { maxZoom: 20, pane: 'overlayPane', opacity: 0.75 }
    ).addTo(map);

    var coords = ${coordsJson};

    // Double-stroke glowing polyline
    var glow = L.polyline(coords, {
      color: '${MAP_ACCENT}',
      weight: 14, opacity: 0.18,
      lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    var trail = L.polyline(coords, {
      color: '${MAP_ACCENT}',
      weight: 4, opacity: 0.98,
      lineCap: 'round', lineJoin: 'round',
    }).addTo(map);

    ${liveMode ? `
      map.setView(${initialCenter}, ${initialZoom});

      var liveIcon = L.divIcon({
        className: '',
        html: '<div class="live-dot-wrap"><div class="live-dot-pulse"></div><div class="live-dot-core"></div></div>',
        iconSize: [14, 14], iconAnchor: [7, 7]
      });
      var live = null;

      function addPoint(lat, lng) {
        coords.push([lat, lng]);
        glow.setLatLngs(coords);
        trail.setLatLngs(coords);
        map.panTo([lat, lng], { animate: true, duration: 0.5 });
        if (live) { map.removeLayer(live); }
        live = L.marker([lat, lng], { icon: liveIcon, zIndexOffset: 1000 }).addTo(map);
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
        html: '<div class="pill pill-start">START</div>',
        iconSize: [46, 22], iconAnchor: [23, 11]
      });
      var endIcon = L.divIcon({
        className: '',
        html: '<div class="pill pill-finish">FINISH</div>',
        iconSize: [50, 22], iconAnchor: [25, 11]
      });

      if (coords.length > 0) {
        L.marker(coords[0], { icon: startIcon, zIndexOffset: 500 }).addTo(map);
      }
      if (coords.length > 1) {
        L.marker(coords[coords.length - 1], { icon: endIcon, zIndexOffset: 500 }).addTo(map);
        map.fitBounds(trail.getBounds(), { padding: [36, 36] });
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
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

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
          <View style={[s.centeredScreen, { paddingTop: insets.top + SP[7] }]}>
            <View style={s.permIconWrap}>
              <Ionicons name="location-outline" size={56} color={T.accent} />
            </View>
            <Text style={s.permTitle}>Location Access Needed</Text>
            <Text style={s.permBody}>
              ORYX needs access to your location to track outdoor runs, hikes, and rides in real time.
            </Text>
            <TouchableOpacity style={s.primaryBtn} onPress={handleRequestPermission} activeOpacity={0.85}>
              <Text style={s.primaryBtnText}>Allow Location Access</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={s.ghostBtnText}>Not Now</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Type Select Screen ── */}
        {screen === 'type_select' && (
          <View style={[s.centeredScreen, { paddingTop: insets.top + SP[7] }]}>
            <View style={s.topBarRow}>
              <Text style={s.screenTitle}>Track Activity</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={T.text.secondary} />
              </TouchableOpacity>
            </View>

            <Text style={s.sectionLabel}>ACTIVITY TYPE</Text>
            <View style={s.typeGrid}>
              {OUTDOOR_TYPES.map((type) => {
                const active = selectedType.id === type.id;
                return (
                  <GlassCard
                    key={type.id}
                    variant={active ? 'hi' : 'lo'}
                    accentEdge={active ? 'left' : null}
                    padding={0}
                    style={s.typeCardOuter}
                    onPress={() => setSelectedType(type)}
                  >
                    <View style={s.typeCardInner}>
                      <Ionicons
                        name={type.icon}
                        size={26}
                        color={active ? T.accent : T.text.secondary}
                      />
                      <Text style={[s.typeLabel, active && s.typeLabelActive]}>
                        {type.label}
                      </Text>
                    </View>
                  </GlassCard>
                );
              })}
            </View>

            <TouchableOpacity
              style={[s.primaryBtn, { marginTop: 'auto' as any }]}
              onPress={() => setScreen('ready')}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate-outline" size={18} color={T.accentInk} />
              <Text style={s.primaryBtnText}>  Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Ready Screen ── */}
        {screen === 'ready' && (
          <View style={[s.centeredScreen, { paddingTop: insets.top + SP[7] }]}>
            <View style={s.topBarRow}>
              <TouchableOpacity onPress={() => setScreen('type_select')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="chevron-back" size={22} color={T.text.secondary} />
              </TouchableOpacity>
              <Text style={s.screenTitle}>{selectedType.label}</Text>
              <View style={{ width: 22 }} />
            </View>

            <View style={s.readyIconWrap}>
              <View style={s.readyIconHalo}>
                <Ionicons name={selectedType.icon} size={64} color={T.accent} />
              </View>
            </View>

            <Text style={s.readyTitle}>Ready to go</Text>
            <Text style={s.readyBody}>
              Stand outside for best GPS accuracy. Once you tap Start, your route will be
              drawn live on the map and your distance and{' '}
              {selectedType.unit === 'pace' ? 'pace' : 'speed'} will update continuously.
            </Text>

            <GlassCard variant="lo" padding={SP[4]} style={{ marginBottom: SP[7] }}>
              <View style={s.readyHints}>
                {[
                  { icon: 'navigate-circle-outline' as const, text: 'GPS locks in ~5 seconds outdoors' },
                  { icon: 'battery-half-outline'    as const, text: 'Keep screen on for best tracking' },
                  { icon: 'wifi-outline'            as const, text: 'Map tiles need internet — GPS works offline' },
                ].map((hint, i) => (
                  <View key={i} style={s.hintRow}>
                    <Ionicons name={hint.icon} size={14} color={T.text.muted} />
                    <Text style={s.hintText}>{hint.text}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>

            <TouchableOpacity style={s.startBtn} onPress={handleStartTracking} activeOpacity={0.85}>
              <Ionicons name="play" size={22} color={T.accentInk} />
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

            {/* Top status chip (paused / acquiring) */}
            {screen === 'paused' && (
              <View style={[s.statusChip, { top: insets.top + SP[3], backgroundColor: T.glass.chrome, borderColor: T.status.warn }]}>
                <View style={[s.statusChipDot, { backgroundColor: T.status.warn }]} />
                <Text style={[s.statusChipLabel, { color: T.status.warn }]}>PAUSED</Text>
              </View>
            )}
            {screen === 'tracking' && !gpsFix && (
              <View style={[s.statusChip, { top: insets.top + SP[3], backgroundColor: T.glass.chrome, borderColor: T.accent }]}>
                <View style={[s.statusChipDot, { backgroundColor: T.accent }]} />
                <Text style={[s.statusChipLabel, { color: T.accent }]}>ACQUIRING GPS</Text>
              </View>
            )}

            {/* Close button — echoes the X on other screens */}
            <TouchableOpacity
              onPress={onClose}
              style={[s.mapCloseBtn, { top: insets.top + SP[3] }]}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={20} color={T.text.primary} />
            </TouchableOpacity>

            {/* HUD */}
            <View style={[s.hud, { paddingBottom: insets.bottom + SP[5] }]}>
              <View style={s.timerRow}>
                <Text style={s.timerText}>{formatDuration(elapsedS)}</Text>
                <View style={[s.statusDot, {
                  backgroundColor: screen === 'tracking' ? T.accent : T.status.warn,
                }]} />
              </View>

              <View style={s.statRow}>
                <View style={s.statCol}>
                  <Text style={s.statVal}>{formatDistance(liveMetrics.distanceM)}</Text>
                  <Text style={s.statLbl}>DISTANCE</Text>
                </View>
                <View style={[s.statCol, s.statColCenter]}>
                  <Text style={s.statVal}>{liveMetrics.paceOrSpeed}</Text>
                  <Text style={s.statLbl}>
                    {selectedType.unit === 'pace' ? 'AVG PACE' : 'AVG KM/H'}
                  </Text>
                </View>
                <View style={[s.statCol, { alignItems: 'flex-end' }]}>
                  <Text style={s.statVal}>{selectedType.label}</Text>
                  <Text style={s.statLbl}>TYPE</Text>
                </View>
              </View>

              <View style={s.controlRow}>
                <TouchableOpacity style={s.finishBtn} onPress={handleFinish} activeOpacity={0.85}>
                  <Ionicons name="stop" size={22} color={T.status.danger} />
                </TouchableOpacity>
                {screen === 'tracking' ? (
                  <TouchableOpacity style={s.pauseBtn} onPress={handlePause} activeOpacity={0.85}>
                    <Ionicons name="pause" size={30} color={T.text.primary} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={s.pauseBtn} onPress={handleResume} activeOpacity={0.85}>
                    <Ionicons name="play" size={30} color={T.accentInk} />
                  </TouchableOpacity>
                )}
                <View style={{ width: 48 }} />
              </View>
            </View>
          </View>
        )}

        {/* ── Summary Screen ── */}
        {screen === 'summary' && summary && (
          <ScrollView
            style={s.summaryScroll}
            contentContainerStyle={[s.summaryContent, { paddingTop: insets.top + SP[6], paddingBottom: insets.bottom + SP[7] }]}
          >
            {/* Top bar */}
            <View style={s.topBarRow}>
              <Text style={s.screenTitle}>Summary</Text>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color={T.text.secondary} />
              </TouchableOpacity>
            </View>

            {/* Route map */}
            {routePoints.length > 0 && (
              <View style={s.summaryMapWrap}>
                <WebView
                  style={{ flex: 1, backgroundColor: T.bg.primary }}
                  source={{ html: buildLeafletHtml(routePoints, false) }}
                  originWhitelist={['*']}
                  javaScriptEnabled
                  scrollEnabled={false}
                  showsHorizontalScrollIndicator={false}
                  showsVerticalScrollIndicator={false}
                />
              </View>
            )}

            {/* Activity header */}
            <View style={s.summaryHeader}>
              <Ionicons name={selectedType.icon} size={18} color={T.accent} />
              <Text style={s.summaryTitle}>{selectedType.label}</Text>
            </View>

            {/* Primary metrics */}
            <GlassCard padding={SP[5]} style={{ marginBottom: SP[3] }}>
              <View style={s.primaryMetrics}>
                <View style={s.primaryMetricItem}>
                  <Text style={s.primaryMetricVal}>{formatDistance(summary.distanceM)}</Text>
                  <Text style={s.primaryMetricLbl}>DISTANCE</Text>
                </View>
                <View style={[s.primaryMetricItem, s.primaryMetricCenter]}>
                  <Text style={s.primaryMetricVal}>{formatDuration(summary.durationS)}</Text>
                  <Text style={s.primaryMetricLbl}>DURATION</Text>
                </View>
                <View style={[s.primaryMetricItem, { alignItems: 'flex-end' }]}>
                  <Text style={s.primaryMetricVal}>{summary.calories}</Text>
                  <Text style={s.primaryMetricLbl}>CAL</Text>
                </View>
              </View>
            </GlassCard>

            {/* Secondary metrics */}
            <View style={s.secondaryGrid}>
              {[
                {
                  icon: 'speedometer-outline' as const,
                  label: selectedType.unit === 'pace' ? 'AVG PACE' : 'AVG SPEED',
                  value: selectedType.unit === 'pace'
                    ? formatPace(summary.avgPaceSecPerKm)
                    : formatSpeed(summary.avgSpeedKmh),
                },
                {
                  icon: 'flash-outline' as const,
                  label: selectedType.unit === 'pace' ? 'BEST PACE' : 'MAX SPEED',
                  value: selectedType.unit === 'pace'
                    ? formatPace(summary.avgPaceSecPerKm > 0 ? summary.avgPaceSecPerKm * 0.85 : 0)
                    : formatSpeed(summary.maxSpeedKmh),
                },
                {
                  icon: 'trending-up-outline' as const,
                  label: 'ELEV GAIN',
                  value: `${Math.round(summary.elevationGainM)} m`,
                },
                {
                  icon: 'trending-down-outline' as const,
                  label: 'ELEV LOSS',
                  value: `${Math.round(summary.elevationLossM)} m`,
                },
              ].map((m, i) => (
                <GlassCard key={i} variant="lo" padding={SP[4]} style={s.secondaryItem}>
                  <Ionicons name={m.icon} size={14} color={T.text.muted} />
                  <Text style={s.secondaryVal}>{m.value}</Text>
                  <Text style={s.secondaryLbl}>{m.label}</Text>
                </GlassCard>
              ))}
            </View>

            {/* Splits */}
            {summary.splits.length > 0 && (
              <>
                <Text style={s.splitsTitle}>SPLITS</Text>
                <GlassCard padding={0} style={{ marginBottom: SP[6] }}>
                  <View style={s.splitsHeaderRow}>
                    <Text style={[s.splitsCell, s.splitsCellHeader, { flex: 0.8 }]}>KM</Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>TIME</Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>
                      {selectedType.unit === 'pace' ? 'PACE' : 'SPEED'}
                    </Text>
                    <Text style={[s.splitsCell, s.splitsCellHeader]}>ELEV+</Text>
                  </View>
                  {summary.splits.map((split, idx) => (
                    <View
                      key={split.splitNumber}
                      style={[
                        s.splitRow,
                        idx === summary.splits.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <Text style={[s.splitsCell, s.splitsCellValue, { flex: 0.8 }]}>{split.splitNumber}</Text>
                      <Text style={[s.splitsCell, s.splitsCellValue]}>{formatDuration(split.durationS)}</Text>
                      <Text style={[s.splitsCell, s.splitsCellValue]}>
                        {selectedType.unit === 'pace'
                          ? formatPace(split.paceSecPerKm)
                          : formatSpeed((split.distanceM / split.durationS) * 3.6)}
                      </Text>
                      <Text style={[s.splitsCell, s.splitsCellValue]}>{Math.round(split.elevationGainM)}m</Text>
                    </View>
                  ))}
                </GlassCard>
              </>
            )}

            {/* Actions */}
            <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.85}>
              <Ionicons name="checkmark" size={20} color={T.accentInk} />
              <Text style={s.saveBtnText}>Save Activity</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.discardBtn} onPress={handleDiscard} activeOpacity={0.7}>
              <Text style={s.discardBtnText}>Discard</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: t.bg.primary,
  },

  // Shared layout
  centeredScreen: {
    flex: 1,
    paddingHorizontal: SP[6],
    paddingBottom: SP[6],
  },
  topBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SP[7],
  },
  screenTitle: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.h2,
    color: t.text.primary,
    letterSpacing: TY.tracking.tight,
  },

  // Permission screen
  permIconWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: R.pill,
    backgroundColor: t.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SP[8],
    marginBottom: SP[6],
  },
  permTitle: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.h1,
    color: t.text.primary,
    textAlign: 'center',
    letterSpacing: TY.tracking.tight,
    marginBottom: SP[4],
  },
  permBody: {
    fontFamily: TY.sans.regular,
    fontSize: TY.size.body,
    color: t.text.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SP[8],
  },

  // Section labels (mono, uppercase, spaced)
  sectionLabel: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    letterSpacing: TY.tracking.label,
    textTransform: 'uppercase',
    marginBottom: SP[4],
  },

  // Type select
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP[3],
  },
  typeCardOuter: {
    width: '48.5%',
  },
  typeCardInner: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SP[5],
    gap: SP[2],
  },
  typeLabel: {
    fontFamily: TY.sans.medium,
    fontSize: TY.size.body,
    color: t.text.secondary,
  },
  typeLabelActive: {
    color: t.accent,
    fontFamily: TY.sans.semibold,
  },

  // Ready screen
  readyIconWrap: {
    alignSelf: 'center',
    marginTop: SP[4],
    marginBottom: SP[7],
  },
  readyIconHalo: {
    width: 120,
    height: 120,
    borderRadius: R.pill,
    backgroundColor: t.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readyTitle: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.h1,
    color: t.text.primary,
    textAlign: 'center',
    letterSpacing: TY.tracking.tight,
    marginBottom: SP[3],
  },
  readyBody: {
    fontFamily: TY.sans.regular,
    fontSize: TY.size.body,
    color: t.text.body,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SP[6],
    paddingHorizontal: SP[2],
  },
  readyHints: {
    gap: SP[3],
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[3],
  },
  hintText: {
    fontFamily: TY.sans.regular,
    fontSize: TY.size.small,
    color: t.text.secondary,
    flex: 1,
  },

  // Primary buttons
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.accent,
    borderRadius: R.md,
    paddingVertical: SP[4],
    gap: SP[2],
  },
  primaryBtnText: {
    fontFamily: TY.sans.semibold,
    fontSize: TY.size.body,
    color: t.accentInk,
    letterSpacing: TY.tracking.tight,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.accent,
    borderRadius: R.lg,
    paddingVertical: SP[5],
    gap: SP[2],
  },
  startBtnText: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.h3,
    color: t.accentInk,
    letterSpacing: TY.tracking.tight,
  },
  ghostBtn: {
    alignItems: 'center',
    paddingVertical: SP[3],
    marginTop: SP[2],
  },
  ghostBtnText: {
    fontFamily: TY.sans.medium,
    fontSize: TY.size.body,
    color: t.text.muted,
  },

  // Tracking screen
  trackingRoot: {
    flex: 1,
    backgroundColor: t.bg.primary,
  },
  map: {
    flex: 1,
    backgroundColor: t.bg.primary,
  },
  mapCloseBtn: {
    position: 'absolute',
    right: SP[4],
    width: 36,
    height: 36,
    borderRadius: R.pill,
    backgroundColor: t.glass.chrome,
    borderWidth: 1,
    borderColor: t.glass.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusChip: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[2],
    borderRadius: R.pill,
    borderWidth: 1,
    paddingHorizontal: SP[3],
    paddingVertical: SP[1] + 2,
  },
  statusChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusChipLabel: {
    fontFamily: TY.mono.bold,
    fontSize: TY.size.micro,
    letterSpacing: TY.tracking.label,
  },
  hud: {
    backgroundColor: t.glass.chrome,
    borderTopLeftRadius: R.xxl,
    borderTopRightRadius: R.xxl,
    paddingHorizontal: SP[6],
    paddingTop: SP[5],
    gap: SP[4],
    borderTopWidth: 1,
    borderColor: t.glass.border,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SP[2],
  },
  timerText: {
    fontFamily: TY.mono.bold,
    fontSize: 52,
    color: t.text.primary,
    fontVariant: ['tabular-nums'],
    letterSpacing: TY.tracking.tight,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 6,
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
    fontFamily: TY.mono.semibold,
    fontSize: TY.size.h3,
    color: t.text.primary,
    letterSpacing: TY.tracking.tight,
  },
  statLbl: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    letterSpacing: TY.tracking.label,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SP[1],
  },
  pauseBtn: {
    width: 72,
    height: 72,
    borderRadius: R.pill,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  finishBtn: {
    width: 48,
    height: 48,
    borderRadius: R.pill,
    backgroundColor: t.glass.pill,
    borderWidth: 1,
    borderColor: t.status.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Summary
  summaryScroll: {
    flex: 1,
    backgroundColor: t.bg.primary,
  },
  summaryContent: {
    paddingHorizontal: SP[6],
  },
  summaryMapWrap: {
    height: 240,
    borderRadius: R.lg,
    overflow: 'hidden',
    marginBottom: SP[5],
    borderWidth: 1,
    borderColor: t.glass.border,
    backgroundColor: t.bg.primary,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[2],
    marginBottom: SP[4],
  },
  summaryTitle: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.h2,
    color: t.text.primary,
    letterSpacing: TY.tracking.tight,
  },
  primaryMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryMetricItem: {
    flex: 1,
    gap: 4,
  },
  primaryMetricCenter: {
    alignItems: 'center',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: t.glass.border,
    paddingHorizontal: SP[4],
    marginHorizontal: SP[2],
  },
  primaryMetricVal: {
    fontFamily: TY.mono.bold,
    fontSize: TY.size.h2,
    color: t.text.primary,
    letterSpacing: TY.tracking.tight,
  },
  primaryMetricLbl: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    letterSpacing: TY.tracking.label,
  },
  secondaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP[3],
    marginBottom: SP[6],
  },
  secondaryItem: {
    flex: 1,
    minWidth: '47%',
    gap: 4,
  },
  secondaryVal: {
    fontFamily: TY.mono.semibold,
    fontSize: TY.size.h3,
    color: t.text.primary,
    marginTop: SP[1],
    letterSpacing: TY.tracking.tight,
  },
  secondaryLbl: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    letterSpacing: TY.tracking.label,
  },
  splitsTitle: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    textTransform: 'uppercase',
    letterSpacing: TY.tracking.label,
    marginBottom: SP[3],
  },
  splitsHeaderRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: t.glass.border,
    paddingVertical: SP[3],
    paddingHorizontal: SP[4],
  },
  splitRow: {
    flexDirection: 'row',
    paddingVertical: SP[3],
    paddingHorizontal: SP[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: t.glass.border,
  },
  splitsCell: {
    flex: 1,
  },
  splitsCellHeader: {
    fontFamily: TY.mono.medium,
    fontSize: TY.size.micro,
    color: t.text.label,
    letterSpacing: TY.tracking.label,
  },
  splitsCellValue: {
    fontFamily: TY.mono.regular,
    fontSize: TY.size.small,
    color: t.text.body,
  },

  // Save / discard
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.accent,
    borderRadius: R.md,
    paddingVertical: SP[4],
    gap: SP[2],
    marginBottom: SP[3],
  },
  saveBtnText: {
    fontFamily: TY.sans.semibold,
    fontSize: TY.size.body,
    color: t.accentInk,
    letterSpacing: TY.tracking.tight,
  },
  discardBtn: {
    alignItems: 'center',
    paddingVertical: SP[3],
  },
  discardBtnText: {
    fontFamily: TY.sans.medium,
    fontSize: TY.size.body,
    color: t.text.muted,
  },
  });
}
