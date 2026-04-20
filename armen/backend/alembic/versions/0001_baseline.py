"""baseline

No-op migration representing the pre-Alembic schema. Existing databases
should `alembic stamp head` once so this is recorded without attempting to
re-create any objects.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-04-20

"""
from typing import Sequence, Union


# revision identifiers, used by Alembic.
revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Intentionally empty — legacy schema is owned by Base.metadata.create_all
    # and _USER_COLUMN_MIGRATIONS in app/main.py until fully migrated.
    pass


def downgrade() -> None:
    pass
