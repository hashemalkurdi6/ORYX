"""Active-user visibility helpers for social read paths.

Soft-deleted users (those with ``delete_requested_at IS NOT NULL``) must
disappear immediately from every user-facing social read path. These helpers
centralize the predicate so callers can apply it consistently.
"""

from sqlalchemy import Select
from sqlalchemy.sql import ColumnElement
from sqlalchemy.sql.expression import select as sa_select

from app.models.user import User


def active_user_filter() -> ColumnElement:
    """SQLAlchemy predicate matching only active (non-soft-deleted) users.

    Use with ``.where(active_user_filter())``. Assumes ``User`` is already
    present in the FROM clause of the query (typically via an explicit JOIN).
    """
    return User.delete_requested_at.is_(None)


def active_users_only(stmt: Select) -> Select:
    """Apply the active-user filter to any ``Select`` that already has
    ``User`` in its FROM clause. Returns the augmented ``Select``.
    """
    return stmt.where(User.delete_requested_at.is_(None))


def active_user_ids_subquery():
    """Scalar subquery selecting IDs of active users.

    Use in ``.where(Model.user_id.in_(active_user_ids_subquery()))`` for
    queries that don't JOIN the users table directly.
    """
    return sa_select(User.id).where(User.delete_requested_at.is_(None)).scalar_subquery()
