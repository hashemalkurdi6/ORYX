import uuid
from datetime import datetime

from sqlalchemy import String, Text, DateTime, JSON
from sqlalchemy.dialects.postgresql import INET, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.database import Base


class AccountDeletionEvent(Base):
    """Audit trail for account deletion lifecycle events.

    Intentionally has NO foreign key to users — the row must survive after
    the user is hard-deleted, so we keep user_id as an opaque UUID.
    """

    __tablename__ = "account_deletion_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ip_address: Mapped[str | None] = mapped_column(INET, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Named extra_metadata to avoid SQLAlchemy's reserved `metadata` attribute
    extra_metadata: Mapped[dict | None] = mapped_column(JSON, nullable=True)
