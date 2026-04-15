/**
 * locationTracking.ts
 * GPS subscription wrapper for outdoor activity tracking.
 *
 * Usage:
 *   const tracker = createTracker(onPoint);
 *   await tracker.start();
 *   tracker.pause();
 *   tracker.resume();
 *   const points = tracker.stop();
 */

import * as Location from 'expo-location';
import { LatLng } from './activityMetrics';

export type TrackingState = 'idle' | 'running' | 'paused';

export interface LocationPoint extends LatLng {
  accuracy?: number | null;
  speed?: number | null;
}

export interface Tracker {
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  stop(): LocationPoint[];
  getState(): TrackingState;
  getPoints(): LocationPoint[];
}

// ── Permissions ───────────────────────────────────────────────────────────────

/**
 * Requests foreground location permission.
 * Returns true if granted, false otherwise.
 */
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

export async function checkLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === Location.PermissionStatus.GRANTED;
}

// ── Tracker Factory ───────────────────────────────────────────────────────────

/**
 * Creates a GPS tracker that calls `onPoint` for every accepted coordinate.
 *
 * @param onPoint  Callback invoked with each new point (while not paused)
 */
export function createTracker(
  onPoint: (point: LocationPoint) => void,
): Tracker {
  let state: TrackingState = 'idle';
  let points: LocationPoint[] = [];
  let subscription: Location.LocationSubscription | null = null;

  const handleLocation = (loc: Location.LocationObject) => {
    if (state !== 'running') return;

    const point: LocationPoint = {
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      altitude: loc.coords.altitude,
      accuracy: loc.coords.accuracy,
      speed: loc.coords.speed,
      timestamp: loc.timestamp,
    };

    // Basic accuracy filter — discard low-accuracy readings during active tracking
    if (point.accuracy != null && point.accuracy > 50) return;

    points.push(point);
    onPoint(point);
  };

  return {
    async start() {
      if (state !== 'idle') return;
      points = [];

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,       // ms
          distanceInterval: 2,      // metres — reduces noise on slow activities
        },
        handleLocation,
      );
      state = 'running';
    },

    pause() {
      if (state === 'running') state = 'paused';
    },

    resume() {
      if (state === 'paused') state = 'running';
    },

    stop(): LocationPoint[] {
      subscription?.remove();
      subscription = null;
      state = 'idle';
      return [...points];
    },

    getState(): TrackingState {
      return state;
    },

    getPoints(): LocationPoint[] {
      return [...points];
    },
  };
}
