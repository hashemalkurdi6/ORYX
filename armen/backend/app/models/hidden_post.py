import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base

class HiddenPost(Base):
    __tablename__ = "hidden_posts"
    __table_args__ = (UniqueConstraint("user_id", "post_id", name="uq_hidden_post"),)
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    post_id = Column(UUID(as_uuid=True), ForeignKey("social_posts.id", ondelete="CASCADE"), nullable=False)
    hidden_at = Column(DateTime, default=datetime.utcnow, nullable=False)
