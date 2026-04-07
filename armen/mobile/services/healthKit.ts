import { Platform } from 'react-native';
import { HealthSnapshotIn } from './api';

// expo-health type declarations for the subset we use
type HealthPermission =
  | 'Steps'
  | 'HeartRate'
  | 'HeartRateVariabilitySDNN'
  | 'RestingHeartRate'
  | 'SleepAnalysis'
  | 'ActiveEnergyBurned';

interface HealthValue {
  value: number;
  startDate: string;
  endDate: string;
}

interface SleepValue {
  value: 'INBED' | 'ASLEEP' | 'AWAKE' | string;
  startDate: string;
  endDate: string;
}

let Health: {
  isAvailable: () => Promise<boolean>;
  requestAuthorization: (
    readPermissions: HealthPermission[],
    writePermissions: HealthPermission[]
  ) => Promise<boolean>;
  getHealthRecords: (options: {
    type: HealthPermission;
    startDate: Date;
    endDate: Date;
    ascending?: boolean;
  }) => Promise<HealthValue[] | SleepValue[]>;
} | null = null;

// Only import expo-health on iOS — it doesn't exist on Android/web
if (Platform.OS === 'ios') {
  try {
    // Dynamic require so that bundler doesn't fail on non-iOS
    Health = require('expo-health');
  } catch {
    Health = null;
  }
}

const READ_PERMISSIONS: HealthPermission[] = [
  'Steps',
  'HeartRate',
  'HeartRateVariabilitySDNN',
  'RestingHeartRate',
  'SleepAnalysis',
  'ActiveEnergyBurned',
];

/**
 * Request HealthKit permissions. Returns false on non-iOS platforms.
 */
export async function requestHealthPermissions(): Promise<boolean> {
  if (!Health || Platform.OS !== 'ios') return false;
  try {
    const available = await Health.isAvailable();
    if (!available) return false;
    return await Health.requestAuthorization(READ_PERMISSIONS, []);
  } catch {
    return false;
  }
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function startOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(d: Date): Date {
  const result = new Date(d);
  result.setHours(23, 59, 59, 999);
  return result;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function sum(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((total, v) => total + v, 0);
}

/**
 * Fetch the last 7 days of health data aggregated into daily snapshots.
 * Returns an empty array on non-iOS platforms or if HealthKit is unavailable.
 */
export async function fetchLast7DaysHealthData(): Promise<HealthSnapshotIn[]> {
  if (!Health || Platform.OS !== 'ios') return [];

  const granted = await requestHealthPermissions();
  if (!granted) return [];

  const snapshots: HealthSnapshotIn[] = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const dayDate = new Date(today);
    dayDate.setDate(today.getDate() - i);
    const dayStart = startOfDay(dayDate);
    const dayEnd = endOfDay(dayDate);
    const dateStr = formatDate(dayDate);

    try {
      // Steps
      const stepsRaw = (await Health!.getHealthRecords({
        type: 'Steps',
        startDate: dayStart,
        endDate: dayEnd,
      })) as HealthValue[];
      const stepsTotal = sum(stepsRaw.map((r) => r.value));

      // Heart Rate Variability (HRV)
      const hrvRaw = (await Health!.getHealthRecords({
        type: 'HeartRateVariabilitySDNN',
        startDate: dayStart,
        endDate: dayEnd,
      })) as HealthValue[];
      const hrvAvg = average(hrvRaw.map((r) => r.value));

      // Resting Heart Rate
      const rhrRaw = (await Health!.getHealthRecords({
        type: 'RestingHeartRate',
        startDate: dayStart,
        endDate: dayEnd,
      })) as HealthValue[];
      const rhrAvg = average(rhrRaw.map((r) => r.value));

      // Active Energy Burned
      const energyRaw = (await Health!.getHealthRecords({
        type: 'ActiveEnergyBurned',
        startDate: dayStart,
        endDate: dayEnd,
      })) as HealthValue[];
      const energyTotal = sum(energyRaw.map((r) => r.value));

      // Sleep Analysis — sum duration of "ASLEEP" samples
      const sleepRaw = (await Health!.getHealthRecords({
        type: 'SleepAnalysis',
        startDate: dayStart,
        endDate: dayEnd,
      })) as SleepValue[];

      let sleepDurationHours: number | null = null;
      const asleepSamples = sleepRaw.filter(
        (s) =>
          typeof s.value === 'string' &&
          s.value.toUpperCase().includes('ASLEEP')
      );
      if (asleepSamples.length > 0) {
        const totalSleepMs = asleepSamples.reduce((total, s) => {
          const start = new Date(s.startDate).getTime();
          const end = new Date(s.endDate).getTime();
          return total + Math.max(0, end - start);
        }, 0);
        sleepDurationHours = totalSleepMs / (1000 * 60 * 60);
      }

      snapshots.push({
        date: dateStr,
        sleep_duration_hours: sleepDurationHours,
        sleep_quality_score: null, // HealthKit doesn't provide a quality score
        hrv_ms: hrvAvg,
        resting_heart_rate: rhrAvg,
        steps: stepsTotal !== null ? Math.round(stepsTotal) : null,
        active_energy_kcal: energyTotal,
      });
    } catch {
      // If a particular day or metric fails, include it with nulls
      snapshots.push({
        date: dateStr,
        sleep_duration_hours: null,
        sleep_quality_score: null,
        hrv_ms: null,
        resting_heart_rate: null,
        steps: null,
        active_energy_kcal: null,
      });
    }
  }

  return snapshots;
}
