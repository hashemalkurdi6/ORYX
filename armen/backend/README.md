# ORYX Backend

FastAPI + SQLAlchemy async + PostgreSQL.

## Run

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Database migrations

This project uses Alembic. After pulling a branch that adds new migrations:

- Fresh DB: `alembic upgrade head`
- Existing DB (pre-Alembic): `alembic stamp head` once, then `alembic upgrade head` going forward

Create a migration:
- `alembic revision --autogenerate -m "description"` (reviews changes against models)
- `alembic revision -m "description"` (empty scaffold for manual migrations)

Roll back: `alembic downgrade -1`
