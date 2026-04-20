# Direct Messages router — Phase 1: text-only, REST-based polling.
# Routes mounted under /messages.

import logging
import uuid as uuid_module
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, func, and_, or_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user import User
from app.models.conversation import Conversation, ConversationParticipant, Message
from app.models.social_follow import SocialFollow
from app.models.user_block import UserBlock
from app.routers.auth import get_current_user
from app.services.user_visibility import active_user_filter, active_user_ids_subquery

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/messages", tags=["messages"])

# ── Constants ────────────────────────────────────────────────────────────────
MAX_CONTENT_LEN = 2000
ALLOWED_MESSAGE_TYPES = {
    "text", "image", "workout_card", "daily_insight",
    "weekly_recap", "story_reply", "post_share",
}
DEFAULT_PAGE_SIZE = 20

# ── Pydantic schemas ─────────────────────────────────────────────────────────


class MessageOut(BaseModel):
    id: str
    conversation_id: str
    sender_id: str
    content: str
    message_type: str
    metadata: Optional[dict] = None
    created_at: str
    deleted_at: Optional[str] = None


class ParticipantOut(BaseModel):
    id: str
    display_name: str
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    initials: str


class ConversationOut(BaseModel):
    id: str
    type: str
    other_participant: Optional[ParticipantOut] = None  # null for group
    last_message: Optional[MessageOut] = None
    last_message_at: Optional[str] = None
    unread_count: int
    muted: bool
    is_archived: bool
    is_request: bool


class ConversationListResponse(BaseModel):
    conversations: List[ConversationOut]


class MessageListResponse(BaseModel):
    messages: List[MessageOut]
    has_more: bool


class SendMessageBody(BaseModel):
    content: str = Field(..., min_length=1, max_length=MAX_CONTENT_LEN)
    message_type: str = Field(default="text")
    metadata: Optional[dict] = None


class StartConversationBody(BaseModel):
    recipient_id: str
    initial_message: Optional[str] = Field(default=None, max_length=MAX_CONTENT_LEN)


class UnreadCountResponse(BaseModel):
    unread_count: int


# ── Helpers ──────────────────────────────────────────────────────────────────


def _user_initials(u: User) -> str:
    name = u.display_name or u.username or u.email or ""
    parts = name.split()
    if not parts:
        return "?"
    out = parts[0][0].upper()
    if len(parts) > 1:
        out += parts[-1][0].upper()
    return out


def _participant_out(u: User) -> ParticipantOut:
    return ParticipantOut(
        id=str(u.id),
        display_name=u.display_name or u.username or (u.email.split("@")[0] if u.email else "Athlete"),
        username=u.username,
        avatar_url=getattr(u, "avatar_url", None),
        initials=_user_initials(u),
    )


def _message_out(m: Message) -> MessageOut:
    return MessageOut(
        id=str(m.id),
        conversation_id=str(m.conversation_id),
        sender_id=str(m.sender_id),
        content=m.content if m.deleted_at is None else "",
        message_type=m.message_type,
        metadata=m.extra_metadata,
        created_at=m.created_at.isoformat(),
        deleted_at=m.deleted_at.isoformat() if m.deleted_at else None,
    )


async def _is_blocked(db: AsyncSession, user_a: uuid_module.UUID, user_b: uuid_module.UUID) -> bool:
    """True if either user has blocked the other."""
    res = await db.execute(
        select(UserBlock.id).where(
            or_(
                and_(UserBlock.blocker_id == user_a, UserBlock.blocked_id == user_b),
                and_(UserBlock.blocker_id == user_b, UserBlock.blocked_id == user_a),
            )
        ).limit(1)
    )
    return res.scalar_one_or_none() is not None


async def _are_mutual_follows(db: AsyncSession, a: uuid_module.UUID, b: uuid_module.UUID) -> bool:
    res = await db.execute(
        select(func.count()).select_from(SocialFollow).where(
            or_(
                and_(SocialFollow.follower_id == a, SocialFollow.following_id == b),
                and_(SocialFollow.follower_id == b, SocialFollow.following_id == a),
            )
        )
    )
    return (res.scalar_one() or 0) >= 2


async def _a_follows_b(db: AsyncSession, a: uuid_module.UUID, b: uuid_module.UUID) -> bool:
    res = await db.execute(
        select(SocialFollow.id).where(
            SocialFollow.follower_id == a, SocialFollow.following_id == b
        ).limit(1)
    )
    return res.scalar_one_or_none() is not None


async def _get_participant(
    db: AsyncSession, conversation_id: uuid_module.UUID, user_id: uuid_module.UUID
) -> Optional[ConversationParticipant]:
    res = await db.execute(
        select(ConversationParticipant).where(
            ConversationParticipant.conversation_id == conversation_id,
            ConversationParticipant.user_id == user_id,
        )
    )
    return res.scalar_one_or_none()


async def _existing_direct_conversation(
    db: AsyncSession, user_a: uuid_module.UUID, user_b: uuid_module.UUID
) -> Optional[uuid_module.UUID]:
    """Find an existing direct conversation between two users (either
    ordering). Returns the conversation id or None."""
    # A direct conversation is one where both users appear as participants
    # and the conversation type is 'direct'. We join twice on participants.
    q = (
        select(Conversation.id)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .where(
            Conversation.type == "direct",
            ConversationParticipant.user_id == user_a,
        )
        .intersect(
            select(Conversation.id)
            .join(
                ConversationParticipant,
                ConversationParticipant.conversation_id == Conversation.id,
            )
            .where(
                Conversation.type == "direct",
                ConversationParticipant.user_id == user_b,
            )
        )
    )
    res = await db.execute(q)
    row = res.scalar_one_or_none()
    return row


async def _build_conversation_out(
    db: AsyncSession,
    conversation: Conversation,
    me_participant: ConversationParticipant,
    me_id: uuid_module.UUID,
) -> ConversationOut:
    # Other participant (direct only — Phase 1 doesn't surface groups).
    other_user: Optional[User] = None
    if conversation.type == "direct":
        res = await db.execute(
            select(User)
            .join(
                ConversationParticipant,
                ConversationParticipant.user_id == User.id,
            )
            .where(
                ConversationParticipant.conversation_id == conversation.id,
                ConversationParticipant.user_id != me_id,
                active_user_filter(),
            )
            .limit(1)
        )
        other_user = res.scalar_one_or_none()

    # Last message (skip soft-deleted).
    last_msg_res = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation.id, Message.deleted_at.is_(None))
        .order_by(Message.created_at.desc())
        .limit(1)
    )
    last_msg: Optional[Message] = last_msg_res.scalar_one_or_none()

    # Unread count: messages newer than last_read_at, not authored by me.
    unread_q = select(func.count()).select_from(Message).where(
        Message.conversation_id == conversation.id,
        Message.deleted_at.is_(None),
        Message.sender_id != me_id,
    )
    if me_participant.last_read_at is not None:
        unread_q = unread_q.where(Message.created_at > me_participant.last_read_at)
    unread_res = await db.execute(unread_q)
    unread_count = unread_res.scalar_one() or 0

    return ConversationOut(
        id=str(conversation.id),
        type=conversation.type,
        other_participant=_participant_out(other_user) if other_user else None,
        last_message=_message_out(last_msg) if last_msg else None,
        last_message_at=(last_msg.created_at.isoformat() if last_msg else None),
        unread_count=unread_count,
        muted=me_participant.muted,
        is_archived=me_participant.is_archived,
        is_request=me_participant.is_request,
    )


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/conversations", response_model=ConversationListResponse)
async def list_conversations(
    page: int = Query(1, ge=1),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=50),
    include_archived: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me_id = current_user.id
    offset = (page - 1) * limit

    # Conversations this user participates in, non-request, ordered by
    # updated_at DESC.
    q = (
        select(Conversation, ConversationParticipant)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .where(
            ConversationParticipant.user_id == me_id,
            ConversationParticipant.is_request.is_(False),
        )
        .order_by(Conversation.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if not include_archived:
        q = q.where(ConversationParticipant.is_archived.is_(False))
    rows = (await db.execute(q)).all()

    out: list[ConversationOut] = []
    for conv, part in rows:
        built = await _build_conversation_out(db, conv, part, me_id)
        # Hide direct conversations whose other participant is soft-deleted.
        if conv.type == "direct" and built.other_participant is None:
            continue
        out.append(built)
    return ConversationListResponse(conversations=out)


@router.get("/conversations/requests", response_model=ConversationListResponse)
async def list_message_requests(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me_id = current_user.id
    q = (
        select(Conversation, ConversationParticipant)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Conversation.id,
        )
        .where(
            ConversationParticipant.user_id == me_id,
            ConversationParticipant.is_request.is_(True),
            ConversationParticipant.is_archived.is_(False),
        )
        .order_by(Conversation.updated_at.desc())
    )
    rows = (await db.execute(q)).all()
    out = []
    for conv, part in rows:
        built = await _build_conversation_out(db, conv, part, me_id)
        if conv.type == "direct" and built.other_participant is None:
            continue
        out.append(built)
    return ConversationListResponse(conversations=out)


@router.get("/conversations/{conv_id}/messages", response_model=MessageListResponse)
async def list_messages(
    conv_id: str,
    before: Optional[str] = Query(None, description="ISO timestamp — return messages created before this"),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        conv_uuid = uuid_module.UUID(conv_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation id")

    me_part = await _get_participant(db, conv_uuid, current_user.id)
    if not me_part:
        raise HTTPException(status_code=404, detail="Conversation not found")

    q = select(Message).where(Message.conversation_id == conv_uuid)
    if before:
        try:
            before_dt = datetime.fromisoformat(before.replace("Z", "+00:00"))
            # Strip tz for naive datetime compare (DB uses naive utc).
            if before_dt.tzinfo is not None:
                before_dt = before_dt.replace(tzinfo=None)
            q = q.where(Message.created_at < before_dt)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid 'before' timestamp")
    q = q.order_by(Message.created_at.desc()).limit(limit + 1)
    rows = (await db.execute(q)).scalars().all()
    has_more = len(rows) > limit
    messages = rows[:limit]
    # Return newest-first so the FlatList (inverted) can render them directly.
    return MessageListResponse(
        messages=[_message_out(m) for m in messages],
        has_more=has_more,
    )


@router.post("/conversations/{conv_id}/messages", response_model=MessageOut)
async def send_message(
    conv_id: str,
    body: SendMessageBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        conv_uuid = uuid_module.UUID(conv_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation id")

    if body.message_type not in ALLOWED_MESSAGE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid message_type")
    # Phase 1: only text is wired; other types reserve the enum but aren't
    # meant to be sent yet.
    if body.message_type != "text":
        raise HTTPException(
            status_code=400,
            detail="Only 'text' messages are supported in this release",
        )

    me_part = await _get_participant(db, conv_uuid, current_user.id)
    if not me_part:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # If the other participant blocked me (or vice versa), refuse.
    other_res = await db.execute(
        select(ConversationParticipant.user_id).where(
            ConversationParticipant.conversation_id == conv_uuid,
            ConversationParticipant.user_id != current_user.id,
        )
    )
    other_ids = [r[0] for r in other_res.all()]
    for oid in other_ids:
        if await _is_blocked(db, current_user.id, oid):
            raise HTTPException(status_code=403, detail="You cannot send messages in this conversation")

    msg = Message(
        conversation_id=conv_uuid,
        sender_id=current_user.id,
        content=body.content.strip(),
        message_type=body.message_type,
        extra_metadata=body.metadata,
    )
    db.add(msg)
    # Bump conversation.updated_at so the inbox re-sorts.
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conv_uuid)
        .values(updated_at=datetime.utcnow())
    )
    # Sender replying to a message request auto-accepts it on their side.
    if me_part.is_request:
        me_part.is_request = False
    await db.flush()
    await db.refresh(msg)
    return _message_out(msg)


@router.post("/conversations/start", response_model=ConversationOut)
async def start_conversation(
    body: StartConversationBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        recipient_uuid = uuid_module.UUID(body.recipient_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid recipient_id")
    if recipient_uuid == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot DM yourself")

    # Recipient must exist and not be soft-deleted.
    recipient_res = await db.execute(select(User).where(User.id == recipient_uuid))
    recipient = recipient_res.scalar_one_or_none()
    if not recipient or recipient.delete_requested_at is not None:
        raise HTTPException(status_code=404, detail="User not found")

    # Block check.
    if await _is_blocked(db, current_user.id, recipient_uuid):
        raise HTTPException(status_code=403, detail="Cannot start conversation")

    # Privacy gate — default 'mutuals'. Stored on users.dm_privacy.
    recipient_privacy = getattr(recipient, "dm_privacy", None) or "mutuals"
    is_mutual = await _are_mutual_follows(db, current_user.id, recipient_uuid)
    recipient_follows_me = await _a_follows_b(db, recipient_uuid, current_user.id)

    if recipient_privacy == "mutuals":
        goes_to_requests = not is_mutual
    elif recipient_privacy == "following":
        # Recipient accepts DMs from people they follow.
        goes_to_requests = not recipient_follows_me
    else:  # 'everyone'
        goes_to_requests = False

    # Idempotent: reuse an existing conversation if one already exists.
    existing_id = await _existing_direct_conversation(
        db, current_user.id, recipient_uuid
    )
    if existing_id:
        conv_res = await db.execute(select(Conversation).where(Conversation.id == existing_id))
        conv = conv_res.scalar_one()
        me_part = await _get_participant(db, conv.id, current_user.id)
        if me_part is None:
            # Shouldn't happen, but recover.
            me_part = ConversationParticipant(
                conversation_id=conv.id, user_id=current_user.id
            )
            db.add(me_part)
            await db.flush()
        # If an initial message was included, send it via the same path.
        if body.initial_message:
            msg = Message(
                conversation_id=conv.id,
                sender_id=current_user.id,
                content=body.initial_message.strip(),
                message_type="text",
            )
            db.add(msg)
            await db.execute(
                update(Conversation)
                .where(Conversation.id == conv.id)
                .values(updated_at=datetime.utcnow())
            )
            if me_part.is_request:
                me_part.is_request = False
            await db.flush()
            await db.refresh(conv)
        return await _build_conversation_out(db, conv, me_part, current_user.id)

    # Create new conversation + two participants.
    conv = Conversation(type="direct")
    db.add(conv)
    await db.flush()
    me_part = ConversationParticipant(
        conversation_id=conv.id, user_id=current_user.id, is_request=False
    )
    other_part = ConversationParticipant(
        conversation_id=conv.id,
        user_id=recipient_uuid,
        is_request=goes_to_requests,
    )
    db.add_all([me_part, other_part])

    if body.initial_message:
        msg = Message(
            conversation_id=conv.id,
            sender_id=current_user.id,
            content=body.initial_message.strip(),
            message_type="text",
        )
        db.add(msg)

    await db.flush()
    await db.refresh(conv)
    return await _build_conversation_out(db, conv, me_part, current_user.id)


@router.post("/conversations/{conv_id}/read")
async def mark_read(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        conv_uuid = uuid_module.UUID(conv_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    me_part = await _get_participant(db, conv_uuid, current_user.id)
    if not me_part:
        raise HTTPException(status_code=404, detail="Conversation not found")
    me_part.last_read_at = datetime.utcnow()
    # Reading a message request accepts it.
    if me_part.is_request:
        me_part.is_request = False
    await db.flush()
    return {"ok": True}


@router.delete("/conversations/{conv_id}/messages/{message_id}")
async def delete_message(
    conv_id: str,
    message_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        conv_uuid = uuid_module.UUID(conv_id)
        msg_uuid = uuid_module.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid id")
    res = await db.execute(
        select(Message).where(
            Message.id == msg_uuid,
            Message.conversation_id == conv_uuid,
        )
    )
    msg = res.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Cannot delete another user's message")
    msg.deleted_at = datetime.utcnow()
    await db.flush()
    return {"ok": True}


async def _flag_participant(
    db: AsyncSession,
    conv_id: str,
    user_id: uuid_module.UUID,
    **fields: bool,
) -> dict:
    try:
        conv_uuid = uuid_module.UUID(conv_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid conversation id")
    me_part = await _get_participant(db, conv_uuid, user_id)
    if not me_part:
        raise HTTPException(status_code=404, detail="Conversation not found")
    for k, v in fields.items():
        setattr(me_part, k, v)
    await db.flush()
    return {"ok": True}


@router.post("/conversations/{conv_id}/mute")
async def mute_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _flag_participant(db, conv_id, current_user.id, muted=True)


@router.post("/conversations/{conv_id}/unmute")
async def unmute_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _flag_participant(db, conv_id, current_user.id, muted=False)


@router.post("/conversations/{conv_id}/archive")
async def archive_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _flag_participant(db, conv_id, current_user.id, is_archived=True)


@router.post("/conversations/{conv_id}/unarchive")
async def unarchive_conversation(
    conv_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _flag_participant(db, conv_id, current_user.id, is_archived=False)


@router.get("/unread-count", response_model=UnreadCountResponse)
async def unread_count(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    me_id = current_user.id

    # Sum of (messages authored by others, not deleted, newer than
    # participant.last_read_at) across all non-archived, non-request
    # conversations this user participates in.
    q = (
        select(func.count())
        .select_from(Message)
        .join(
            ConversationParticipant,
            ConversationParticipant.conversation_id == Message.conversation_id,
        )
        .where(
            ConversationParticipant.user_id == me_id,
            ConversationParticipant.is_archived.is_(False),
            ConversationParticipant.is_request.is_(False),
            Message.deleted_at.is_(None),
            Message.sender_id != me_id,
            or_(
                ConversationParticipant.last_read_at.is_(None),
                Message.created_at > ConversationParticipant.last_read_at,
            ),
        )
    )
    res = await db.execute(q)
    return UnreadCountResponse(unread_count=int(res.scalar_one() or 0))


# ── DM-able users list (for the New Message screen) ──────────────────────────


class DmUserOut(BaseModel):
    id: str
    display_name: str
    username: Optional[str] = None
    avatar_url: Optional[str] = None
    initials: str


class DmUserListResponse(BaseModel):
    users: List[DmUserOut]


@router.get("/dm-candidates", response_model=DmUserListResponse)
async def dm_candidates(
    q: Optional[str] = Query(None, description="Filter by name/username prefix"),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Users the current user can start a DM with.

    Phase 1 behaviour: everyone the current user is following (subject to
    block list). A later phase can extend to 'mutuals only' when the target
    user's dm_privacy is 'mutuals' etc.
    """
    me_id = current_user.id
    # Users I follow.
    follow_q = (
        select(User)
        .join(SocialFollow, SocialFollow.following_id == User.id)
        .where(SocialFollow.follower_id == me_id, active_user_filter())
    )
    if q:
        like = f"%{q.strip()}%"
        follow_q = follow_q.where(
            or_(User.display_name.ilike(like), User.username.ilike(like))
        )
    follow_q = follow_q.limit(limit)
    rows = (await db.execute(follow_q)).scalars().all()

    # Filter blocked (bidirectional).
    out: list[DmUserOut] = []
    for u in rows:
        if await _is_blocked(db, me_id, u.id):
            continue
        out.append(
            DmUserOut(
                id=str(u.id),
                display_name=u.display_name or u.username or "Athlete",
                username=u.username,
                avatar_url=getattr(u, "avatar_url", None),
                initials=_user_initials(u),
            )
        )
    return DmUserListResponse(users=out)
