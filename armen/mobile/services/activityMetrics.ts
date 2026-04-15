/**
 * activityMetrics.ts
 * Pure-function utilities for outdoor activity calculations.
 * All functions are synchronous and side-effect free.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
  altitude?: number | null;
  timestamp?: number;
}

export interface Split {
  splitNumber: number;        // 1-indexed km splits
  distanceM: number;          // distance covered in this split (nominally 1000 m)
  durationS: number;          // seconds elapsed for this split
  paceSecPerKm: number;       // seconds per km for this split
  elevationGainM: number;     // cumulative elevation gain in this split
}

export interface ActivitySummary {
  distanceM: number;
  durationS: number;
  elevationGainM: number;
  elevationLossM: number;
  avgSpeedKmh: number;
  avgPaceSecPerKm: number;    // 0 when no movement
  maxSpeedKmh: number;
  calories: number;           // rough estimate
  splits: Split[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;
const SPLIT_DISTANCE_M = 1000;

/** Speed (m/s) below which a GPS reading is treated as stationary noise. */
const MIN_MOVEMENT_SPEED_MS = 0.3;

/** Maximum plausible speed (m/s) per activity type. Points above this are
 *  likely GPS jumps and are discarded. */
const MAX_SPEED_MS: Record<string, number> = {
  running: 12,    // ~43 km/h — elite sprinting
  jogging: 6,     // ~21.6 km/h
  walking: 3,     // ~10.8 km/h
  hiking: 3,
  cycling: 20,    // ~72 km/h
};
const DEFAULT_MAX_SPEED_MS = 20;

/** MET (metabolic equivalent) values for calorie estimate */
const MET: Record<string, number> = {
  running: 9.8,
  jogging: 7.0,
  walking: 3.5,
  hiking: 5.3,
  cycling: 7.5,
};
const DEFAULT_MET = 6.0;

/** Assumed body-weight for calorie estimate when unavailable (kg) */
const DEFAULT_WEIGHT_KG = 75;

// ── Haversine ─────────────────────────────────────────────────────────────────

/** Returns the great-circle distance in metres between two coordinates. */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// ── GPS Noise Filter ──────────────────────────────────────────────────────────

/**
 * Removes GPS points that imply impossible speed for the given activity type.
 * Also drops consecutive duplicate coordinates.
 */
export function filterNoise(
  points: LatLng[],
  activityType: string = 'running',
): LatLng[] {
  if (points.length < 2) return points;
  const maxSpeed = MAX_SPEED_MS[activityType] ?? DEFAULT_MAX_SPEED_MS;
  const result: LatLng[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const dist = haversineM(prev, curr);
    const dt =
      curr.timestamp && prev.timestamp
        ? (curr.timestamp - prev.timestamp) / 1000
        : 1;

    if (dt <= 0) continue; // duplicate timestamp
    const speed = dist / dt;
    if (speed > maxSpeed) continue; // GPS jump — discard
    if (dist < 0.5 && speed < MIN_MOVEMENT_SPEED_MS) continue; // stationary noise
    result.push(curr);
  }
  return result;
}

// ── Core Metrics ──────────────────────────────────────────────────────────────

/** Calculates total distance in metres over an array of (already-filtered) points. */
export function totalDistanceM(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineM(points[i - 1], points[i]);
  }
  return total;
}

/** Elevation gain / loss from altitude-bearing coordinates (metres). */
export function elevationChange(points: LatLng[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    const alt1 = points[i - 1].altitude ?? 0;
    const alt2 = points[i].altitude ?? 0;
    const delta = alt2 - alt1;
    if (delta > 0) gain += delta;
    else loss += Math.abs(delta);
  }
  return { gain, loss };
}

/** Instantaneous speed between two consecutive points (km/h). */
export function instantSpeedKmh(a: LatLng, b: LatLng): number {
  if (!a.timestamp || !b.timestamp) return 0;
  const dtS = (b.timestamp - a.timestamp) / 1000;
  if (dtS <= 0) return 0;
  return (haversineM(a, b) / dtS) * 3.6;
}

// ── Splits ────────────────────────────────────────────────────────────────────

export function buildSplits(points: LatLng[]): Split[] {
  if (points.length < 2) return [];
  const splits: Split[] = [];
  let splitStart = 0; // index of the point that began this split
  let splitStartTime = points[0].timestamp ?? 0;
  let splitDist = 0;
  let splitElevGain = 0;
  let splitNum = 1;

  for (let i = 1; i < points.length; i++) {
    const seg = haversineM(points[i - 1], points[i]);
    const dAlt = (points[i].altitude ?? 0) - (points[i - 1].altitude ?? 0);
    splitDist += seg;
    if (dAlt > 0) splitElevGain += dAlt;

    if (splitDist >= SPLIT_DISTANCE_M) {
      const endTime = points[i].timestamp ?? 0;
      const durationS = startTime => Math.max(1, (endTime - startTime) / 1000);
      const dur = durationS(splitStartTime);
      splits.push({
        splitNumber: splitNum,
        distanceM: splitDist,
        durationS: dur,
        paceSecPerKm: (dur / splitDist) * 1000,
        elevationGainM: splitElevGain,
      });
      splitNum++;
      splitDist = 0;
      splitElevGain = 0;
      splitStartTime = points[i].timestamp ?? 0;
    }
  }
  return splits;
}

// ── Summary ───────────────────────────────────────────────────────────────────

export function buildSummary(
  points: LatLng[],
  durationS: number,
  activityType: string = 'running',
  weightKg: number = DEFAULT_WEIGHT_KG,
): ActivitySummary {
  const filtered = filterNoise(points, activityType);
  const distanceM = totalDistanceM(filtered);
  const { gain, loss } = elevationChange(filtered);

  const avgSpeedKmh = durationS > 0 ? (distanceM / durationS) * 3.6 : 0;
  const avgPaceSecPerKm = distanceM > 10 ? (durationS / distanceM) * 1000 : 0;

  let maxSpeedKmh = 0;
  for (let i = 1; i < filtered.length; i++) {
    const s = instantSpeedKmh(filtered[i - 1], filtered[i]);
    if (s > maxSpeedKmh) maxSpeedKmh = s;
  }

  const met = MET[activityType] ?? DEFAULT_MET;
  const calories = Math.round(met * weightKg * (durationS / 3600));

  const splits = buildSplits(filtered);

  return {
    distanceM,
    durationS,
    elevationGainM: gain,
    elevationLossM: loss,
    avgSpeedKmh,
    avgPaceSecPerKm,
    maxSpeedKmh,
    calories,
    splits,
  };
}

// ── Formatting Helpers ────────────────────────────────────────────────────────

/** Format seconds → "h:mm:ss" or "m:ss" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${pad(m)}:${pad(sec)}`;
  }
  return `${m}:${pad(sec)}`;
}

/** Format pace (seconds per km) → "m'ss\"" */
export function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '--';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${pad(s)}"`;
}

/** Format distance in metres → "x.xx km" or "xxx m" */
export function formatDistance(metres: number): string {
  if (metres >= 1000) {
    return `${(metres / 1000).toFixed(2)} km`;
  }
  return `${Math.round(metres)} m`;
}

/** Format speed km/h → "x.x km/h" */
export function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
