"""
SQLAlchemy database models for AutoSplit.

Think of these as the "blueprints" for our database tables.
Each class = one table, each Column = one column in that table.
The relationships let SQLAlchemy automatically join tables for us.
"""

from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, Text, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import declarative_base, relationship
from datetime import datetime, timezone

# Base is the "parent" all models inherit from — SQLAlchemy needs this
Base = declarative_base()


class Group(Base):
    """
    A household or group of people sharing expenses.
    Example: "The 3rd St Apartment" or "Japan Trip Jan 2026"
    """
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Optional trip date range — transactions outside this window get auto-excluded on import
    start_date = Column(String, nullable=True)  # ISO date e.g. "2026-01-05"
    end_date = Column(String, nullable=True)    # ISO date e.g. "2026-01-19"
    # The currency all expenses are settled in (e.g. "USD", "JPY").
    # Foreign currency expenses get converted to this before settlement.
    base_currency = Column(String, default="USD", nullable=False, server_default="USD")
    # The Supabase user UUID who owns this trip. Nullable for backward compatibility
    # with locally-created groups that predate the cloud migration.
    owner_id = Column(String, nullable=True, index=True)
    # Invite link token — anyone with this URL can join as a collaborator.
    # Generated on demand, revocable by regenerating. Separate from share_code.
    invite_code = Column(String, nullable=True, unique=True, index=True)

    # One group → many members/statements/rules
    members = relationship("Member", back_populates="group", cascade="all, delete-orphan")
    statements = relationship("Statement", back_populates="group", cascade="all, delete-orphan")
    merchant_rules = relationship("MerchantRule", back_populates="group", cascade="all, delete-orphan")


class Member(Base):
    """
    One person in the group.
    Example: "Alice", "Bob", "Charlie"
    """
    __tablename__ = "members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    name = Column(String, nullable=False)
    # Supabase user UUID — set when a user claims this member slot via an invite link.
    # Null = this member hasn't joined AutoSplit yet (they're just a name in the trip).
    user_id = Column(String, nullable=True, index=True)

    @property
    def has_account(self) -> bool:
        """True if this member has linked their AutoSplit account."""
        return self.user_id is not None

    group = relationship("Group", back_populates="members")


class Statement(Base):
    """
    One uploaded credit card statement (PDF).
    We store the statement period (e.g. Jan 9 – Feb 8) so we can
    correctly assign years to transaction dates like "01/15".
    source_hash prevents the same PDF from being imported twice.
    """
    __tablename__ = "statements"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    # Statement date = the closing/due date printed on the statement
    statement_date = Column(String, nullable=True)
    period_start = Column(String, nullable=True)   # e.g. "2026-01-09"
    period_end = Column(String, nullable=True)     # e.g. "2026-02-08"
    # SHA-256 hash of the uploaded file bytes — used to detect duplicate uploads
    source_hash = Column(String, unique=True, nullable=False)
    # Full extracted text stored for debugging
    raw_text = Column(Text, nullable=True)
    uploaded_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Which member is the card holder (paid the bill)
    card_holder_member_id = Column(Integer, ForeignKey("members.id"), nullable=True)

    group = relationship("Group", back_populates="statements")
    transactions = relationship("Transaction", back_populates="statement", cascade="all, delete-orphan")
    card_holder = relationship("Member", foreign_keys=[card_holder_member_id])


class Transaction(Base):
    """
    One line item from the credit card statement.

    Stores both the raw data from the PDF AND the user's decisions about
    how to split it. The overrides_json field tracks any manual changes
    the user made (for audit trail).

    parse_confidence: 1.0 = perfectly parsed, <0.8 = might be wrong, flag for review.
    txn_hash: fingerprint of date+merchant+amount for idempotency (no duplicate imports).
    """
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    statement_id = Column(Integer, ForeignKey("statements.id"), nullable=False)
    posted_date = Column(String, nullable=False)        # "2026-01-15" (ISO format)
    description_raw = Column(String, nullable=False)    # Exactly as it appears on statement
    amount = Column(Float, nullable=False)              # Amount in the group's base currency
    txn_type = Column(String, default="purchase")       # "purchase" (future: "payment", "credit")
    # Multi-currency support:
    # currency = what currency the charge was made in (e.g. "JPY")
    # original_amount = the amount in that foreign currency (e.g. 5000 for ¥5000)
    # If currency == base_currency, original_amount will be null (same thing, no conversion needed)
    currency = Column(String, default="USD", nullable=False, server_default="USD")
    original_amount = Column(Float, nullable=True)      # null if same as base currency
    category = Column(String, nullable=True)            # "dining", "groceries", etc.
    is_personal = Column(Boolean, default=False)        # If True, excluded from splitting

    # Who splits this charge and how.
    # participants_json example: {"type": "all", "member_ids": [1, 2, 3]}
    # type can be: "all", "single", "custom", "ask" (needs user input)
    participants_json = Column(JSON, nullable=True)

    # How to split the amount.
    # split_method_json examples:
    #   {"type": "equal"}
    #   {"type": "percentage", "percentages": {"1": 60, "2": 40}}
    #   {"type": "exact", "amounts": {"1": 45.00, "2": 23.50}}
    split_method_json = Column(JSON, nullable=True)

    # Any manual overrides the user made (for audit + merchant rule learning)
    overrides_json = Column(JSON, nullable=True, default=dict)

    parse_confidence = Column(Float, default=1.0)
    txn_hash = Column(String, nullable=False, index=True)  # fingerprint for dedup
    # Three-state review status (replaces the binary is_personal for bulk-editing workflows)
    # "unreviewed" = needs attention, "confirmed" = user approved, "excluded" = not shared
    status = Column(String, default="unreviewed")

    statement = relationship("Statement", back_populates="transactions")


class MerchantRule(Base):
    """
    "Remember this" rules for specific merchants.

    When a user overrides a transaction and clicks "Save as merchant rule",
    we store their preference here. Next time that merchant appears,
    we auto-apply the same category, participants, and split method.

    merchant_key is a normalized version of the merchant name
    (lowercase, stripped of location/numbers) for fuzzy matching.
    Example: "WHOLE FOODS MARKET 123 NEW YORK NY" → "whole foods market"
    """
    __tablename__ = "merchant_rules"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    merchant_key = Column(String, nullable=False)           # normalized merchant name
    default_category = Column(String, nullable=True)
    default_participants_json = Column(JSON, nullable=True)
    default_split_method_json = Column(JSON, nullable=True)

    group = relationship("Group", back_populates="merchant_rules")

    # Unique constraint: one rule per merchant per group
    __table_args__ = (
        UniqueConstraint('group_id', 'merchant_key', name='uq_merchant_rule'),
    )


class TripShare(Base):
    """
    A shareable read-only link for a trip's settlement summary.

    When a trip owner wants to show their friends how the expenses were split,
    they create a share link. Anyone with the link can view the settlement
    without signing up — this is the app's viral loop.

    share_code:       A random UUID used in the URL: /share/abc123
    group_id:         Which trip this share points to
    created_by:       Supabase user UUID of who created the share
    payer_member_id:  The reference payer used for settlement computation
                      (captured at share creation time from the settlement page)
    view_count:       How many times the share link has been viewed (analytics)
    """
    __tablename__ = "trip_shares"

    id = Column(Integer, primary_key=True, index=True)
    # The URL-safe random code used in the share link (e.g. "a8f3c2d1-...")
    share_code = Column(String, unique=True, nullable=False, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False)
    # Who created the share (must be the trip owner)
    created_by = Column(String, nullable=False)
    # Which member is the reference payer for settlement computation
    # (saved at share creation so the link always shows a valid settlement)
    payer_member_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    # Track how many times this link has been viewed — useful for growth analytics
    view_count = Column(Integer, default=0, nullable=False, server_default="0")

    group = relationship("Group")


class Feedback(Base):
    """
    User feedback submitted through the in-app feedback widget.

    Collected during early rollout to help iterate on the product.
    Stored locally — no external service needed.
    """
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    # Type lets us triage quickly: bug reports vs feature requests vs general
    feedback_type = Column(String, nullable=False)   # "bug" | "feature" | "other"
    message = Column(Text, nullable=False)
    # Optional — user can leave their email if they want a follow-up
    email = Column(String, nullable=True)
    # Which page they were on — helps us understand context
    page = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
