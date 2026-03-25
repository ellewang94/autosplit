import { useState, useRef, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  ArrowRight, ChevronLeft, Info, List, Loader,
  FileSpreadsheet, ChevronDown, ChevronUp, Trash2,
} from 'lucide-react'
import clsx from 'clsx'

// ── Supported currencies (same list as TransactionsPage) ─────────────────────
const CURRENCIES = ['USD', 'AUD', 'NZD', 'JPY', 'GBP', 'EUR', 'CAD', 'SGD', 'HKD', 'THB']

// ── Banks that support CSV export, with where to find it ─────────────────────
const CSV_BANKS = [
  {
    name: 'American Express',
    steps: 'Log in → Statements & Activity → Download → CSV',
  },
  {
    name: 'Bank of America',
    steps: 'Log in → Accounts → Download transactions → CSV',
  },
  {
    name: 'Citi',
    steps: 'Log in → Account Details → Download → CSV',
  },
  {
    name: 'Capital One',
    steps: 'Log in → View Transactions → Download Transactions → CSV',
  },
  {
    name: 'Discover',
    steps: 'Log in → Manage → Download Center → CSV',
  },
  {
    name: 'Chase (alternative)',
    steps: 'Log in → Account Activity → Download → CSV (if you prefer CSV over PDF)',
  },
]

// ── Drop zone used by both PDF and CSV upload modes ───────────────────────────
function DropZone({ onFile, disabled, accept, label, sublabel, mono }) {
  const [dragging, setDragging] = useState(false)
  const [multiError, setMultiError] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 1) {
      setMultiError(true)
      setTimeout(() => setMultiError(false), 4000)
      return
    }
    setMultiError(false)
    const file = files[0]
    if (file) onFile(file)
  }

  return (
    <div
      className={clsx(
        'border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer',
        multiError ? 'border-red-400/60 bg-red-400/5' :
        dragging ? 'border-lime-400 bg-lime-400/5' :
        'border-ink-600 hover:border-ink-400 hover:bg-ink-800/30',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        disabled={disabled}
      />
      {multiError ? (
        <>
          <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-display text-lg text-red-400 mb-1">One file at a time</p>
          <p className="text-sm text-ink-400">Upload each statement separately</p>
        </>
      ) : (
        <>
          <Upload size={32} className="text-ink-500 mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-display text-lg text-ink-200 mb-1">{label}</p>
          <p className="text-sm text-ink-500">{sublabel}</p>
          {mono && <p className="text-xs text-ink-600 mt-2 font-mono">{mono}</p>}
        </>
      )}
    </div>
  )
}

function FilePreview({ file }) {
  const sizeMB = (file.size / 1024 / 1024).toFixed(2)
  const isCSV = file.name.toLowerCase().endsWith('.csv')
  return (
    <div className="card-sm flex items-center gap-3">
      {isCSV
        ? <FileSpreadsheet size={20} className="text-lime-400 flex-shrink-0" />
        : <FileText size={20} className="text-lime-400 flex-shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-100 truncate">{file.name}</p>
        <p className="text-xs text-ink-500 font-mono">{sizeMB} MB · {isCSV ? 'CSV' : 'PDF'}</p>
      </div>
    </div>
  )
}

// ── CSV bank instructions accordion ──────────────────────────────────────────
function BankInstructions() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-ink-700 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left bg-ink-800/50 hover:bg-ink-800 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xs font-medium text-ink-300 flex items-center gap-2">
          <Info size={12} className="text-ink-500" />
          How to export CSV from your bank
        </span>
        {open
          ? <ChevronUp size={13} className="text-ink-500" />
          : <ChevronDown size={13} className="text-ink-500" />
        }
      </button>
      {open && (
        <div className="divide-y divide-ink-800">
          {CSV_BANKS.map((bank) => (
            <div key={bank.name} className="px-4 py-2.5 bg-ink-900/50">
              <p className="text-xs font-semibold text-ink-200 mb-0.5">{bank.name}</p>
              <p className="text-xs text-ink-500 font-mono">{bank.steps}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main upload page ──────────────────────────────────────────────────────────
export default function UploadPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Which upload mode the user has chosen: 'pdf' | 'csv'
  const [mode, setMode] = useState(null)

  const [file, setFile] = useState(null)
  const [cardHolderId, setCardHolderId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  // Currency of the statement being uploaded — defaults to the group's base currency.
  // If a Canadian friend uploads her CAD statement into a USD trip, she sets this to CAD
  // and enters the exchange rate so every transaction gets correctly converted.
  const [statementCurrency, setStatementCurrency] = useState('USD')
  const [exchangeRate, setExchangeRate] = useState('')

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: statements = [] } = useQuery({
    queryKey: ['statements', groupId],
    queryFn: () => api.getStatements(groupId),
  })

  // Which statement is showing the "Delete?" confirmation inline
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const deleteStatement = useMutation({
    mutationFn: (id) => api.deleteStatement(id),
    onSuccess: () => {
      qc.invalidateQueries(['statements', groupId])
      qc.invalidateQueries(['group-statements', groupId])
      qc.invalidateQueries(['group-transactions', groupId])
      setConfirmDeleteId(null)
    },
  })

  // Format an ISO date string into "Jan 5, 2026"
  const fmtDate = (iso) => {
    if (!iso) return null
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Format a statement's period into a readable string
  const fmtPeriod = (s) => {
    if (s.period_start && s.period_end) return `${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`
    if (s.statement_date) return fmtDate(s.statement_date)
    return null
  }

  // Shared success/error handlers — same regardless of PDF or CSV
  const onSuccess = (data) => {
    setResult(data)
    setError(null)
    qc.invalidateQueries(['statements', groupId])
    qc.invalidateQueries(['group-statements', groupId])
  }
  const onError = (err) => setError(err.message)

  // Default the statement currency to the group's base currency once it loads
  const baseCurrency = group?.base_currency || 'USD'
  const rateNeeded = statementCurrency !== baseCurrency
  const rateValid = !rateNeeded || (exchangeRate && parseFloat(exchangeRate) > 0)

  const uploadPDF = useMutation({
    mutationFn: () => api.uploadPDF(
      groupId, file, cardHolderId || null,
      statementCurrency,
      rateNeeded ? parseFloat(exchangeRate) : null,
    ),
    onSuccess,
    onError,
  })

  const uploadCSV = useMutation({
    mutationFn: () => api.uploadCSV(
      groupId, file, cardHolderId || null,
      statementCurrency,
      rateNeeded ? parseFloat(exchangeRate) : null,
    ),
    onSuccess,
    onError,
  })

  // The active upload mutation depends on the chosen mode
  const upload = mode === 'csv' ? uploadCSV : uploadPDF
  const members = group?.members || []

  const reset = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setStatementCurrency(baseCurrency)
    setExchangeRate('')
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <button
        className="btn-ghost mb-6 -ml-2 text-ink-400"
        onClick={() => navigate('/groups')}
      >
        <ChevronLeft size={15} />
        Back to Trips
      </button>

      <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-50 tracking-tight mb-1">Import Statement</h1>
      <p className="text-ink-400 text-sm mb-8">
        Upload your bank statement to extract and split transactions
      </p>

      {/* Already imported statements — filter out virtual manual-expense containers */}
      {statements.filter(s => !s.is_manual).length > 0 && (
        <div className="card mb-6">
          <h2 className="font-display text-base font-semibold text-ink-200 mb-3 flex items-center gap-2">
            <List size={14} className="text-ink-500" />
            Already Imported
          </h2>
          <div className="space-y-2">
            {statements.filter(s => !s.is_manual).map((s) => {
              const holder = s.card_holder_member_id
                ? members.find(m => m.id === s.card_holder_member_id)?.name
                : null
              const period = fmtPeriod(s)
              const isConfirming = confirmDeleteId === s.id

              return (
                <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-ink-800/50 group">
                  <CheckCircle size={13} className="text-lime-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-ink-200 font-medium">
                      {holder ? `${holder}'s Statement` : 'Statement'}
                    </span>
                    {period && (
                      <span className="text-xs text-ink-500 ml-2">{period}</span>
                    )}
                  </div>
                  <span className="text-xs font-mono text-ink-500 flex-shrink-0">
                    {s.transaction_count} txns
                  </span>

                  {/* Delete with confirm */}
                  {isConfirming ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-red-400">Delete?</span>
                      <button
                        className="px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-400 transition-colors"
                        onClick={() => deleteStatement.mutate(s.id)}
                        disabled={deleteStatement.isPending}
                      >
                        Yes
                      </button>
                      <button
                        className="px-1.5 py-0.5 rounded text-[10px] bg-ink-700 text-ink-300 hover:bg-ink-600 transition-colors"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      className="opacity-0 group-hover:opacity-100 p-1 rounded text-ink-600 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0"
                      title="Delete this statement and all its transactions"
                      onClick={() => setConfirmDeleteId(s.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <p className="text-xs text-ink-600 mt-3">
            Hover a row to delete it. This removes the statement and all its transactions permanently.
          </p>
        </div>
      )}

      {/* ── Step 1: Choose upload method ─────────────────────────────────── */}
      {!result && (
        <div className="card mb-4">
          <label className="label mb-3">What type of file are you uploading?</label>
          <div className="grid grid-cols-2 gap-3">

            {/* Chase PDF option */}
            <button
              className={clsx(
                'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                mode === 'pdf'
                  ? 'border-lime-400/60 bg-lime-400/5'
                  : 'border-ink-700 hover:border-ink-500 bg-ink-800/30'
              )}
              onClick={() => { setMode('pdf'); reset() }}
            >
              <div className="flex items-center gap-2">
                <FileText size={18} className={mode === 'pdf' ? 'text-lime-400' : 'text-ink-400'} />
                <span className={clsx('font-semibold text-sm', mode === 'pdf' ? 'text-lime-400' : 'text-ink-200')}>
                  Chase PDF
                </span>
              </div>
              <p className="text-xs text-ink-500 leading-relaxed">
                The monthly statement PDF from Chase's "Statements" section. Drag and drop — no export needed.
              </p>
              <span className="text-[10px] font-mono text-ink-600">Chase credit cards only</span>
            </button>

            {/* Bank CSV option */}
            <button
              className={clsx(
                'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
                mode === 'csv'
                  ? 'border-lime-400/60 bg-lime-400/5'
                  : 'border-ink-700 hover:border-ink-500 bg-ink-800/30'
              )}
              onClick={() => { setMode('csv'); reset() }}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className={mode === 'csv' ? 'text-lime-400' : 'text-ink-400'} />
                <span className={clsx('font-semibold text-sm', mode === 'csv' ? 'text-lime-400' : 'text-ink-200')}>
                  Bank CSV
                </span>
              </div>
              <p className="text-xs text-ink-500 leading-relaxed">
                A transaction export from any bank's website. Works with Amex, BofA, Citi, Capital One, Discover, and Chase.
              </p>
              <span className="text-[10px] font-mono text-ink-600">All major banks</span>
            </button>

          </div>

          {/* Contextual help shown after mode is chosen */}
          {mode === 'pdf' && (
            <div className="mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-ink-800/60 border border-ink-700 animate-slide-up">
              <Info size={12} className="text-ink-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-400">
                On Chase.com: <span className="text-ink-300 font-mono">Account → Statements → View Statement → Download PDF</span>.
                The PDF must be from Chase credit cards — debit or other banks won't work.
              </p>
            </div>
          )}
          {mode === 'csv' && (
            <div className="mt-4 animate-slide-up">
              <BankInstructions />
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Card holder ───────────────────────────────────────────── */}
      {mode && !result && members.length > 0 && (
        <div className="card mb-4">
          <label className="label">Who is the card holder?</label>
          <p className="text-xs text-ink-500 mb-3">
            The person whose card this statement belongs to — all charges come "from" them.
          </p>
          <select
            className="select"
            value={cardHolderId}
            onChange={(e) => setCardHolderId(e.target.value)}
          >
            <option value="">Select card holder…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Step 2b: Statement currency ──────────────────────────────────── */}
      {/* Only shown when a mode is chosen — if the card currency matches the
          group's base currency (most common case), this is a one-click confirm.
          If it differs (e.g. Canadian friend uploading CAD into a USD trip),
          an exchange rate input appears so every transaction gets converted. */}
      {mode && !result && (
        <div className="card mb-4">
          <label className="label">What currency is this statement in?</label>
          <p className="text-xs text-ink-500 mb-3">
            This trip settles in <span className="text-ink-300 font-medium">{baseCurrency}</span>.
            If this card charges in a different currency, we'll convert every transaction automatically.
          </p>
          <select
            className="select mb-3"
            value={statementCurrency}
            onChange={(e) => { setStatementCurrency(e.target.value); setExchangeRate('') }}
          >
            {CURRENCIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Exchange rate — only shown when currency differs from base */}
          {rateNeeded && (
            <div className="rounded-lg bg-ink-800/60 border border-ink-700 px-4 py-3 animate-slide-up">
              <label className="block text-xs text-ink-400 mb-2">
                Exchange rate <span className="text-ink-600">(required)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400">1 {statementCurrency} =</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="e.g. 0.74"
                  className="input flex-1 text-sm"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
                <span className="text-xs text-ink-400">{baseCurrency}</span>
              </div>
              <p className="text-xs text-ink-600 mt-2">
                Look up today's rate on Google: "{statementCurrency} to {baseCurrency}"
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: File drop zone ────────────────────────────────────────── */}
      {mode && !result && (
        <div className="card mb-4">
          <label className="label">
            {mode === 'pdf' ? 'Chase Statement PDF' : 'Bank Transaction CSV'}
          </label>
          {file ? (
            <div className="space-y-3">
              <FilePreview file={file} />
              <button className="btn-ghost text-xs" onClick={reset}>
                Change file
              </button>
            </div>
          ) : mode === 'pdf' ? (
            <DropZone
              onFile={setFile}
              disabled={upload.isPending}
              accept=".pdf"
              label="Drop your Chase PDF here"
              sublabel="or click to browse · one statement at a time"
              mono="PDF only · Chase credit card statements"
            />
          ) : (
            <DropZone
              onFile={setFile}
              disabled={upload.isPending}
              accept=".csv"
              label="Drop your bank CSV here"
              sublabel="or click to browse · export from your bank's website"
              mono="CSV only · Chase, Amex, BofA, Citi, Capital One, Discover"
            />
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="card-sm border-red-500/30 bg-red-500/5 flex gap-3 mb-4">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Upload failed</p>
            <p className="text-xs text-ink-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Success */}
      {result && (
        <div className="card border-lime-400/30 bg-lime-400/5 animate-slide-up mb-4">
          <div className="flex items-start gap-3">
            <CheckCircle size={20} className="text-lime-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-lime-400 mb-1">
                {result.status === 'duplicate' ? 'Already imported' : 'Import successful'}
              </p>
              <p className="text-sm text-ink-300">{result.message}</p>

              <div className="flex gap-4 mt-3 pt-3 border-t border-lime-400/20">
                <div>
                  <div className="font-mono text-xl font-bold text-ink-50">{result.transaction_count}</div>
                  <div className="text-xs text-ink-500">transactions</div>
                </div>
                {result.needs_review_count > 0 && (
                  <div>
                    <div className="font-mono text-xl font-bold text-amber-400">{result.needs_review_count}</div>
                    <div className="text-xs text-ink-500">need review</div>
                  </div>
                )}
                {result.excluded_by_date_count > 0 && (
                  <div>
                    <div className="font-mono text-xl font-bold text-ink-500">{result.excluded_by_date_count}</div>
                    <div className="text-xs text-ink-500">outside trip dates</div>
                  </div>
                )}
              </div>

              {result.excluded_by_date_count > 0 && (
                <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-ink-800/60 border border-ink-700">
                  <AlertTriangle size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-ink-400">
                    {result.excluded_by_date_count} transaction{result.excluded_by_date_count > 1 ? 's' : ''} outside
                    the trip date range were auto-excluded. You can review them in the Excluded filter on Transactions.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              className="btn-primary flex-1 justify-center"
              onClick={() => navigate(`/groups/${groupId}/transactions`)}
            >
              Review Transactions
              <ArrowRight size={14} />
            </button>
            <button className="btn-secondary" onClick={() => { reset(); setMode(null) }}>
              Upload Another
            </button>
          </div>
        </div>
      )}

      {/* Upload button */}
      {mode && !result && file && (
        <button
          className="btn-primary w-full justify-center py-3"
          onClick={() => upload.mutate()}
          disabled={upload.isPending || !file || !rateValid}
        >
          {upload.isPending ? (
            <>
              <Loader size={15} className="animate-spin" />
              {mode === 'pdf' ? 'Parsing PDF…' : 'Parsing CSV…'}
            </>
          ) : (
            <>
              <Upload size={15} />
              {mode === 'pdf' ? 'Import PDF Statement' : 'Import CSV Statement'}
            </>
          )}
        </button>
      )}
    </div>
  )
}
