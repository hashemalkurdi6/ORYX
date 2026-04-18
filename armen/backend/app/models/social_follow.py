import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class SocialFollow(Base):
    __tablename__ = "social_follows"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    follower_id = Column(UUID(as_uuid=True), nullable=False)
    following_id = Column(UUID(as_uuid=True), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint('follower_id', 'following_id', name='uq_social_follow'),
    )
