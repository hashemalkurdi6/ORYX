# Component inventory

Reusable components in [armen/mobile/components/](../../armen/mobile/components/). Use this before building anything new — half the time the thing you need already exists.

## Cards / surfaces

### `GlassCard`
**File:** [armen/mobile/components/GlassCard.tsx](../../armen/mobile/components/GlassCard.tsx)
**Default export.** The canonical card primitive. Translucent on dark, solid + shadow on light.
**Props:** `children`, `variant?`, `padding?`, `radius?`, `style?`, `onPress?`, `accentEdge?: 'left' | 'top' | null`, `accentColor?`, `accentThickness?`, `blur?`, `blurIntensity?` (1–100, default 30), `testID?`.

### `AmbientBackdrop`
**File:** [armen/mobile/components/AmbientBackdrop.tsx](../../armen/mobile/components/AmbientBackdrop.tsx)
**Default export.** No props. Renders the radial ambient glow behind hero surfaces (readiness ring, etc.).

## Dashboard / wellness

### `DiagnosisCard`
**File:** [armen/mobile/components/DiagnosisCard.tsx](../../armen/mobile/components/DiagnosisCard.tsx)
**Props:** `label: string`, `text: string`, `loading: boolean`.

### `WorkoutAutopsyCard`
**File:** [armen/mobile/components/WorkoutAutopsyCard.tsx](../../armen/mobile/components/WorkoutAutopsyCard.tsx)
**Props:** `activity: Activity`, `autopsy: string | null | undefined`, `loading: boolean`. Internal `SPORT_ICONS` map covers Run / Ride / Swim / WeightTraining / etc.

### `RecoveryIndicator`
**File:** [armen/mobile/components/RecoveryIndicator.tsx](../../armen/mobile/components/RecoveryIndicator.tsx)
**Props:** `score: number`, `color: 'green' | 'yellow' | 'red'`, `loading: boolean`.

### `SleepHRVChart`
**File:** [armen/mobile/components/SleepHRVChart.tsx](../../armen/mobile/components/SleepHRVChart.tsx)
**Props:** `snapshots: HealthSnapshot[]`.

### `DeloadCard`
**File:** [armen/mobile/components/DeloadCard.tsx](../../armen/mobile/components/DeloadCard.tsx)
**Props:** `recommendation: DeloadRecommendation | null`, `loading: boolean`, `onDismiss: () => void`.

## Activity / workout

### `OutdoorTracker`
**File:** [armen/mobile/components/OutdoorTracker.tsx](../../armen/mobile/components/OutdoorTracker.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `onSave: (activity: SavedOutdoorActivity) => void`. Live GPS workout tracker — modal.

### `WarmUpModal`
**File:** [armen/mobile/components/WarmUpModal.tsx](../../armen/mobile/components/WarmUpModal.tsx)
**Props:** `visible`, `onClose`, `prefillMuscles?: string[]`, `prefillSessionType?: string`, `soreness?: number`, `energy?: number`, `sleepScore?: number`. Generates a warm-up suggestion from today's wellness check-in + the activity being logged.

### `MuscleMap`
**File:** [armen/mobile/components/MuscleMap.tsx](../../armen/mobile/components/MuscleMap.tsx)
**Props:** `muscles: string[]`, `size?: number` (default 160).

### `PlateCalculator`
**File:** [armen/mobile/components/PlateCalculator.tsx](../../armen/mobile/components/PlateCalculator.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `initialTargetKg?: number`. Modal.

## Nutrition / weight

### `FoodSearchModal`
**File:** [armen/mobile/components/FoodSearchModal.tsx](../../armen/mobile/components/FoodSearchModal.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `onLogged: (log: NutritionLog) => void`. Modal.

### `WeightLogSheet`
**File:** [armen/mobile/components/WeightLogSheet.tsx](../../armen/mobile/components/WeightLogSheet.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `onLogged: (result: WeightLogResult) => void`, `currentWeightKg?: number | null`, `displayUnit?: 'kg' | 'lbs'`.

## Social — posts / stories / profile

### `PostCreator`
**File:** [armen/mobile/components/PostCreator.tsx](../../armen/mobile/components/PostCreator.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `onPostCreated: () => void`, `currentStats?: any`, `dashboard?: any`. Modal.

### `PostDetailModal`
**File:** [armen/mobile/components/PostDetailModal.tsx](../../armen/mobile/components/PostDetailModal.tsx)
**Props:** `visible`, `post: Post | null`, `currentUserId: string`, `onClose`, `onProfilePress: (userId: string) => void`, `onPostDeleted?: (postId: string) => void`. Modal.

### `OryxInsightCreator`
**File:** [armen/mobile/components/OryxInsightCreator.tsx](../../armen/mobile/components/OryxInsightCreator.tsx)
**Props:** `visible`, `onClose`, `onBack`, `onPostCreated`, `initialSessionId?: string`, `initialSessionSource?: 'manual' | 'strava' | 'hevy'`, `initialSessionData?: any`. AI-assisted post / insight creator.

### `StoryCreator`
**File:** [armen/mobile/components/StoryCreator.tsx](../../armen/mobile/components/StoryCreator.tsx)
**Props:** `visible: boolean`, `onClose: () => void`, `onStoryCreated: () => void`, `currentStats?: CurrentStats`. Modal.

### `StoryViewer`
**File:** [armen/mobile/components/StoryViewer.tsx](../../armen/mobile/components/StoryViewer.tsx)
**Props:** `visible`, `groups: StoryGroup[]`, `initialGroupIndex: number`, `currentUserId: string`, `onClose`, `onMarkSeen: (storyId, groupUserId) => void`, `onDelete?`, `onProfilePress?`. Full-screen story reel.

### `AthleteProfileModal`
**File:** [armen/mobile/components/AthleteProfileModal.tsx](../../armen/mobile/components/AthleteProfileModal.tsx)
**Props:** `visible: boolean`, `userId: string | null`, `onClose: () => void`, `onOpenPostDetail?: (post: Post) => void`. Modal.

## Messages

### `ConversationRow`
**File:** [armen/mobile/components/ConversationRow.tsx](../../armen/mobile/components/ConversationRow.tsx)
**Named export `ConversationRowProps`.** Props: `conversation: DmConversation`, `currentUserId: string`, `onPress: () => void`, `onLongPress?: () => void`.

### `MessageBubble`
**File:** [armen/mobile/components/MessageBubble.tsx](../../armen/mobile/components/MessageBubble.tsx)
**Named export `MessageBubbleProps`.** Props: `content: string`, `isMine: boolean`, `isDeleted?: boolean`, `onLongPress?: () => void`, `withTail?: boolean` (default `true`).

## Conventions

- All components default-export the component itself; some additionally export their `Props` interface as a named export (`GlassCard`, `ConversationRow`, `MessageBubble`, `OryxInsightCreator`).
- Modals follow the `{ visible, onClose, on<Result> }` shape — keep new modals consistent with this.
- Cards generally compose around `GlassCard`. Don't roll your own glass surface — extend `GlassCard` props instead.
- New components belong in `armen/mobile/components/` if they're reused in 2+ screens. Otherwise keep them co-located with the screen that owns them.
