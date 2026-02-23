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

class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    created_at: Any
    members: List[MemberResponse] = []


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


# ─── Transactions ─────────────────────────────────────────────────────────────

class TransactionUpdate(BaseModel):
    """Fields the user can override on a transaction."""
    category: Optional[str] = None
    is_personal: Optional[bool] = None
    participants_json: Optional[dict] = None
    split_method_json: Optional[dict] = None

class TransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    statement_id: int
    posted_date: str
    description_raw: str
    amount: float
    txn_type: str
    category: Optional[str]
    is_personal: bool
    participants_json: Optional[dict]
    split_method_json: Optional[dict]
    overrides_json: Optional[dict]
    parse_confidence: float
    txn_hash: str


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
    message: str

class SaveMerchantRuleRequest(BaseModel):
    """Request to save a merchant rule from a transaction override."""
    transaction_id: int
    merchant_key: Optional[str] = None  # if None, we auto-compute from description
