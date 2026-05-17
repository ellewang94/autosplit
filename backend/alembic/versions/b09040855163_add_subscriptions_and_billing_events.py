"""add subscriptions and billing_events

Revision ID: b09040855163
Revises: 097d38528aef
Create Date: 2026-05-15 01:36:39.987487

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b09040855163'
down_revision: Union[str, Sequence[str], None] = '097d38528aef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add subscriptions + billing_events tables for Stripe integration."""
    op.create_table(
        'billing_events',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('stripe_event_id', sa.String(), nullable=False),
        sa.Column('event_type', sa.String(), nullable=False),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('payload_json', sa.JSON(), nullable=True),
        sa.Column('received_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_billing_events_id'), 'billing_events', ['id'], unique=False)
    op.create_index(op.f('ix_billing_events_stripe_customer_id'), 'billing_events', ['stripe_customer_id'], unique=False)
    op.create_index(op.f('ix_billing_events_stripe_event_id'), 'billing_events', ['stripe_event_id'], unique=True)
    op.create_index(op.f('ix_billing_events_user_id'), 'billing_events', ['user_id'], unique=False)

    op.create_table(
        'subscriptions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('stripe_customer_id', sa.String(), nullable=True),
        sa.Column('stripe_subscription_id', sa.String(), nullable=True),
        sa.Column('plan', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('current_period_end', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_subscriptions_id'), 'subscriptions', ['id'], unique=False)
    op.create_index(op.f('ix_subscriptions_stripe_customer_id'), 'subscriptions', ['stripe_customer_id'], unique=False)
    op.create_index(op.f('ix_subscriptions_stripe_subscription_id'), 'subscriptions', ['stripe_subscription_id'], unique=True)
    op.create_index(op.f('ix_subscriptions_user_id'), 'subscriptions', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_subscriptions_user_id'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_stripe_subscription_id'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_stripe_customer_id'), table_name='subscriptions')
    op.drop_index(op.f('ix_subscriptions_id'), table_name='subscriptions')
    op.drop_table('subscriptions')
    op.drop_index(op.f('ix_billing_events_user_id'), table_name='billing_events')
    op.drop_index(op.f('ix_billing_events_stripe_event_id'), table_name='billing_events')
    op.drop_index(op.f('ix_billing_events_stripe_customer_id'), table_name='billing_events')
    op.drop_index(op.f('ix_billing_events_id'), table_name='billing_events')
    op.drop_table('billing_events')
