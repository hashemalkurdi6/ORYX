import base64
import io
import logging
import os as _os
import uuid

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from app.models.user import User
from app.routers.auth import get_current_user
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/media", tags=["media"])

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
    _boto3_available = True
except ImportError:
    _boto3_available = False
    logger.warning("boto3 not installed — S3 uploads disabled, using base64 fallback")

try:
    from PIL import Image
    _pillow_available = True
except ImportError:
    _pillow_available = False
    logger.warning("Pillow not installed — image compression disabled")


def _compress_image(data: bytes, max_width: int = 1080, quality: int = 85) -> bytes:
    """Compress image using Pillow: resize to max_width and convert to JPEG."""
    if not _pillow_available:
        return data
    img = Image.open(io.BytesIO(data))
    # Convert to RGB (handles PNG with transparency, etc.)
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    # Resize if wider than max_width, preserving aspect ratio
    if img.width > max_width:
        ratio = max_width / img.width
        new_height = int(img.height * ratio)
        img = img.resize((max_width, new_height), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=quality, optimize=True)
    return buf.getvalue()


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a photo. Returns { "url": "<public url>" }.
    If S3/R2 is configured: compresses (Pillow, max 1080px, JPEG q85) and uploads.
    Otherwise (dev fallback): returns a base64 data URL.
    Auth required to prevent abuse.
    """
    # Validate MIME type before reading body.
    ALLOWED_CONTENT_TYPES = {
        "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
    }
    content_type = (file.content_type or "").split(";")[0].strip().lower()
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{content_type}'. Allowed: JPEG, PNG, WEBP, HEIC.",
        )

    # Hard cap: 20 MB raw before compression. Pillow will compress further for S3.
    MAX_UPLOAD_BYTES = 20 * 1024 * 1024
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail="File too large (max 20 MB).",
        )

    if settings.AWS_S3_BUCKET and _boto3_available:
        # S3 / R2 path
        try:
            compressed = _compress_image(data)
            key = f"uploads/{uuid.uuid4().hex}.jpg"
            s3_kwargs: dict = {
                "aws_access_key_id": settings.AWS_ACCESS_KEY_ID,
                "aws_secret_access_key": settings.AWS_SECRET_ACCESS_KEY,
                "region_name": settings.AWS_S3_REGION,
            }
            if settings.AWS_S3_ENDPOINT_URL:
                s3_kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT_URL

            s3 = boto3.client("s3", **s3_kwargs)
            s3.put_object(
                Bucket=settings.AWS_S3_BUCKET,
                Key=key,
                Body=compressed,
                ContentType="image/jpeg",
            )

            if settings.AWS_S3_ENDPOINT_URL:
                # Custom endpoint (e.g. Cloudflare R2 public bucket URL)
                public_url = f"{settings.AWS_S3_ENDPOINT_URL.rstrip('/')}/{settings.AWS_S3_BUCKET}/{key}"
            else:
                public_url = (
                    f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_S3_REGION}.amazonaws.com/{key}"
                )
            return {"url": public_url}
        except Exception as exc:
            logger.error("S3 upload failed: %s", exc)
            raise HTTPException(status_code=500, detail=f"Upload failed: {exc}")
    else:
        # No S3 configured. In dev, return a small base64 data URL so the UI still
        # works. In production, REFUSE — base64 images in the DB explode it within
        # a week (500KB–5MB per post). Configure S3/R2 before shipping.
        if _os.getenv("ENV", "dev").lower() in ("prod", "production"):
            raise HTTPException(
                status_code=503,
                detail="Media storage not configured. Set AWS_S3_BUCKET + creds.",
            )
        # Cap dev fallback at 2 MB — enough for a Pillow-compressed JPEG at 1080px.
        # Base64 overhead is ~33 %, so 2 MB raw → ~2.7 MB stored in the DB column,
        # which is acceptable for a dev database. Configure S3/R2 before shipping.
        if len(data) > 2 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image too large for dev fallback (>2 MB). Configure S3 to upload.",
            )
        encoded = base64.b64encode(data).decode()
        return {"url": f"data:image/jpeg;base64,{encoded}"}
