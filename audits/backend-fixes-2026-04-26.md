# Backend Fix Log — 2026-04-26

- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/routers/home.py:709-836 — POST /home/diagnosis now attaches `recovery_score`/`recovery_color` (sourced from readiness service) to every response path so wellness.tsx can render the recovery card.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/services/claude_service.py:7-15 — Removed dead `anthropic` import and `_client`, `MODEL`, `HAIKU_MODEL` constants (file kept its name; all calls go through OpenAI gpt-4o-mini).
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/services/warmup_service.py:15,92-104 — Migrated warm-up generation off Anthropic SDK to OpenAI gpt-4o-mini (only remaining importer of `_client`/`HAIKU_MODEL`).
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/requirements.txt:12 — Dropped unused `anthropic==0.34.2` dependency.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/models/user.py:44 — `hevy_api_key` switched to `EncryptedString(1024)` for at-rest encryption parity with Strava/Whoop/Oura tokens.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/main.py:560 — Added `ALTER TABLE users ALTER COLUMN hevy_api_key TYPE VARCHAR(1024)` migration to widen column for Fernet ciphertext.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/main.py:439-450 — `post_reports` table now has proper UUID FKs to `users(id)` and `social_posts(id)` with ON DELETE CASCADE plus indexes.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/models/post_report.py — Rewrote ORM model to use UUID + ForeignKey columns matching the corrected raw-SQL schema.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/routers/posts.py:977-991 — `report_post` now validates `post_id` as UUID and passes UUIDs (not strings) into `PostReport`.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/services/claude_service.py:111-148 — `_format_wellness` now reads Hooper Index fields (sleep_quality/fatigue/stress/muscle_soreness on 1–7 scale) with a fallback to the legacy mood/energy/soreness fields.
- /Users/armenkevorkian/Desktop/ORYX/ORYX/armen/backend/app/main.py:78-91 — Documented the dual-source-of-truth decision: `_USER_COLUMN_MIGRATIONS` + `create_all` remain authoritative; Alembic retained for ordered/data-backfill migrations.
