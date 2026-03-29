import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { trackStatementUploaded } from '../lib/analytics'
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  ArrowRight, ChevronLeft, Info, List, Loader,
  FileSpreadsheet, ChevronDown, ChevronUp, Trash2,
  ThumbsUp, ThumbsDown, Send, X, Plus,
} from 'lucide-react'
import clsx from 'clsx'

// ── Inline feedback prompt shown after a successful import ───────────────────
// Appears once per session after all uploads complete.
function ImportFeedback({ groupId }) {
  const [vote, setVote] = useState(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    setSubmitting(true)
    try {
      await api.submitFeedback(
        vote === 'yes' ? 'feature' : 'bug',
        vote === 'yes'
          ? 'Statement import: user confirmed it parsed correctly.'
          : `Statement import: user reported a problem. ${comment ? 'Details: ' + comment : 'No details provided.'}`,
        null,
        `/groups/${groupId}/upload`,
      )
    } catch (e) {
      console.error('Feedback submit failed:', e)
    }
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-500 py-2">
        <CheckCircle size={12} className="text-lime-400" />
        Thanks for the feedback!
      </div>
    )
  }

  return (
    <div className="mt-4 pt-4 border-t border-ink-700/50">
      {vote === null ? (
        <div className="flex items-center gap-3">
          <span className="text-xs text-ink-500">Did AutoSplit parse this correctly?</span>
          <button
            onClick={() => { setVote('yes'); setTimeout(submit, 50) }}
            className="flex items-center gap-1 text-xs text-ink-400 hover:text-lime-400 transition-colors"
          >
            <ThumbsUp size={13} /> Yes
          </button>
          <button
            onClick={() => setVote('no')}
            className="flex items-center gap-1 text-xs text-ink-400 hover:text-red-400 transition-colors"
          >
            <ThumbsDown size={13} /> No
          </button>
        </div>
      ) : (
        <div className="space-y-2 animate-slide-up">
          <p className="text-xs text-ink-400">What went wrong? <span className="text-ink-600">(optional)</span></p>
          <textarea
            className="input w-full text-xs resize-none h-16"
            placeholder="e.g. amounts were wrong, duplicate transactions, wrong dates…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <button onClick={submit} disabled={submitting} className="btn-secondary text-xs py-1.5">
            <Send size={11} />
            {submitting ? 'Sending…' : 'Send feedback'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Supported currencies ──────────────────────────────────────────────────────
const CURRENCIES = ['USD', 'AUD', 'NZD', 'JPY', 'GBP', 'EUR', 'CAD', 'SGD', 'HKD', 'THB']

// ── Bank instructions ─────────────────────────────────────────────────────────
const PDF_BANKS = [
  { name: 'Chase', steps: 'Log in → Accounts → Statements → View/Download PDF' },
  { name: 'American Express', steps: 'Log in → Statements & Activity → View Statement → Download PDF' },
  { name: 'Bank of America', steps: 'Log in → Accounts → Statements → View Statement → Download PDF' },
]
const CSV_BANKS = [
  { name: 'American Express', steps: 'Log in → Statements & Activity → Download → CSV' },
  { name: 'Bank of America', steps: 'Log in → Accounts → Download transactions → CSV' },
  { name: 'Citi', steps: 'Log in → Account Details → Download → CSV' },
  { name: 'Capital One', steps: 'Log in → View Transactions → Download Transactions → CSV' },
  { name: 'Discover', steps: 'Log in → Manage → Download Center → CSV' },
  { name: 'Chase (alternative)', steps: 'Log in → Account Activity → Download → CSV' },
]

// ── Bank instructions accordion ───────────────────────────────────────────────
function BankInstructions({ banks, title }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-ink-700 overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-ink-800/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-xs text-ink-400">
          <Info size={13} />
          {title}
        </div>
        {open ? <ChevronUp size={13} className="text-ink-500" /> : <ChevronDown size={13} className="text-ink-500" />}
      </button>
      {open && (
        <div className="border-t border-ink-700 px-4 py-3 space-y-3 bg-ink-800/30 animate-slide-up">
          {banks.map((b) => (
            <div key={b.name}>
              <p className="text-xs font-medium text-ink-300 mb-0.5">{b.name}</p>
              <p className="text-xs text-ink-500 font-mono">{b.steps}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Multi-file drop zone ──────────────────────────────────────────────────────
// Accepts multiple files at once — drag a whole folder's worth in one shot.
function DropZone({ onFiles, disabled, accept, mode }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const files = Array.from(e.dataTransfer.files).filter(f => {
      const ext = f.name.split('.').pop().toLowerCase()
      return mode === 'csv' ? ext === 'csv' : ext === 'pdf'
    })
    if (files.length > 0) onFiles(files)
  }

  return (
    <div
      className={clsx(
        'border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 cursor-pointer',
        dragging ? 'border-lime-400 bg-lime-400/5' : 'border-ink-600 hover:border-ink-400 hover:bg-ink-800/30',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      {/* Hidden input — multiple={true} lets you pick several files at once */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || [])
          if (files.length) onFiles(files)
          // Reset input so the same file can be re-added if removed
          e.target.value = ''
        }}
        disabled={disabled}
      />
      <Upload size={32} className="text-ink-500 mx-auto mb-3" strokeWidth={1.5} />
      <p className="font-display text-lg text-ink-200 mb-1">
        Drop {mode === 'pdf' ? 'PDFs' : 'CSVs'} here
      </p>
      <p className="text-sm text-ink-500">
        or click to browse · select multiple files at once
      </p>
      <p className="text-xs text-ink-600 mt-2 font-mono">
        {mode === 'pdf'
          ? 'PDF only · Chase · Amex · Bank of America · Capital One'
          : 'CSV only · Chase, Amex, BofA, Citi, Capital One, Discover'}
      </p>
    </div>
  )
}

// ── Single file card in the queue ─────────────────────────────────────────────
// Shows the filename, card holder picker, upload status, and result summary.
function QueueCard({ item, members, onRemove, onSetCardHolder }) {
  const isCSV = item.file.name.toLowerCase().endsWith('.csv')
  const sizeMB = (item.file.size / 1024 / 1024).toFixed(2)

  return (
    <div className={clsx(
      'card-sm transition-all',
      item.status === 'done' && 'border-lime-400/25 bg-lime-400/5',
      item.status === 'error' && 'border-red-400/25 bg-red-400/5',
    )}>
      {/* File header row */}
      <div className="flex items-start gap-3">
        {/* Status icon */}
        <div className="flex-shrink-0 mt-0.5">
          {item.status === 'pending' && (
            isCSV
              ? <FileSpreadsheet size={18} className="text-ink-400" />
              : <FileText size={18} className="text-ink-400" />
          )}
          {item.status === 'uploading' && <Loader size={18} className="text-lime-400 animate-spin" />}
          {item.status === 'done' && <CheckCircle size={18} className="text-lime-400" />}
          {item.status === 'error' && <AlertTriangle size={18} className="text-red-400" />}
        </div>

        {/* Filename + size */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink-100 truncate">{item.file.name}</p>
          <p className="text-xs text-ink-500 font-mono">{sizeMB} MB</p>
        </div>

        {/* Remove button — only for pending items */}
        {item.status === 'pending' && (
          <button
            onClick={onRemove}
            className="text-ink-600 hover:text-red-400 transition-colors flex-shrink-0 p-0.5"
            title="Remove from queue"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Card holder picker — only for pending/uploading */}
      {(item.status === 'pending' || item.status === 'uploading') && members.length > 0 && (
        <div className="mt-3">
          <label className="text-[10px] font-medium text-ink-400 uppercase tracking-widest mb-1 block">
            Card holder
          </label>
          <select
            className="select text-sm py-1.5"
            value={item.cardHolderId}
            onChange={(e) => onSetCardHolder(e.target.value)}
            disabled={item.status === 'uploading'}
          >
            <option value="">Select who owns this card…</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Error message */}
      {item.status === 'error' && (
        <p className="text-xs text-red-400 mt-2">{item.error || 'Upload failed — try again.'}</p>
      )}

      {/* Success summary */}
      {item.status === 'done' && item.result && (
        <div className="mt-3 pt-3 border-t border-lime-400/20 flex items-center gap-4">
          <div>
            <span className="font-mono text-lg font-bold text-ink-50">{item.result.transaction_count}</span>
            <span className="text-xs text-ink-500 ml-1.5">transactions</span>
          </div>
          {item.result.needs_review_count > 0 && (
            <div>
              <span className="font-mono text-lg font-bold text-amber-400">{item.result.needs_review_count}</span>
              <span className="text-xs text-ink-500 ml-1.5">need review</span>
            </div>
          )}
          {item.result.excluded_by_date_count > 0 && (
            <div>
              <span className="font-mono text-lg font-bold text-ink-500">{item.result.excluded_by_date_count}</span>
              <span className="text-xs text-ink-500 ml-1.5">outside trip dates</span>
            </div>
          )}
          {item.result.status === 'duplicate' && (
            <span className="text-xs text-ink-400 italic">Already imported</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UploadPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()

  // Upload mode: 'pdf' | 'csv' | null
  const [mode, setMode] = useState(null)

  // The file queue — each item tracks its own state and result.
  // This replaces the old single `file` state variable.
  const [queue, setQueue] = useState([])

  // Whether an upload batch is currently in progress
  const [uploading, setUploading] = useState(false)

  // Whether at least one upload in this session completed successfully
  const [anySucceeded, setAnySucceeded] = useState(false)

  // Currency applies globally to all files in the current batch.
  // For the vast majority of trips everyone has the same card currency.
  const [statementCurrency, setStatementCurrency] = useState('USD')
  const [exchangeRate, setExchangeRate] = useState('')

  // Which already-imported statement is showing the delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: statements = [] } = useQuery({
    queryKey: ['statements', groupId],
    queryFn: () => api.getStatements(groupId),
  })

  const baseCurrency = group?.base_currency || 'USD'
  const members = group?.members || []
  const rateNeeded = statementCurrency !== baseCurrency
  const rateValid = !rateNeeded || (exchangeRate && parseFloat(exchangeRate) > 0)

  // ── Queue management ────────────────────────────────────────────────────────

  // Add new files to the queue (skips duplicates by filename)
  const addFiles = useCallback((files) => {
    setQueue(prev => {
      const existingNames = new Set(prev.map(item => item.file.name))
      const newItems = files
        .filter(f => !existingNames.has(f.name))
        .map(f => ({
          id: Math.random().toString(36).slice(2, 10),
          file: f,
          cardHolderId: '',
          status: 'pending',   // 'pending' | 'uploading' | 'done' | 'error'
          result: null,
          error: null,
        }))
      return [...prev, ...newItems]
    })
  }, [])

  function removeItem(id) {
    setQueue(prev => prev.filter(item => item.id !== id))
  }

  function setCardHolder(id, value) {
    setQueue(prev => prev.map(item =>
      item.id === id ? { ...item, cardHolderId: value } : item
    ))
  }

  function updateItem(id, updates) {
    setQueue(prev => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ))
  }

  // ── Upload all pending files in sequence ────────────────────────────────────
  async function uploadAll() {
    if (uploading) return
    setUploading(true)

    const pending = queue.filter(item => item.status === 'pending')
    const rate = rateNeeded ? parseFloat(exchangeRate) : null

    for (const item of pending) {
      updateItem(item.id, { status: 'uploading' })
      try {
        const result = mode === 'csv'
          ? await api.uploadCSV(groupId, item.file, item.cardHolderId || null, statementCurrency, rate)
          : await api.uploadPDF(groupId, item.file, item.cardHolderId || null, statementCurrency, rate)
        updateItem(item.id, { status: 'done', result })
        setAnySucceeded(true)
        // Fire analytics event so we can track upload success rate and bank distribution
        trackStatementUploaded({
          bank: result.bank_detected || 'unknown',
          fileType: mode,
          transactionCount: result.transaction_count ?? 0,
          needsReviewCount: result.needs_review_count ?? 0,
        })
        // Refresh the statements list so the "Already Imported" section updates live
        qc.invalidateQueries(['statements', groupId])
        qc.invalidateQueries(['group-statements', groupId])
        qc.invalidateQueries(['group-transactions', groupId])
      } catch (e) {
        updateItem(item.id, { status: 'error', error: e.message })
      }
    }

    setUploading(false)
  }

  // Reset the queue entirely so the user can start a new batch
  function resetQueue() {
    setQueue([])
    setAnySucceeded(false)
    setStatementCurrency(baseCurrency)
    setExchangeRate('')
  }

  // ── Delete an already-imported statement ────────────────────────────────────
  async function deleteStatement(id) {
    try {
      await api.deleteStatement(id)
      qc.invalidateQueries(['statements', groupId])
      qc.invalidateQueries(['group-statements', groupId])
      qc.invalidateQueries(['group-transactions', groupId])
    } catch (e) {
      console.error('Delete failed:', e)
    }
    setConfirmDeleteId(null)
  }

  const fmtDate = (iso) => {
    if (!iso) return null
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const fmtPeriod = (s) => {
    if (s.period_start && s.period_end) return `${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`
    if (s.statement_date) return fmtDate(s.statement_date)
    return null
  }

  // Derived state for the action button
  const hasPending = queue.some(item => item.status === 'pending')
  const allFinished = queue.length > 0 && queue.every(item => item.status === 'done' || item.status === 'error')
  const successCount = queue.filter(item => item.status === 'done').length
  const errorCount = queue.filter(item => item.status === 'error').length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <button className="btn-ghost mb-6 -ml-2 text-ink-400" onClick={() => navigate('/groups')}>
        <ChevronLeft size={15} />
        Back to Trips
      </button>

      <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-50 tracking-tight mb-1">
        Import Statements
      </h1>
      <p className="text-ink-400 text-sm mb-8">
        Upload one or more bank statements — drop them all at once.
      </p>

      {/* ── Already imported statements ──────────────────────────────────────── */}
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
                    {period && <span className="text-xs text-ink-500 ml-2">{period}</span>}
                  </div>
                  <span className="text-xs font-mono text-ink-500 flex-shrink-0">{s.transaction_count} txns</span>
                  {isConfirming ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-red-400">Delete?</span>
                      <button
                        className="px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-400 transition-colors"
                        onClick={() => deleteStatement(s.id)}
                      >Yes</button>
                      <button
                        className="px-1.5 py-0.5 rounded text-[10px] bg-ink-700 text-ink-300 hover:bg-ink-600 transition-colors"
                        onClick={() => setConfirmDeleteId(null)}
                      >No</button>
                    </div>
                  ) : (
                    <button
                      className="p-1 rounded text-ink-600 hover:text-red-400 hover:bg-red-400/10 transition-all flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
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
        </div>
      )}

      {/* ── Step 1: File type ─────────────────────────────────────────────────── */}
      <div className="card mb-4">
        <label className="label mb-3">What type of file are you uploading?</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            className={clsx(
              'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
              mode === 'pdf' ? 'border-lime-400/60 bg-lime-400/5' : 'border-ink-700 hover:border-ink-500 bg-ink-800/30'
            )}
            onClick={() => { setMode('pdf'); resetQueue() }}
          >
            <div className="flex items-center gap-2">
              <FileText size={18} className={mode === 'pdf' ? 'text-lime-400' : 'text-ink-400'} />
              <span className={clsx('font-semibold text-sm', mode === 'pdf' ? 'text-lime-400' : 'text-ink-200')}>
                Bank PDF
              </span>
            </div>
            <p className="text-xs text-ink-500 leading-relaxed">
              Your monthly statement PDF. Bank is auto-detected.
            </p>
            <span className="text-[10px] font-mono text-ink-600">Chase · Amex · Bank of America</span>
          </button>

          <button
            className={clsx(
              'flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all',
              mode === 'csv' ? 'border-lime-400/60 bg-lime-400/5' : 'border-ink-700 hover:border-ink-500 bg-ink-800/30'
            )}
            onClick={() => { setMode('csv'); resetQueue() }}
          >
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={18} className={mode === 'csv' ? 'text-lime-400' : 'text-ink-400'} />
              <span className={clsx('font-semibold text-sm', mode === 'csv' ? 'text-lime-400' : 'text-ink-200')}>
                Bank CSV
              </span>
            </div>
            <p className="text-xs text-ink-500 leading-relaxed">
              Transaction export. Works with Amex, BofA, Citi, Capital One, Discover, Chase.
            </p>
            <span className="text-[10px] font-mono text-ink-600">All major banks</span>
          </button>
        </div>

        {mode === 'pdf' && (
          <div className="mt-4 animate-slide-up">
            <BankInstructions banks={PDF_BANKS} title="How to download your statement PDF" />
          </div>
        )}
        {mode === 'csv' && (
          <div className="mt-4 animate-slide-up">
            <BankInstructions banks={CSV_BANKS} title="How to export CSV from your bank" />
          </div>
        )}
      </div>

      {/* ── Step 2: Currency (global for the batch) ──────────────────────────── */}
      {mode && (
        <div className="card mb-4">
          <label className="label">What currency are these statements in?</label>
          <p className="text-xs text-ink-500 mb-3">
            This trip settles in <span className="text-ink-300 font-medium">{baseCurrency}</span>.
            Applies to all files below — set once, upload many.
          </p>
          <select
            className="select mb-3"
            value={statementCurrency}
            onChange={(e) => { setStatementCurrency(e.target.value); setExchangeRate('') }}
            disabled={uploading}
          >
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {rateNeeded && (
            <div className="rounded-lg bg-ink-800/60 border border-ink-700 px-4 py-3 animate-slide-up">
              <label className="block text-xs text-ink-400 mb-2">
                Exchange rate <span className="text-ink-600">(required)</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-xs text-ink-400">1 {statementCurrency} =</span>
                <input
                  type="number" min="0.000001" step="any" placeholder="e.g. 0.74"
                  className="input flex-1 text-sm"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                  disabled={uploading}
                />
                <span className="text-xs text-ink-400">{baseCurrency}</span>
              </div>
              <p className="text-xs text-ink-600 mt-2">
                Google "{statementCurrency} to {baseCurrency}" for the current rate.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Step 3: Drop zone + queue ─────────────────────────────────────────── */}
      {mode && (
        <div className="card mb-4">
          <label className="label mb-3">
            {queue.length === 0
              ? (mode === 'pdf' ? 'Drop your statement PDFs' : 'Drop your transaction CSVs')
              : `${queue.length} file${queue.length !== 1 ? 's' : ''} queued`
            }
          </label>

          {/* Drop zone — always visible so user can keep adding more files */}
          <DropZone
            onFiles={addFiles}
            disabled={uploading}
            accept={mode === 'pdf' ? '.pdf' : '.csv'}
            mode={mode}
          />

          {/* File queue */}
          {queue.length > 0 && (
            <div className="mt-4 space-y-3">
              {queue.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  members={members}
                  onRemove={() => removeItem(item.id)}
                  onSetCardHolder={(v) => setCardHolder(item.id, v)}
                />
              ))}
            </div>
          )}

          {/* Summary after all done */}
          {allFinished && (
            <div className="mt-4 pt-4 border-t border-ink-700 animate-slide-up">
              <div className="flex items-center gap-3 mb-3">
                {successCount > 0 && (
                  <span className="text-sm text-lime-400 font-medium flex items-center gap-1.5">
                    <CheckCircle size={14} />
                    {successCount} imported
                  </span>
                )}
                {errorCount > 0 && (
                  <span className="text-sm text-red-400 font-medium flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    {errorCount} failed
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary flex-1 justify-center"
                  onClick={() => navigate(`/groups/${groupId}/transactions`)}
                >
                  Review Transactions
                  <ArrowRight size={14} />
                </button>
                <button className="btn-secondary" onClick={resetQueue}>
                  Upload More
                </button>
              </div>
              {anySucceeded && <ImportFeedback groupId={groupId} />}
            </div>
          )}
        </div>
      )}

      {/* ── Upload button ─────────────────────────────────────────────────────── */}
      {mode && hasPending && !allFinished && (
        <button
          className="btn-primary w-full justify-center py-3"
          onClick={uploadAll}
          disabled={uploading || !rateValid}
        >
          {uploading ? (
            <>
              <Loader size={15} className="animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <Upload size={15} />
              {queue.filter(i => i.status === 'pending').length > 1
                ? `Upload ${queue.filter(i => i.status === 'pending').length} Statements`
                : `Upload Statement`
              }
            </>
          )}
        </button>
      )}
    </div>
  )
}
