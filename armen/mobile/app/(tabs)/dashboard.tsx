import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import {
  getMe,
  getActivities,
  getDailyDiagnosis,
  getWorkoutAutopsy,
  getHealthSnapshots,
  getStravaAuthUrl,
  uploadHealthSnapshots,
  Activity,
  HealthSnapshot,
  DiagnosisResult,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import RecoveryIndicator from '@/components/RecoveryIndicator';
import DiagnosisCard from '@/components/DiagnosisCard';
import WorkoutAutopsyCard from '@/components/WorkoutAutopsyCard';
import SleepHRVChart from '@/components/SleepHRVChart';

export default function DashboardScreen() {
  const { user, setAuth, clearAuth, token } = useAuthStore();

  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [autopsyMap, setAutopsyMap] = useState<Record<string, string | null>>({});
  const [autopsyLoading, setAutopsyLoading] = useState<Record<string, boolean>>({});
  const [healthSnapshots, setHealthSnapshots] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosisLoading, setDiagnosisLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setError(null);

      // 1. Check auth and get user
      const me = await getMe();
      if (token) {
        setAuth(token, {
          id: me.id,
          email: me.email,
          strava_connected: me.strava_connected,
        });
      }

      // 2. Upload HealthKit data on iOS
      if (Platform.OS === 'ios') {
        try {
          const healthData = await fetchLast7DaysHealthData();
          if (healthData.length > 0) {
            await uploadHealthSnapshots(healthData);
          }
        } catch {
          // Non-fatal — continue without HealthKit data
        }
      }

      // 3. Get daily diagnosis
      setDiagnosisLoading(true);
      const [diagnosisResult, activitiesResult, snapshotsResult] =
        await Promise.allSettled([
          getDailyDiagnosis(),
          getActivities(1, 20),
          getHealthSnapshots(7),
        ]);

      if (diagnosisResult.status === 'fulfilled') {
        setDiagnosis(diagnosisResult.value);
      }
      setDiagnosisLoading(false);

      const top3Activities: Activity[] = [];
      if (activitiesResult.status === 'fulfilled') {
        top3Activities.push(...activitiesResult.value.slice(0, 3));
        setActivities(top3Activities);
      }

      if (snapshotsResult.status === 'fulfilled') {
        setHealthSnapshots(snapshotsResult.value);
      }

      // 5. Generate autopsies for activities that don't have one yet
      for (const act of top3Activities) {
        if (!act.autopsy_text) {
          setAutopsyLoading((prev) => ({ ...prev, [act.id]: true }));
          try {
            const result = await getWorkoutAutopsy(act.id);
            setAutopsyMap((prev) => ({ ...prev, [act.id]: result.autopsy }));
          } catch {
            setAutopsyMap((prev) => ({ ...prev, [act.id]: null }));
          } finally {
            setAutopsyLoading((prev) => ({ ...prev, [act.id]: false }));
          }
        } else {
          setAutopsyMap((prev) => ({ ...prev, [act.id]: act.autopsy_text }));
        }
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError?.response?.status === 401) {
        clearAuth();
        router.replace('/(auth)/login');
        return;
      }
      setError('Failed to load data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, setAuth, clearAuth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleConnectStrava = async () => {
    try {
      const { url } = await getStravaAuthUrl();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Error', 'Could not open Strava authorization. Please try again.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6C63FF" />
        <Text style={styles.loadingText}>Loading your fitness data…</Text>
      </View>
    );
  }

  const recoveryScore = diagnosis?.recovery_score ?? 0;
  const recoveryColor = diagnosis?.recovery_color ?? 'yellow';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor="#6C63FF"
          colors={['#6C63FF']}
        />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>ARMEN</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={22} color="#888" />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Recovery Score */}
      <View style={styles.section}>
        <RecoveryIndicator
          score={recoveryScore}
          color={recoveryColor}
          loading={diagnosisLoading}
        />
      </View>

      {/* Diagnosis Card */}
      <View style={styles.section}>
        <DiagnosisCard
          diagnosis={diagnosis?.diagnosis ?? ''}
          mainFactor={diagnosis?.main_factor ?? ''}
          recommendation={diagnosis?.recommendation ?? ''}
          loading={diagnosisLoading}
        />
      </View>

      {/* Connect Strava Banner */}
      {user && !user.strava_connected && (
        <TouchableOpacity
          style={styles.stravaButton}
          onPress={handleConnectStrava}
          activeOpacity={0.85}
        >
          <Ionicons name="fitness-outline" size={20} color="#FFFFFF" />
          <Text style={styles.stravaButtonText}>Connect Strava to Import Workouts</Text>
        </TouchableOpacity>
      )}

      {/* Recent Workouts */}
      {activities.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Workouts</Text>
          {activities.map((act) => (
            <WorkoutAutopsyCard
              key={act.id}
              activity={act}
              autopsy={autopsyMap[act.id] ?? act.autopsy_text}
              loading={autopsyLoading[act.id] ?? false}
            />
          ))}
        </View>
      )}

      {/* Sleep & HRV Chart */}
      {healthSnapshots.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sleep & HRV (7 Days)</Text>
          <SleepHRVChart snapshots={healthSnapshots} />
        </View>
      )}

      {activities.length === 0 && !user?.strava_connected && (
        <View style={styles.emptyState}>
          <Ionicons name="barbell-outline" size={48} color="#333" />
          <Text style={styles.emptyTitle}>No workouts yet</Text>
          <Text style={styles.emptySubtitle}>
            Connect Strava above to import your training history.
          </Text>
        </View>
      )}

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888',
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#6C63FF',
    letterSpacing: 4,
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
  },
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#2D1515',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#F44336',
  },
  errorText: {
    color: '#FF6B6B',
    fontSize: 13,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  stravaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FC4C02',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#FC4C02',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  stravaButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#444',
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomPadding: {
    height: 20,
  },
});
