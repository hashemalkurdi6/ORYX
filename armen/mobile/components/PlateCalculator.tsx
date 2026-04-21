/**
 * PlateCalculator — given a target lift weight, compute the plate breakdown
 * per side of a barbell. Supports kg and lb, olympic and standard bars.
 */

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

type Unit = 'kg' | 'lb';

const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
const PLATES_LB = [45, 35, 25, 10, 5, 2.5];
const PLATE_COLORS: Record<string, string> = {
  '25': '#E53935', '20': '#1E88E5', '15': '#FDD835', '10': '#43A047',
  '5': '#424242', '2.5': '#757575', '1.25': '#9E9E9E',
  '45': '#1E88E5', '35': '#FDD835',
};

function breakdown(target: number, bar: number, plates: number[]): { plate: number; count: number }[] {
  let remaining = (target - bar) / 2; // per side
  if (remaining <= 0) return [];
  const out: { plate: number; count: number }[] = [];
  for (const p of plates) {
    const count = Math.floor(remaining / p);
    if (count > 0) {
      out.push({ plate: p, count });
      remaining = Math.round((remaining - count * p) * 100) / 100;
    }
  }
  return out;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  initialTargetKg?: number;
}

export default function PlateCalculator({ visible, onClose, initialTargetKg }: Props) {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [unit, setUnit] = useState<Unit>('kg');
  const [barKg, setBarKg] = useState(20);
  const [targetText, setTargetText] = useState(initialTargetKg ? String(initialTargetKg) : '');

  const target = parseFloat(targetText) || 0;
  const targetKg = unit === 'lb' ? target / 2.20462 : target;
  const barDisplay = unit === 'lb' ? Math.round(barKg * 2.20462) : barKg;
  const plates = unit === 'lb' ? PLATES_LB : PLATES_KG;

  const perSide = useMemo(() => {
    const t = unit === 'lb' ? target : target; // input already in selected unit
    const b = unit === 'lb' ? barDisplay : barKg;
    return breakdown(t, b, plates);
  }, [target, barKg, barDisplay, unit, plates]);

  const perSideSum = perSide.reduce((acc, p) => acc + p.plate * p.count, 0);
  const actual = Math.round((2 * perSideSum + (unit === 'lb' ? barDisplay : barKg)) * 100) / 100;
  const diff = Math.round((target - actual) * 100) / 100;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.wrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <View style={s.handle} />
          <View style={s.headerRow}>
            <Text style={s.title}>Plate Calculator</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color={theme.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Unit toggle */}
          <View style={s.toggleRow}>
            {(['kg', 'lb'] as Unit[]).map((u) => (
              <TouchableOpacity
                key={u}
                onPress={() => setUnit(u)}
                style={[s.toggleBtn, unit === u && s.toggleBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.toggleText, unit === u && s.toggleTextActive]}>{u.toUpperCase()}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target */}
          <Text style={s.label}>Target weight</Text>
          <View style={s.inputRow}>
            <TextInput
              style={s.input}
              value={targetText}
              onChangeText={setTargetText}
              placeholder={unit === 'lb' ? '225' : '100'}
              placeholderTextColor={theme.text.muted}
              keyboardType="decimal-pad"
            />
            <Text style={s.inputUnit}>{unit}</Text>
          </View>

          {/* Bar weight */}
          <Text style={s.label}>Bar</Text>
          <View style={s.barRow}>
            {[20, 15, 10].map((b) => (
              <TouchableOpacity
                key={b}
                onPress={() => setBarKg(b)}
                style={[s.barChip, barKg === b && s.barChipActive]}
                activeOpacity={0.75}
              >
                <Text style={[s.barChipText, barKg === b && s.barChipTextActive]}>
                  {unit === 'lb' ? `${Math.round(b * 2.20462)} lb` : `${b} kg`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Breakdown */}
          <View style={s.resultCard}>
            <Text style={s.resultLabel}>Per side</Text>
            {target <= (unit === 'lb' ? barDisplay : barKg) ? (
              <Text style={s.hint}>Target is at or below the bar weight.</Text>
            ) : perSide.length === 0 ? (
              <Text style={s.hint}>No combination possible with available plates.</Text>
            ) : (
              <View style={s.platesRow}>
                {perSide.map(({ plate, count }) => (
                  <View key={plate} style={[s.plate, { backgroundColor: PLATE_COLORS[String(plate)] ?? theme.text.secondary }]}>
                    <Text style={s.plateCount}>×{count}</Text>
                    <Text style={s.plateWeight}>{plate}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={s.sumRow}>
              <View style={s.sumCell}>
                <Text style={s.sumLabel}>Bar</Text>
                <Text style={s.sumValue}>{unit === 'lb' ? barDisplay : barKg} {unit}</Text>
              </View>
              <View style={s.sumCell}>
                <Text style={s.sumLabel}>Actual</Text>
                <Text style={s.sumValue}>{actual} {unit}</Text>
              </View>
              {diff !== 0 && target > 0 && (
                <View style={s.sumCell}>
                  <Text style={s.sumLabel}>Diff</Text>
                  <Text style={[s.sumValue, { color: theme.readiness.mid }]}>
                    {diff > 0 ? '+' : ''}{diff} {unit}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: t.bg.primary },
    content: { padding: SP[5], paddingBottom: SP[8] },
    handle: { width: 40, height: 4, backgroundColor: t.border, borderRadius: 2, alignSelf: 'center', marginBottom: SP[5] },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[5] },
    title: { fontFamily: TY.sans.bold, fontSize: TY.size.h2, color: t.text.primary, letterSpacing: TY.tracking.tight },
    closeBtn: { width: 36, height: 36, borderRadius: R.pill, backgroundColor: t.bg.elevated, alignItems: 'center', justifyContent: 'center' },

    toggleRow: { flexDirection: 'row', backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.border, borderRadius: R.pill, padding: 4, marginBottom: SP[4] },
    toggleBtn: { flex: 1, paddingVertical: SP[2], alignItems: 'center', borderRadius: R.pill },
    toggleBtnActive: { backgroundColor: t.accent },
    toggleText: { fontFamily: TY.sans.semibold, color: t.text.secondary, fontSize: TY.size.small + 1 },
    toggleTextActive: { color: t.accentInk },

    label: { fontFamily: TY.sans.medium, fontSize: TY.size.small + 1, color: t.text.secondary, marginBottom: SP[2] },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, borderRadius: R.sm, paddingHorizontal: SP[4], marginBottom: SP[4] },
    input: { flex: 1, fontFamily: TY.mono.bold, fontSize: 28, color: t.text.primary, paddingVertical: SP[3], fontVariant: ['tabular-nums'] },
    inputUnit: { fontFamily: TY.mono.medium, fontSize: TY.size.body, color: t.text.muted },

    barRow: { flexDirection: 'row', gap: SP[2], marginBottom: SP[5] },
    barChip: { paddingHorizontal: SP[4], paddingVertical: SP[2] + 2, borderRadius: R.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.glass.card },
    barChipActive: { backgroundColor: t.accent, borderColor: t.accent },
    barChipText: { fontFamily: TY.sans.semibold, fontSize: TY.size.small + 1, color: t.text.secondary },
    barChipTextActive: { color: t.accentInk },

    resultCard: { backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.border, borderRadius: R.md, padding: SP[4], gap: SP[3] },
    resultLabel: { fontFamily: TY.mono.semibold, fontSize: TY.size.tick, color: t.text.muted, letterSpacing: TY.tracking.label, textTransform: 'uppercase' },

    platesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SP[2] - 2 },
    plate: { paddingHorizontal: SP[3], paddingVertical: SP[2] + 2, borderRadius: R.sm, alignItems: 'center', minWidth: 54 },
    plateCount: { fontFamily: TY.mono.bold, color: '#fff', fontSize: TY.size.small + 2 },
    plateWeight: { fontFamily: TY.mono.semibold, color: '#fff', fontSize: TY.size.small, opacity: 0.9 },

    hint: { fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: t.text.muted, paddingVertical: SP[2] },

    sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: SP[3] - 2, paddingTop: SP[3] - 2, borderTopWidth: 1, borderTopColor: t.border },
    sumCell: { gap: 2 },
    sumLabel: { fontFamily: TY.sans.regular, fontSize: TY.size.tick, color: t.text.muted, textTransform: 'uppercase' },
    sumValue: { fontFamily: TY.mono.bold, fontSize: TY.size.body + 1, color: t.text.primary, fontVariant: ['tabular-nums'] },
  });
}
