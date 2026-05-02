# AutoSplit — Competitor Research

_Last updated 2026-05-02 · Mexico trip ships 2026-05-23 (3 weeks)_

This is the field report. AutoSplit's wedge is **statement import + auto-categorize + greedy debt-minimization**. Splitwise is wounded by a 2024–2025 monetization push, Tricount is the obvious "European, free, simple" alternative, and most others are weekend-project apps. The opportunity is real, but we'd lose a head-to-head today on a few specific things — listed below.

---

## 1. Top 10 complaints across competitors (ranked by frequency)

1. **Splitwise's 3-expense-per-day cap on free users + 10-second countdown timer.** This is *the* meme right now. Reddit threads literally titled "rip splitwise." Many users describe it as "great app ruined by terrible monetization." ([IT Voice](https://www.itvoice.in/splitwise-has-introduced-restrictions-on-the-number-of-free-expenses-users-can-add), [PartyTab](https://partytab.app/blog/best-splitwise-alternatives))
2. **Aggressive Pro nag screens / forced ads** on Splitwise free tier. Modal dialogs interrupt expense entry; ads can't be dismissed quickly. Quote: "the constant prompts for going pro are annoying… nag screens you have to sit and look at interminably." ([JustUseApp Splitwise reviews](https://justuseapp.com/en/app/458023433/splitwise/reviews))
3. **No CSV / bank-statement import anywhere.** Splitwise officially refuses ("no standard CSV format… would be rather messy"). Tricount, Settle Up, Splid all require manual entry per expense. ([Splitwise feedback](https://feedback.splitwise.com/forums/162446-general/suggestions/3034871-allow-importing-expenses-from-a-csv-file))
4. **No bulk edit on Splitwise.** A "Bulk Edit Expense" feature request from 2012 has still not shipped. Users have to delete and re-enter expenses one at a time to fix mistakes. ([Splitwise feedback](https://feedback.splitwise.com/forums/162446-general/suggestions/5715060-enable-mass-editing-of-expenses))
5. **Currency conversion is broken / Pro-only.** Splitwise locks live FX behind Pro; even Pro converts only on save (not retroactively). Tricount makes you input the rate manually per expense. Multi-leg trips (Mexico → US → home) become a mess. ([Splitwise feedback](https://feedback.splitwise.com/forums/162446-general/suggestions/6765166-improve-the-way-splitwise-handles-multi-currency))
6. **Sync bugs and lost data.** Tricount: "expenses disappear and reappear, unusable if there are 2+ people." Settle Up: "connection errors 49 out of 50 times." Cross-platform Apple↔Android sync drops payments silently. ([JustUseApp Tricount](https://justuseapp.com/en/app/349866256/tricount-split-group-bills/problems), [JustUseApp Settle Up](https://justuseapp.com/en/app/737534985/settle-up-group-expenses/reviews))
7. **Splitwise requires verified contact info per friend** — phone/email — and people see this as a growth-hack-disguised-as-feature ("sketchy data requirement designed to spread Splitwise"). ([ComplaintsBoard](https://www.complaintsboard.com/splitwise-b149630))
8. **Splid: no way to delete an entry, no bulk select / mass categorize, no tax field.** Multiple App Store reviewers cite all three. ([Splid App Store reviews](https://apps.apple.com/us/app/splid-split-group-bills/id991473495?see-all=reviews))
9. **Receipt scanning is camera-only on Splitwise Pro** — you can't pick from your photo gallery, a request open since 2019. Splitty, OneSplit, SplitMyExpenses all do gallery import. ([Splitty comparison](https://splittyapp.com/learn/splitwise-receipt-scanning-vs-splitty/))
10. **No drafts when switching apps.** Splitwise users report opening Venmo to check the amount, returning to Splitwise, and the in-progress expense is gone. ([JustUseApp Splitwise](https://justuseapp.com/en/app/458023433/splitwise/reviews))

---

## 2. Top 5 things competitors do BETTER than AutoSplit today

These are the head-to-head losses we'd take if Elle demoed AutoSplit next to them on the Mexico trip.

| # | Feature | Who does it well | Why we'd lose |
|---|---|---|---|
| 1 | **Frictionless invite — no signup needed** | Tricount (shareable link, zero signup), Splid (offline + invite link) | Today AutoSplit's share link is read-only. A trip member who wants to *add* their own expenses still needs to use Elle's machine. |
| 2 | **Mobile app you can use mid-meal** | Splitwise, Tricount, Splid, Settle Up — all native iOS+Android | AutoSplit is web-only. On a Mexico beach with spotty wifi, opening a browser is friction. |
| 3 | **Photo of receipt → expense** | Tricount (attach photo), SplitMyExpenses (AI itemize per line), Splitty (99% OCR accuracy) | AutoSplit has no receipt capture at all. For cash-paid taco stands, statement import doesn't help. |
| 4 | **Per-line-item splitting at restaurants** | SplitMyExpenses, Splitty, Plates by Splitwise | "I had the appetizer and the cocktail, you had the steak" — none of our split modes handle this elegantly. |
| 5 | **Recurring expenses / templates** | Splitwise (free tier), SplitMyExpenses | Trip-relevant for "daily villa cost split 4 ways for 7 nights." We'd ask the user to add it 7 times. |

---

## 3. Top 5 things AutoSplit already does BETTER

| # | Feature | Why it's a real moat |
|---|---|---|
| 1 | **PDF/CSV statement import with bank-specific parsers (Chase, Amex, BofA, universal)** | Splitwise refuses to build this. SplitMyExpenses requires Stripe + bank linking (security friction many won't tolerate). We accept the file the user already has. |
| 2 | **Auto-categorization with two-tier confidence + auto-confirm** | Means the user lands on a screen that's mostly already done. Splitwise et al. start with a blank list. |
| 3 | **Greedy debt minimization across the whole group** | Splitwise's "simplify debts" is the same idea but locked to in-group only. AutoSplit computes optimal settlement up front. |
| 4 | **Real bulk toolbar** (select-all + tri-state checkbox, bulk category change, bulk participants set, bulk confirm/exclude/unreview, optimistic UI) — `frontend/src/pages/TransactionsPage.jsx` lines 1261–2137, backend `PUT /groups/{id}/transactions/bulk-update` | Splitwise has zero. Splid has zero. Tricount has zero. This is genuinely a category-leading feature. |
| 5 | **Pre-trip booking detection** (flights/hotels charged in March for a May trip get surfaced as "include these?") | No competitor does this — all of them assume "trip = expenses entered during the trip." |

---

## 4. Bulk-feature gap analysis

Legend: ✅ has it · ⚠️ partial / clunky · ❌ missing · 💲 Pro-only

| Feature | Splitwise | Tricount | Settle Up | Splid | SplitMyExpenses | Spliit | **AutoSplit** |
|---|---|---|---|---|---|---|---|
| Statement / CSV import | ❌ | ❌ | ❌ | ❌ | ⚠️ Stripe bank-link only | ❌ | ✅ PDF + CSV, multi-bank |
| Multi-select rows | ❌ | ❌ | ❌ | ❌ | ⚠️ limited | ❌ | ✅ |
| Bulk categorize | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ |
| Bulk re-assign participants | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Bulk delete / exclude | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ | ✅ (exclude) |
| Bulk mark as confirmed | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Equal-split UX for many people at once | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Unequal split UX (per-person amount) | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Per-line-item / itemized splits | ⚠️ Plates app | ❌ | ❌ | ❌ | ✅ AI | ⚠️ | ❌ |
| Recurring expenses / templates | ✅ free | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Receipt photo attach | ✅ 💲 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Receipt OCR → auto expense | 💲 camera only | ❌ | ❌ | ❌ | ✅ | ⚠️ | ❌ |
| Native mobile app | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ web | ❌ |

**Bottom line:** AutoSplit is the *only* app with serious bulk operations on the desk-top web. That's a legitimate, defensible advantage and Elle should lean into it in marketing. The gaps are mobile + receipts + recurring.

---

## 5. Non-technical user friction — "I gave up because…"

Recurring patterns from reviews and Reddit:

- **"Every person has to download an app and make an account."** Cited as the #1 social friction across all competitors. ([startupnews.fyi on BillBob](https://startupnews.fyi/2026/01/23/billbob-launches-tackle-friendflation/))
- **"I had 47 transactions and had to enter them one by one."** Direct statement-import wedge.
- **"I added one expense and Splitwise made me wait 10 seconds, then nagged me to upgrade."** Real quote pattern across dozens of recent 1-star reviews.
- **"I tried to convert pesos to dollars and the rate was wrong by 3%, no way to override."** Multi-currency frustration is universal.
- **"My friend uses Android, I use iPhone, the totals don't match."** Sync bugs — Settle Up + Tricount specifically.
- **"I deleted a person and lost all our shared history."** Splitwise.
- **"The free version is unusable, the paid version is $60/yr — I'm not paying $60 to track $200 of pizza."** Anchor-pricing fatigue.

The implication for AutoSplit: **the trip organizer should be able to do everything for the group**, and group members should experience zero friction (no signup, no app install) when they get their settlement link. This already aligns with the planned share-link viral loop in CLAUDE.md.

---

## 6. One-click WOW moments worth borrowing

Ranked by impact ÷ effort.

1. **Photo-of-receipt → pre-filled expense modal.** Highest WOW. Tricount has it without OCR (just attaches photo); SplitMyExpenses uses AI to itemize. For Mexico cash spending this is the single biggest gap. Even non-OCR "snap and attach" would close the gap with Tricount.
2. **One-tap "Apply to all selected" for participants** — already in AutoSplit's bulk popover, but make it the *first* thing in the empty state. Show off the wedge.
3. **"Who's in?" trip roster toggle** — for each expense, instead of a participant picker, show the trip roster with one-tap toggles. SplitMyExpenses-style. Removes the "custom" → multi-select cognitive load.
4. **"Daily villa cost" recurring template.** A trip-scoped recurring is specifically valuable for a Mexico Airbnb/villa scenario.
5. **Settle Up–style "pay with Venmo" deep link** that pre-fills the amount and memo. We already compute the optimal payment graph; one-click "Pay Anthony $142 on Venmo" closes the loop.
6. **PWA install prompt on mobile** so users can "add to home screen" and use AutoSplit on their phone in Mexico without us having to ship a real native app in 3 weeks.

---

## 7. Recommended must-haves to ship before May 23

3-week budget. Prioritized by impact-to-Elle's-actual-trip and defensibility against demos to the group.

### P0 — must ship (week 1)
1. **Mobile-friendly responsive view of `TransactionsPage` and `SettlementPage`.** Elle is going to be holding her phone in Mexico. Tailwind is already in use — this is mostly responsive grid + larger tap targets. Without this, the trip is a bad demo.
2. **PWA manifest + install prompt.** ~2 hours of work. Elle and her trip group "install" AutoSplit to their home screen. Looks native, works offline-ish.
3. **Quick-add expense from mobile** — a single "+" floating button that opens a slimmed-down modal. The current Add Expense modal is desktop-shaped.

### P1 — should ship (week 2)
4. **Receipt photo attach** (no OCR yet). Just `<input type="file" accept="image/*" capture="environment">` so phones open the camera. Store in Supabase Storage. Closes the biggest "but Tricount has this" objection.
5. **"Who paid cash?" quick-entry flow.** A path that doesn't require uploading a statement — the cash-only Mexico beach taco stand case. Today AutoSplit's manual-add path exists but is buried; surface it as a primary action on mobile.
6. **Venmo / Cash App / PayPal deep-link buttons on the settlement page.** Standard URL schemes (`venmo://paycharge?...`). Each settlement row gets a one-tap "Pay" button. Ship the viral closing moment.

### P2 — nice to have (week 3 if time)
7. **Public read-only share link** (already planned in CLAUDE.md as the viral loop). Even pre-cloud, ship this for the Mexico group as a "look what I built" moment.
8. **Daily/weekly recurring expense template.** Trip villa cost split N ways for K nights — generate K transactions in one click.

---

## 8. Nice-to-have (post-trip)

- **AI receipt OCR → itemized split.** SplitMyExpenses and Splitty have set the bar at line-item accuracy. Use Claude with vision; cache aggressively. Defer until cloud migration is done.
- **Native iOS/Android.** Real apps via Capacitor wrapping the existing React app — small lift after PWA is solid.
- **Multi-currency live FX.** Use openexchangerates.org or similar; auto-pull on import; let the user override per expense. Our wedge here is *retroactive* re-conversion, which Splitwise Pro famously doesn't do.
- **Per-line-item split at a restaurant** — "drag items to plates" UI, Plates-by-Splitwise style.
- **Smart suggestions: "you usually split coffee with Anthony — apply that here?"** Use the existing MerchantRule table; just surface it as a suggestion on import instead of a silent rule.
- **"Friend doesn't use AutoSplit" payment request via SMS link.** SMS handoff is the killer app for the actually-non-technical relative who refuses to install anything.

---

## What I'd actually tell Elle

You're not in a tight race. Splitwise just shot itself in the foot, Tricount is sleepy, and the others are weekend projects. The wedge (statement import + bulk ops + auto-categorize) is real and category-leading. **The only thing that loses the Mexico demo is the phone experience.** Spend week 1 making AutoSplit feel like a phone-native PWA, week 2 adding receipt photos and Venmo deep-links, and the trip becomes a great word-of-mouth moment instead of a "yeah but on my phone…" awkward one.

---

### Sources

- [Splitwise — JustUseApp reviews](https://justuseapp.com/en/app/458023433/splitwise/reviews)
- [Splitwise — Trustpilot](https://www.trustpilot.com/review/splitwise.com)
- [Splitwise — ComplaintsBoard](https://www.complaintsboard.com/splitwise-b149630)
- [IT Voice — Splitwise free expense limits](https://www.itvoice.in/splitwise-has-introduced-restrictions-on-the-number-of-free-expenses-users-can-add)
- [PartyTab — 7 Best Splitwise Alternatives](https://partytab.app/blog/best-splitwise-alternatives)
- [Splitty — Splitwise free limits in 2026](https://splittyapp.com/learn/splitwise-free-limits/)
- [Splitwise feedback — Allow CSV import](https://feedback.splitwise.com/forums/162446-general/suggestions/3034871-allow-importing-expenses-from-a-csv-file)
- [Splitwise feedback — Mass edit expenses](https://feedback.splitwise.com/forums/162446-general/suggestions/5715060-enable-mass-editing-of-expenses)
- [Splitwise feedback — Improve multi-currency](https://feedback.splitwise.com/forums/162446-general/suggestions/6765166-improve-the-way-splitwise-handles-multi-currency)
- [Splitty vs Splitwise OCR](https://splittyapp.com/learn/splitwise-receipt-scanning-vs-splitty/)
- [Tricount — JustUseApp problems](https://justuseapp.com/en/app/349866256/tricount-split-group-bills/problems)
- [Tricount on Apple App Store](https://apps.apple.com/us/app/tricount-split-settle-bills/id349866256)
- [Tricount — Splitwise vs Tricount](https://tricount.com/splitwise-vs-tricount)
- [FlightDeck — Tricount review](https://www.pilotplans.com/blog/tricount-review)
- [Settle Up — JustUseApp reviews](https://justuseapp.com/en/app/737534985/settle-up-group-expenses/reviews)
- [Splid — Apple App Store reviews](https://apps.apple.com/us/app/splid-split-group-bills/id991473495?see-all=reviews)
- [Splid — JustUseApp problems](https://justuseapp.com/en/app/991473495/splid-split-group-bills/problems)
- [SplitMyExpenses](https://www.splitmyexpenses.com/)
- [SplitMyExpenses — recurring expenses](https://www.splitmyexpenses.com/articles/recurring-expenses-launched)
- [Spliit — open source alternative](https://spliit.app/)
- [Spliit — GitHub](https://github.com/spliit-app/spliit)
- [BillBob launch — startupnews.fyi](https://startupnews.fyi/2026/01/23/billbob-launches-tackle-friendflation/)
- [Squadtrip — Best Splitwise alternatives 2026](https://www.squadtrip.com/guides/top-splitwise-alternatives-for-group-travel-expenses/)
- [MoneyMonit — Free Splitwise alternatives 2025](https://moneymonit.com/blog/free-splitwise-alternatives/)
