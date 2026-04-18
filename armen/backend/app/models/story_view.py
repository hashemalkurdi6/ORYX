import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class StoryView(Base):
    __tablename__ = "story_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    story_id = Column(UUID(as_uuid=True), nullable=False)
    viewer_user_id = Column(UUID(as_uuid=True), nullable=False)
    viewed_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('story_id', 'viewer_user_id', name='uq_story_view'),
    )
