import { Link } from 'react-router-dom'
import { Zap, ArrowLeft } from 'lucide-react'

/**
 * 404 Not Found page — shown when a user hits a route that doesn't exist.
 * On-brand, minimal, always gives them a way back home.
 */
export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-ink-950 flex flex-col items-center justify-center px-6 text-center">
      {/* Logo mark */}
      <div className="w-12 h-12 rounded-2xl bg-lime-400 flex items-center justify-center mb-8">
        <Zap size={20} className="text-ink-950" strokeWidth={2.5} />
      </div>

      {/* Big 404 in display font */}
      <p className="font-display text-[120px] leading-none font-bold text-ink-800 select-none">
        404
      </p>

      <h1 className="mt-2 text-xl font-semibold text-ink-100">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-ink-500 max-w-xs">
        The link you followed might be expired, or this page may have moved.
      </p>

      <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/" className="btn-primary">
          <ArrowLeft size={14} />
          Back to AutoSplit
        </Link>
        <Link to="/split" className="btn-secondary">
          Try the free calculator
        </Link>
      </div>
    </div>
  )
}
