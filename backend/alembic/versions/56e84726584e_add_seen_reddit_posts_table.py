"""add seen_reddit_posts table

Revision ID: 56e84726584e
Revises: a68c51dff2cd
Create Date: 2026-05-15 01:30:34.074532

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '56e84726584e'
down_revision: Union[str, Sequence[str], None] = 'a68c51dff2cd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Adds seen_reddit_posts: persistent dedup store for the growth monitor."""
    op.create_table(
        'seen_reddit_posts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('post_id', sa.String(), nullable=False),
        sa.Column('seen_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_seen_reddit_posts_id'), 'seen_reddit_posts', ['id'], unique=False)
    op.create_index(op.f('ix_seen_reddit_posts_post_id'), 'seen_reddit_posts', ['post_id'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_seen_reddit_posts_post_id'), table_name='seen_reddit_posts')
    op.drop_index(op.f('ix_seen_reddit_posts_id'), table_name='seen_reddit_posts')
    op.drop_table('seen_reddit_posts')
