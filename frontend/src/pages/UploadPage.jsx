import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Upload, FileText, CheckCircle, AlertTriangle,
  ArrowRight, ChevronLeft, Info,
} from 'lucide-react'
import clsx from 'clsx'

function DropZone({ onFile, disabled }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file?.type === 'application/pdf') onFile(file)
  }

  return (
    <div
      className={clsx(
        'border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 cursor-pointer',
        dragging ? 'border-lime-400 bg-lime-400/5 drop-zone-active' : 'border-ink-600 hover:border-ink-400 hover:bg-ink-800/30',
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
        accept=".pdf"
        className="hidden"
        onChange={(e) => e.target.files[0] && onFile(e.target.files[0])}
        disabled={disabled}
      />
      <Upload size={36} className="text-ink-500 mx-auto mb-4" strokeWidth={1.5} />
      <p className="font-display text-xl text-ink-200 mb-1">Drop your Chase PDF here</p>
      <p className="text-sm text-ink-500">or click to browse</p>
      <p className="text-xs text-ink-600 mt-3 font-mono">PDF only · Chase credit card statements</p>
    </div>
  )
}

function FilePreview({ file }) {
  const sizeMB = (file.size / 1024 / 1024).toFixed(2)
  return (
    <div className="card-sm flex items-center gap-3">
      <FileText size={20} className="text-lime-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-100 truncate">{file.name}</p>
        <p className="text-xs text-ink-500 font-mono">{sizeMB} MB</p>
      </div>
    </div>
  )
}

export default function UploadPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [cardHolderId, setCardHolderId] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const upload = useMutation({
    mutationFn: () => api.uploadPDF(groupId, file, cardHolderId || null),
    onSuccess: (data) => {
      setResult(data)
      setError(null)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const members = group?.members || []

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back link */}
      <button
        className="btn-ghost mb-6 -ml-2 text-ink-400"
        onClick={() => navigate(`/groups`)}
      >
        <ChevronLeft size={15} />
        Back to Groups
      </button>

      <h1 className="section-title mb-1">Import Statement</h1>
      <p className="text-ink-400 text-sm mb-8">
        Upload a Chase credit card PDF to extract and split transactions
      </p>

      {/* Step 1: Card holder */}
      {members.length > 0 && (
        <div className="card mb-4">
          <label className="label">Who is the card holder?</label>
          <p className="text-xs text-ink-500 mb-3">
            This is the person who pays the credit card bill — all charges are "from" them.
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

      {/* Step 2: File upload */}
      {!result && (
        <div className="card mb-4">
          <label className="label">Statement PDF</label>

          {file ? (
            <div className="space-y-3">
              <FilePreview file={file} />
              <button
                className="btn-ghost text-xs"
                onClick={() => { setFile(null); setResult(null); setError(null) }}
              >
                Change file
              </button>
            </div>
          ) : (
            <DropZone onFile={setFile} disabled={upload.isPending} />
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

      {/* Success result */}
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
              </div>
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
            <button
              className="btn-secondary"
              onClick={() => { setFile(null); setResult(null); setError(null) }}
            >
              Upload Another
            </button>
          </div>
        </div>
      )}

      {/* Upload button */}
      {!result && file && (
        <button
          className="btn-primary w-full justify-center py-3"
          onClick={() => upload.mutate()}
          disabled={upload.isPending || !file}
        >
          {upload.isPending ? (
            <>
              <span className="animate-pulse-soft">Parsing PDF…</span>
            </>
          ) : (
            <>
              <Upload size={15} />
              Import Statement
            </>
          )}
        </button>
      )}

      {/* How it works */}
      <div className="mt-8 card-sm">
        <div className="flex gap-2 mb-2">
          <Info size={14} className="text-ink-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-medium text-ink-400">How it works</p>
        </div>
        <ul className="space-y-1.5 text-xs text-ink-500">
          <li>• We parse the "ACCOUNT ACTIVITY → PURCHASES" section of your Chase statement</li>
          <li>• Each merchant is auto-categorized (dining, groceries, utilities…)</li>
          <li>• Participants are suggested based on category (utilities → everyone, subscriptions → one person)</li>
          <li>• Re-uploading the same PDF won't create duplicate transactions</li>
          <li>• Your PDF never leaves this device — no cloud, no servers</li>
        </ul>
      </div>
    </div>
  )
}
