import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class PostLike(Base):
    __tablename__ = "posts_likes"
    __table_args__ = (UniqueConstraint("post_id", "user_id", name="uq_post_like"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id = Column(UUID(as_uuid=True), nullable=False)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    liked_at = Column(DateTime, default=datetime.utcnow, nullable=False)
