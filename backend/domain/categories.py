"""
Auto-categorization logic for transactions.

This is pure business logic — no database, no API, just functions.
We match merchant names to categories using keyword lists, then suggest
who should split each category based on sensible household defaults.

Think of this like a smart inbox filter: "if the email contains 'Netflix',
put it in Subscriptions and mark it for one person only."
"""

import re
from typing import Tuple, List

# Maps category name → list of keywords to look for in merchant descriptions.
# Keywords are checked case-insensitively. Order matters: first match wins.
CATEGORY_KEYWORDS: dict[str, list[str]] = {
    "dining": [
        "restaurant", "cafe", "coffee", "pizza", "burger", "sushi", "taco",
        "grill", "kitchen", "bakery", "diner", "bistro", "bar ", "pub ",
        "eatery", "mcdonald", "starbucks", "chipotle", "doordash", "uber eats",
        "grubhub", "postmates", "seamless", "toast", "chick-fil", "subway ",
        "panera", "shake shack", "five guys", "sweetgreen", "cava", "dig ",
        "boba", "dunkin", "pret ", "wingstop", "popeyes", "domino", "papa john",
        "little caesar", "jersey mike", "firehouse", "habit ", "smashburger",
    ],
    "groceries": [
        "whole foods", "trader joe", "kroger", "safeway", "albertsons",
        "publix", "costco", "walmart", "aldi", "sprouts", "market", "grocery",
        "supermarket", "fresh market", "food lion", "stop & shop", "wegmans",
        "heb ", "giant ", "winn dixie", "meijer", "harris teeter",
    ],
    "transportation": [
        "uber", "lyft", "taxi", "metro", "subway pass", "transit", "parking",
        "eztag", "fastrak", "toll", "shell ", "chevron", "bp ", "exxon",
        "mobil ", "marathon ", "delta air", "united air", "southwest air",
        "american air", "jetblue", "alaska air", "frontier air", "spirit air",
        "amtrak", "greyhound",
    ],
    "utilities": [
        "electric", "gas company", "water company", "pg&e", "con ed",
        "national grid", "xfinity", "comcast", "spectrum", "cox comm",
        "verizon fios", "at&t internet", "t-mobile home", "centurylink",
        "frontier comm", "optimum", "direct tv", "dish network",
    ],
    "subscriptions": [
        "netflix", "spotify", "hulu ", "disney+", "apple.com/bill",
        "amazon prime", "youtube premium", "hbo max", "paramount+",
        "peacock", "adobe", "microsoft 365", "google one", "dropbox",
        "icloud", "github", "notion", "slack", "zoom ", "chatgpt",
        "anthropic", "openai",
    ],
    "entertainment": [
        "amc ", "regal ", "cinemark", "movie", "cinema", "theater",
        "concert", "ticketmaster", "eventbrite", "dave & buster", "bowling",
        "topgolf", "minigolf", "escape room", "arcade", "museum", "zoo ",
        "aquarium",
    ],
    "health": [
        "cvs ", "walgreens", "rite aid", "pharmacy", "doctor", "dental",
        "hospital", "urgent care", "clinic", "medical", "optometrist",
        "gyno", "therapy", "psychiatry",
    ],
    "fitness": [
        "gym ", "fitness", "planet fitness", "equinox", "soulcycle", "peloton",
        "orange theory", "barry's", "crossfit", "yoga", "pilates",
    ],
    "shopping": [
        "amazon", "ebay", "etsy", "zara", "h&m ", "gap ", "old navy",
        "nike ", "adidas", "nordstrom", "macy", "best buy", "apple store",
        "target", "tj maxx", "marshalls", "ross ",
    ],
    "travel": [
        "hotel", "airbnb", "marriott", "hilton", "hyatt", "expedia",
        "booking.com", "vrbo", "hostel", "inn ", "resort ",
    ],
}

# Default participant suggestion per category:
# "all"    → include all group members (e.g. shared utilities)
# "single" → one person (e.g. individual subscriptions, personal shopping)
# "ask"    → unclear, flag for user to decide
CATEGORY_DEFAULT_PARTICIPANTS: dict[str, str] = {
    "dining": "all",
    "groceries": "all",
    "utilities": "all",
    "subscriptions": "single",
    "transportation": "single",
    "entertainment": "ask",
    "health": "single",
    "fitness": "single",
    "shopping": "single",
    "travel": "ask",
    "unknown": "ask",
}


def normalize_merchant_key(description: str) -> str:
    """
    Normalize a raw merchant description to a stable key for merchant rule lookup.

    Chase statements often have location info and transaction IDs appended:
      "WHOLE FOODS MARKET #123 NEW YORK NY 01/15" → "whole foods market"
    We strip numbers, locations, and extra spaces.
    """
    # Lowercase
    key = description.lower()
    # Remove trailing state abbreviations like "NY", "CA", "TX" with spaces
    key = re.sub(r'\b[a-z]{2}\b\s*$', '', key)
    # Remove digits and common separator characters
    key = re.sub(r'[\d#*\-_/]', ' ', key)
    # Remove extra whitespace
    key = re.sub(r'\s+', ' ', key).strip()
    # Truncate to first 3 words for fuzzy stability.
    # 4 words risks including location info (e.g. "WHOLE FOODS MARKET NEW YORK" → 4th word is "NEW")
    words = key.split()
    return ' '.join(words[:3])


def categorize(description: str) -> Tuple[str, float]:
    """
    Attempt to categorize a merchant description.

    Returns:
        (category_name, confidence)
        confidence = 1.0 for keyword match, 0.5 for unknown
    """
    desc_lower = description.lower()

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in desc_lower:
                return category, 1.0

    return "unknown", 0.5


def suggest_participants(category: str, all_member_ids: List[int]) -> dict:
    """
    Suggest who should split a transaction based on its category.

    Returns a participants_json dict that gets stored on the Transaction:
        {"type": "all", "member_ids": [1, 2, 3]}   ← all members
        {"type": "single", "member_ids": []}         ← one person (TBD)
        {"type": "ask", "member_ids": []}            ← needs review
    """
    suggestion_type = CATEGORY_DEFAULT_PARTICIPANTS.get(category, "ask")

    if suggestion_type == "all":
        return {"type": "all", "member_ids": all_member_ids}
    elif suggestion_type == "single":
        return {"type": "single", "member_ids": []}
    else:
        return {"type": "ask", "member_ids": []}
