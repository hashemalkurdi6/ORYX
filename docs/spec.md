# ORYX — Full Feature Spec

## The App
A fitness intelligence mobile app that aggregates data from multiple fitness platforms and uses AI to explain athletic performance in plain English. Users connect their fitness apps, understand why their body performed the way it did, and share the story behind the stats.

## Tech Stack
- Frontend: React Native with Expo (iOS and Android)
- Backend: Python FastAPI with PostgreSQL and SQLAlchemy async
- AI: OpenAI GPT-4o-mini for all AI features
- Database: PostgreSQL via asyncpg
- Auth: JWT tokens
- Hosting: Railway or Render
- Storage: AWS S3 or Cloudflare R2 for photos

## Integrations (all read-only import)
- Strava — OAuth, pull activities
- Apple HealthKit — steps, sleep, HRV, resting heart rate
- Hevy — API key, pull workout history
- Whoop — OAuth, pull recovery and sleep data
- Oura — OAuth, pull readiness and sleep data
- Open Food Facts — free barcode and food search API
- USDA FoodData Central — nutrition database API

## App Structure — 5 Bottom Tabs
1. Nutrition (fork and knife icon)
2. Community (people icon)
3. Home (house icon, center)
4. Wellness (circle icon)
5. Profile (person icon)

## HOME TAB
Private intelligence dashboard. All content here is personal and only visible to the user.

- Hero: concentric ring circle. Outer ring is readiness score colored green/amber/red. Inner ring is weekly training load progress. Center shows readiness number and READINESS label. Weekly load number and steps today shown as stat callouts flanking the circle.
- Strain gauge bar: today's accumulated load vs recommended load.
- Quick actions row (horizontal scrollable pills): Log Workout, Log Food, Rest Day, Check In, Log Weight.
- ORYX Intelligence card: AI daily diagnosis, 2 sentences max. Contributing factor pills. One sentence recommendation. Cached once per day, refreshes when new data is logged.
- Training card: last session header, sessions this week vs goal, streak, days since rest, weekly load comparison bar, next session recommendation.
- Nutrition snapshot card: calories consumed vs target, three inline macro stats.
- Weight card: current weight, trend arrow, 7-day sparkline, weekly average. Tapping opens full weight tracking screen.
- Wellness row: four Hooper index inputs in one compact horizontal card (Sleep Quality, Fatigue, Stress, Soreness each 1-7).
- Weekly snapshot card: sessions, load, goal progress, calories this week.

## ACTIVITY TAB
Training execution and history.

- Top: Readiness to Train card (same score as home, single source of truth), steps progress bar, stats row, Weekly Training Load card with EWMA-ACWR, Readiness score.
- Progress and Records: sport breakdown donut chart, achievements grid, weekly goal progress bars.
- Journal: grouped by week with collapsible headers, search bar, filter tabs (All, Strength, Cardio, Sport, Strava, Hevy), pagination (8 weeks at a time). Each session card shows sport icon, name, date, duration, training load badge, RPE badge, AI autopsy snippet. Share icon on every card.
- Plus button opens action menu: Log Workout, Log Run or Cardio, Start Warmup, Track Activity, Log Sport Session.
- Manual workout logger: exercise library, sets/reps/weight, rest timer, plate calculator, superset mode, RPE input, muscle map visualization, AI autopsy after session.
- Strava imports: read-only, correct sport type icons, pace formatted correctly.
- Hevy imports: read-only, exercise list, volume, PRs.
- Training load = RPE x duration. EWMA-ACWR for injury risk. Deload detector. Rest day recommendation.

## NUTRITION TAB
- Unified calorie and macro circle card at top: large calorie circle (consumed vs target), three macro circles (Protein, Carbs, Fat) below it.
- Weekly calorie trend bar chart: 7 bars, colored by target achievement.
- Scan Food Photo: AI photo scanning via OpenAI vision, identifies food, estimates macros.
- Ask ORYX input: AI nutrition assistant chat. 20 messages per day limit. Can modify today's meal plan when asked.
- Water tracking card: personalized target based on weight, training, goal, region. Custom glass size or direct ml input. Drop icons. Progress bar.
- Macro and micronutrient swipeable card: swipe from macros to see micronutrients (Fibre, Sugar, Sodium, most at-risk nutrient).
- Today's Meals: food diary, Log Meal button, each entry shows food name, calories, macros, delete option.
- Today's Meal Plan: AI-generated daily plan from nutrition survey. Compact list rows with time, meal name, calories. Tap to expand ingredients and prep note. Log This Meal button pre-fills diary. Regenerate link (1 per hour). Grocery list collapsible.
- My Nutrition Profile card: collapsed summary of survey answers. Edit button.
- Weekly summary card: average daily calories, protein, days on target.
- Nutrition survey: 6 screens covering food preferences, dietary restrictions, sugar/carb approach, cheat days, meal timing, lifestyle/budget, region (full country dropdown). Smart filtering (selecting Vegan removes animal products from chips).
- Macro targets calculated from Mifflin St Jeor TDEE plus goal adjustment plus diet type adjustments. Micronutrient targets per scientific recommendations.

## WELLNESS TAB
- Daily wellness overview: Hooper Index check-in (Sleep Quality, Fatigue, Stress, Soreness 1-7 each).
- Readiness to Train card: same score as home (single shared function).
- Recovery metrics cards: HRV, resting heart rate, sleep duration from Apple Health.
- HRV Trends: 30-day line chart, current vs 7-day vs 30-day average.
- Sleep Trends: 14-night bar chart colored by duration.
- Recovery History: 30-day readiness score line chart.
- Wellness History: 14-day Hooper stacked area chart (shown after 5 check-ins).

## PROFILE TAB — PURELY SOCIAL
No health data. Public-facing identity and content.

- Header: profile photo, display name, username, bio, location, sport tags pills, Edit Profile button, Customize button, gear icon.
- Stats row: 4 user-chosen stats (default: Total Workouts, Current Streak, Followers, Following). Tapping followers/following opens bottom sheet lists.
- Story highlights row: horizontal scrollable highlights bubbles below stats row. New button to create highlights.
- Three content tabs:
  - Posts: pinned post at top if set, post grid in chosen layout (3 column default, 2 column, or list). Tapping any post opens post detail.
  - Achievements: full achievements badge grid (earned full opacity, unearned 30% with lock), personal bests section, activity heatmap (365-day GitHub style calendar).
  - About: full bio, sport tags, member since date, region, connected apps made public, website link.
- Profile Customization: accent color theme, featured stats (choose 4), post grid layout, pinned post management, visibility settings, story settings (allow replies, audience, close friends list).
- Edit Profile: profile photo, display name, username, bio, location, sport tags, website, date of birth, weight, height, privacy toggle.

## COMMUNITY TAB
Three internal tabs: Feed, Clubs, Leaderboard.

Feed tab:
- Story row at top: circular profile bubbles with readiness color rings. Your Story bubble first with plus icon if no story today. Unseen stories full opacity, seen stories 40% opacity. Swipe up from feed enters story mode.
- Filter bar: All, Following, Clubs, Workouts, Insights, Recaps pills.
- Search bar: tapping opens search screen with Athletes, Posts, Clubs tabs.
- Post cards: profile photo and name tappable to profile, photo full width, like and comment counts, caption max 2 lines with more link, location tag, time ago. Double tap to like.

Post creation (plus button):
- Two types: Photo Post and ORYX Insight.
- Photo Post: camera or gallery, crop, also share as story toggle, tag a club toggle, caption.
- ORYX Insight types: Workout Card, Daily Insight Card, Weekly Recap Card, Nutrition Card, Text Card.
- All insight types support custom title, caption, location, privacy toggles per stat.
- Share activity from Activity tab: share icon on every session card.

Story creation:
- Full screen camera with pinch to zoom, zoom level indicator, quick zoom buttons.
- Story editor: full bleed photo, X close, ORYX readiness pill (tappable to toggle stats sticker), tool column (Text, Sticker, Effects, Collapse), caption input, Your Story and Close Friends share buttons.
- Stickers: ORYX Stats card sticker, preset text stickers. Draggable, pinch to resize, two-finger rotate, drag to trash.
- Story viewer: full screen, progress bars, header with profile and time, stats overlay if added, caption, like and comment only, swipe right to previous, swipe left or auto-advance to next, swipe down to exit, hold to pause.
- Stories expire after 24 hours. Close friends list.

Clubs tab:
- Default clubs: MMA and Combat Sports, Running and Cardio, Gym and Strength, Cycling, Swimming, Football and Soccer, Basketball, General Fitness. Auto-join based on sport tags.
- Club screen: cover photo, member count, three tabs (Feed, Members, Leaderboard).

Leaderboard tab:
- Club selector pills. Top 10 members ranked by training load (default), sessions, or steps. Gold/silver/bronze for top 3. Current user row pinned at bottom. Resets every Monday. Last week's top 3 shown below.

Public profile (viewing another user):
- Profile photo, name, username, sport tags, location, bio, Follow/Message buttons. Followers and Following counts tappable. Three content tabs: Posts (locked if private), Activity, About. Three dot menu: Report, Block.

Post detail:
- Full bleed photo. Profile row. Caption with more link. Location tag. Like button with count. Comment button navigates to comments. Double tap to like. Save button. Three dot menu varies by own vs other. Comments: each with profile photo, name, text, time ago, like, reply. Nested replies. Long press for edit/delete/report. Comment input with KeyboardAvoidingView. Own post menu: Edit, Delete, Pin, Share as Story, Archive, View Insights. Other post menu: Report, Not Interested, Copy Link.

## READINESS SCORE
Single shared function `calculate_readiness(user_id)` called from everywhere. Never duplicated.

Four components with dynamic weight redistribution if data missing:
- Hooper Index (40%): four 1-7 inputs, converts to 0-100. Yesterday's with 5 point penalty if today not logged.
- Training Load (35%): EWMA-ACWR (7-day acute / 28-day chronic), monotony penalty if above 2.0, consecutive days without rest penalty.
- Nutritional Recovery (15%): protein adequacy (1.6g/kg target), caloric adequacy adjusted for training, post-workout nutrition timing.
- Sleep (10%): only if Apple Health sleep data available. Duration plus bedtime consistency.

Hardware extension slots for HRV, RHR, SpO2 — return null until connected, automatically incorporated.

Labels: 85-100 Optimal, 70-84 Good to Train, 55-69 Train with Caution, 40-54 Light Activity Only, below 40 Rest Recommended.

Returns: score, label, color, primary_factor, data_confidence (High/Medium/Low/Directional Only), components_used, breakdown, hardware_available.

Cached 1 hour. Invalidated on new session, meal, or wellness input.

## WEIGHT TRACKING
Standalone screen from Home weight card tap. First data point from onboarding weight. Full trend graph: raw daily dots plus 7-day rolling average line. Time range selector: 7D, 1M, 3M, 6M, 1Y, All. Rolling average adapts. Goal alignment card: minimum 14 logs for full judgment. Stats row: Current, Change, This Week avg, Rate per week. Log Weight button opens bottom sheet with yesterday's weight pre-filled, unit toggle, optional note. Morning reminder toggle with time picker. Logging streak. Connected to AI diagnosis and nutrition correlation. Weight stored as kg internally.

## WATER TRACKING
Personalized target: weight_kg x 35ml plus activity plus goal plus climate adjustment. User override. Custom glass size (100ml-1000ml) or direct ml input. Stored as amount_ml, synced via PATCH /nutrition/water/today.

## AI SYSTEMS
All AI uses OpenAI GPT-4o-mini.

- Daily diagnosis: cached once per day, refreshed on new data (max once per hour). 2 sentences max, one sentence recommendation, JSON response with diagnosis, recommendation, main_factors (max 3), tone. Max 300 tokens.
- Workout autopsy: generated per session. Cached. Insight not data repetition, 2 sentences max.
- Meal plan generation: daily, cached, regeneratable once per hour. Full prompt includes nutrition survey, macro targets, training load, readiness, ACWR, day of week, cheat day logic. Returns JSON with meals, grocery list, nutrition note.
- Nutrition assistant: context-aware chat with last 5 messages. Includes user profile, today's meals, meal plan, readiness. Detects meal modification intent. 20 messages per day limit.
- AI meal photo scanning: OpenAI vision, returns JSON with food_name, calories, protein_g, carbs_g, fat_g, fibre_g, confidence. Confidence low shows warning. User edits before confirming.