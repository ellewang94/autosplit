"""add owner_id to statements/transactions/merchant_rules

Revision ID: 097d38528aef
Revises: 56e84726584e
Create Date: 2026-05-15 01:35:36.197648

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '097d38528aef'
down_revision: Union[str, Sequence[str], None] = '56e84726584e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add owner_id (denormalized from Group.owner_id) for defense-in-depth."""
    op.add_column('merchant_rules', sa.Column('owner_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_merchant_rules_owner_id'), 'merchant_rules', ['owner_id'], unique=False)
    op.add_column('statements', sa.Column('owner_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_statements_owner_id'), 'statements', ['owner_id'], unique=False)
    op.add_column('transactions', sa.Column('owner_id', sa.String(), nullable=True))
    op.create_index(op.f('ix_transactions_owner_id'), 'transactions', ['owner_id'], unique=False)

    # Backfill owner_id on existing rows from the parent Group. Skips legacy
    # rows whose Group has no owner_id (pre-auth local data).
    op.execute("""
        UPDATE statements
        SET owner_id = (SELECT g.owner_id FROM groups g WHERE g.id = statements.group_id)
        WHERE owner_id IS NULL
    """)
    op.execute("""
        UPDATE merchant_rules
        SET owner_id = (SELECT g.owner_id FROM groups g WHERE g.id = merchant_rules.group_id)
        WHERE owner_id IS NULL
    """)
    op.execute("""
        UPDATE transactions
        SET owner_id = (
            SELECT s.owner_id FROM statements s WHERE s.id = transactions.statement_id
        )
        WHERE owner_id IS NULL
    """)


def downgrade() -> None:
    op.drop_index(op.f('ix_transactions_owner_id'), table_name='transactions')
    op.drop_column('transactions', 'owner_id')
    op.drop_index(op.f('ix_statements_owner_id'), table_name='statements')
    op.drop_column('statements', 'owner_id')
    op.drop_index(op.f('ix_merchant_rules_owner_id'), table_name='merchant_rules')
    op.drop_column('merchant_rules', 'owner_id')
