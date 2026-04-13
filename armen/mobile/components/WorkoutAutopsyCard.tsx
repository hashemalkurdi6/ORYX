import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Activity } from '@/services/api';

interface WorkoutAutopsyCardProps {
  activity: Activity;
  autopsy: string | null | undefined;
  loading: boolean;
}

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

const SPORT_ICONS: Record<string, IoniconsName> = {
  Run: 'walk-outline',
  TrailRun: 'trail-sign-outline',
  Ride: 'bicycle-outline',
  GravelRide: 'bicycle-outline',
  MountainBikeRide: 'bicycle-outline',
  Swim: 'water-outline',
  Swim_Pool: 'water-outline',
  Walk: 'walk-outline',
  Hike: 'trail-sign-outline',
  WeightTraining: 'barbell-outline',
  Workout: 'barbell-outline',
  Yoga: 'body-outline',
  Rowing: 'boat-outline',
  Kayaking: 'boat-outline',
  Soccer: 'football-outline',
  Tennis: 'tennisball-outline',
  Basketball: 'basketball-outline',
  CrossFit: 'barbell-outline',
  EBikeRide: 'bicycle-outline',
  VirtualRide: 'bicycle-outline',
  VirtualRun: 'walk-outline',
};

function getSportIcon(sportType: string): IoniconsName {
  return SPORT_ICONS[sportType] ?? 'fitness-outline';
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDistance(meters: number | null): string {
  if (meters === null || meters === undefined) return '';
  return `${(meters / 1000).toFixed(2)} km`;
}

export default function WorkoutAutopsyCard({
  activity,
  autopsy,
  loading,
}: WorkoutAutopsyCardProps) {
  const icon = getSportIcon(activity.sport_type);

  const stats: Array<{ label: string; value: string }> = [];
  if (activity.distance_meters != null) {
    stats.push({ label: 'Distance', value: formatDistance(activity.distance_meters) });
  }
  if (activity.pace_per_km_str && activity.pace_per_km_str !== 'N/A') {
    stats.push({ label: 'Pace', value: activity.pace_per_km_str });
  }
  if (activity.avg_heart_rate != null) {
    stats.push({ label: 'Avg HR', value: `${Math.round(activity.avg_heart_rate)} bpm` });
  }

  return (
    <View style={styles.card}>
      {/* Header row */}
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <Ionicons name={icon} size={20} color="#FFFFFF" />
        </View>
        <View style={styles.titleBlock}>
          <Text style={styles.activityName} numberOfLines={1}>
            {activity.name}
          </Text>
          <Text style={styles.activityDate}>{formatDate(activity.start_date)}</Text>
        </View>
        <View style={styles.sportBadge}>
          <Text style={styles.sportBadgeText}>{activity.sport_type}</Text>
        </View>
      </View>

      {/* Stats row */}
      {stats.length > 0 && (
        <View style={styles.statsRow}>
          {stats.map((stat, idx) => (
            <View key={idx} style={styles.statItem}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Autopsy text */}
      <View style={styles.autopsyContainer}>
        {loading ? (
          <View style={styles.generatingRow}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.generatingText}>Generating analysis…</Text>
          </View>
        ) : autopsy ? (
          <Text style={styles.autopsyText}>{autopsy}</Text>
        ) : (
          <Text style={styles.noAutopsyText}>No analysis available.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(224,224,224,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  activityName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f0f0f0',
  },
  activityDate: {
    fontSize: 12,
    color: '#555555',
  },
  sportBadge: {
    backgroundColor: '#0a0a0a',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  sportBadgeText: {
    fontSize: 11,
    color: '#555555',
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 12,
  },
  statItem: {
    gap: 2,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#f0f0f0',
  },
  statLabel: {
    fontSize: 11,
    color: '#555555',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  divider: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginBottom: 12,
  },
  autopsyContainer: {
    minHeight: 36,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  generatingText: {
    fontSize: 13,
    color: '#555555',
    fontStyle: 'italic',
  },
  autopsyText: {
    fontSize: 14,
    color: '#888888',
    lineHeight: 21,
    fontStyle: 'italic',
  },
  noAutopsyText: {
    fontSize: 13,
    color: '#555555',
    fontStyle: 'italic',
  },
});
