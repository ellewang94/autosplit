/**
 * API client — thin wrapper around fetch that talks to our FastAPI backend.
 *
 * All functions return plain JS objects (already parsed from JSON).
 * Errors throw with a message you can display in the UI.
 *
 * The Vite proxy forwards /api/* requests to http://localhost:8000/api/*
 * so we don't need to hardcode the backend URL here.
 */

// In development, Vite proxies /api → localhost:8001 (see vite.config.js).
// In production (Vercel), the vercel.json rewrites handle routing /api → Railway.
// We keep BASE as '/api' so both environments work without any code changes.
const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }

  // Handle empty responses (DELETE returns {"ok": true})
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

// ── Groups ───────────────────────────────────────────────────────────────────
export const api = {
  // Groups
  getGroups: () => request('/groups'),
  // createGroup accepts optional trip dates and an optional base_currency (e.g. "USD", "JPY")
  // base_currency is the currency that all expenses get settled in for this group
  createGroup: (name, start_date = null, end_date = null, base_currency = 'USD') =>
    request('/groups', { method: 'POST', body: JSON.stringify({ name, start_date, end_date, base_currency }) }),
  updateGroup: (id, name, start_date = null, end_date = null) =>
    request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify({ name, start_date, end_date }) }),
  deleteGroup: (id) => request(`/groups/${id}`, { method: 'DELETE' }),
  getGroup: (id) => request(`/groups/${id}`),

  // Members
  addMember: (groupId, name) => request(`/groups/${groupId}/members`, {
    method: 'POST', body: JSON.stringify({ name }),
  }),
  updateMember: (id, name) => request(`/members/${id}`, {
    method: 'PUT', body: JSON.stringify({ name }),
  }),
  deleteMember: (id) => request(`/members/${id}`, { method: 'DELETE' }),

  // Statements
  getStatements: (groupId) => request(`/groups/${groupId}/statements`),
  deleteStatement: (id) => request(`/statements/${id}`, { method: 'DELETE' }),
  setCardHolder: (statementId, memberId) => request(`/statements/${statementId}/card-holder`, {
    method: 'PUT', body: JSON.stringify({ member_id: memberId }),
  }),

  // Upload Chase PDF statement
  // statementCurrency: the currency on the card (e.g. "CAD" for a Canadian card)
  // exchangeRate: 1 statementCurrency = exchangeRate baseCurrency (e.g. 0.74 for CAD→USD)
  uploadPDF: async (groupId, file, cardHolderMemberId, statementCurrency = 'USD', exchangeRate = null) => {
    const form = new FormData()
    form.append('file', file)
    if (cardHolderMemberId) form.append('card_holder_member_id', cardHolderMemberId)
    form.append('statement_currency', statementCurrency)
    if (exchangeRate) form.append('exchange_rate', exchangeRate)

    const res = await fetch(`${BASE}/groups/${groupId}/statements/upload`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || `Upload failed: HTTP ${res.status}`)
    }
    return res.json()
  },

  // Upload a bank CSV export (Chase, Amex, BofA, Citi, Capital One, Discover)
  // Bank format is auto-detected from the CSV headers.
  uploadCSV: async (groupId, file, cardHolderMemberId, statementCurrency = 'USD', exchangeRate = null) => {
    const form = new FormData()
    form.append('file', file)
    if (cardHolderMemberId) form.append('card_holder_member_id', cardHolderMemberId)
    form.append('statement_currency', statementCurrency)
    if (exchangeRate) form.append('exchange_rate', exchangeRate)

    const res = await fetch(`${BASE}/groups/${groupId}/statements/upload-csv`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || `Upload failed: HTTP ${res.status}`)
    }
    return res.json()
  },

  // Manually add a single expense (no statement upload needed)
  // paidByMemberId: which member paid; participantIds: array of member IDs who split it
  // currency: what currency the charge was in (e.g. "JPY") — defaults to "USD"
  // originalAmount: the amount in the foreign currency (set automatically if currency differs)
  // exchangeRate: how many base-currency units 1 foreign-currency unit equals (e.g. 0.0067)
  createManualTransaction: (groupId, { postedDate, description, amount, paidByMemberId, category, participantIds, splitMethod, currency, exchangeRate }) =>
    request(`/groups/${groupId}/transactions/manual`, {
      method: 'POST',
      body: JSON.stringify({
        posted_date: postedDate,
        description,
        amount: parseFloat(amount),
        paid_by_member_id: paidByMemberId,
        category: category || null,
        // Build the participants_json in the format the backend expects
        participants_json: participantIds?.length
          ? { type: 'custom', member_ids: participantIds }
          : null,
        split_method_json: splitMethod || { type: 'equal' },
        // Multi-currency fields — backend converts amount if currency != base_currency
        currency: currency || 'USD',
        exchange_rate: exchangeRate ? parseFloat(exchangeRate) : null,
      }),
    }),

  // Transactions
  getTransactions: (statementId) => request(`/statements/${statementId}/transactions`),
  getGroupTransactions: (groupId) => request(`/groups/${groupId}/transactions`),
  updateTransaction: (id, updates) => request(`/transactions/${id}`, {
    method: 'PUT', body: JSON.stringify(updates),
  }),
  deleteTransaction: (id) => request(`/transactions/${id}`, { method: 'DELETE' }),
  saveMerchantRule: (transactionId, merchantKey) => request('/transactions/save-merchant-rule', {
    method: 'POST', body: JSON.stringify({ transaction_id: transactionId, merchant_key: merchantKey }),
  }),
  batchUpdate: (statementId, updates) => request(`/statements/${statementId}/batch-update`, {
    method: 'POST', body: JSON.stringify(updates),
  }),
  // Bulk-update multiple transactions at once — the core trip workflow
  bulkUpdateTransactions: (groupId, body) =>
    request(`/groups/${groupId}/transactions/bulk-update`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  // Merchant rules
  getMerchantRules: (groupId) => request(`/groups/${groupId}/merchant-rules`),
  deleteMerchantRule: (id) => request(`/merchant-rules/${id}`, { method: 'DELETE' }),

  // Settlement
  computeSettlement: (groupId, payerMemberId, statementId = null) =>
    request(`/groups/${groupId}/settlement`, {
      method: 'POST',
      body: JSON.stringify({ payer_member_id: payerMemberId, statement_id: statementId }),
    }),

  // Export all transactions (date, merchant, category, amount, participants, status)
  // as a CSV you can open in Google Sheets or Excel — no settlement computation needed.
  exportTransactionsCSV: async (groupId, groupName) => {
    const res = await fetch(`${BASE}/groups/${groupId}/transactions/export-csv`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Use the group name in the filename so it's easy to find in Downloads
    a.download = `${groupName.replace(/\s+/g, '_')}_transactions.csv`
    a.click()
    URL.revokeObjectURL(url)
  },

  exportCSV: async (groupId, payerMemberId, statementId = null) => {
    const res = await fetch(`${BASE}/groups/${groupId}/settlement/export-csv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer_member_id: payerMemberId, statement_id: statementId }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'settlement.csv'
    a.click()
    URL.revokeObjectURL(url)
  },

  exportJSON: async (groupId, payerMemberId, statementId = null) => {
    const res = await fetch(`${BASE}/groups/${groupId}/settlement/export-json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payer_member_id: payerMemberId, statement_id: statementId }),
    })
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'settlement.json'
    a.click()
    URL.revokeObjectURL(url)
  },
}
