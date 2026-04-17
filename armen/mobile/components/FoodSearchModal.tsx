/**
 * FoodSearchModal — complete food logging flow.
 *
 * Screens (internal):
 *   'search'   → search bar + barcode button + results / recent / frequent
 *   'serving'  → serving size selector with real-time macro calculation
 *   'custom'   → manual custom food creator
 *
 * The parent only needs to handle the final logged NutritionLog;
 * all API calls happen inside this component.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import {
  createCustomFood,
  FoodItem,
  FrequentFoodItem,
  getCustomFoods,
  getFrequentFoods,
  getRecentFoods,
  logNutrition,
  lookupBarcode,
  NutritionLog,
  RecentFoodItem,
  searchFoods,
} from '@/services/api';

// ── Types ─────────────────────────────────────────────────────────────────────

type ModalScreen = 'search' | 'serving' | 'custom';
// CustomForm stores every field as a string so TextInput works uniformly;
// values are parsed to numbers in handleSaveCustom before submission.
type CustomForm = Record<string, string>;

const MEAL_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Pre-workout', 'Post-workout'];

const { width: SW } = Dimensions.get('window');

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcMacros(food: FoodItem | SelectedQuickFood, grams: number, servings: number) {
  const totalG = grams * servings;
  const factor = totalG / 100;
  return {
    calories:   Math.round((food.calories_100g  ?? 0) * factor),
    protein:    Math.round((food.protein_100g   ?? 0) * factor * 10) / 10,
    carbs:      Math.round((food.carbs_100g     ?? 0) * factor * 10) / 10,
    fat:        Math.round((food.fat_100g       ?? 0) * factor * 10) / 10,
    fibre:      Math.round((food.fibre_100g     ?? 0) * factor * 10) / 10,
    sugar:      Math.round((food.sugar_100g     ?? 0) * factor * 10) / 10,
    sodium_mg:  Math.round((food.sodium_100g    ?? 0) * factor * 1000 * 10) / 10,
    vitamin_d:  Math.round((food.vitamin_d_100g ?? 0) * factor * 10) / 10,
    magnesium:  Math.round((food.magnesium_100g ?? 0) * factor * 10) / 10,
    iron:       Math.round((food.iron_100g      ?? 0) * factor * 100) / 100,
    calcium:    Math.round((food.calcium_100g   ?? 0) * factor * 10) / 10,
    zinc:       Math.round((food.zinc_100g      ?? 0) * factor * 100) / 100,
    omega3:     Math.round((food.omega3_100g    ?? 0) * factor * 100) / 100,
  };
}

interface SelectedQuickFood {
  name: string;
  brand?: string | null;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fibre_100g: number;
  sugar_100g: number;
  sodium_100g: number;
  vitamin_d_100g: number;
  magnesium_100g: number;
  iron_100g: number;
  calcium_100g: number;
  zinc_100g: number;
  omega3_100g: number;
  serving_size_g?: number | null;
}

function quickFoodFromRecent(r: RecentFoodItem): SelectedQuickFood {
  // Back-calculate per-100g values from the logged amounts (assume 100g serving if unknown)
  return {
    name: r.meal_name,
    calories_100g:  r.calories ?? 0,
    protein_100g:   r.protein_g ?? 0,
    carbs_100g:     r.carbs_g ?? 0,
    fat_100g:       r.fat_g ?? 0,
    fibre_100g:     r.fibre_g ?? 0,
    sugar_100g:     0,
    sodium_100g:    0,
    vitamin_d_100g: 0,
    magnesium_100g: 0,
    iron_100g:      0,
    calcium_100g:   0,
    zinc_100g:      0,
    omega3_100g:    0,
    serving_size_g: 100,
  };
}

// ── Skeleton row ──────────────────────────────────────────────────────────────

function SkeletonRow({ t }: { t: ThemeColors }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
      <View style={{ height: 14, width: SW * 0.55, borderRadius: 4, backgroundColor: t.bg.elevated }} />
      <View style={{ height: 11, width: SW * 0.35, borderRadius: 4, backgroundColor: t.bg.elevated }} />
    </View>
  );
}

// ── Food result row ───────────────────────────────────────────────────────────

function FoodRow({
  item,
  onPress,
  t,
}: {
  item: FoodItem;
  onPress: () => void;
  t: ThemeColors;
}) {
  const serving = item.serving_size_g
    ? `${Math.round(item.serving_size_g)}g serving · `
    : '';
  return (
    <TouchableOpacity
      style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: t.text.primary }} numberOfLines={1}>{item.name}</Text>
          {item.brand ? <Text style={{ fontSize: 12, color: t.text.muted, marginTop: 1 }} numberOfLines={1}>{item.brand}</Text> : null}
          <Text style={{ fontSize: 11, color: t.text.muted, marginTop: 3 }}>
            {serving}{Math.round(item.calories_100g)} kcal/100g
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          <Text style={{ fontSize: 11, color: '#27ae60' }}>P {Math.round(item.protein_100g)}g</Text>
          <Text style={{ fontSize: 11, color: t.text.muted }}>C {Math.round(item.carbs_100g)}g</Text>
          <Text style={{ fontSize: 11, color: '#FF6B35' }}>F {Math.round(item.fat_100g)}g</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ── Quick food row (recent / frequent) ────────────────────────────────────────

function QuickFoodRow({
  name,
  calories,
  protein,
  badge,
  onPress,
  t,
}: {
  name: string;
  calories: number | null;
  protein: number | null;
  badge?: string;
  onPress: () => void;
  t: ThemeColors;
}) {
  return (
    <TouchableOpacity
      style={{ paddingHorizontal: 16, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border }}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, color: t.text.primary }} numberOfLines={1}>{name}</Text>
        {calories != null && (
          <Text style={{ fontSize: 12, color: t.text.muted, marginTop: 1 }}>
            {calories} kcal · P {Math.round(protein ?? 0)}g
          </Text>
        )}
      </View>
      {badge && (
        <View style={{ backgroundColor: t.bg.elevated, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: t.border }}>
          <Text style={{ fontSize: 10, color: t.text.muted }}>{badge}</Text>
        </View>
      )}
      <Ionicons name="add-circle-outline" size={20} color={t.text.muted} style={{ marginLeft: 10 }} />
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onLogged: (log: NutritionLog) => void;
}

export default function FoodSearchModal({ visible, onClose, onLogged }: Props) {
  const { theme: t } = useTheme();
  const s = styles(t);

  const [view, setView]             = useState<ModalScreen>('search');
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<FoodItem[]>([]);
  const [searching, setSearching]   = useState(false);
  const [recent, setRecent]         = useState<RecentFoodItem[]>([]);
  const [frequent, setFrequent]     = useState<FrequentFoodItem[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);

  // Serving selector
  const [selectedFood, setSelectedFood] = useState<FoodItem | null>(null);
  const [servingGrams, setServingGrams] = useState('100');
  const [numServings, setNumServings]   = useState('1');
  const [mealType, setMealType]         = useState('Breakfast');
  const [logging, setLogging]           = useState(false);

  // Barcode scanner
  const [scannerOpen, setScannerOpen]   = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanLoading, setScanLoading]   = useState(false);
  const scannedRef                      = useRef(false);

  // Custom food form
  const [customForm, setCustomForm] = useState<CustomForm>({
    food_name: '', brand: '',
    calories_100g: '', protein_100g: '', carbs_100g: '',
    fat_100g: '', fibre_100g: '', sugar_100g: '',
    serving_size_g: '', serving_unit: '',
  });
  const [savingCustom, setSavingCustom] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load recent/frequent on open ─────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    setView('search');
    setQuery('');
    setResults([]);
    setSelectedFood(null);
    setServingGrams('100');
    setNumServings('1');
    scannedRef.current = false;

    Promise.allSettled([getRecentFoods(), getFrequentFoods(), getCustomFoods()])
      .then(([r, f, c]) => {
        if (r.status === 'fulfilled') setRecent(r.value);
        if (f.status === 'fulfilled') setFrequent(f.value);
        if (c.status === 'fulfilled') {
          setCustomFoods(c.value.map((cf) => ({
            id: cf.id,
            name: cf.food_name,
            brand: cf.brand ?? null,
            source: 'custom' as const,
            calories_100g: cf.calories_100g,
            protein_100g: cf.protein_100g,
            carbs_100g: cf.carbs_100g,
            fat_100g: cf.fat_100g,
            fibre_100g: cf.fibre_100g,
            sugar_100g: cf.sugar_100g,
            sodium_100g: cf.sodium_100g,
            serving_size_g: cf.serving_size_g ?? null,
            serving_unit: cf.serving_unit ?? null,
          })));
        }
      });
  }, [visible]);

  // ── Debounced search ──────────────────────────────────────────────────────

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      console.log('[FoodSearch] searching for:', query.trim());
      try {
        const res = await searchFoods(query.trim());
        console.log('[FoodSearch] got', res.results.length, 'results for', query.trim());
        setResults(res.results);
      } catch (err) {
        console.error('[FoodSearch] search error:', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  // ── Select food → go to serving selector ─────────────────────────────────

  const selectFood = useCallback((food: FoodItem) => {
    setSelectedFood(food);
    const defaultGrams = food.serving_size_g ? String(Math.round(food.serving_size_g)) : '100';
    setServingGrams(defaultGrams);
    setNumServings('1');
    setView('serving');
  }, []);

  const selectQuickFood = useCallback((qf: SelectedQuickFood) => {
    const asFoodItem: FoodItem = {
      id: `quick_${qf.name}`,
      name: qf.name,
      brand: qf.brand ?? null,
      source: 'openfoodfacts',
      calories_100g:  qf.calories_100g,
      protein_100g:   qf.protein_100g,
      carbs_100g:     qf.carbs_100g,
      fat_100g:       qf.fat_100g,
      fibre_100g:     qf.fibre_100g,
      sugar_100g:     qf.sugar_100g,
      sodium_100g:    qf.sodium_100g,
      vitamin_d_100g: qf.vitamin_d_100g,
      magnesium_100g: qf.magnesium_100g,
      iron_100g:      qf.iron_100g,
      calcium_100g:   qf.calcium_100g,
      zinc_100g:      qf.zinc_100g,
      omega3_100g:    qf.omega3_100g,
      serving_size_g: qf.serving_size_g ?? null,
      serving_unit: null,
    };
    selectFood(asFoodItem);
  }, [selectFood]);

  // ── Log the meal ──────────────────────────────────────────────────────────

  const handleConfirmLog = async () => {
    if (!selectedFood) return;
    const grams = parseFloat(servingGrams) || 100;
    const servings = parseFloat(numServings) || 1;
    const macros = calcMacros(selectedFood, grams, servings);

    setLogging(true);
    try {
      const log = await logNutrition({
        meal_name: selectedFood.brand
          ? `${selectedFood.name} (${selectedFood.brand})`
          : selectedFood.name,
        calories:     macros.calories,
        protein_g:    macros.protein,
        carbs_g:      macros.carbs,
        fat_g:        macros.fat,
        fibre_g:      macros.fibre,
        sugar_g:      macros.sugar,
        sodium_mg:    macros.sodium_mg,
        vitamin_d_iu: macros.vitamin_d,
        magnesium_mg: macros.magnesium,
        iron_mg:      macros.iron,
        calcium_mg:   macros.calcium,
        zinc_mg:      macros.zinc,
        omega3_g:     macros.omega3,
        meal_type: mealType.toLowerCase().replace('-', '_'),
        source:    selectedFood.source,
        notes:     `${grams * servings}g · ${selectedFood.source}`,
      });
      onLogged(log);
      onClose();
    } catch {
      Alert.alert('Error', 'Failed to log meal. Please try again.');
    } finally {
      setLogging(false);
    }
  };

  // ── Barcode scanner ───────────────────────────────────────────────────────

  const openScanner = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        Alert.alert('Camera Required', 'Please enable camera access in Settings to scan barcodes.');
        return;
      }
    }
    scannedRef.current = false;
    setScannerOpen(true);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current || scanLoading) return;
    scannedRef.current = true;
    setScanLoading(true);
    setScannerOpen(false);
    console.log('[Barcode] scanned value:', data);
    try {
      const food = await lookupBarcode(data);
      console.log('[Barcode] found:', food.name, '—', food.calories_100g, 'kcal/100g');
      selectFood(food);
    } catch (err) {
      console.error('[Barcode] lookup error:', err);
      Alert.alert(
        'Product Not Found',
        'This barcode isn\'t in our database yet. Try searching by name instead.',
        [{ text: 'OK', onPress: () => { scannedRef.current = false; } }],
      );
    } finally {
      setScanLoading(false);
    }
  };

  // ── Dev test helpers (only in __DEV__ mode) ───────────────────────────────

  const runTestSearch = () => setQuery('banana');

  const runTestBarcode = async () => {
    console.log('[DevTest] simulating barcode scan: 5449000000996 (Coca-Cola)');
    await handleBarcodeScanned({ data: '5449000000996' });
  };

  // ── Save custom food ──────────────────────────────────────────────────────

  const handleSaveCustom = async () => {
    if (!customForm.food_name.trim()) {
      Alert.alert('Required', 'Please enter a food name.');
      return;
    }
    setSavingCustom(true);
    try {
      const saved = await createCustomFood({
        food_name: customForm.food_name.trim(),
        brand: customForm.brand?.trim() || undefined,
        calories_100g:  parseFloat(String(customForm.calories_100g))  || 0,
        protein_100g:   parseFloat(String(customForm.protein_100g))   || 0,
        carbs_100g:     parseFloat(String(customForm.carbs_100g))     || 0,
        fat_100g:       parseFloat(String(customForm.fat_100g))       || 0,
        fibre_100g:     parseFloat(String(customForm.fibre_100g))     || 0,
        sugar_100g:     parseFloat(String(customForm.sugar_100g))     || 0,
        serving_size_g: parseFloat(String(customForm.serving_size_g)) || undefined,
        serving_unit:   customForm.serving_unit?.trim() || undefined,
      });
      // Select this food immediately
      selectFood({
        id: saved.id,
        name: saved.food_name,
        brand: saved.brand ?? null,
        source: 'custom',
        calories_100g: saved.calories_100g,
        protein_100g:  saved.protein_100g,
        carbs_100g:    saved.carbs_100g,
        fat_100g:      saved.fat_100g,
        fibre_100g:    saved.fibre_100g,
        sugar_100g:    saved.sugar_100g,
        sodium_100g:   saved.sodium_100g,
        serving_size_g: saved.serving_size_g ?? null,
        serving_unit:   saved.serving_unit ?? null,
      });
      setCustomForm({ food_name: '', brand: '', calories_100g: '', protein_100g: '', carbs_100g: '', fat_100g: '', fibre_100g: '', sugar_100g: '', serving_size_g: '', serving_unit: '' } as any);
    } catch {
      Alert.alert('Error', 'Failed to save custom food.');
    } finally {
      setSavingCustom(false);
    }
  };

  // ── Macro preview (live) ──────────────────────────────────────────────────

  const liveMacros = selectedFood
    ? calcMacros(selectedFood, parseFloat(servingGrams) || 0, parseFloat(numServings) || 1)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* ── Barcode scanner overlay ── */}
        {scannerOpen && (
          <View style={s.scannerOverlay}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a', 'upc_e', 'ean8'] }}
              onBarcodeScanned={handleBarcodeScanned}
            />
            <View style={s.scannerFrame} />
            <Text style={s.scannerHint}>Point at barcode to scan</Text>
            <TouchableOpacity style={s.scannerClose} onPress={() => setScannerOpen(false)}>
              <Ionicons name="close-circle" size={36} color="#ffffff" />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Search view ── */}
        {view === 'search' && (
          <>
            {/* Header */}
            <View style={s.header}>
              <View style={s.handle} />
              <View style={s.headerRow}>
                <Text style={s.title}>Log Food</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={22} color={t.text.muted} />
                </TouchableOpacity>
              </View>

              {/* Search bar + barcode button */}
              <View style={s.searchRow}>
                <View style={s.searchBar}>
                  <Ionicons name="search" size={16} color={t.text.muted} />
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search 3M+ foods..."
                    placeholderTextColor={t.text.muted}
                    value={query}
                    onChangeText={setQuery}
                    autoCorrect={false}
                    returnKeyType="search"
                  />
                  {query.length > 0 && (
                    <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle" size={16} color={t.text.muted} />
                    </TouchableOpacity>
                  )}
                </View>
                <TouchableOpacity style={s.barcodeBtn} onPress={openScanner} disabled={scanLoading}>
                  {scanLoading
                    ? <ActivityIndicator size="small" color={t.text.secondary} />
                    : <Ionicons name="barcode-outline" size={22} color={t.text.secondary} />}
                </TouchableOpacity>
              </View>

              {/* Dev test strip — only visible in development builds */}
              {__DEV__ && (
                <View style={{ flexDirection: 'row', gap: 8, paddingTop: 8 }}>
                  <TouchableOpacity
                    onPress={runTestSearch}
                    style={{ flex: 1, backgroundColor: '#1a3a1a', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 11, color: '#27ae60', fontWeight: '600' }}>🔍 Test: banana</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={runTestBarcode}
                    style={{ flex: 1, backgroundColor: '#1a1a3a', borderRadius: 8, paddingVertical: 6, alignItems: 'center' }}
                  >
                    <Text style={{ fontSize: 11, color: '#6b8cff', fontWeight: '600' }}>📱 Test: Coca-Cola</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
              {/* Searching state — skeleton loaders */}
              {searching && (
                <View>
                  {[0, 1, 2, 3, 4].map((i) => <SkeletonRow key={i} t={t} />)}
                </View>
              )}

              {/* Search results */}
              {!searching && query.trim().length > 0 && (
                <>
                  {results.length === 0 ? (
                    <View style={s.emptyState}>
                      <Ionicons name="search-outline" size={32} color={t.text.muted} />
                      <Text style={s.emptyText}>No results for "{query}"</Text>
                      <TouchableOpacity onPress={() => setView('custom')} style={s.createFoodBtn}>
                        <Ionicons name="add" size={16} color="#27ae60" />
                        <Text style={s.createFoodBtnText}>Create Custom Food</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    results.map((item) => (
                      <FoodRow key={item.id} item={item} onPress={() => selectFood(item)} t={t} />
                    ))
                  )}
                </>
              )}

              {/* Idle state — recent + frequent + custom */}
              {!searching && query.trim().length === 0 && (
                <>
                  {/* Custom foods */}
                  {customFoods.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>MY FOODS</Text>
                      {customFoods.map((cf) => (
                        <FoodRow key={cf.id} item={cf} onPress={() => selectFood(cf)} t={t} />
                      ))}
                    </>
                  )}

                  {/* Recent */}
                  {recent.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>RECENT</Text>
                      {recent.map((r, i) => (
                        <QuickFoodRow
                          key={`recent-${i}`}
                          name={r.meal_name}
                          calories={r.calories}
                          protein={r.protein_g}
                          onPress={() => selectQuickFood(quickFoodFromRecent(r))}
                          t={t}
                        />
                      ))}
                    </>
                  )}

                  {/* Frequent */}
                  {frequent.length > 0 && (
                    <>
                      <Text style={s.sectionLabel}>FREQUENT</Text>
                      {frequent.map((f, i) => (
                        <QuickFoodRow
                          key={`freq-${i}`}
                          name={f.meal_name}
                          calories={f.calories}
                          protein={f.protein_g}
                          badge={`×${f.log_count}`}
                          onPress={() => selectQuickFood(quickFoodFromRecent(f as any))}
                          t={t}
                        />
                      ))}
                    </>
                  )}

                  {/* Create custom food button */}
                  <TouchableOpacity style={s.createFoodRow} onPress={() => setView('custom')}>
                    <Ionicons name="add-circle-outline" size={20} color="#27ae60" />
                    <Text style={s.createFoodRowText}>Create Custom Food</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </>
        )}

        {/* ── Serving selector ── */}
        {view === 'serving' && selectedFood && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={s.header}>
              <View style={s.handle} />
              <View style={s.headerRow}>
                <TouchableOpacity onPress={() => setView('search')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color={t.text.secondary} />
                </TouchableOpacity>
                <View style={{ flex: 1, paddingHorizontal: 8 }}>
                  <Text style={s.servingFoodName} numberOfLines={1}>{selectedFood.name}</Text>
                  {selectedFood.brand && <Text style={s.servingBrand} numberOfLines={1}>{selectedFood.brand}</Text>}
                </View>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={t.text.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ paddingHorizontal: 20 }}>
              {/* Calorie hero */}
              <View style={s.calorieHero}>
                <Text style={s.calorieNum}>{liveMacros?.calories ?? 0}</Text>
                <Text style={s.calorieUnit}>kcal</Text>
              </View>

              {/* Macro row */}
              <View style={s.macroRow}>
                {[
                  { label: 'Protein', value: liveMacros?.protein ?? 0, color: '#27ae60' },
                  { label: 'Carbs',   value: liveMacros?.carbs   ?? 0, color: t.text.muted },
                  { label: 'Fat',     value: liveMacros?.fat     ?? 0, color: '#FF6B35' },
                  { label: 'Fibre',   value: liveMacros?.fibre   ?? 0, color: '#888888' },
                ].map((m) => (
                  <View key={m.label} style={s.macroItem}>
                    <Text style={[s.macroVal, { color: m.color }]}>{m.value}g</Text>
                    <Text style={s.macroLbl}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* Serving grams */}
              <Text style={s.fieldLabel}>Serving size (g)</Text>
              <View style={s.inputRow}>
                <TextInput
                  style={s.numInput}
                  value={servingGrams}
                  onChangeText={setServingGrams}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
                <Text style={s.inputUnit}>g</Text>
              </View>

              {/* Quick serving presets */}
              <View style={s.presetRow}>
                {[
                  { label: '100g', grams: 100 },
                  ...(selectedFood.serving_size_g
                    ? [{ label: selectedFood.serving_unit || `1 serving (${Math.round(selectedFood.serving_size_g)}g)`, grams: Math.round(selectedFood.serving_size_g) }]
                    : []),
                  { label: '200g', grams: 200 },
                  { label: '50g', grams: 50 },
                ].map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    style={[s.presetBtn, parseFloat(servingGrams) === preset.grams && s.presetBtnActive]}
                    onPress={() => setServingGrams(String(preset.grams))}
                  >
                    <Text style={[s.presetBtnText, parseFloat(servingGrams) === preset.grams && s.presetBtnTextActive]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Number of servings */}
              <Text style={s.fieldLabel}>Number of servings</Text>
              <View style={s.inputRow}>
                <TouchableOpacity
                  style={s.stepBtn}
                  onPress={() => setNumServings((v) => String(Math.max(0.25, (parseFloat(v) || 1) - 0.25)))}
                >
                  <Ionicons name="remove" size={18} color={t.text.primary} />
                </TouchableOpacity>
                <TextInput
                  style={[s.numInput, { flex: 1, textAlign: 'center' }]}
                  value={numServings}
                  onChangeText={setNumServings}
                  keyboardType="numeric"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={s.stepBtn}
                  onPress={() => setNumServings((v) => String((parseFloat(v) || 1) + 0.25))}
                >
                  <Ionicons name="add" size={18} color={t.text.primary} />
                </TouchableOpacity>
              </View>

              {/* Meal type */}
              <Text style={s.fieldLabel}>Meal type</Text>
              <View style={s.mealTypeGrid}>
                {MEAL_TYPES.map((mt) => (
                  <TouchableOpacity
                    key={mt}
                    style={[s.mealTypeChip, mealType === mt && s.mealTypeChipActive]}
                    onPress={() => setMealType(mt)}
                  >
                    <Text style={[s.mealTypeText, mealType === mt && s.mealTypeTextActive]}>{mt}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Confirm button */}
              <TouchableOpacity
                style={[s.confirmBtn, logging && { opacity: 0.6 }]}
                onPress={handleConfirmLog}
                disabled={logging}
                activeOpacity={0.85}
              >
                {logging
                  ? <ActivityIndicator size="small" color="#0a0a0a" />
                  : <Text style={s.confirmBtnText}>Log Meal</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* ── Custom food creator ── */}
        {view === 'custom' && (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
            <View style={s.header}>
              <View style={s.handle} />
              <View style={s.headerRow}>
                <TouchableOpacity onPress={() => setView('search')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="chevron-back" size={22} color={t.text.secondary} />
                </TouchableOpacity>
                <Text style={s.title}>Create Custom Food</Text>
                <TouchableOpacity onPress={onClose}>
                  <Ionicons name="close" size={22} color={t.text.muted} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={{ paddingHorizontal: 20, gap: 14 }}>
              <View>
                <Text style={s.fieldLabel}>Food name *</Text>
                <TextInput
                  style={s.textField}
                  placeholder="e.g. Homemade Granola"
                  placeholderTextColor={t.text.muted}
                  value={customForm.food_name as string}
                  onChangeText={(v) => setCustomForm((p) => ({ ...p, food_name: v }))}
                  autoFocus
                />
              </View>
              <View>
                <Text style={s.fieldLabel}>Brand (optional)</Text>
                <TextInput
                  style={s.textField}
                  placeholder="Brand name"
                  placeholderTextColor={t.text.muted}
                  value={customForm.brand as string}
                  onChangeText={(v) => setCustomForm((p) => ({ ...p, brand: v }))}
                />
              </View>

              <Text style={[s.fieldLabel, { marginBottom: -6 }]}>Nutrition per 100g</Text>
              <View style={s.macroGrid}>
                {[
                  { key: 'calories_100g',  label: 'Calories', unit: 'kcal' },
                  { key: 'protein_100g',   label: 'Protein',  unit: 'g' },
                  { key: 'carbs_100g',     label: 'Carbs',    unit: 'g' },
                  { key: 'fat_100g',       label: 'Fat',      unit: 'g' },
                  { key: 'fibre_100g',     label: 'Fibre',    unit: 'g' },
                  { key: 'sugar_100g',     label: 'Sugar',    unit: 'g' },
                ].map(({ key, label, unit }) => (
                  <View key={key} style={s.macroInputBox}>
                    <TextInput
                      style={s.macroBoxInput}
                      placeholder="—"
                      placeholderTextColor={t.border}
                      keyboardType="numeric"
                      value={customForm[key] as string}
                      onChangeText={(v) => setCustomForm((p) => ({ ...p, [key]: v }))}
                    />
                    <Text style={s.macroBoxUnit}>{unit}</Text>
                    <Text style={s.macroBoxLabel}>{label}</Text>
                  </View>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Serving size</Text>
                  <TextInput
                    style={s.textField}
                    placeholder="e.g. 30"
                    placeholderTextColor={t.text.muted}
                    keyboardType="numeric"
                    value={customForm.serving_size_g as string}
                    onChangeText={(v) => setCustomForm((p) => ({ ...p, serving_size_g: v }))}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.fieldLabel}>Unit</Text>
                  <TextInput
                    style={s.textField}
                    placeholder="e.g. g, cup, slice"
                    placeholderTextColor={t.text.muted}
                    value={customForm.serving_unit as string}
                    onChangeText={(v) => setCustomForm((p) => ({ ...p, serving_unit: v }))}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[s.confirmBtn, savingCustom && { opacity: 0.6 }]}
                onPress={handleSaveCustom}
                disabled={savingCustom}
                activeOpacity={0.85}
              >
                {savingCustom
                  ? <ActivityIndicator size="small" color="#0a0a0a" />
                  : <Text style={s.confirmBtnText}>Save & Log</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
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
    header: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderColor: t.border,
    },
    handle: {
      width: 40, height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginVertical: 12,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
    },

    // Search bar
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    searchBar: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: t.border,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: t.text.primary,
    },
    barcodeBtn: {
      width: 46,
      height: 46,
      borderRadius: 12,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Barcode scanner
    scannerOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
      zIndex: 100,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerFrame: {
      width: 260,
      height: 160,
      borderRadius: 12,
      borderWidth: 3,
      borderColor: '#27ae60',
    },
    scannerHint: {
      marginTop: 20,
      fontSize: 14,
      color: '#ffffff',
    },
    scannerClose: {
      position: 'absolute',
      top: 56,
      right: 20,
    },

    // Sections
    sectionLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      paddingHorizontal: 16,
      paddingTop: 20,
      paddingBottom: 8,
    },
    emptyState: {
      alignItems: 'center',
      paddingVertical: 40,
      gap: 12,
    },
    emptyText: {
      fontSize: 14,
      color: t.text.muted,
    },
    createFoodBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: '#27ae60',
    },
    createFoodBtnText: {
      fontSize: 14,
      color: '#27ae60',
      fontWeight: '600',
    },
    createFoodRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 16,
      marginTop: 8,
    },
    createFoodRowText: {
      fontSize: 14,
      color: '#27ae60',
      fontWeight: '600',
    },

    // Serving selector
    servingFoodName: {
      fontSize: 16,
      fontWeight: '700',
      color: t.text.primary,
    },
    servingBrand: {
      fontSize: 12,
      color: t.text.muted,
      marginTop: 1,
    },
    calorieHero: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 20,
    },
    calorieNum: {
      fontSize: 52,
      fontWeight: '800',
      color: t.text.primary,
      fontVariant: ['tabular-nums'],
    },
    calorieUnit: {
      fontSize: 18,
      color: t.text.muted,
      marginBottom: 10,
    },
    macroRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      backgroundColor: t.bg.elevated,
      borderRadius: 14,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 20,
    },
    macroItem: {
      alignItems: 'center',
      gap: 2,
    },
    macroVal: {
      fontSize: 16,
      fontWeight: '700',
    },
    macroLbl: {
      fontSize: 11,
      color: t.text.muted,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 8,
      marginTop: 4,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    numInput: {
      backgroundColor: t.bg.elevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
      minWidth: 80,
    },
    inputUnit: {
      fontSize: 14,
      color: t.text.muted,
    },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: 10,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    presetRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 20,
    },
    presetBtn: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg.elevated,
    },
    presetBtnActive: {
      borderColor: '#27ae60',
      backgroundColor: 'rgba(39,174,96,0.08)',
    },
    presetBtnText: {
      fontSize: 13,
      color: t.text.secondary,
    },
    presetBtnTextActive: {
      color: '#27ae60',
      fontWeight: '600',
    },
    mealTypeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 24,
    },
    mealTypeChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg.elevated,
    },
    mealTypeChipActive: {
      borderColor: '#27ae60',
      backgroundColor: 'rgba(39,174,96,0.08)',
    },
    mealTypeText: {
      fontSize: 13,
      color: t.text.secondary,
    },
    mealTypeTextActive: {
      color: '#27ae60',
      fontWeight: '600',
    },
    confirmBtn: {
      backgroundColor: '#27ae60',
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
    },
    confirmBtnText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#0a0a0a',
    },

    // Custom food form
    textField: {
      backgroundColor: t.bg.elevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: t.text.primary,
    },
    macroGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    macroInputBox: {
      width: (SW - 40 - 20) / 3,
      backgroundColor: t.bg.elevated,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
      alignItems: 'center',
    },
    macroBoxInput: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
      textAlign: 'center',
      width: '100%',
    },
    macroBoxUnit: {
      fontSize: 10,
      color: t.text.muted,
    },
    macroBoxLabel: {
      fontSize: 11,
      color: t.text.muted,
      marginTop: 2,
    },
  });
}
