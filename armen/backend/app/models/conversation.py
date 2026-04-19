# Direct Messages — Phase 1 (text-only, REST-polled).
# Three tables: conversations / conversation_participants / messages.
# Message types are enumerated now so future phases (image, workout_card,
# daily_insight, weekly_recap, story_reply, post_share) don't require
# another migration.

import uuid
from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    String,
    Text,
    Boolean,
    ForeignKey,
    Index,
    PrimaryKeyConstraint,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # 'direct' (1:1) or 'group'. Phase 1 only creates 'direct' rows.
    type: Mapped[str] = mapped_column(String(16), nullable=False, default="direct")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    # Bumped every time a new message is posted — lets us order the inbox.
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class ConversationParticipant(Base):
    __tablename__ = "conversation_participants"

    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    # Null until the user has read at least one message.
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    muted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Message-request gating: non-mutual conversations land here until the
    # recipient accepts (i.e. until they read or reply). True = unaccepted.
    is_request: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    __table_args__ = (
        PrimaryKeyConstraint("conversation_id", "user_id", name="pk_conversation_participant"),
        Index("ix_conversation_participants_user", "user_id"),
    )


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Enum-like: 'text' | 'image' | 'workout_card' | 'daily_insight' |
    # 'weekly_recap' | 'story_reply' | 'post_share'. Phase 1 only writes 'text'.
    message_type: Mapped[str] = mapped_column(
        String(32), default="text", nullable=False
    )
    # Future attachment / shared-object references (post_id, activity_id, etc.).
    extra_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_messages_conversation_created", "conversation_id", "created_at"),
    )
