"""
Auto-categorization logic for transactions.

This is pure business logic — no database, no API, just functions.
We match merchant names to categories using a TWO-TIER keyword system,
then suggest who should split each category based on sensible trip defaults.

HOW THE TWO-TIER SYSTEM WORKS:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tier 1 — PHRASE_KEYWORDS (exact brand names, confidence 1.0):
  "whole foods", "mcdonald", "netflix" → solid match, we're confident
  These are substring matches (the keyword appears anywhere in the description)

Tier 2 — WORD_KEYWORDS (generic category words, confidence 0.9):
  "restaurant", "pharmacy", "supermarket" → decent signal but less certain
  These use word-boundary matching (\bword\b) so "bar" won't match "barber"
  or "subway" won't match "subway sandwich" when we don't want it to

WHY TWO TIERS?
  A single flat list has a false-positive problem: "bar" matches "barbershop",
  "market" matches "supermarket" AND "stock market newsletter".
  Separating brand names (precise) from generic words (fuzzy) lets us tune
  each tier's matching aggressiveness independently.

Think of Tier 1 as a VIP guest list: if you're on it, you're in, no questions asked.
Tier 2 is more like a bouncer with a description: "does this person look like they
belong in the dining category?"
"""

import re
from typing import Tuple, List


# ─────────────────────────────────────────────────────────────────────────────
# TIER 1 — PHRASE KEYWORDS (brand names, specific merchants, POS prefixes)
# These are substring-matched case-insensitively. Confidence: 1.0
# ─────────────────────────────────────────────────────────────────────────────

CATEGORY_PHRASE_KEYWORDS: dict[str, list[str]] = {

    "dining": [
        # ── Chase POS / delivery platform prefixes ──
        "tst*",           # Toast POS — restaurant point-of-sale system
        "sq *",           # Square POS — very common for cafes, food trucks
        "doordash",       # Delivery
        "uber eats",      # Delivery
        "grubhub",        # Delivery
        "postmates",      # Delivery
        "seamless",       # Delivery
        "instacart",      # Sometimes food delivery
        "deliveroo",      # UK/AU/Middle East delivery
        "foodpanda",      # Asia delivery
        "grab food",      # Southeast Asia
        "menulog",        # Australia/NZ delivery
        "uber eatz",      # Typo variant we've seen
        "door dash",      # Space variant

        # ── Global fast food chains ──
        "mcdonald",       # McDonald's (no apostrophe in transaction data)
        "mcdonalds",
        "starbucks",
        "chipotle",
        "subway sandwich",
        "panera",
        "shake shack",
        "five guys",
        "sweetgreen",
        "cava",
        "wingstop",
        "popeyes",
        "dominos",        # Domino's
        "domino's",
        "papa john",
        "little caesar",
        "jersey mike",
        "firehouse subs",
        "habit burger",
        "smashburger",
        "chick-fil",      # Chick-fil-A
        "taco bell",
        "kfc ",           # Space prevents matching "rkfc" etc.
        "pizza hut",
        "dunkin",         # Dunkin' Donuts
        "pret ",          # Pret a Manger
        "tim hortons",
        "chilis",         # Chili's
        "applebees",
        "ihop",
        "denny's",
        "olive garden",
        "red lobster",
        "outback steakhouse",
        "cheesecake factory",
        "panda express",
        "p.f. chang",
        "cheesecake",
        "nandos",         # Nando's (AU/UK/SA)
        "hungry jack",    # Burger King in Australia
        "grill'd",        # Australian burger chain
        "oporto",         # Australian chicken chain
        "red rooster",    # Australian fast food
        "guzman",         # Guzman y Gomez (AU Mexican)
        "soul origin",    # Australian cafe chain
        "the coffee club", # AU/NZ cafe chain
        "gloria jeans",   # AU coffee chain
        "hudsons coffee", # Australian cafe
        "boost juice",    # Australian juice bar
        "chatime",        # Bubble tea chain (AU/Asia)
        "gongcha",        # Gong Cha bubble tea
        "tiger sugar",    # Bubble tea
        "ippudo",         # Japanese ramen chain (global)
        "ichiran",        # Japanese ramen (global)
        "wagamama",       # Asian fusion (UK/global)
        "yoshinoya",      # Japanese fast food
        "mos burger",     # Japanese burger chain
        "lotteria",       # Korean fast food
        "jollibee",       # Filipino fast food (global)
        "pepper lunch",   # Japanese chain (global)
        "sukiya",         # Japanese beef bowl
        "matsuya",        # Japanese beef bowl
        "saizeriya",      # Italian-Japanese chain
        "gyukatsu",       # Japanese beef cutlet
        "tempura tendon", # Japanese tempura
        "conveyor sushi", # Generic sushi belt restaurant
        "sushiro",        # Japanese conveyor sushi chain
        "kura sushi",     # Japanese sushi chain
        "hamazushi",      # Japanese sushi chain
        "genki sushi",    # Japanese sushi chain
        "gyu-kaku",       # Japanese BBQ chain
        "yakiniku",       # Generic Japanese BBQ
        "maidreamin",     # Japanese maid cafe
        "dennys jp",      # Denny's Japan (different from US)

        # ── Common restaurant/cafe keywords as brand fragments ──
        "boba",
        "poke bowl",
        "acai bowl",

        # ── NZ/AU cafe chains ──
        "esquires coffee",
        "mojo coffee",    # NZ
        "atomic coffee",  # NZ
        "neo coffee",     # NZ

        # ── UK/EU dining ──
        "pret a manger",
        "leon restaurant",
        "wasabi restaurant",
        "itsu ",          # UK Japanese fast food
        "yo! sushi",
        "yo sushi",
        "wagamama",
        "turtle bay",     # UK Caribbean chain
    ],

    "groceries": [
        # ── US chains ──
        "whole foods",
        "trader joe",
        "kroger",
        "safeway",
        "albertsons",
        "publix",
        "costco",
        "walmart",
        "aldi",
        "sprouts",
        "fresh market",
        "food lion",
        "stop & shop",
        "wegmans",
        "heb ",           # H-E-B Texas
        "giant ",         # Giant Food
        "winn dixie",
        "meijer",
        "harris teeter",
        "smart & final",
        "stater bros",
        "food 4 less",
        "save mart",
        "shoprite",
        "acme market",
        "price chopper",
        "winco",
        "piggly wiggly",
        "brookshire",
        "hy-vee",
        "hannaford",
        "market basket",

        # ── Australia/NZ ──
        "woolworths",     # Australian supermarket (not the US Woolworths)
        "coles ",         # Australian supermarket
        "iga ",           # IGA supermarket (AU)
        "pak n save",     # NZ supermarket
        "new world",      # NZ supermarket
        "countdown",      # NZ supermarket (now Woolworths NZ)
        "four square",    # NZ small grocery
        "foodstuffs",     # NZ grocery group
        "harris farm",    # Australian fresh market
        "thomas dux",     # Australian deli/grocery
        "drakes supermarkets",
        "foodland",       # SA Australia

        # ── UK/EU ──
        "tesco",
        "sainsbury",
        "asda",
        "morrisons",
        "waitrose",
        "marks & spencer food",
        "lidl",
        "iceland food",
        "co-op food",
        "ocado",
        "spar ",          # SPAR grocery (global)

        # ── Asia/Japan ──
        "aeon ",          # Japanese supermarket chain
        "ito yokado",     # Japanese supermarket
        "life supermarket", # Japanese chain
        "york benimaru",  # Japanese supermarket
        "maruetsu",       # Japanese supermarket
        "summit store",   # Japanese supermarket
        "don quijote",    # Japanese variety/grocery store
        "donki ",         # Don Quijote abbreviation
        "lawson",         # Japanese convenience store (also sells food)
        "seven eleven",   # 7-Eleven (convenience but lots of food)
        "7-eleven",
        "family mart",    # Japanese/Asian convenience store
        "familymart",
        "ministop",       # Japanese convenience store
        "circle k",       # Convenience/grocery
        "cold storage",   # Singapore grocery
        "fairprice",      # Singapore NTUC FairPrice
        "giant sg",       # Giant Singapore
        "jasons market",  # Asian premium grocery
        "city super",     # HK/Singapore premium grocery

        # ── Middle East/Other ──
        "carrefour",      # Global hypermarket (France, Middle East, Asia)
        "lulu hypermarket",
        "spinneys",       # Middle East grocery
        "waitrose uae",
    ],

    "transportation": [
        # ── Rideshare ──
        "uber",           # Uber (rides, not Uber Eats — parsed separately)
        "lyft",
        "didi",           # DiDi (China/AU/NZ/Latin America)
        "grab ",          # Grab (Southeast Asia)
        "ola ",           # Ola (India/AU/UK)
        "gojek",          # Indonesian super-app
        "bolt ride",      # Bolt rideshare (Europe/Africa)
        "free now",       # European taxi app
        "cabify",         # Latin America
        "indrive",        # Global rideshare
        "blablacar",      # Carpooling Europe

        # ── Taxi ──
        "yellow cab",
        "blue cab",
        "city cab",

        # ── Public transit ──
        "metro",
        "transit",
        "mta ",           # NYC MTA
        "cta ",           # Chicago Transit
        "bart ",          # Bay Area
        "wmata",          # DC Metro
        "mbta",           # Boston
        "septa",          # Philadelphia
        "muni ",          # SF Muni
        "trimet",         # Portland
        "translink",      # Vancouver/Brisbane
        "opal card",      # Sydney transit
        "myki",           # Melbourne transit
        "at hop",         # Auckland Transit (AT HOP)
        "snapper",        # Wellington NZ transit
        "eway",           # NZ road tolls
        "ic card",        # Japan IC transit cards
        "suica",          # Japanese transit card
        "pasmo",          # Japanese transit card
        "nimoca",         # Japanese transit card
        "hayakaken",      # Fukuoka transit
        "toica",          # Nagoya transit
        "pitapa",         # Osaka transit
        "jr pass",        # Japan Rail Pass
        "shinkansen",     # Japanese bullet train
        "jr east",        # Japan Rail East
        "jr west",        # Japan Rail West
        "jr central",     # Japan Rail Central
        "jr kyushu",      # Japan Rail Kyushu
        "hankyu",         # Osaka private rail
        "keio",           # Tokyo private rail
        "tokyu",          # Tokyo private rail
        "odakyu",         # Tokyo private rail
        "seibu",          # Tokyo private rail
        "tobu",           # Tokyo private rail

        # ── Fuel / Gas stations ──
        "shell ",
        "chevron",
        "bp ",            # BP petrol
        "exxon",
        "mobil ",
        "marathon ",
        "speedway",
        "sunoco",
        "valero",
        "circle k fuel",
        "casey's general",
        "kwik trip",
        "love's travel",
        "pilot flying j",
        "ta travel center",
        "wawa",
        "sheetz",
        "racetrac",
        "gate fuel",
        "maverik",
        "caltex",         # AU/NZ/Asia petrol
        "z energy",       # NZ petrol
        "gull ",          # NZ petrol
        "challenge fuel", # NZ petrol
        "puma energy",    # AU/global petrol
        "7-eleven fuel",  # AU 7-Eleven has petrol
        "bp australia",
        "ampol",          # Australian petrol
        "eneos",          # Japanese petrol
        "idemitsu",       # Japanese petrol
        "cosmo oil",      # Japanese petrol
        "esso ",          # ExxonMobil global

        # ── Toll roads ──
        "eztag",
        "fastrak",
        "e-zpass",
        "sunpass",
        "ipass",
        "txtag",
        "peach pass",
        "platepass",
        "eway toll",      # NZ toll road
        "linkt",          # Australian tolls
        "citylink",       # Melbourne toll
        "westconnex",     # Sydney toll
        "nexway",         # Tokyo expressway

        # ── Airlines (by name fragment) ──
        "delta air",
        "united air",
        "southwest air",
        "american air",
        "jetblue",
        "alaska air",
        "frontier air",
        "spirit air",
        "hawaiian air",
        "sun country",
        "allegiant air",
        "qantas",         # Australian
        "jetstar",        # Qantas low-cost
        "virgin australia",
        "rex airlines",   # Regional Australia
        "air new zealand",
        "air nz",
        "air pacific",    # Fiji Airways
        "japan airlines",
        "jal ",
        "ana ",           # All Nippon Airways
        "peach aviation", # Japanese LCC
        "zipair",         # Japanese LCC
        "vanilla air",    # Japanese LCC
        "solaseed air",   # Japanese regional
        "fuji dream",     # Japanese regional
        "starlux",        # Taiwan airline
        "eva air",
        "china airlines",
        "cathay pacific",
        "singaporeair",   # Singapore Airlines
        "singapore airlines",
        "scoot",          # Singapore LCC
        "tigerair",       # Singapore LCC (now Scoot)
        "airasia",        # Southeast Asia LCC
        "cebu pacific",   # Philippines LCC
        "philippine air",
        "lion air",       # Indonesian/Asian LCC
        "batik air",
        "indigo",         # Indian LCC
        "air india",
        "british airways",
        "ba.com",
        "easyjet",
        "ryanair",
        "wizz air",
        "norwegian air",
        "klm ",
        "lufthansa",
        "air france",
        "emirates",
        "etihad",
        "turkish airlines",
        "turkish air",

        # ── Long-distance ground transport ──
        "amtrak",
        "greyhound",
        "megabus",
        "flixbus",
        "trailways",
        "coachusa",

        # ── Car rental ──
        "enterprise rent",
        "hertz",
        "avis ",
        "budget rental",
        "national car",
        "alamo rental",
        "thrifty car",
        "dollar rental",
        "sixt ",
        "europcar",
        "ace rent",
        "payless car",
        "fox rent",
        "turo ",          # Peer-to-peer car rental

        # ── Parking ──
        "spothero",
        "parkwhiz",
        "parkopedia",
        "abc parking",
        "impark",
        "propark",
        "sp+ parking",
        "laaz parking",
        "parking meter",
        "park n ride",
        "jncp",           # Japan parking
    ],

    "utilities": [
        # ── US electric/gas/water ──
        "pg&e",
        "con ed",
        "consolidated edison",
        "national grid",
        "duke energy",
        "dominion energy",
        "southern company",
        "entergy",
        "centerpoint energy",
        "pge ",
        "pacific gas",
        "san diego gas",
        "sdge",
        "xcel energy",
        "ameren",
        "firstenergy",
        "aep ",
        "ohio edison",
        "pepco",
        "bgk",
        "nstar",
        "eversource",
        "national fuel gas",
        "spire gas",
        "southwest gas",
        "atmos energy",
        "nicor gas",
        "peoples gas",
        "awwa",           # American Water
        "american water",

        # ── Internet/cable/TV moved to subscriptions ──
        # (home internet bills are personal monthly subscriptions,
        #  not shared trip expenses — moved to subscriptions category)

        # ── AU/NZ electricity only ──
        "agl energy",     # Australian electricity
        "origin energy",  # Australian electricity
        "energy australia",
        "powershop",      # NZ/AU electricity
        "genesis energy", # NZ electricity
        "mercury energy", # NZ electricity
        "contact energy", # NZ electricity
        "vector limited", # NZ electricity network
        "trustpower",     # NZ electricity
        # NZ/AU telecom moved to subscriptions (personal phone/internet bills)

        # ── Japan electricity/gas only ──
        "tepco",          # Tokyo Electric Power
        "kepco",          # Kansai Electric Power
        "tokyo gas",
        "osaka gas",
        "toho gas",
        # Japan mobile carriers moved to subscriptions
    ],

    "subscriptions": [
        # ── US mobile phone carriers ──
        # Monthly phone bills are personal, not trip expenses
        "verizon wireless",
        "at&t mobility",
        "t-mobile",
        "sprint ",
        "boost mobile",
        "cricket wireless",
        "metro by t-mobile",
        "us cellular",
        "consumer cellular",
        "visible wireless",
        "mint mobile",
        "google fi",

        # ── AU/NZ phone/internet carriers ──
        "telstra",
        "optus",
        "vodafone au",
        "vodafone nz",
        "spark nz",
        "2degrees",
        "tpg internet",
        "iinet",
        "aussie broadband",
        "internode",
        "amaysim",
        "chorus nz",
        "chorus broadband",
        "bigpipe",

        # ── Japan mobile carriers ──
        "ntt docomo",
        "ntt ",
        "au by kddi",
        "softbank jp",
        "rakuten mobile",

        # ── Internet / cable / TV providers ──
        # These are monthly home bills — personal, not shared trip expenses
        "xfinity",
        "comcast",
        "spectrum",
        "cox comm",
        "verizon fios",
        "at&t internet",
        "t-mobile home",
        "centurylink",
        "lumen tech",
        "frontier comm",
        "optimum",
        "altice",
        "direct tv",
        "directv",
        "dish network",
        "sling tv",

        # ── Video streaming ──
        "netflix",
        "hulu ",
        "disney+",
        "disney plus",
        "hbo max",
        "max.com",
        "paramount+",
        "paramount plus",
        "peacock",
        "apple tv+",
        "apple tv plus",
        "amazon prime video",
        "youtube premium",
        "youtube tv",
        "espn+",
        "espn plus",
        "fubo tv",
        "philo",
        "starz ",
        "showtime",
        "discovery+",
        "stan ",          # Australian streaming
        "binge ",         # Australian streaming (Foxtel)
        "kayo sports",    # Australian sports streaming
        "foxtel",         # Australian pay TV
        "britbox",
        "acorn tv",
        "criterion",
        "mubi ",
        "crunchyroll",    # Anime streaming
        "funimation",
        "hidive",
        "niconico",       # Japanese video platform
        "abema",          # Japanese streaming
        "unext",          # Japanese streaming
        "dazn",           # Sports streaming (global)
        "nba league pass",
        "mlb tv",
        "nfl+",
        "nfl sunday ticket",

        # ── Music streaming ──
        "spotify",
        "apple music",
        "apple.com/bill", # Apple subscriptions catch-all
        "itunes",
        "amazon music",
        "tidal ",
        "deezer",
        "pandora",
        "soundcloud",
        "youtube music",
        "line music",     # Japanese music app
        "rekochoku",      # Japanese music service

        # ── Cloud storage / productivity ──
        "icloud",
        "google one",
        "google storage",
        "dropbox",
        "box.com",
        "onedrive",
        "backblaze",

        # ── Software / AI / productivity ──
        "adobe",
        "microsoft 365",
        "microsoft office",
        "office 365",
        "github",
        "notion",
        "slack",
        "zoom ",
        "chatgpt",
        "openai",
        "anthropic",
        "midjourney",
        "canva",
        "figma",
        "1password",
        "lastpass",
        "dashlane",
        "nordvpn",
        "expressvpn",
        "surfshark",
        "malwarebytes",
        "grammarly",
        "duolingo",
        "rosetta stone",
        "brilliant.org",
        "coursera",
        "udemy",
        "skillshare",
        "masterclass",
        "headspace",
        "calm ",
        "noom ",
        "myfitnesspal",

        # ── Gaming ──
        "xbox game pass",
        "xbox live",
        "playstation now",
        "playstation plus",
        "ps plus",
        "nintendo switch online",
        "nintendo online",
        "ea play",
        "ubisoft+",
        "twitch",
        "humble bundle",
        "steam ",

        # ── News / reading ──
        "new york times",
        "nytimes",
        "wsj.com",
        "the guardian",
        "washington post",
        "bloomberg subscription",
        "economist.com",
        "kindle unlimited",
        "audible",
        "scribd",
        "overdrive",
    ],

    "entertainment": [
        # ── Cinemas ──
        "amc ",
        "regal ",
        "cinemark",
        "alamo drafthouse",
        "marcus theater",
        "showcase cinema",
        "odeon ",         # UK cinema chain
        "vue cinema",     # UK
        "cineworld",      # UK
        "hoyts",          # AU/NZ cinema chain
        "event cinemas",  # AU cinema chain
        "dendy cinemas",  # AU cinema
        "palace cinemas", # AU cinema
        "reading cinemas", # AU/NZ/US
        "village cinema", # AU
        "session cinema", # AU
        "toho cinemas",   # Japanese cinema chain
        "united cinemas", # Japanese
        "kinezo",         # Japanese cinema
        "movix",          # Japanese cinema
        "cinemasunshine",
        "cinema complex",

        # ── Live events ──
        "ticketmaster",
        "eventbrite",
        "livenation",
        "live nation",
        "stubhub",
        "seatgeek",
        "axs.com",
        "dice fm",
        "ents24",

        # ── Activities ──
        "dave & buster",
        "topgolf",
        "main event",
        "bowling",
        "escape room",
        "arcade",
        "trampoline park",
        "paintball",
        "laser tag",
        "go-karting",
        "go kart",
        "axe throwing",
        "virtual reality",
        "vr experience",
        "karting",
        "putt putt",      # Minigolf
        "mini golf",

        # ── Cultural ──
        "museum",
        "aquarium",
        "zoo ",
        "science center",
        "botanical garden",
        "national park",  # Entry fees
        "visitor center",
        "tour company",
        "guided tour",
        "theme park",
        "disneyland",
        "disney world",
        "universal studios",
        "seaworld",
        "busch gardens",
        "six flags",

        # ── Japan-specific entertainment ──
        "karaoke ",
        "pasela",         # Japanese karaoke chain
        "big echo",       # Japanese karaoke chain
        "joysound",       # Japanese karaoke
        "karaokekan",
        "round1 ",        # Round 1 arcade/bowling Japan
        "namco ",         # Bandai Namco arcade
        "taito station",  # Taito arcade chain
        "sega arcade",
        "super nintendo world",
        "teamlab",        # Digital art museum
        "ghibli museum",
        "tokyo disneyland",
        "universal studios japan",
        "spa world",
        "onsen ",         # Hot springs
        "sento ",         # Public bath
        "capcom bar",     # Gaming themed bar Japan

        # ── Sports ──
        "ticketek",       # AU/NZ ticketing
        "ticketplus",
        "mlb tickets",
        "nfl tickets",
        "nba tickets",
    ],

    "health": [
        # ── US pharmacies ──
        "cvs ",
        "walgreens",
        "rite aid",
        "duane reade",
        "kinney drugs",
        "brookshire's",

        # ── AU/NZ pharmacies ──
        "chemist warehouse",
        "priceline pharmacy",
        "terry white",    # AU pharmacy chain
        "blooms the chemist",
        "pharmacy 4 less",
        "unichem pharmacy",  # NZ
        "life pharmacy",  # NZ
        "amcal chemist",
        "guardian pharmacy",

        # ── Japan pharmacies / drug stores ──
        "matsumoto kiyoshi",  # Japanese drug store
        "welcia",         # Japanese drug store
        "sundrug",        # Japanese drug store
        "cocokara",       # Japanese drug store
        "tsuruha",        # Japanese drug store
        "kusuri no aoki", # Japanese drug store
        "and pharmacy",
        "ainsoph pharmacy",

        # ── Medical services ──
        "urgent care",
        "minute clinic",
        "cvs clinic",
        "walgreens clinic",
        "planned parenthood",
        "kaiser permanente",
        "blue cross",
        "aetna",
        "united health",
        "cigna",
        "humana",
        "optumrx",
        "express scripts",
        "good rx",
        "riteaid",

        # ── Dental / vision ──
        "dentist",
        "dental care",
        "aspen dental",
        "western dental",
        "smile direct",
        "warby parker",   # Eyeglasses
        "lenscrafters",
        "pearle vision",
        "americas best",

        # ── Mental health / therapy ──
        "betterhelp",
        "talkspace",
        "brightside",
        "cerebral",
        "monument",
        "headway",
    ],

    "fitness": [
        # ── US gym chains ──
        "planet fitness",
        "equinox",
        "soulcycle",
        "peloton",
        "orange theory",
        "orangetheory",
        "barry's",
        "barrys",
        "crossfit",
        "la fitness",
        "lifetime fitness",
        "24 hour fitness",
        "anytime fitness",
        "gold's gym",
        "golds gym",
        "crunch fitness",
        "blink fitness",
        "retro fitness",
        "planet fitness",
        "ymca",
        "curves ",
        "f45 ",           # F45 Training (AU origin, global)
        "9round",
        "pure barre",
        "club pilates",
        "stride fitness",
        "solidcore",

        # ── AU/NZ gyms ──
        "jetts fitness",  # AU gym
        "snap fitness",   # Global
        "goodlife health", # AU gym chain
        "virgin active",  # AU/UK/global
        "genesis fitness", # AU gym
        "fitness first",  # AU/global

        # ── Sport specific ──
        "yoga",
        "pilates",
        "martial arts",
        "boxing gym",
        "swimming class",
        "spin class",
        "hot yoga",
        "bikram yoga",
        "corepower yoga",
        "the bar method",
        "xtend barre",
        "ballet barre",
        "rock climbing",
        "climbing gym",
        "bouldering",
        "climbing wall",
        "tennis club",
        "squash club",
        "badminton",

        # ── Japan fitness ──
        "tipness",        # Japanese gym chain
        "konami sports",  # Japanese sports club
        "central sports",
        "nnp sports",
        "gold gym japan",
        "fastgym",
        "expa gym",
    ],

    "shopping": [
        # ── US e-commerce / department ──
        "amazon.com",
        "amazon mktplace",
        "amazon marketplace",
        "ebay",
        "etsy",
        "zara",
        "h&m ",
        "gap ",
        "old navy",
        "nike ",
        "adidas",
        "nordstrom",
        "macy's",
        "macys",
        "best buy",
        "apple store",
        "apple retail",
        "target",
        "tj maxx",
        "marshalls",
        "ross ",
        "burlington coat",
        "homegoods",
        "bed bath",
        "crate & barrel",
        "restoration hardware",
        "pottery barn",
        "ikea",
        "home depot",
        "lowe's",
        "lowes",
        "ace hardware",
        "true value",
        "menards",
        "ulta beauty",
        "sephora",
        "bath body works",
        "victoria's secret",
        "lululemon",
        "athleta",
        "patagonia",
        "rei ",           # Outdoor gear
        "backcountry",
        "moosejaw",
        "evo ",           # Outdoor/snow gear

        # ── AU/NZ shopping ──
        "big w",          # Australian discount store
        "kmart au",       # Australian Kmart (different from US)
        "target au",
        "myer",           # Australian dept store
        "david jones",    # Australian dept store
        "harvey norman",  # AU/NZ electronics
        "jb hi-fi",       # Australian electronics
        "officeworks",    # Australian office supplies
        "bunnings",       # Australian hardware
        "supercheap auto",
        "rebel sport",    # AU sports retailer
        "kathmandu",      # NZ/AU outdoor gear
        "macpac",         # NZ outdoor gear
        "cotton on",      # AU clothing
        "country road",   # AU clothing
        "glassons",       # NZ clothing
        "hallensteins",   # NZ mens clothing
        "the warehouse",  # NZ discount store
        "briscoes",       # NZ homeware
        "farmers nz",     # NZ dept store
        "whitcoulls",     # NZ books/gifts
        "paper plus",     # NZ books

        # ── Japan shopping ──
        "uniqlo",
        "muji",
        "miniso",         # Japanese budget store (global)
        "daiso",          # Japanese dollar store (global)
        "seria",          # Japanese 100-yen store
        "can do",         # Japanese 100-yen store
        "tokyu hands",    # Japanese lifestyle store (now HANDS)
        "hands ",
        "loft jp",        # Japanese lifestyle store
        "ito yokado",
        "aeon style",
        "parco",          # Japanese shopping mall
        "lumine",         # Japanese shopping complex
        "marui",          # Japanese dept store
        "takashimaya",    # Japanese/global dept store
        "isetan",         # Japanese dept store
        "mitsukoshi",     # Japanese dept store
        "hankyu dept",
        "kintetsu dept",
        "yodobashi",      # Japanese electronics mega-store
        "bic camera",     # Japanese electronics
        "yamada denki",   # Japanese electronics
        "edion",          # Japanese electronics
        "ebook japan",
        "tsutaya",        # Japanese books/music/DVD

        # ── UK/EU shopping ──
        "primark",
        "topshop",
        "next plc",
        "john lewis",
        "marks & spencer",
        "boots pharmacy",  # UK health/beauty retailer
        "argos",
        "currys pc world",
    ],

    "travel": [
        # ── Hotels / accommodation ──
        "marriott",
        "hilton",
        "hyatt",
        "ihg ",           # InterContinental Hotels Group
        "intercontinental",
        "sheraton",
        "westin",
        "w hotel",
        "st. regis",
        "ritz-carlton",
        "four seasons",
        "kimpton",
        "radisson",
        "renaissance hotel",
        "courtyard hotel",
        "residence inn",
        "springhill suites",
        "fairfield inn",
        "ac hotel",
        "moxy hotel",
        "aloft hotel",
        "element hotel",
        "doubletree",
        "embassy suites",
        "hampton inn",
        "hilton garden",
        "homewood suites",
        "home2 suites",
        "holiday inn",
        "crowne plaza",
        "staybridge",
        "candlewood",
        "best western",
        "choice hotel",
        "days inn",
        "super 8",
        "motel 6",
        "la quinta",
        "red roof inn",
        "americas best inn",
        "comfort inn",
        "quality inn",
        "clarion hotel",
        "econo lodge",
        "rodeway inn",
        "extended stay",
        "wyndham",
        "ramada",
        "baymont inn",
        "microtel",

        # ── Online booking platforms ──
        "airbnb",
        "expedia",
        "booking.com",
        "hotels.com",
        "orbitz",
        "travelocity",
        "priceline",
        "kayak",
        "vrbo",
        "homeaway",
        "hostelworld",
        "hostelz",
        "agoda",          # Popular in Asia
        "ctrip",          # Chinese travel (now Trip.com)
        "trip.com",
        "jalan.net",      # Japanese hotel booking
        "rakuten travel", # Japanese booking
        "jalan",          # Japanese travel site

        # ── AU/NZ accommodation brands ──
        "quest apartments",
        "ibis ",          # Accor budget hotels (global)
        "ibis budget",
        "novotel",        # Accor mid-range
        "pullman hotel",  # Accor upscale
        "mercure",        # Accor
        "sofitel",        # Accor luxury
        "mantra resort",
        "peppers resort",
        "breakfree resorts",
        "racv resort",
        "rydges",         # AU/NZ hotel chain
        "crowne plaza au",
        "copthorne",      # NZ hotel chain
        "sudima",         # NZ hotel chain
        "heritage hotel",
        "scenic hotel",   # NZ chain

        # ── Japan accommodation ──
        "toyoko inn",     # Japanese budget hotel chain
        "dormy inn",      # Japanese hotel chain
        "apa hotel",
        "richmond hotel",
        "super hotel jp",
        "route inn",      # Japanese budget hotel
        "comfort hotel jp",
        "daiwa roynet",
        "jr inn",         # JR hotel group
        "jal city",       # JAL hotels
        "ana intercontinental",
        "keio plaza",
        "palace hotel tokyo",
        "park hyatt tokyo",
        "mandarin oriental tokyo",
        "hoshinoya",      # Japanese luxury ryokan brand
        "ryokan",         # Generic Japanese inn

        # ── Chase Travel specific ──
        "chase travel",
        "cl *chase",

        # ── Other travel services ──
        "aaa travel",
        "globus tour",
        "trafalgar tour",
        "contiki",
        "intrepid travel",
        "G adventures",
        "viator",         # Tours and activities
        "getyourguide",   # Tours and activities
        "klook",          # Asia tours and activities
        "kkday",          # Asia tours and activities
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# TIER 2 — WORD KEYWORDS (generic category-descriptive words)
# These use regex word-boundary matching so "bar" won't accidentally match
# "barber" or "candy bar" (well, it would match "candy bar" — but "barbershop"
# won't be tagged as dining). Confidence: 0.9 (slightly less certain than brands)
# ─────────────────────────────────────────────────────────────────────────────

CATEGORY_WORD_KEYWORDS: dict[str, list[str]] = {
    "dining": [
        "restaurant", "cafe", "coffee", "pizza", "burger", "sushi",
        "taco", "grill", "kitchen", "bakery", "diner", "bistro",
        "eatery", "ramen", "noodle", "dumpling", "steakhouse",
        "brasserie", "boulangerie", "patisserie", "trattoria", "osteria",
        "izakaya",    # Japanese gastropub
        "yakitori",   # Japanese chicken skewer restaurant
        "teppanyaki", # Japanese iron grill restaurant
        "tempura",    # Japanese tempura restaurant
        "tonkatsu",   # Japanese pork cutlet restaurant
        "kaiseki",    # Japanese fine dining
        "omakase",    # Japanese chef's choice dining
        "tapas",      # Spanish small plates
        "cantina",    # Mexican-style restaurant
        "barbeque", "bbq restaurant",
        "tavern", "gastropub", "pub food",
        "bar tab", "drinks", "cocktails", "nightclub", "bar ",  # bar/drinks
        "brunch", "breakfast joint",
        "dinner", "lunch", "breakfast", "supper",  # meal words users type in manual entries
        "dining out", "eat out", "eating out",
        "ice cream", "gelato", "sorbet",
        "dessert bar", "cake shop",
        "juice bar",
    ],
    "groceries": [
        "supermarket", "grocery", "groceries", "market", "food store",
        "delicatessen", "deli ", "butcher", "fishmonger",
        "produce store", "greengrocer", "fruit shop",
        "convenience store", "corner store",
        "natural foods", "health food",
    ],
    "transportation": [
        "taxi", "parking", "toll", "fuel", "petrol", "gas station",
        "shuttle", "airport transfer", "limousine", "chauffeur",
        "ferry ", "water taxi",
        "bike share", "scooter share", "e-scooter",
        "rental car",
    ],
    "utilities": [
        "electric", "electricity", "gas company", "water company",
        "internet service", "broadband", "cable tv", "phone bill",
        "utility", "utilities",
    ],
    "subscriptions": [
        "subscription", "membership", "monthly plan", "annual plan",
        "premium plan", "pro plan",
    ],
    "entertainment": [
        "cinema", "theater", "theatre", "concert", "festival",
        "nightclub", "comedy club", "live music",
        "bowling", "minigolf", "mini golf", "escape room",
        "aquarium", "planetarium",
    ],
    "health": [
        "pharmacy", "chemist", "doctor", "dental", "dentist",
        "hospital", "clinic", "medical", "optometrist", "optician",
        "physiotherapy", "physiotherapist", "physio",
        "chiropractic", "chiropractor",
        "therapy", "psychiatry", "psychologist",
        "dermatologist", "specialist",
        "blood test", "pathology",
        "dispensary",
    ],
    "fitness": [
        "gym ", "fitness", "yoga", "pilates", "crossfit", "spinning",
        "swimming pool", "sports club", "athletic",
        "personal trainer", "boot camp",
        "martial arts", "dojo",
    ],
    "shopping": [
        "hardware", "electronics", "clothing", "apparel", "boutique",
        "department store", "outlet store",
        "toy store", "book store", "bookstore",
        "furniture store", "homeware", "home goods",
        "pet store", "pet supplies",
        "sporting goods", "outdoor gear",
        "jeweler", "jewelry", "watchmaker",
        "beauty supply", "cosmetics",
    ],
    "travel": [
        "hotel", "hostel", "motel", "resort", "inn ", "lodge ",
        "bed and breakfast", "b&b ", "guesthouse",
        "villa ", "chalet",
        "travel agency", "tour operator", "travel agent",
        "airport ", "terminal",
        "flight", "flights", "airfare", "air ticket",  # manual entry words
        "train ticket", "bus ticket", "ferry",
        "accommodation", "booking",
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# DEFAULT PARTICIPANT SUGGESTION PER CATEGORY
# ─────────────────────────────────────────────────────────────────────────────
#
# Philosophy for trip-splitting:
#   The card was used on a trip where everyone travels together.
#   "Everyone" is the correct default for the vast majority of charges.
#   Review should be reserved for finding *exceptions*, not confirming everything.
#
# "all"    → include all group members (the safe trip default)
# "single" → clearly personal — subscriptions, gym, pharmacy
# "ask"    → genuinely ambiguous — shopping could be souvenirs or a personal splurge

CATEGORY_DEFAULT_PARTICIPANTS: dict[str, str] = {
    "dining": "all",          # shared meals — the core trip expense
    "groceries": "all",       # group grocery runs
    "utilities": "all",       # shared accommodation costs
    "transportation": "all",  # ubers/taxis on a trip are usually shared
    "entertainment": "all",   # activities, attractions — usually the whole group
    "travel": "all",          # flights, hotels, Airbnb — clearly trip expenses
    "unknown": "all",         # on a trip, assume shared until proven otherwise
    "subscriptions": "single", # Netflix/Spotify are personal regardless of trip
    "health": "single",       # pharmacy, doctor — personal
    "fitness": "single",      # personal fitness
    "shopping": "ask",        # ambiguous — could be souvenirs (shared) or personal
}


# ─────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

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


def categorize(description: str) -> tuple[str, float]:
    """
    Attempt to categorize a merchant description using a two-tier strategy.

    Tier 1 — exact phrase/brand match (confidence 1.0):
      Checks if any known brand name appears as a substring in the description.
      E.g. "STARBUCKS #1234 NEW YORK" → "dining", 1.0

    Tier 2 — generic word match (confidence 0.9):
      Checks if a generic category word appears as a whole word (word boundary).
      E.g. "BLUE SKY RESTAURANT TOKYO" → "dining", 0.9

    Returns:
        (category_name, confidence)
        1.0 → brand name match (high confidence)
        0.9 → generic word match (good confidence)
        0.5 → no match (unknown)
    """
    desc_lower = description.lower()

    # ── Tier 1: Check brand names / phrases ──────────────────────────────────
    # These are substring checks. Fast, but only matches known brands.
    for category, keywords in CATEGORY_PHRASE_KEYWORDS.items():
        for keyword in keywords:
            if keyword in desc_lower:
                return category, 1.0

    # ── Tier 2: Check generic category words with word boundaries ─────────────
    # Word boundary (\b) prevents "bar" from matching "barber" or "carbarn".
    # This catches things like "LITTLE TOKYO RAMEN BAR" even if we don't know
    # the specific restaurant name.
    for category, words in CATEGORY_WORD_KEYWORDS.items():
        for word in words:
            # Build a regex: \bword\b  (case-insensitive)
            # We escape the word in case it has special regex chars (like "b&b")
            pattern = r'\b' + re.escape(word.strip()) + r'\b'
            if re.search(pattern, desc_lower):
                return category, 0.9

    # ── No match: unknown ─────────────────────────────────────────────────────
    return "unknown", 0.5


def suggest_participants(category: str, all_member_ids: list[int]) -> dict:
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
