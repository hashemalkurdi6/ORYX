import uuid
from datetime import datetime
from sqlalchemy import Column, Text, Boolean, DateTime, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SocialPost(Base):
    __tablename__ = "social_posts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    photo_url = Column(Text, nullable=True)
    caption = Column(Text, nullable=True)
    oryx_data_card_json = Column(JSON, nullable=True)  # { post_type: "workout"|"insight"|"recap"|"milestone"|"generic", ...type-specific fields }
    also_shared_as_story = Column(Boolean, default=False, nullable=False)
    story_id = Column(UUID(as_uuid=True), ForeignKey("stories.id", ondelete="SET NULL", use_alter=True, name="fk_social_posts_story_id"), nullable=True)
    club_id = Column(UUID(as_uuid=True), ForeignKey("clubs.id", ondelete="SET NULL"), nullable=True)
    is_deleted = Column(Boolean, default=False, nullable=False)
    is_pinned = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
