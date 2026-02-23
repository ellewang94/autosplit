/**
 * API client — thin wrapper around fetch that talks to our FastAPI backend.
 *
 * All functions return plain JS objects (already parsed from JSON).
 * Errors throw with a message you can display in the UI.
 *
 * The Vite proxy forwards /api/* requests to http://localhost:8000/api/*
 * so we don't need to hardcode the backend URL here.
 */

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
  createGroup: (name) => request('/groups', { method: 'POST', body: JSON.stringify({ name }) }),
  updateGroup: (id, name) => request(`/groups/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
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

  // Upload PDF — uses FormData, not JSON
  uploadPDF: async (groupId, file, cardHolderMemberId) => {
    const form = new FormData()
    form.append('file', file)
    if (cardHolderMemberId) form.append('card_holder_member_id', cardHolderMemberId)

    const res = await fetch(`${BASE}/groups/${groupId}/statements/upload`, {
      method: 'POST',
      body: form,
      // Don't set Content-Type — browser sets it with boundary for multipart
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail || `Upload failed: HTTP ${res.status}`)
    }
    return res.json()
  },

  // Transactions
  getTransactions: (statementId) => request(`/statements/${statementId}/transactions`),
  getGroupTransactions: (groupId) => request(`/groups/${groupId}/transactions`),
  updateTransaction: (id, updates) => request(`/transactions/${id}`, {
    method: 'PUT', body: JSON.stringify(updates),
  }),
  saveMerchantRule: (transactionId, merchantKey) => request('/transactions/save-merchant-rule', {
    method: 'POST', body: JSON.stringify({ transaction_id: transactionId, merchant_key: merchantKey }),
  }),
  batchUpdate: (statementId, updates) => request(`/statements/${statementId}/batch-update`, {
    method: 'POST', body: JSON.stringify(updates),
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
