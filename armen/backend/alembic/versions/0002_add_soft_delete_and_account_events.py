"""add_soft_delete_and_account_events

Adds users.delete_requested_at and users.deleted_at for soft-delete,
plus account_deletion_events audit table.

Revision ID: 0002_add_soft_delete
Revises: 0001_baseline
Create Date: 2026-04-20

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0002_add_soft_delete"
down_revision: Union[str, None] = "0001_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Idempotent: coexists with legacy Base.metadata.create_all on lifespan startup
    # and with re-runs on DBs that already hold the schema via other paths.
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS delete_requested_at TIMESTAMPTZ NULL"
    )
    op.execute(
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_users_deleted_at ON users (deleted_at)"
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS account_deletion_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL,
            event_type VARCHAR(32) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            ip_address INET NULL,
            user_agent TEXT NULL,
            extra_metadata JSONB NULL
        )
        """
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_account_deletion_events_user_created "
        "ON account_deletion_events (user_id, created_at DESC)"
    )


def downgrade() -> None:
    op.drop_index(
        "ix_account_deletion_events_user_created",
        table_name="account_deletion_events",
    )
    op.drop_table("account_deletion_events")
    op.drop_index("ix_users_deleted_at", table_name="users")
    op.drop_column("users", "deleted_at")
    op.drop_column("users", "delete_requested_at")
