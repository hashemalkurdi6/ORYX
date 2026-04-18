import uuid
from datetime import datetime
from sqlalchemy import Column, Text, Boolean, DateTime, JSON, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Story(Base):
    __tablename__ = "stories"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    story_type = Column(String(50), nullable=False, default='photo')
    photo_url = Column(Text, nullable=True)   # required for all stories (nullable in DB for migration safety)
    caption = Column(Text, nullable=True)
    oryx_data_overlay_json = Column(JSON, nullable=True)  # { readiness, steps, calories, training_load, readiness_color, readiness_label, x_ratio, y_ratio }
    text_overlay = Column(Text, nullable=True)  # plain text string shown on story
    source_post_id = Column(UUID(as_uuid=True), ForeignKey("social_posts.id", ondelete="SET NULL"), nullable=True)
    checkin_id = Column(UUID(as_uuid=True), ForeignKey("daily_checkins.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_expired = Column(Boolean, default=False, nullable=False)
    is_highlight = Column(Boolean, default=False, nullable=False)
    highlight_category = Column(String(100), nullable=True)
