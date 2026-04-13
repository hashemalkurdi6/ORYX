// ORYX Exercise Library & Sport Types

export type SportCategory = 'strength' | 'cardio' | 'combat' | 'sport' | 'mindBody' | 'other';
export type IntensityKey = 'Easy' | 'Moderate' | 'Hard' | 'Max';

export interface SportType {
  id: string;
  label: string;
  icon: string;
  category: SportCategory;
  met: Record<IntensityKey, number>;
}

export interface ExerciseDefinition {
  id: string;
  name: string;
  muscleGroup: string;
  muscles: string[];
}

// ── Muscle Colors ──────────────────────────────────────────────────────────────

export const MUSCLE_COLORS: Record<string, string> = {
  chest: '#c0392b',
  back: '#888888',
  lats: '#888888',
  shoulders: '#888888',
  biceps: '#888888',
  triceps: '#888888',
  quads: '#888888',
  hamstrings: '#888888',
  glutes: '#888888',
  calves: '#888888',
  core: '#888888',
  traps: '#888888',
  forearms: '#888888',
  full_body: '#888888',
  cardio: '#00B894',
};

// ── Sport Types (30) ───────────────────────────────────────────────────────────

export const SPORT_TYPES: SportType[] = [
  // Strength (6)
  { id: 'strength', label: 'Strength', icon: 'barbell-outline', category: 'strength', met: { Easy: 4.0, Moderate: 5.5, Hard: 7.0, Max: 9.0 } },
  { id: 'crossfit', label: 'CrossFit', icon: 'trophy-outline', category: 'strength', met: { Easy: 5.0, Moderate: 7.0, Hard: 9.0, Max: 12.0 } },
  { id: 'hiit', label: 'HIIT', icon: 'flash-outline', category: 'strength', met: { Easy: 6.0, Moderate: 8.0, Hard: 10.0, Max: 13.0 } },
  { id: 'powerlifting', label: 'Powerlifting', icon: 'barbell-outline', category: 'strength', met: { Easy: 4.0, Moderate: 5.5, Hard: 7.0, Max: 9.0 } },
  { id: 'calisthenics', label: 'Calisthenics', icon: 'body-outline', category: 'strength', met: { Easy: 4.5, Moderate: 6.0, Hard: 7.5, Max: 10.0 } },
  { id: 'olympic_lifting', label: 'Olympic Lifting', icon: 'barbell-outline', category: 'strength', met: { Easy: 4.5, Moderate: 6.5, Hard: 8.5, Max: 11.0 } },
  // Cardio (8)
  { id: 'running', label: 'Running', icon: 'walk-outline', category: 'cardio', met: { Easy: 6.0, Moderate: 8.5, Hard: 11.0, Max: 14.0 } },
  { id: 'cycling', label: 'Cycling', icon: 'bicycle-outline', category: 'cardio', met: { Easy: 4.0, Moderate: 6.5, Hard: 9.0, Max: 12.0 } },
  { id: 'swimming', label: 'Swimming', icon: 'water-outline', category: 'cardio', met: { Easy: 5.0, Moderate: 7.0, Hard: 9.5, Max: 12.0 } },
  { id: 'walking', label: 'Walking', icon: 'walk-outline', category: 'cardio', met: { Easy: 2.8, Moderate: 3.5, Hard: 4.5, Max: 5.5 } },
  { id: 'hiking', label: 'Hiking', icon: 'trail-sign-outline', category: 'cardio', met: { Easy: 4.0, Moderate: 5.5, Hard: 7.0, Max: 9.0 } },
  { id: 'rowing', label: 'Rowing', icon: 'boat-outline', category: 'cardio', met: { Easy: 4.5, Moderate: 6.5, Hard: 8.5, Max: 11.0 } },
  { id: 'elliptical', label: 'Elliptical', icon: 'fitness-outline', category: 'cardio', met: { Easy: 4.0, Moderate: 5.5, Hard: 7.0, Max: 9.0 } },
  { id: 'jump_rope', label: 'Jump Rope', icon: 'infinite-outline', category: 'cardio', met: { Easy: 8.0, Moderate: 10.0, Hard: 12.0, Max: 14.0 } },
  // Combat (5)
  { id: 'mma', label: 'MMA', icon: 'body-outline', category: 'combat', met: { Easy: 6.5, Moderate: 9.0, Hard: 12.0, Max: 14.0 } },
  { id: 'boxing', label: 'Boxing', icon: 'body-outline', category: 'combat', met: { Easy: 6.0, Moderate: 8.5, Hard: 11.0, Max: 13.0 } },
  { id: 'bjj', label: 'BJJ', icon: 'body-outline', category: 'combat', met: { Easy: 5.5, Moderate: 8.0, Hard: 10.5, Max: 13.0 } },
  { id: 'muay_thai', label: 'Muay Thai', icon: 'body-outline', category: 'combat', met: { Easy: 6.5, Moderate: 9.0, Hard: 11.5, Max: 14.0 } },
  { id: 'wrestling', label: 'Wrestling', icon: 'body-outline', category: 'combat', met: { Easy: 6.0, Moderate: 8.5, Hard: 11.0, Max: 13.0 } },
  // Sport (5)
  { id: 'soccer', label: 'Soccer', icon: 'football-outline', category: 'sport', met: { Easy: 5.0, Moderate: 7.5, Hard: 10.0, Max: 12.0 } },
  { id: 'basketball', label: 'Basketball', icon: 'basketball-outline', category: 'sport', met: { Easy: 4.5, Moderate: 7.0, Hard: 9.0, Max: 11.0 } },
  { id: 'tennis', label: 'Tennis', icon: 'tennisball-outline', category: 'sport', met: { Easy: 4.5, Moderate: 6.5, Hard: 8.5, Max: 11.0 } },
  { id: 'padel', label: 'Padel', icon: 'tennisball-outline', category: 'sport', met: { Easy: 4.0, Moderate: 6.0, Hard: 8.0, Max: 10.0 } },
  { id: 'volleyball', label: 'Volleyball', icon: 'football-outline', category: 'sport', met: { Easy: 3.5, Moderate: 5.0, Hard: 7.0, Max: 9.0 } },
  // Mind / Body (3)
  { id: 'yoga', label: 'Yoga', icon: 'leaf-outline', category: 'mindBody', met: { Easy: 2.5, Moderate: 3.5, Hard: 4.5, Max: 6.0 } },
  { id: 'pilates', label: 'Pilates', icon: 'leaf-outline', category: 'mindBody', met: { Easy: 2.5, Moderate: 3.5, Hard: 4.5, Max: 6.0 } },
  { id: 'stretching', label: 'Stretching', icon: 'leaf-outline', category: 'mindBody', met: { Easy: 2.0, Moderate: 2.8, Hard: 3.5, Max: 4.5 } },
  // Other (3)
  { id: 'rock_climbing', label: 'Climbing', icon: 'trending-up-outline', category: 'other', met: { Easy: 5.0, Moderate: 7.0, Hard: 9.0, Max: 11.0 } },
  { id: 'skiing', label: 'Skiing', icon: 'snow-outline', category: 'other', met: { Easy: 4.0, Moderate: 6.5, Hard: 8.5, Max: 11.0 } },
  { id: 'dance', label: 'Dance', icon: 'musical-notes-outline', category: 'other', met: { Easy: 3.5, Moderate: 5.0, Hard: 6.5, Max: 8.5 } },
];

// ── Exercise Library (100+ exercises) ─────────────────────────────────────────

export const EXERCISE_LIBRARY: Record<string, ExerciseDefinition[]> = {
  Chest: [
    { id: 'bench_press', name: 'Bench Press', muscleGroup: 'chest', muscles: ['chest', 'triceps', 'shoulders'] },
    { id: 'incline_bench', name: 'Incline Bench Press', muscleGroup: 'chest', muscles: ['chest', 'triceps', 'shoulders'] },
    { id: 'decline_bench', name: 'Decline Bench Press', muscleGroup: 'chest', muscles: ['chest', 'triceps'] },
    { id: 'dumbbell_fly', name: 'Dumbbell Fly', muscleGroup: 'chest', muscles: ['chest'] },
    { id: 'cable_fly', name: 'Cable Fly', muscleGroup: 'chest', muscles: ['chest'] },
    { id: 'pec_deck', name: 'Pec Deck', muscleGroup: 'chest', muscles: ['chest'] },
    { id: 'push_up', name: 'Push-up', muscleGroup: 'chest', muscles: ['chest', 'triceps', 'core'] },
    { id: 'wide_push_up', name: 'Wide Push-up', muscleGroup: 'chest', muscles: ['chest', 'triceps'] },
    { id: 'dips', name: 'Dips', muscleGroup: 'chest', muscles: ['chest', 'triceps'] },
    { id: 'cable_crossover', name: 'Cable Crossover', muscleGroup: 'chest', muscles: ['chest'] },
    { id: 'chest_press_machine', name: 'Chest Press Machine', muscleGroup: 'chest', muscles: ['chest', 'triceps'] },
    { id: 'landmine_press', name: 'Landmine Press', muscleGroup: 'chest', muscles: ['chest', 'shoulders'] },
  ],
  Back: [
    { id: 'pull_up', name: 'Pull-up', muscleGroup: 'back', muscles: ['lats', 'biceps', 'back'] },
    { id: 'chin_up', name: 'Chin-up', muscleGroup: 'back', muscles: ['lats', 'biceps'] },
    { id: 'barbell_row', name: 'Barbell Row', muscleGroup: 'back', muscles: ['back', 'biceps', 'lats'] },
    { id: 'dumbbell_row', name: 'Dumbbell Row', muscleGroup: 'back', muscles: ['back', 'biceps'] },
    { id: 'cable_row', name: 'Seated Cable Row', muscleGroup: 'back', muscles: ['back', 'biceps'] },
    { id: 'lat_pulldown', name: 'Lat Pulldown', muscleGroup: 'lats', muscles: ['lats', 'biceps'] },
    { id: 'face_pull', name: 'Face Pull', muscleGroup: 'back', muscles: ['shoulders', 'back', 'traps'] },
    { id: 'tbar_row', name: 'T-Bar Row', muscleGroup: 'back', muscles: ['back', 'biceps', 'lats'] },
    { id: 'meadows_row', name: 'Meadows Row', muscleGroup: 'back', muscles: ['back', 'lats'] },
    { id: 'inverted_row', name: 'Inverted Row', muscleGroup: 'back', muscles: ['back', 'biceps'] },
    { id: 'rack_pull', name: 'Rack Pull', muscleGroup: 'back', muscles: ['back', 'glutes', 'traps'] },
    { id: 'good_morning', name: 'Good Morning', muscleGroup: 'back', muscles: ['back', 'hamstrings'] },
    { id: 'back_extension', name: 'Back Extension', muscleGroup: 'back', muscles: ['back', 'glutes'] },
    { id: 'straight_arm_pulldown', name: 'Straight Arm Pulldown', muscleGroup: 'lats', muscles: ['lats', 'back'] },
  ],
  Shoulders: [
    { id: 'overhead_press', name: 'Overhead Press', muscleGroup: 'shoulders', muscles: ['shoulders', 'triceps', 'traps'] },
    { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', muscleGroup: 'shoulders', muscles: ['shoulders', 'triceps'] },
    { id: 'arnold_press', name: 'Arnold Press', muscleGroup: 'shoulders', muscles: ['shoulders'] },
    { id: 'lateral_raise', name: 'Lateral Raise', muscleGroup: 'shoulders', muscles: ['shoulders'] },
    { id: 'front_raise', name: 'Front Raise', muscleGroup: 'shoulders', muscles: ['shoulders'] },
    { id: 'rear_delt_fly', name: 'Rear Delt Fly', muscleGroup: 'shoulders', muscles: ['shoulders', 'back'] },
    { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', muscleGroup: 'shoulders', muscles: ['shoulders'] },
    { id: 'upright_row', name: 'Upright Row', muscleGroup: 'shoulders', muscles: ['shoulders', 'traps'] },
    { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', muscleGroup: 'shoulders', muscles: ['shoulders', 'triceps'] },
    { id: 'shrug', name: 'Shrug', muscleGroup: 'traps', muscles: ['traps', 'shoulders'] },
  ],
  Arms: [
    { id: 'barbell_curl', name: 'Barbell Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'dumbbell_curl', name: 'Dumbbell Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'hammer_curl', name: 'Hammer Curl', muscleGroup: 'biceps', muscles: ['biceps', 'forearms'] },
    { id: 'incline_curl', name: 'Incline Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'preacher_curl', name: 'Preacher Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'cable_curl', name: 'Cable Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'concentration_curl', name: 'Concentration Curl', muscleGroup: 'biceps', muscles: ['biceps'] },
    { id: 'ez_bar_curl', name: 'EZ Bar Curl', muscleGroup: 'biceps', muscles: ['biceps', 'forearms'] },
    { id: 'tricep_pushdown', name: 'Tricep Pushdown', muscleGroup: 'triceps', muscles: ['triceps'] },
    { id: 'skull_crusher', name: 'Skull Crusher', muscleGroup: 'triceps', muscles: ['triceps'] },
    { id: 'close_grip_bench', name: 'Close Grip Bench', muscleGroup: 'triceps', muscles: ['triceps', 'chest'] },
    { id: 'overhead_extension', name: 'Overhead Extension', muscleGroup: 'triceps', muscles: ['triceps'] },
    { id: 'diamond_push_up', name: 'Diamond Push-up', muscleGroup: 'triceps', muscles: ['triceps', 'chest'] },
    { id: 'tricep_kickback', name: 'Tricep Kickback', muscleGroup: 'triceps', muscles: ['triceps'] },
    { id: 'cable_overhead_extension', name: 'Cable Overhead Extension', muscleGroup: 'triceps', muscles: ['triceps'] },
    { id: 'bench_dip', name: 'Bench Dip', muscleGroup: 'triceps', muscles: ['triceps', 'chest'] },
  ],
  Legs: [
    { id: 'squat', name: 'Squat', muscleGroup: 'quads', muscles: ['quads', 'glutes', 'hamstrings', 'core'] },
    { id: 'front_squat', name: 'Front Squat', muscleGroup: 'quads', muscles: ['quads', 'core'] },
    { id: 'leg_press', name: 'Leg Press', muscleGroup: 'quads', muscles: ['quads', 'glutes'] },
    { id: 'hack_squat', name: 'Hack Squat', muscleGroup: 'quads', muscles: ['quads'] },
    { id: 'lunge', name: 'Lunge', muscleGroup: 'quads', muscles: ['quads', 'glutes'] },
    { id: 'bulgarian_split_squat', name: 'Bulgarian Split Squat', muscleGroup: 'quads', muscles: ['quads', 'glutes'] },
    { id: 'rdl', name: 'Romanian Deadlift', muscleGroup: 'hamstrings', muscles: ['hamstrings', 'glutes', 'back'] },
    { id: 'leg_curl', name: 'Leg Curl', muscleGroup: 'hamstrings', muscles: ['hamstrings'] },
    { id: 'leg_extension', name: 'Leg Extension', muscleGroup: 'quads', muscles: ['quads'] },
    { id: 'calf_raise', name: 'Calf Raise', muscleGroup: 'calves', muscles: ['calves'] },
    { id: 'seated_calf_raise', name: 'Seated Calf Raise', muscleGroup: 'calves', muscles: ['calves'] },
    { id: 'step_up', name: 'Step-up', muscleGroup: 'quads', muscles: ['quads', 'glutes'] },
    { id: 'sumo_squat', name: 'Sumo Squat', muscleGroup: 'quads', muscles: ['quads', 'glutes'] },
    { id: 'hip_thrust', name: 'Hip Thrust', muscleGroup: 'glutes', muscles: ['glutes', 'hamstrings'] },
    { id: 'glute_bridge', name: 'Glute Bridge', muscleGroup: 'glutes', muscles: ['glutes'] },
  ],
  Core: [
    { id: 'plank', name: 'Plank', muscleGroup: 'core', muscles: ['core'] },
    { id: 'side_plank', name: 'Side Plank', muscleGroup: 'core', muscles: ['core'] },
    { id: 'crunch', name: 'Crunch', muscleGroup: 'core', muscles: ['core'] },
    { id: 'sit_up', name: 'Sit-up', muscleGroup: 'core', muscles: ['core'] },
    { id: 'russian_twist', name: 'Russian Twist', muscleGroup: 'core', muscles: ['core'] },
    { id: 'leg_raise', name: 'Leg Raise', muscleGroup: 'core', muscles: ['core'] },
    { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', muscleGroup: 'core', muscles: ['core'] },
    { id: 'ab_wheel', name: 'Ab Wheel', muscleGroup: 'core', muscles: ['core', 'shoulders'] },
    { id: 'cable_crunch', name: 'Cable Crunch', muscleGroup: 'core', muscles: ['core'] },
    { id: 'v_up', name: 'V-up', muscleGroup: 'core', muscles: ['core'] },
  ],
  'Full Body': [
    { id: 'deadlift', name: 'Deadlift', muscleGroup: 'full_body', muscles: ['back', 'glutes', 'hamstrings', 'core', 'traps'] },
    { id: 'power_clean', name: 'Power Clean', muscleGroup: 'full_body', muscles: ['full_body'] },
    { id: 'snatch', name: 'Snatch', muscleGroup: 'full_body', muscles: ['full_body'] },
    { id: 'thruster', name: 'Thruster', muscleGroup: 'full_body', muscles: ['quads', 'shoulders', 'core'] },
    { id: 'burpee', name: 'Burpee', muscleGroup: 'full_body', muscles: ['full_body', 'cardio'] },
    { id: 'turkish_getup', name: 'Turkish Get-up', muscleGroup: 'full_body', muscles: ['core', 'shoulders', 'full_body'] },
    { id: 'kettlebell_swing', name: 'Kettlebell Swing', muscleGroup: 'full_body', muscles: ['glutes', 'hamstrings', 'back'] },
    { id: 'box_jump', name: 'Box Jump', muscleGroup: 'full_body', muscles: ['quads', 'glutes', 'calves'] },
    { id: 'clean_and_press', name: 'Clean and Press', muscleGroup: 'full_body', muscles: ['full_body'] },
    { id: 'devil_press', name: 'Devil Press', muscleGroup: 'full_body', muscles: ['full_body'] },
    { id: 'farmers_walk', name: "Farmer's Walk", muscleGroup: 'full_body', muscles: ['traps', 'forearms', 'core'] },
    { id: 'sled_push', name: 'Sled Push', muscleGroup: 'full_body', muscles: ['quads', 'glutes', 'cardio'] },
    { id: 'battle_ropes', name: 'Battle Ropes', muscleGroup: 'full_body', muscles: ['shoulders', 'core', 'cardio'] },
    { id: 'tire_flip', name: 'Tire Flip', muscleGroup: 'full_body', muscles: ['full_body'] },
    { id: 'jump_rope_ex', name: 'Jump Rope', muscleGroup: 'cardio', muscles: ['calves', 'cardio'] },
    { id: 'rowing_machine', name: 'Rowing Machine', muscleGroup: 'full_body', muscles: ['back', 'lats', 'cardio'] },
    { id: 'assault_bike', name: 'Assault Bike', muscleGroup: 'full_body', muscles: ['cardio', 'full_body'] },
    { id: 'ski_erg', name: 'Ski Erg', muscleGroup: 'full_body', muscles: ['back', 'lats', 'cardio'] },
  ],
};

// Flat list for search
export const ALL_EXERCISES: ExerciseDefinition[] = Object.values(EXERCISE_LIBRARY).flat();

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  lats: 'Lats',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
  traps: 'Traps',
  forearms: 'Forearms',
  full_body: 'Full Body',
  cardio: 'Cardio',
};
