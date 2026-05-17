"""add status enum check constraint

Revision ID: 53d3cb9d9505
Revises: b09040855163
Create Date: 2026-05-15 01:42:54.261024

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '53d3cb9d9505'
down_revision: Union[str, Sequence[str], None] = 'b09040855163'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Add a CHECK constraint on transactions.status so a typo in the application
    layer can't silently produce a row with an invalid status value (which
    would then be invisible to settlement queries that filter on the exact
    string). batch_alter_table rewrites the table for SQLite — Postgres can
    ALTER TABLE ADD CONSTRAINT directly.
    """
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.create_check_constraint(
            'ck_transactions_status_enum',
            "status IN ('unreviewed', 'confirmed', 'excluded')",
        )


def downgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.drop_constraint('ck_transactions_status_enum', type_='check')
