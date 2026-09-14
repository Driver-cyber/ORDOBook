import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getOverheadSchedule } from '../api/ingestion'

// The accounts behind one month's Overhead figure.
//
// Overhead is the direct sum of the accounts mapped to it, so this screen is that
// line's audit trail: open the number, see what it is made of. Read-only — it
// reports what was imported. The Forecast overhead schedule reuses this same
// payload for its Last Month and YTD Avg columns and adds an input per account.

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmt(cents) {
  if (cents === undefined || cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

export default function OverheadSchedule() {
  const { id, year, month } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const fiscalYear = Number(year)
  const m = Number(month)

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getOverheadSchedule(clientId, fiscalYear)
      .then(setData)
      .catch(e => setError(e.message || 'Could not load the overhead schedule'))
  }, [clientId, fiscalYear])

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/clients/${id}/workspace`)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') goBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm">{error}</div>
  if (!data) return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>

  const imported = data.imported_months || []
  const recon = data.reconciliation?.[String(m)]
  const priorMonth = [...imported].filter(x => x < m).pop() ?? null
  // Year-to-date average per account: the imported months up to and including
  // this one. Early in the year that is a short run — the count is shown so the
  // average is never mistaken for a full-year figure.
  const ytdMonths = imported.filter(x => x <= m)

  // January reaches back to December of the prior fiscal year for its comparison.
  const priorDec = data.prior_december || {}
  const usePriorDec = priorMonth === null && Object.keys(priorDec).length > 0
  const amount = (acc, mm) => (mm === null ? null : acc.months?.[String(mm)] ?? 0)
  const lastMonthOf = (acc) =>
    usePriorDec ? (priorDec[acc.account_name] ?? null) : amount(acc, priorMonth)
  const ytdAvg = (acc) => {
    if (ytdMonths.length === 0) return null
    const sum = ytdMonths.reduce((s, mm) => s + (acc.months?.[String(mm)] ?? 0), 0)
    return Math.round(sum / ytdMonths.length)
  }

  const rows = data.accounts || []
  const thisTotal = rows.reduce((s, a) => s + (amount(a, m) ?? 0), 0)
  const priorTotal = (priorMonth === null && !usePriorDec)
    ? null
    : rows.reduce((s, a) => s + (lastMonthOf(a) ?? 0), 0)
  const avgTotal = ytdMonths.length === 0 ? null : rows.reduce((s, a) => s + (ytdAvg(a) ?? 0), 0)

  const monthsWithData = imported.length > 0
  const isImported = imported.includes(m)
  const prevAvailable = imported.some(x => x < m) || m > 1
  const nextAvailable = m < 12

  const th = 'text-right px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={goBack} className="hover:text-text-secondary transition-colors">← Back</button>
            <span>/</span>
            <span className="text-text-secondary">Actuals {fiscalYear}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-xl text-text-primary">
              Overhead Expenses — {MONTH_NAMES[m]} {fiscalYear}
            </h1>
            <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border text-text-muted border-border">
              actuals
            </span>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">
            The accounts behind the Overhead line. Every account counts once, in exactly one category.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(`/clients/${id}/actuals/${fiscalYear}/overhead/${m - 1}`)}
                  disabled={!prevAvailable || m <= 1}
                  className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="Previous month">‹</button>
          <button onClick={() => navigate(`/clients/${id}/actuals/${fiscalYear}/overhead/${m + 1}`)}
                  disabled={!nextAvailable}
                  className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="Next month">›</button>
          {isImported && (
            <button onClick={() => navigate(`/clients/${id}/actuals/${fiscalYear}/${m}`)}
                    className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors">
              Month detail →
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!monthsWithData ? (
          <div className="max-w-md bg-surface border border-border rounded-xl px-6 py-8 text-center">
            <p className="font-display font-semibold text-text-primary mb-1">Nothing imported for {fiscalYear}</p>
            <p className="text-text-muted text-[12px]">Import a Profit &amp; Loss export to see the accounts behind overhead.</p>
          </div>
        ) : !isImported ? (
          <div className="max-w-md bg-surface border border-border rounded-xl px-6 py-8 text-center">
            <p className="font-display font-semibold text-text-primary mb-1">{MONTH_NAMES[m]} {fiscalYear} isn't imported</p>
            <p className="text-text-muted text-[12px]">
              Imported months this year: {imported.map(x => MONTH_ABBR[x]).join(', ')}.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl space-y-4">
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface2/50">
                    <th className="text-left px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                      Account
                    </th>
                    <th className={th}>{MONTH_ABBR[m]} {String(fiscalYear).slice(2)}</th>
                    <th className={th}>
                      {priorMonth
                        ? `${MONTH_ABBR[priorMonth]} ${String(fiscalYear).slice(2)}`
                        : usePriorDec ? data.prior_december_label : 'Last Month'}
                    </th>
                    <th className={th} title={`Average of ${ytdMonths.length} imported month${ytdMonths.length === 1 ? '' : 's'}`}>
                      YTD Avg ({ytdMonths.length})
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={4} className="px-5 py-6 text-center text-[12px] text-text-muted">
                      No accounts are mapped to Overhead Expenses.
                    </td></tr>
                  )}
                  {rows.map(acc => (
                    <tr key={acc.account_name} className="border-b border-border/50 hover:bg-surface2/40 transition-colors">
                      <td className="px-5 py-2.5 text-[12px] text-text-secondary">
                        <span className="inline-flex items-center gap-2">
                          {acc.account_name}
                          {acc.from_other_section && (
                            <span title={`Mapped to Overhead from the ${acc.section} section of the statement`}
                                  className="font-mono text-[8px] uppercase tracking-widest text-[#8a6d2e] border border-[rgba(200,169,110,0.45)] rounded px-1">
                              {acc.section}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-text-primary">{fmt(amount(acc, m))}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-text-muted">{fmt(lastMonthOf(acc))}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-[12px] text-text-muted">{fmt(ytdAvg(acc))}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface2/40">
                    <td className="px-5 py-3 text-[12px] font-semibold text-text-secondary">Total Overhead Expenses</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-text-primary">{fmt(thisTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-text-secondary">{fmt(priorTotal)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-text-secondary">{fmt(avgTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Does the schedule equal the figure stored on the month? */}
            {recon && (recon.difference === 0 ? (
              <p className="text-[11px] text-text-muted">
                Ties to the Overhead figure on {MONTH_NAMES[m]}: {fmt(recon.stored_total)}.
              </p>
            ) : (
              <div className="px-4 py-3 rounded-xl text-[12px]"
                   style={{ background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.35)' }}>
                <div className="font-medium text-text-primary mb-1">
                  This schedule is {fmt(Math.abs(recon.difference))} {recon.difference > 0 ? 'below' : 'above'} the stored figure
                </div>
                <div className="text-text-secondary">
                  Stored on the month: {fmt(recon.stored_total)} · from these accounts: {fmt(recon.schedule_total)}.
                  The stored total predates the current mapping. Run <strong>Re-apply Mapping</strong> on the
                  Actuals tab to bring it in line.
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
