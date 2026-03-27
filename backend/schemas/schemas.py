"""
Pydantic schemas — these define the shape of data flowing in and out of the API.

Think of schemas like "contracts":
- Request schemas: what the frontend must send us
- Response schemas: what we promise to send back

Pydantic v2 automatically validates types, converts strings to ints, etc.
If the data doesn't match the schema, FastAPI returns a 422 error automatically.
"""

from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Any


# ─── Members ──────────────────────────────────────────────────────────────────

class MemberCreate(BaseModel):
    name: str

class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    name: str


# ─── Groups ───────────────────────────────────────────────────────────────────

class GroupCreate(BaseModel):
    name: str
    start_date: Optional[str] = None  # ISO date e.g. "2026-01-05"
    end_date: Optional[str] = None    # ISO date e.g. "2026-01-19"
    # The settlement currency for this group — all foreign expenses get converted to this
    base_currency: str = "USD"

class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: Any
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    members: List[MemberResponse] = []
    # Return the group's settlement currency to the frontend
    base_currency: str = "USD"


# ─── Statements ───────────────────────────────────────────────────────────────

class StatementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    statement_date: Optional[str]
    period_start: Optional[str]
    period_end: Optional[str]
    uploaded_at: Any
    card_holder_member_id: Optional[int]
    transaction_count: int = 0
    # True for the virtual "Manual Expenses" containers that hold manually-entered
    # expenses. These are not real uploaded files and should be hidden from the
    # statement list and settlement config UI.
    is_manual: bool = False


# ─── Transactions ─────────────────────────────────────────────────────────────

class TransactionUpdate(BaseModel):
    """Fields the user can override on a transaction."""
    # Core fields — useful for fixing PDF/CSV parsing errors or manual entry mistakes
    amount: Optional[float] = None
    posted_date: Optional[str] = None       # ISO date "YYYY-MM-DD"
    description_raw: Optional[str] = None  # merchant name / description
    # Classification fields
    category: Optional[str] = None
    is_personal: Optional[bool] = None
    participants_json: Optional[dict] = None
    split_method_json: Optional[dict] = None
    status: Optional[str] = None  # "unreviewed" | "confirmed" | "excluded"

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    statement_id: int
    posted_date: str
    description_raw: str
    amount: float                           # Amount in the group's base currency
    txn_type: str
    category: Optional[str]
    is_personal: bool
    participants_json: Optional[dict]
    split_method_json: Optional[dict]
    overrides_json: Optional[dict]
    parse_confidence: float
    txn_hash: str
    status: str = "unreviewed"
    # Multi-currency fields — frontend uses these to show "¥5,000 (≈$33.50)"
    currency: str = "USD"                   # The currency the charge was made in
    original_amount: Optional[float] = None # Amount in foreign currency (null if same as base)

class BulkTransactionUpdate(BaseModel):
    """Bulk-update multiple transactions at once — the core trip workflow."""
    transaction_ids: List[int]
    category: Optional[str] = None
    is_personal: Optional[bool] = None
    participants_json: Optional[dict] = None
    split_method_json: Optional[dict] = None
    status: Optional[str] = None


# ─── Merchant Rules ───────────────────────────────────────────────────────────

class MerchantRuleCreate(BaseModel):
    merchant_key: str
    default_category: Optional[str] = None
    default_participants_json: Optional[dict] = None
    default_split_method_json: Optional[dict] = None

class MerchantRuleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    group_id: int
    merchant_key: str
    default_category: Optional[str]
    default_participants_json: Optional[dict]
    default_split_method_json: Optional[dict]


# ─── Settlement ───────────────────────────────────────────────────────────────

class SettlementRequest(BaseModel):
    """Who paid the credit card bill? Required to compute who owes whom."""
    payer_member_id: int
    statement_id: Optional[int] = None  # if None, compute across all statements

class BalanceItem(BaseModel):
    member_id: int
    member_name: str
    balance: float  # positive = owed, negative = owes

class TransferItem(BaseModel):
    from_member_id: int
    from_member_name: str
    to_member_id: int
    to_member_name: str
    amount: float
    message: str        # human-readable: "Bob owes Alice $47.50"
    payment_request: str  # copyable: "Hey Bob, you owe me $47.50 for shared expenses. Venmo: @alice"

class SettlementResponse(BaseModel):
    group_id: int
    payer_member_id: int
    balances: List[BalanceItem]
    transfers: List[TransferItem]
    total_shared_expenses: float
    currency: str = "USD"


# ─── Upload Response ──────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    status: str  # "imported" | "duplicate"
    statement_id: int
    transaction_count: int
    needs_review_count: int  # transactions with participants_json.type == "ask"
    excluded_by_date_count: int = 0  # transactions outside the trip date range
    message: str

class SaveMerchantRuleRequest(BaseModel):
    """Request to save a merchant rule from a transaction override."""
    transaction_id: int
    merchant_key: Optional[str] = None  # if None, we auto-compute from description


# ─── Manual Expense Entry ──────────────────────────────────────────────────────

class ManualTransactionCreate(BaseModel):
    """
    Data the user fills in when manually adding an expense (no bank statement needed).

    Every field maps directly to what a user would fill in on a form:
    - posted_date: when the expense happened ("2026-01-15")
    - description: what the merchant / expense was ("Dinner at Nobu")
    - amount: how much was spent (positive number, e.g. 124.50)
    - paid_by_member_id: which group member's card / cash paid for it
    - category: optional override — if omitted we auto-detect from the description
    - participants_json: who splits this expense — defaults to all members equally
    - split_method_json: how to split — defaults to equal
    - currency: what currency the charge was made in (e.g. "JPY")
    - original_amount: amount in the original foreign currency (null if same as base)
    - exchange_rate: how many base-currency units one foreign-currency unit is worth
                     (e.g. 0.0067 means 1 JPY = 0.0067 USD)
    """
    posted_date: str                             # ISO date "YYYY-MM-DD"
    description: str                             # merchant name or free-text label
    amount: float                                # positive number (in stated currency)
    paid_by_member_id: int                       # member who paid
    category: Optional[str] = None              # auto-detected if omitted
    participants_json: Optional[dict] = None    # {"type": "all", "member_ids": [...]}
    split_method_json: Optional[dict] = None    # {"type": "equal"} etc.
    # Multi-currency: if currency differs from the group's base_currency, provide exchange_rate
    currency: str = "USD"                       # currency the expense was charged in
    original_amount: Optional[float] = None    # amount in foreign currency (set by service)
    exchange_rate: Optional[float] = None      # 1 foreign unit = exchange_rate base units


class ManualTransactionResponse(BaseModel):
    """Returned after successfully creating a manual expense."""
    transaction_id: int
    statement_id: int
    message: str


# ─── Trip Share ───────────────────────────────────────────────────────────────

class TripShareCreate(BaseModel):
    """Request to create (or return existing) share link for a trip settlement."""
    # The payer we used on the settlement page — captures which member is the reference
    payer_member_id: int

class TripShareResponse(BaseModel):
    """Returned when creating a share link."""
    share_code: str          # The UUID code used in the URL, e.g. "a8f3c2d1-..."
    share_url: str           # The full URL the user can share
    created_at: Any
    view_count: int = 0

class PublicMember(BaseModel):
    """A trip member, safe to show publicly."""
    id: int
    name: str

class PublicTransfer(BaseModel):
    """One 'X owes Y $Z' row — safe to show on the public share page."""
    from_member_name: str
    to_member_name: str
    amount: float
    message: str             # "Alice owes Bob $47.50"
    payment_request: str     # Full copyable message: "Hey Alice! You owe Bob..."

class PublicTripView(BaseModel):
    """
    Everything needed to render the public share page.
    Contains no sensitive user data — only trip name, members, and settlement math.
    """
    trip_name: str
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    members: List[PublicMember]
    currency: str
    total_shared_expenses: float
    transfers: List[PublicTransfer]
    transaction_count: int   # Total number of transactions in the trip
    view_count: int          # How many times this share has been viewed


# ─── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackCreate(BaseModel):
    """
    User-submitted feedback from the in-app feedback widget.
    Collected during early rollout to improve the product.
    """
    feedback_type: str          # "bug" | "feature" | "other"
    message: str                # required — what they want to say
    email: Optional[str] = None # optional — only if they want a reply
    page: Optional[str] = None  # which page they were on (e.g. "/groups/3/upload")

class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    feedback_type: str
    message: str
    email: Optional[str] = None
    page: Optional[str] = None
    created_at: Any
