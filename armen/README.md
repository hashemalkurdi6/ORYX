# ARMEN — Fitness Intelligence App

ARMEN is a mobile fitness intelligence platform that combines Strava workout data, Apple HealthKit biometrics, and Claude AI to deliver daily performance diagnoses and workout autopsies.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 18+ |
| Python | 3.11+ |
| PostgreSQL | 14+ |
| Expo CLI | Latest (`npm install -g expo-cli`) |
| iOS device or simulator | Required for HealthKit |

---

## 1. Clone the Repository

```bash
git clone <repo-url>
cd armen
```

---

## 2. Backend Setup

### 2a. Create and activate a Python virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # macOS / Linux
# .venv\Scripts\activate         # Windows
```

### 2b. Install dependencies

```bash
pip install -r requirements.txt
```

### 2c. Create the database

```bash
createdb armen
# or via psql:
# psql -U postgres -c "CREATE DATABASE armen;"
```

### 2d. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` with your values (see Environment Variables section below).

### 2e. Start the backend server

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

Database tables are created automatically on first startup.

---

## 3. Mobile Setup

### 3a. Install dependencies

```bash
cd mobile
npm install
```

### 3b. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_API_URL` to your backend URL (use your local machine's network IP if testing on a physical device, e.g. `http://192.168.1.x:8000`).

### 3c. Start the Expo development server

```bash
npx expo start
```

- Press `i` to open iOS simulator
- Scan the QR code with the Expo Go app on a physical iOS device

---

## 4. Strava API Setup

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Create a new application:
   - **Application Name**: ARMEN
   - **Category**: Training
   - **Club**: (leave blank)
   - **Website**: `http://localhost:8000`
   - **Authorization Callback Domain**: `localhost`
3. Note your **Client ID** and **Client Secret**
4. Set `STRAVA_REDIRECT_URI` to `http://localhost:8000/strava/callback` in your backend `.env`

The OAuth flow:
1. Mobile app calls `GET /strava/auth-url` to get the authorization URL
2. Opens URL in an in-app browser
3. User authorizes ARMEN on Strava
4. Strava redirects to `STRAVA_REDIRECT_URI` with an authorization code
5. Backend exchanges the code for tokens, saves them, and fetches recent activities

---

## 5. Anthropic API Key

1. Sign up or log in at [https://console.anthropic.com](https://console.anthropic.com)
2. Navigate to **API Keys** and create a new key
3. Set `ANTHROPIC_API_KEY` in your backend `.env`

ARMEN uses `claude-sonnet-4-20250514` for:
- **Daily Diagnosis**: Analyzes 7 days of health + recent workouts → recovery score, diagnosis, recommendation
- **Workout Autopsy**: Explains a specific session's performance with pre-workout recovery context

---

## 6. HealthKit Notes

- HealthKit requires a **physical iOS device** or an iOS simulator with simulated health data
- On first launch, ARMEN will request permission to read: Steps, Heart Rate, HRV (SDNN), Resting Heart Rate, Sleep Analysis, Active Energy Burned
- On Android and web, HealthKit calls are gracefully skipped and return empty data
- Health data is uploaded to the backend automatically on each dashboard load

---

## 7. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Mobile App (React Native / Expo Router)                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │  Auth Screens│  │  Dashboard   │  │  Components           │ │
│  │  login.tsx   │  │  dashboard   │  │  RecoveryIndicator    │ │
│  │  signup.tsx  │  │  .tsx        │  │  DiagnosisCard        │ │
│  └──────────────┘  └──────────────┘  │  WorkoutAutopsyCard   │ │
│                                       │  SleepHRVChart        │ │
│  ┌──────────────┐  ┌──────────────┐  └───────────────────────┘ │
│  │  api.ts      │  │  healthKit   │                             │
│  │  (Axios)     │  │  .ts         │                             │
│  │              │  │  (expo-health│                             │
│  └──────────────┘  └──────────────┘                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  authStore.ts (Zustand + AsyncStorage persistence)       │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS / REST
┌────────────────────────────▼────────────────────────────────────┐
│  Backend (FastAPI + SQLAlchemy + asyncpg)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────────┐  │
│  │  /auth   │  │  /strava │  │  /health │  │  /diagnosis    │  │
│  │  signup  │  │  auth-url│  │  bulk    │  │  daily         │  │
│  │  login   │  │  callback│  │  upsert  │  │  diagnosis     │  │
│  │  me      │  │  sync    │  │  get     │  │  autopsy       │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────────┘  │
│  ┌────────────────────────┐  ┌────────────────────────────────┐  │
│  │  strava_service.py     │  │  claude_service.py             │  │
│  │  OAuth + Activities    │  │  Daily Diagnosis + Autopsy     │  │
│  └────────────────────────┘  └────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
      PostgreSQL         Strava API      Anthropic API
      (via asyncpg)    (OAuth + REST)   (claude-sonnet)
```

---

## 8. Environment Variables Reference

### Backend (`backend/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string with asyncpg driver | `postgresql+asyncpg://postgres:password@localhost:5432/armen` |
| `SECRET_KEY` | JWT signing secret — use a long random string in production | `openssl rand -hex 32` |
| `ALGORITHM` | JWT algorithm (default: HS256) | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token validity in minutes (default: 10080 = 7 days) | `10080` |
| `STRAVA_CLIENT_ID` | Your Strava application Client ID | `12345` |
| `STRAVA_CLIENT_SECRET` | Your Strava application Client Secret | `abc123...` |
| `STRAVA_REDIRECT_URI` | OAuth callback URL registered in Strava | `http://localhost:8000/strava/callback` |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude | `sk-ant-...` |
| `FRONTEND_URL` | Allowed CORS origin for the mobile app | `exp://localhost:8081` |

### Mobile (`mobile/.env`)

| Variable | Description | Example |
|----------|-------------|---------|
| `EXPO_PUBLIC_API_URL` | Backend API base URL (no trailing slash) | `http://localhost:8000` |

> **Note**: When testing on a physical device, replace `localhost` with your machine's local network IP address (e.g. `192.168.1.42`).

---

## 9. Development Tips

- **Hot reload**: Both the FastAPI server (`--reload`) and Expo (`expo start`) support hot reload.
- **Database inspection**: Use `psql armen` or a GUI like TablePlus / DBeaver.
- **API testing**: The FastAPI Swagger UI at `http://localhost:8000/docs` lets you test all endpoints interactively.
- **Strava webhook**: For production, consider setting up a Strava webhook so activities sync automatically rather than requiring manual sync.
- **Production deployment**: Use a proper `SECRET_KEY`, disable `--reload`, use a production ASGI server (gunicorn + uvicorn workers), and store credentials in environment variables rather than a `.env` file.
