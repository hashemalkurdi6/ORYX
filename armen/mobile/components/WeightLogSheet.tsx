/**
 * WeightLogSheet — bottom-sheet modal for logging weight.
 * Used from both Home (Quick Actions) and Profile (WEIGHT section).
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { logWeight, WeightLogResult } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onLogged: (result: WeightLogResult) => void;
  currentWeightKg?: number | null;
  displayUnit?: 'kg' | 'lbs';
}

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

function lbsToKg(lbs: number): number {
  return Math.round((lbs / 2.20462) * 100) / 100;
}

export default function WeightLogSheet({
  visible,
  onClose,
  onLogged,
  currentWeightKg,
  displayUnit = 'kg',
}: Props) {
  const { theme } = useTheme();
  const s = createStyles(theme);

  const defaultDisplay = currentWeightKg
    ? displayUnit === 'lbs'
      ? String(kgToLbs(currentWeightKg))
      : String(currentWeightKg)
    : '';

  const [value, setValue] = useState(defaultDisplay);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      setValue(defaultDisplay);
      setNote('');
    }
  }, [visible]);

  const unit = displayUnit;

  async function handleSave() {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert('Invalid weight', `Please enter a valid weight in ${unit}.`);
      return;
    }

    const kg = unit === 'lbs' ? lbsToKg(parsed) : parsed;
    if (kg < 30 || kg > 300) {
      Alert.alert('Invalid weight', 'Weight must be between 30 and 300 kg.');
      return;
    }

    setSaving(true);
    try {
      const result = await logWeight(kg, note || undefined);
      onLogged(result);
      onClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Please try again.';
      Alert.alert('Could not save', msg);
    } finally {
      setSaving(false);
    }
  }

  // Step buttons: +/- 0.5 in display unit
  function step(delta: number) {
    const current = parseFloat(value) || (currentWeightKg ? (unit === 'lbs' ? kgToLbs(currentWeightKg) : currentWeightKg) : 70);
    const next = Math.round((current + delta) * 10) / 10;
    if (next <= 0) return;
    setValue(String(next));
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'position' : undefined}
          >
            <TouchableWithoutFeedback onPress={() => {}}>
              <View style={s.sheet}>
                {/* Handle */}
                <View style={s.handle} />

                {/* Header */}
                <View style={s.header}>
                  <Text style={s.title}>Log Weight</Text>
                  <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                    <Ionicons name="close" size={22} color={theme.text.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Weight input row */}
                <View style={s.inputRow}>
                  <TouchableOpacity style={s.stepBtn} onPress={() => step(-0.5)}>
                    <Ionicons name="remove" size={22} color={theme.text.secondary} />
                  </TouchableOpacity>

                  <View style={s.weightInputWrap}>
                    <TextInput
                      style={s.weightInput}
                      value={value}
                      onChangeText={setValue}
                      keyboardType="decimal-pad"
                      placeholder={unit === 'lbs' ? '154.0' : '70.0'}
                      placeholderTextColor={theme.text.muted}
                      selectTextOnFocus
                    />
                    <Text style={s.unitLabel}>{unit}</Text>
                  </View>

                  <TouchableOpacity style={s.stepBtn} onPress={() => step(0.5)}>
                    <Ionicons name="add" size={22} color={theme.text.secondary} />
                  </TouchableOpacity>
                </View>

                {/* Note input */}
                <TextInput
                  style={s.noteInput}
                  value={note}
                  onChangeText={setNote}
                  placeholder="Note (optional)"
                  placeholderTextColor={theme.text.muted}
                  returnKeyType="done"
                />

                {/* Save button */}
                <TouchableOpacity
                  style={[s.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#000" size="small" />
                  ) : (
                    <Text style={s.saveBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: t.bg.elevated,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: Platform.OS === 'ios' ? 36 : 24,
      paddingTop: 12,
      gap: 16,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: t.border,
      alignSelf: 'center',
      marginBottom: 4,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
    },
    closeBtn: {
      padding: 4,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
    },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: t.bg.primary,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    weightInputWrap: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    weightInput: {
      fontSize: 42,
      fontWeight: '700',
      color: t.text.primary,
      minWidth: 90,
      textAlign: 'center',
    },
    unitLabel: {
      fontSize: 18,
      color: t.text.secondary,
      fontWeight: '500',
    },
    noteInput: {
      backgroundColor: t.bg.primary,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
      fontSize: 15,
      color: t.text.primary,
    },
    saveBtn: {
      backgroundColor: '#ffffff',
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#000000',
    },
  });
}
