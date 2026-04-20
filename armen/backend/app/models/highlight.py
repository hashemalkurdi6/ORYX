import uuid
from datetime import datetime
from sqlalchemy import Column, Text, Integer, DateTime, JSON, ForeignKey, String, Date
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class Highlight(Base):
    __tablename__ = "highlights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(60), nullable=False)
    cover_photo_url = Column(Text, nullable=True)           # null → derive from first story
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    featured_stat = Column(String(20), nullable=False, default='sessions')  # 'sessions' | 'load' | 'prs' | 'readiness'
    story_ids = Column(JSON, nullable=False, default=list)  # JSONB array of story UUIDs (strings)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    deleted_at = Column(DateTime, nullable=True)            # soft delete
