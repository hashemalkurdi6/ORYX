/**
 * MuscleMap — simplified front+back body outline, highlighting muscle groups
 * hit in a session. Pure react-native-svg; no images, no licensing issues.
 *
 * Accepts an array of muscle keys (chest, back, lats, shoulders, biceps,
 * triceps, quads, hamstrings, glutes, calves, core, traps, forearms). Unknown
 * keys are ignored.
 */

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Ellipse, Rect } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, space as SP } from '@/services/theme';

type MuscleKey =
  | 'chest' | 'back' | 'lats' | 'shoulders' | 'biceps' | 'triceps'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'core' | 'traps' | 'forearms';

interface Props {
  muscles: string[];
  size?: number;
}

const ALL_FRONT: MuscleKey[] = ['chest', 'shoulders', 'biceps', 'forearms', 'quads', 'calves', 'core'];
const ALL_BACK: MuscleKey[] = ['traps', 'back', 'lats', 'triceps', 'glutes', 'hamstrings'];

export default function MuscleMap({ muscles, size = 160 }: Props) {
  const { theme } = useTheme();
  const hit = useMemo(() => new Set(muscles.map((m) => m.toLowerCase())), [muscles]);

  const color = (key: MuscleKey) => (hit.has(key) ? theme.accent : theme.glass.pill);
  const stroke = theme.border;

  const W = size;
  const H = Math.round(size * 1.6);
  const cx = W / 2;

  return (
    <View style={{ flexDirection: 'row', gap: SP[5], alignItems: 'center', justifyContent: 'center' }}>
      {/* FRONT */}
      <View style={{ alignItems: 'center' }}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Head */}
          <Ellipse cx={cx} cy={H * 0.08} rx={W * 0.12} ry={H * 0.06} fill={theme.glass.pill} stroke={stroke} />
          {/* Neck */}
          <Rect x={cx - W * 0.05} y={H * 0.13} width={W * 0.1} height={H * 0.03} fill={theme.glass.pill} stroke={stroke} />

          {/* Shoulders */}
          <Ellipse cx={cx - W * 0.22} cy={H * 0.18} rx={W * 0.1} ry={H * 0.04} fill={color('shoulders')} stroke={stroke} />
          <Ellipse cx={cx + W * 0.22} cy={H * 0.18} rx={W * 0.1} ry={H * 0.04} fill={color('shoulders')} stroke={stroke} />

          {/* Chest */}
          <Path
            d={`M ${cx - W * 0.18} ${H * 0.2} Q ${cx} ${H * 0.18} ${cx + W * 0.18} ${H * 0.2} L ${cx + W * 0.18} ${H * 0.32} Q ${cx} ${H * 0.33} ${cx - W * 0.18} ${H * 0.32} Z`}
            fill={color('chest')}
            stroke={stroke}
          />

          {/* Core (abs) */}
          <Rect x={cx - W * 0.12} y={H * 0.33} width={W * 0.24} height={H * 0.14} fill={color('core')} stroke={stroke} />

          {/* Biceps */}
          <Ellipse cx={cx - W * 0.28} cy={H * 0.25} rx={W * 0.06} ry={H * 0.06} fill={color('biceps')} stroke={stroke} />
          <Ellipse cx={cx + W * 0.28} cy={H * 0.25} rx={W * 0.06} ry={H * 0.06} fill={color('biceps')} stroke={stroke} />

          {/* Forearms */}
          <Ellipse cx={cx - W * 0.32} cy={H * 0.37} rx={W * 0.05} ry={H * 0.07} fill={color('forearms')} stroke={stroke} />
          <Ellipse cx={cx + W * 0.32} cy={H * 0.37} rx={W * 0.05} ry={H * 0.07} fill={color('forearms')} stroke={stroke} />

          {/* Quads */}
          <Path
            d={`M ${cx - W * 0.18} ${H * 0.48} L ${cx - W * 0.04} ${H * 0.48} L ${cx - W * 0.06} ${H * 0.72} L ${cx - W * 0.18} ${H * 0.72} Z`}
            fill={color('quads')}
            stroke={stroke}
          />
          <Path
            d={`M ${cx + W * 0.04} ${H * 0.48} L ${cx + W * 0.18} ${H * 0.48} L ${cx + W * 0.18} ${H * 0.72} L ${cx + W * 0.06} ${H * 0.72} Z`}
            fill={color('quads')}
            stroke={stroke}
          />

          {/* Calves */}
          <Path
            d={`M ${cx - W * 0.16} ${H * 0.74} L ${cx - W * 0.06} ${H * 0.74} L ${cx - W * 0.08} ${H * 0.94} L ${cx - W * 0.14} ${H * 0.94} Z`}
            fill={color('calves')}
            stroke={stroke}
          />
          <Path
            d={`M ${cx + W * 0.06} ${H * 0.74} L ${cx + W * 0.16} ${H * 0.74} L ${cx + W * 0.14} ${H * 0.94} L ${cx + W * 0.08} ${H * 0.94} Z`}
            fill={color('calves')}
            stroke={stroke}
          />
        </Svg>
        <Text style={{ fontFamily: TY.mono.semibold, fontSize: TY.size.tick, color: theme.text.muted, marginTop: 4, letterSpacing: TY.tracking.label }}>
          FRONT
        </Text>
      </View>

      {/* BACK */}
      <View style={{ alignItems: 'center' }}>
        <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {/* Head */}
          <Ellipse cx={cx} cy={H * 0.08} rx={W * 0.12} ry={H * 0.06} fill={theme.glass.pill} stroke={stroke} />
          {/* Traps */}
          <Path
            d={`M ${cx - W * 0.14} ${H * 0.14} Q ${cx} ${H * 0.11} ${cx + W * 0.14} ${H * 0.14} L ${cx + W * 0.12} ${H * 0.22} L ${cx - W * 0.12} ${H * 0.22} Z`}
            fill={color('traps')}
            stroke={stroke}
          />
          {/* Upper back */}
          <Rect x={cx - W * 0.18} y={H * 0.22} width={W * 0.36} height={H * 0.08} fill={color('back')} stroke={stroke} />
          {/* Lats */}
          <Path
            d={`M ${cx - W * 0.22} ${H * 0.3} L ${cx - W * 0.04} ${H * 0.3} L ${cx - W * 0.08} ${H * 0.46} L ${cx - W * 0.24} ${H * 0.42} Z`}
            fill={color('lats')}
            stroke={stroke}
          />
          <Path
            d={`M ${cx + W * 0.04} ${H * 0.3} L ${cx + W * 0.22} ${H * 0.3} L ${cx + W * 0.24} ${H * 0.42} L ${cx + W * 0.08} ${H * 0.46} Z`}
            fill={color('lats')}
            stroke={stroke}
          />
          {/* Triceps */}
          <Ellipse cx={cx - W * 0.28} cy={H * 0.25} rx={W * 0.06} ry={H * 0.06} fill={color('triceps')} stroke={stroke} />
          <Ellipse cx={cx + W * 0.28} cy={H * 0.25} rx={W * 0.06} ry={H * 0.06} fill={color('triceps')} stroke={stroke} />

          {/* Glutes */}
          <Rect x={cx - W * 0.18} y={H * 0.48} width={W * 0.36} height={H * 0.1} fill={color('glutes')} stroke={stroke} />
          {/* Hamstrings */}
          <Path
            d={`M ${cx - W * 0.18} ${H * 0.6} L ${cx - W * 0.04} ${H * 0.6} L ${cx - W * 0.06} ${H * 0.74} L ${cx - W * 0.18} ${H * 0.74} Z`}
            fill={color('hamstrings')}
            stroke={stroke}
          />
          <Path
            d={`M ${cx + W * 0.04} ${H * 0.6} L ${cx + W * 0.18} ${H * 0.6} L ${cx + W * 0.18} ${H * 0.74} L ${cx + W * 0.06} ${H * 0.74} Z`}
            fill={color('hamstrings')}
            stroke={stroke}
          />
          {/* Calves (back view) */}
          <Path
            d={`M ${cx - W * 0.16} ${H * 0.76} L ${cx - W * 0.06} ${H * 0.76} L ${cx - W * 0.08} ${H * 0.94} L ${cx - W * 0.14} ${H * 0.94} Z`}
            fill={color('calves')}
            stroke={stroke}
          />
          <Path
            d={`M ${cx + W * 0.06} ${H * 0.76} L ${cx + W * 0.16} ${H * 0.76} L ${cx + W * 0.14} ${H * 0.94} L ${cx + W * 0.08} ${H * 0.94} Z`}
            fill={color('calves')}
            stroke={stroke}
          />
        </Svg>
        <Text style={{ fontFamily: TY.mono.semibold, fontSize: TY.size.tick, color: theme.text.muted, marginTop: 4, letterSpacing: TY.tracking.label }}>
          BACK
        </Text>
      </View>
    </View>
  );
}

export const MUSCLE_MAP_KEYS = { ALL_FRONT, ALL_BACK };
