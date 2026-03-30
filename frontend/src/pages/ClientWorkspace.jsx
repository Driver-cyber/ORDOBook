import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getActuals, getMappingReviewData } from '../api/ingestion'

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function ClientWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [actuals, setActuals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMapping, setLoadingMapping] = useState(false)

  const handleReviewMapping = async () => {
    setLoadingMapping(true)
    try {
      const preview = await getMappingReviewData(id)
      navigate(`/clients/${id}/mapping-review`, {
        state: { preview, sourceFiles: [] }
      })
    } catch {
      alert('Could not load import data. Try re-importing your QB files.')
    } finally {
      setLoadingMapping(false)
    }
  }

  useEffect(() => {
    Promise.all([getClient(id), getActuals(id)])
      .then(([c, a]) => { setClient(c); setActuals(a) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">
            {client?.name}
          </h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            {client?.industry || 'Client workspace'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actuals.length > 0 && (
            <>
              <button
                onClick={() => navigate(`/clients/${id}/actuals/history`)}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors"
              >
                Actuals History
              </button>
              <button
                onClick={handleReviewMapping}
                disabled={loadingMapping}
                className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loadingMapping ? 'Loading…' : 'Review Mapping'}
              </button>
            </>
          )}
          <button
            onClick={() => navigate(`/clients/${id}/upload`)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
          >
            <span className="text-base leading-none">↑</span> Import Data
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl space-y-6">

          {/* Periods */}
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Periods
            </h2>

            {actuals.length === 0 ? (
              <div className="bg-surface border border-border rounded-xl px-6 py-10 flex flex-col items-center text-center">
                <div className="text-text-muted text-3xl mb-3">◎</div>
                <p className="font-display font-semibold text-text-primary mb-1">No data imported yet</p>
                <p className="text-text-muted text-[12px] mb-5">
                  Upload a QuickBooks export to get started.
                </p>
                <button
                  onClick={() => navigate(`/clients/${id}/upload`)}
                  className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
                >
                  Import Data
                </button>
              </div>
            ) : (
              <div className="grid gap-2">
                {actuals.map(a => (
                  <button
                    key={a.id}
                    onClick={() => navigate(`/clients/${id}/actuals/${a.fiscal_year}/${a.month}`)}
                    className="w-full text-left bg-surface border border-border rounded-xl px-5 py-3.5 hover:border-accent/40 hover:bg-surface2 transition-all group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-display font-semibold text-text-primary group-hover:text-accent transition-colors">
                          {MONTH_NAMES[a.month]} {a.fiscal_year}
                        </span>
                        <span className={`ml-3 font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                          a.status === 'confirmed'
                            ? 'text-text-muted border-border'
                            : 'text-[#c8a96e] border-[rgba(200,169,110,0.3)]'
                        }`}>
                          {a.status}
                        </span>
                      </div>
                      <span className="text-text-muted group-hover:text-accent transition-colors">→</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  )
}
