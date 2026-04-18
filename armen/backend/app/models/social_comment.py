import uuid
from datetime import datetime
from sqlalchemy import Column, Text, DateTime, Integer
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SocialComment(Base):
    __tablename__ = "social_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    comment_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    parent_comment_id = Column(UUID(as_uuid=True), nullable=True)
    like_count = Column(Integer, default=0, nullable=False)
