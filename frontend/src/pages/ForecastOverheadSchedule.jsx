import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getOverheadSchedule } from '../api/ingestion'
import { getDrivers, updateDrivers } from '../api/forecast'

// Build one forecast month's Overhead account by account, instead of hard keying
// a single number into the grid.
//
// The accounts are the ones mapped to Overhead on the imported statements, in
// statement order, each with what it ran last month and its year-to-date average
// so the advisor has something to forecast FROM. The inputs sum to the Overhead
// figure on the Forecast.
//
// Typing straight into the Forecast grid still wins — that hard key is stored
// separately and leaves this schedule intact underneath, so clearing the cell
// brings the schedule back (app/engine/overhead.py).

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']
const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const S = {
  bg: '#f5f3ef', surface: '#ffffff', border: '#dedad4', text: '#1a1918',
  textSecondary: '#5a5751', textMuted: '#9a9590', gold: '#c8a96e', goldDim: '#a07a3a',
}

function fmt(cents) {
  if (cents === undefined || cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(cents / 100)
}

// Whole dollars in, cents out. Blank means "no entry", which is not the same as zero.
function AmountInput({ value, onCommit }) {
  const [local, setLocal] = useState(value === null || value === undefined ? '' : String(Math.round(value / 100)))
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setLocal(value === null || value === undefined ? '' : String(Math.round(value / 100)))
  }, [value, editing])

  return (
    <input
      type="number"
      step="1"
      placeholder="—"
      value={local}
      onChange={e => setLocal(e.target.value)}
      onFocus={e => { setEditing(true); e.currentTarget.select() }}
      onBlur={() => {
        setEditing(false)
        const trimmed = local.trim()
        onCommit(trimmed === '' ? null : Math.round((Number(trimmed) || 0) * 100))
      }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-28 text-right font-mono text-[12px] px-2 py-1 rounded outline-none no-spin focus:border-accent"
      style={{ background: S.surface, border: `1px solid ${S.border}`, color: S.text }}
    />
  )
}

export default function ForecastOverheadSchedule() {
  const { id, year, month } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const fiscalYear = Number(year)
  const m = Number(month)

  const [schedule, setSchedule] = useState(null)
  const [config, setConfig] = useState(null)
  const [error, setError] = useState(null)
  const [saveStatus, setSaveStatus] = useState(null)
  const [undoStack, setUndoStack] = useState([])
  const seq = useRef(0)

  useEffect(() => {
    Promise.all([getOverheadSchedule(clientId, fiscalYear), getDrivers(clientId, fiscalYear)])
      .then(([s, c]) => { setSchedule(s); setConfig(c) })
      .catch(e => setError(e.message || 'Could not load the overhead schedule'))
  }, [clientId, fiscalYear])

  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/clients/${id}/workspace/forecast/${fiscalYear}`)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && e.target.tagName !== 'INPUT') goBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const accounts = schedule?.accounts ?? []
  const imported = schedule?.imported_months ?? []
  const detailAll = useMemo(() => config?.overhead_detail_monthly ?? {}, [config])
  const hardAll = useMemo(() => config?.other_overhead_monthly ?? {}, [config])
  const detail = detailAll[String(m)] ?? {}
  const isHardKeyed = Object.prototype.hasOwnProperty.call(hardAll, String(m))
  const isActualMonth = imported.includes(m)

  // What each account ran last month: an imported month reads from the statement,
  // a forecast month reads from the schedule built for it.
  const priorDec = schedule?.prior_december || {}
  const lastMonthOf = (name) => {
    const prev = m - 1
    // January reaches back to December of the prior fiscal year.
    if (prev < 1) return priorDec[name] ?? null
    if (imported.includes(prev)) {
      const acc = accounts.find(a => a.account_name === name)
      return acc?.months?.[String(prev)] ?? 0
    }
    const d = detailAll[String(prev)]
    return d ? (d[name] ?? null) : null
  }
  // Average across the imported (actual) months of this year.
  const ytdAvgOf = (name) => {
    if (imported.length === 0) return null
    const acc = accounts.find(a => a.account_name === name)
    if (!acc) return null
    const sum = imported.reduce((s, mm) => s + (acc.months?.[String(mm)] ?? 0), 0)
    return Math.round(sum / imported.length)
  }

  const scheduleTotal = accounts.reduce((s, a) => s + (detail[a.account_name] ?? 0), 0)
  const filledCount = accounts.filter(a => detail[a.account_name] !== undefined).length

  // ── Saving ────────────────────────────────────────────────────────────────
  // Writing a schedule DELETES this month's hard key so the sum flows through;
  // that is the same "presence, not truthiness" rule COS pinning uses.
  const persist = async (nextDetail, { releaseHardKey = true } = {}) => {
    const mine = ++seq.current
    setSaveStatus('saving')
    const detail_monthly = { ...detailAll }
    if (nextDetail === null || Object.keys(nextDetail).length === 0) delete detail_monthly[String(m)]
    else detail_monthly[String(m)] = nextDetail

    const hard_monthly = { ...hardAll }
    if (releaseHardKey) delete hard_monthly[String(m)]

    // Optimistic: the table should respond immediately, the server confirms.
    setConfig(c => ({ ...c, overhead_detail_monthly: detail_monthly, other_overhead_monthly: hard_monthly }))
    try {
      const saved = await updateDrivers(clientId, fiscalYear, {
        overhead_detail_monthly: detail_monthly,
        other_overhead_monthly: hard_monthly,
      })
      if (mine === seq.current) { setConfig(saved); setSaveStatus('saved'); setTimeout(() => setSaveStatus(s => s === 'saved' ? null : s), 1500) }
    } catch (e) {
      if (mine === seq.current) { setSaveStatus('error'); setError(e.message || 'Save failed') }
    }
  }

  const pushUndo = (label) => setUndoStack(st => [{ label, detail: { ...detail }, at: Date.now() }, ...st].slice(0, 20))

  const setAccount = (name, cents) => {
    if ((detail[name] ?? null) === cents) return
    pushUndo(name)
    const next = { ...detail }
    if (cents === null) delete next[name]
    else next[name] = cents
    persist(next)
  }

  const clearAll = () => {
    if (filledCount === 0) return
    pushUndo('Clear all')
    persist({})
  }

  const fillAverages = () => {
    pushUndo('Fill averages')
    const next = { ...detail }
    accounts.forEach(a => {
      const avg = ytdAvgOf(a.account_name)
      if (avg !== null) next[a.account_name] = avg
    })
    persist(next)
  }

  const undo = () => {
    const top = undoStack[0]
    if (!top) return
    setUndoStack(st => st.slice(1))
    persist(top.detail)
  }

  const useScheduleInstead = () => {
    // Remove the hard key only; the schedule below is already stored.
    persist(detail, { releaseHardKey: true })
  }

  if (error && !schedule) return <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm">{error}</div>
  if (!schedule || !config) return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>

  const th = 'text-right px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted'
  const btn = 'px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={goBack} className="hover:text-text-secondary transition-colors">← Back</button>
            <span>/</span>
            <span className="text-text-secondary">Forecast {fiscalYear}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-xl text-text-primary">
              Overhead Expenses — {MONTH_NAMES[m]} {fiscalYear}
            </h1>
            <span className="font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border text-[#c8a96e] border-[rgba(200,169,110,0.3)]">
              forecast
            </span>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">
            Build this month's Overhead account by account. The total flows to the Forecast.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] min-w-[64px] text-right"
                style={{ color: saveStatus === 'error' ? '#b04040' : S.textMuted }}>
            {saveStatus === 'saving' && 'saving…'}
            {saveStatus === 'saved' && 'saved ✓'}
            {saveStatus === 'error' && 'save failed'}
          </span>
          <button onClick={undo} disabled={undoStack.length === 0} className={btn}
                  title={undoStack[0] ? `Undo: ${undoStack[0].label}` : 'Nothing to undo'}>↶ Undo</button>
          <button onClick={fillAverages} disabled={imported.length === 0} className={btn}
                  title="Copy each account's year-to-date average into this month">Fill averages</button>
          <button onClick={clearAll} disabled={filledCount === 0} className={btn}>Clear all</button>
          <button onClick={() => navigate(`/clients/${id}/workspace/forecast/${fiscalYear}/overhead/${m - 1}`)}
                  disabled={m <= 1} className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="Previous month">‹</button>
          <button onClick={() => navigate(`/clients/${id}/workspace/forecast/${fiscalYear}/overhead/${m + 1}`)}
                  disabled={m >= 12} className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30"
                  aria-label="Next month">›</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl space-y-4">

          {isActualMonth && (
            <div className="px-4 py-3 rounded-xl text-[12px]"
                 style={{ background: 'rgba(0,0,0,0.03)', border: `1px solid ${S.border}` }}>
              <span className="text-text-primary font-medium">{MONTH_NAMES[m]} is a confirmed actual.</span>{' '}
              <span className="text-text-secondary">
                Its Overhead comes from the imported statement, so anything entered here is ignored
                until the month becomes a forecast again.
              </span>{' '}
              <button onClick={() => navigate(`/clients/${id}/actuals/${fiscalYear}/overhead/${m}`)}
                      className="underline hover:text-text-primary">See the imported accounts →</button>
            </div>
          )}

          {isHardKeyed && (
            <div className="px-4 py-3 rounded-xl text-[12px] flex items-start justify-between gap-4"
                 style={{ background: 'rgba(200,169,110,0.10)', border: '1px solid rgba(200,169,110,0.35)' }}>
              <div>
                <div className="font-medium text-text-primary mb-0.5">
                  A typed figure of {fmt(hardAll[String(m)])} is overriding this schedule
                </div>
                <div className="text-text-secondary">
                  Someone entered Overhead straight into the Forecast grid for {MONTH_ABBR[m]}. The
                  schedule below is kept, it just isn't being used. Editing any line here switches
                  back to the schedule.
                </div>
              </div>
              <button onClick={useScheduleInstead} className={btn}>Use the schedule</button>
            </div>
          )}

          {accounts.length === 0 ? (
            <div className="bg-surface border border-border rounded-xl px-6 py-8 text-center">
              <p className="font-display font-semibold text-text-primary mb-1">No overhead accounts yet</p>
              <p className="text-text-muted text-[12px]">
                The accounts come from imported statements. Import a Profit &amp; Loss for {fiscalYear}
                {' '}and map its accounts to Overhead Expenses.
              </p>
            </div>
          ) : (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface2/50">
                    <th className="text-left px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                      Account
                    </th>
                    <th className={th}>
                      {m > 1
                        ? `${MONTH_ABBR[m - 1]} ${String(fiscalYear).slice(2)}`
                        : (schedule?.prior_december_label || 'Last Month')}
                    </th>
                    <th className={th} title={`Average of ${imported.length} imported month${imported.length === 1 ? '' : 's'}`}>
                      YTD Avg ({imported.length})
                    </th>
                    <th className={th}>{MONTH_ABBR[m]} Forecast</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(acc => (
                    <tr key={acc.account_name} className="border-b border-border/50 hover:bg-surface2/40 transition-colors">
                      <td className="px-5 py-2 text-[12px] text-text-secondary">
                        <span className="inline-flex items-center gap-2">
                          {acc.account_name}
                          {acc.from_other_section && (
                            <span title={`Mapped to Overhead from the ${acc.section} section`}
                                  className="font-mono text-[8px] uppercase tracking-widest text-[#8a6d2e] border border-[rgba(200,169,110,0.45)] rounded px-1">
                              {acc.section}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-[12px] text-text-muted">{fmt(lastMonthOf(acc.account_name))}</td>
                      <td className="px-4 py-2 text-right font-mono text-[12px] text-text-muted">{fmt(ytdAvgOf(acc.account_name))}</td>
                      <td className="px-4 py-2 text-right">
                        <AmountInput value={detail[acc.account_name] ?? null}
                                     onCommit={cents => setAccount(acc.account_name, cents)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-surface2/40">
                    <td className="px-5 py-3 text-[12px] font-semibold text-text-secondary">
                      Total Overhead Expenses
                      <span className="block text-[10px] font-normal text-text-muted">
                        {filledCount} of {accounts.length} accounts entered
                      </span>
                    </td>
                    <td />
                    <td />
                    <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-text-primary">
                      {fmt(scheduleTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-text-muted">
            {isHardKeyed
              ? `The Forecast shows the typed ${fmt(hardAll[String(m)])} for ${MONTH_ABBR[m]}, not this total.`
              : filledCount === 0
                ? `Nothing entered yet, so ${MONTH_ABBR[m]} Overhead reads $0 on the Forecast.`
                : `${MONTH_ABBR[m]} Overhead on the Forecast reads ${fmt(scheduleTotal)}, carrying a Σ badge.`}
            {' '}A blank line is not zero — it simply has no entry.
          </p>
        </div>
      </div>
    </div>
  )
}
