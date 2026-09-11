import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getActuals, getActualsDetail, updateActuals, getMappingReviewData } from '../api/ingestion'
import { calculateForecast } from '../api/forecast'
import { ActualsGrid } from './ActualsHistory'

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// Grid (one fiscal year of months across) is the working view; List is the
// original period-per-row list. The choice sticks per browser.
const VIEW_KEY = 'ordobook.actualsView'
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid' } catch { return 'grid' } }
const storeView = (v) => { try { localStorage.setItem(VIEW_KEY, v) } catch {} }

export default function ClientWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const [client, setClient] = useState(null)
  const [actuals, setActuals] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMapping, setLoadingMapping] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState(null)
  const [view, setView] = useState(readView)
  const [year, setYear] = useState(null)
  const [details, setDetails] = useState([])       // full records for the selected year
  const [loadingYear, setLoadingYear] = useState(false)

  const load = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([getClient(clientId), getActuals(clientId)])
      setClient(c); setActuals(a)
      // Default to the latest fiscal year that has data (backend orders year, month ASC).
      setYear(prev => prev ?? (a.length ? a[a.length - 1].fiscal_year : null))
    } catch (e) {
      setError(e.message || 'Failed to load actuals')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  // Fetch the selected year's detail records for the grid.
  useEffect(() => {
    if (view !== 'grid' || year === null) return
    const months = actuals.filter(a => a.fiscal_year === year)
    if (months.length === 0) { setDetails([]); return }
    let cancelled = false
    setLoadingYear(true)
    Promise.all(months.map(p => getActualsDetail(clientId, p.fiscal_year, p.month)))
      .then(d => { if (!cancelled) setDetails(d) })
      .catch(e => { if (!cancelled) setError(e.message || 'Failed to load the year') })
      .finally(() => { if (!cancelled) setLoadingYear(false) })
    return () => { cancelled = true }
  }, [clientId, actuals, year, view])

  const years = [...new Set(actuals.map(a => a.fiscal_year))].sort((a, b) => a - b)
  const yearIdx = years.indexOf(year)
  const draftPeriods = actuals.filter(p => p.status === 'draft')

  const switchView = (v) => { setView(v); storeView(v) }

  const handleReviewMapping = async () => {
    setLoadingMapping(true)
    try {
      const preview = await getMappingReviewData(clientId)
      navigate(`/clients/${id}/mapping-review`, {
        state: { preview, sourceFiles: preview.source_files || [] }
      })
    } catch {
      alert('Could not load import data. Try re-importing your QB files.')
    } finally {
      setLoadingMapping(false)
    }
  }

  const handleConfirmAll = async () => {
    setConfirming(true); setError(null)
    try {
      await Promise.all(
        draftPeriods.map(p => updateActuals(clientId, p.fiscal_year, p.month, { status: 'confirmed' }))
      )
      // Re-run the forecast for each affected year — silently skip years with no config.
      const affectedYears = [...new Set(draftPeriods.map(p => p.fiscal_year))]
      await Promise.all(affectedYears.map(y => calculateForecast(clientId, y).catch(() => {})))
      await load()
    } catch (e) {
      setError(e.message || 'Failed to confirm actuals')
    }
    setConfirming(false)
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  const secondaryBtn = 'px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">
            {client?.name}
          </h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            {client?.industry || 'Actuals'}
            {actuals.length > 0 && (
              <> · {actuals.length} period{actuals.length !== 1 ? 's' : ''} imported</>
            )}
            {draftPeriods.length > 0 && (
              <span className="text-accent"> · {draftPeriods.length} pending confirmation</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {actuals.length > 0 && (
            <>
              {draftPeriods.length > 0 && (
                <button
                  onClick={handleConfirmAll}
                  disabled={confirming}
                  className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-[#d4b87a] transition-colors disabled:opacity-50"
                >
                  {confirming ? 'Confirming…' : `Confirm All (${draftPeriods.length})`}
                </button>
              )}
              <div className="flex items-center rounded-lg border border-border overflow-hidden">
                {[['grid', 'Grid'], ['list', 'List View']].map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => switchView(v)}
                    className="px-3 py-2 text-sm font-medium transition-colors"
                    style={view === v
                      ? { background: '#c8a96e', color: '#1a1918' }
                      : { color: '#5a5751', background: 'transparent' }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={handleReviewMapping} disabled={loadingMapping} className={secondaryBtn}>
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

      {error && (
        <div className="mx-8 mt-4 px-4 py-2 rounded text-[12px]"
             style={{ background: 'rgba(192,90,90,0.07)', color: '#b04040', border: '1px solid rgba(192,90,90,0.2)' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {actuals.length === 0 && (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-2xl bg-surface border border-border rounded-xl px-6 py-10 flex flex-col items-center text-center">
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
        </div>
      )}

      {/* Grid view — one fiscal year across */}
      {actuals.length > 0 && view === 'grid' && (
        <>
          <div className="px-8 pt-5 pb-2 flex items-center gap-2">
            <button
              onClick={() => setYear(years[yearIdx - 1])}
              disabled={yearIdx <= 0}
              className="w-7 h-7 rounded border border-border text-text-secondary text-sm hover:text-text-primary disabled:opacity-30"
              aria-label="Previous year"
            >‹</button>
            <select
              value={year ?? ''}
              onChange={e => setYear(Number(e.target.value))}
              className="font-mono text-[13px] bg-surface border border-border rounded px-2 py-1 text-text-primary outline-none"
            >
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => setYear(years[yearIdx + 1])}
              disabled={yearIdx < 0 || yearIdx >= years.length - 1}
              className="w-7 h-7 rounded border border-border text-text-secondary text-sm hover:text-text-primary disabled:opacity-30"
              aria-label="Next year"
            >›</button>
            <span className="ml-2 font-mono text-[11px] text-text-muted">
              {loadingYear ? 'loading…' : `${details.length} month${details.length !== 1 ? 's' : ''} · click a month to open it`}
            </span>
          </div>
          <div className="flex-1 min-h-0 px-8 pb-16 overflow-auto scroll-visible">
            {details.length > 0 && (
              <ActualsGrid
                periods={details}
                onOpenMonth={p => navigate(`/clients/${id}/actuals/${p.fiscal_year}/${p.month}`)}
              />
            )}
          </div>
        </>
      )}

      {/* List view — every period, one per row */}
      {actuals.length > 0 && view === 'list' && (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-2xl">
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Periods
            </h2>
            <div className="grid gap-2">
              {[...actuals].reverse().map(a => (
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
          </div>
        </div>
      )}
    </div>
  )
}
