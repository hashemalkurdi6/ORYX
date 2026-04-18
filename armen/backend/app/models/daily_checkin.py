import uuid
from datetime import datetime
from sqlalchemy import Column, Text, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class DailyCheckin(Base):
    __tablename__ = "daily_checkins"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    photo_url = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    stats_overlay_json = Column(JSON, nullable=True)
    influence_tags = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    window_expires_at = Column(DateTime, nullable=True)
    post_id = Column(UUID(as_uuid=True), nullable=True)
