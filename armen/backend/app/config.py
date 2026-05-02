from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 10080  # 7 days
    STRAVA_CLIENT_ID: str = ""
    STRAVA_CLIENT_SECRET: str = ""
    STRAVA_REDIRECT_URI: str = "http://localhost:8000/strava/callback"
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    USDA_API_KEY: str = ""   # optional — get free key at https://fdc.nal.usda.gov/
    # S3 / Cloudflare R2 media storage (optional — leave blank for base64 dev fallback)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_S3_BUCKET: str = ""
    AWS_S3_REGION: str = "us-east-1"
    AWS_S3_ENDPOINT_URL: str = ""  # empty = use AWS; set to R2 endpoint for Cloudflare R2

    @property
    def usda_api_key(self) -> str:
        return self.USDA_API_KEY
    FRONTEND_URL: str = "exp://localhost:8081"
    WHOOP_CLIENT_ID: str = ""
    WHOOP_CLIENT_SECRET: str = ""
    WHOOP_REDIRECT_URI: str = "http://localhost:8000/whoop/callback"
    OURA_CLIENT_ID: str = ""
    OURA_CLIENT_SECRET: str = ""
    OURA_REDIRECT_URI: str = "http://localhost:8000/oura/callback"
    # Account deletion
    ACCOUNT_DELETION_GRACE_DAYS: int = 30
    PENDING_TOKEN_EXPIRE_MINUTES: int = 10
    # Email (Resend)
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "ORYX <noreply@oryx.app>"
    PASSWORD_RESET_URL_BASE: str = "oryx://reset-password"
    EMAIL_VERIFY_URL_BASE: str = "https://oryx.app/verify-email"
    ENV: str = "dev"
    # Fernet key (base64) used to encrypt OAuth tokens (Strava/Whoop/Oura) at rest.
    # Generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    # If missing in dev, tokens are stored plaintext with a warning; in prod the app refuses to start.
    TOKEN_ENCRYPTION_KEY: str = ""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
