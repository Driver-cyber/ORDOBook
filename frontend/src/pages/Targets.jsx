import { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getTargets, saveTargets, saveTargetNote } from '../api/targets'

// Metrics in UI display order.
// computed=true: value is derived from driver inputs — shown read-only.
// hasPercentToggle=true: field can be entered as $ or % of revenue.
const METRICS = [
  // Operations — inputs that drive Revenue
  { key: 'total_jobs',            label: 'Total Jobs',             type: 'count', section: 'Operations', computed: false },
  { key: 'blended_avg_job_value', label: 'Avg Job Value',          type: 'cents', section: 'Operations', computed: false },
  { key: 'revenue',               label: 'Revenue',                type: 'cents', section: 'Operations', computed: true },
  // P&L
  // hasPercentToggle rows can be viewed (and, when editable, entered) as a % of
  // Revenue. On computed rows the toggle is display-only. Toggling switches the
  // target, prior-year and forecast columns together so they stay comparable —
  // each column uses its OWN revenue as the denominator.
  { key: 'cost_of_sales',         label: 'Cost of Sales',          type: 'cents', section: 'P&L', computed: false, hasPercentToggle: true },
  { key: 'gross_profit',          label: 'Gross Profit',           type: 'cents', section: 'P&L', computed: true,  hasPercentToggle: true },
  { key: 'payroll_expenses',      label: 'Payroll Expenses',       type: 'cents', section: 'P&L', computed: false, hasPercentToggle: true },
  { key: 'marketing_expenses',    label: 'Marketing Expenses',     type: 'cents', section: 'P&L', computed: false, hasPercentToggle: true },
  { key: 'overhead_expenses',     label: 'Overhead Expenses',      type: 'cents', section: 'P&L', computed: false, hasPercentToggle: true },
  { key: 'net_operating_profit',  label: 'Net Operating Profit',   type: 'cents', section: 'P&L', computed: true },
  { key: 'other_income_expense',  label: 'Other Income / Expense', type: 'cents', section: 'P&L', computed: false },
  { key: 'net_profit',            label: 'Net Profit',             type: 'cents', section: 'P&L', computed: true,  hasPercentToggle: true },
  // Cash Flow — driver order mirrors the reference workbook: asset-side drivers,
  // then liability-side, then owner. Money drivers are SIGNED CASH AMOUNTS:
  // a purchase/repayment is entered negative because it reduces cash.
  { key: 'dso_days',                    label: 'DSO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'dio_days',                    label: 'DIO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'cf_other_current_assets',     label: 'Sale or (Purchase) of Other Current Assets',          type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'cf_fixed_assets',             label: 'Sale or (Purchase) of Other Long-Term & Fixed Assets', type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'dpo_days',                    label: 'DPO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'cf_current_debt',             label: 'Additions or (Repayments) to Other Current Debt',     type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'cf_long_term_debt',           label: 'Additions or (Repayments) to Long-Term Debt',         type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'owner_total_draws',           label: 'Investments or (Draws) by Owner',                     type: 'cents', section: 'Cash Flow', computed: false },
  // Computed roll-ups. Asset/liability change rows absorb both the working-capital
  // effect of DSO/DIO/DPO and the explicit drivers above, so the documented
  // Net CF formula stays intact:
  //   Net CF = Net Profit + Owner Investments/(Draws) + CF: Asset Changes + CF: Liability Changes
  { key: 'cf_assets_change',      label: 'CF: Asset Changes',      type: 'cents', section: 'Cash Flow', computed: true },
  { key: 'cf_liabilities_change', label: 'CF: Liability Changes',  type: 'cents', section: 'Cash Flow', computed: true },
  { key: 'net_cash_flow',         label: 'Net Cash Flow',          type: 'cents', section: 'Cash Flow', computed: true },
]

const SECTIONS = ['Operations', 'P&L', 'Cash Flow']

// How many committed edits the Undo dropdown keeps (session memory only).
const UNDO_LIMIT = 20

/**
 * Per-metric advisor note: a two-line box that autosaves, with an expand button
 * for anything longer. The expanded panel is anchored over the Notes column only,
 * so the metric name and the three data columns stay readable behind it.
 *
 * Autosave is debounced rather than per-keystroke — one request per character
 * would hammer the API for no benefit. Also flushes on blur so clicking away
 * always persists.
 */
// Expanded-note panel size; used to keep it fully inside the viewport.
const PANEL_WIDTH = 340
const PANEL_HEIGHT = 260

function NoteCell({ value, onSave }) {
  const [text, setText] = useState(value ?? '')
  const [expanded, setExpanded] = useState(false)
  const [status, setStatus] = useState('idle') // idle | saving | saved
  const [anchor, setAnchor] = useState(null)
  const timer = useRef(null)
  const lastSaved = useRef(value ?? '')
  const wrapRef = useRef(null)

  // The table card is `rounded-xl overflow-hidden`, which clips absolutely
  // positioned children — the panel's lower half (and its close button) got cut
  // off. Position it `fixed` against the cell's measured rect instead, which
  // escapes the clip entirely. Re-measure on scroll/resize so it tracks the row.
  useEffect(() => {
    if (!expanded) return
    const measure = () => {
      if (wrapRef.current) setAnchor(wrapRef.current.getBoundingClientRect())
    }
    measure()
    const onKey = (e) => { if (e.key === 'Escape') setExpanded(false) }
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
      window.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  // Adopt external changes (year switch, reload) without clobbering in-progress typing.
  useEffect(() => {
    setText(value ?? '')
    lastSaved.current = value ?? ''
  }, [value])

  const flush = useCallback(async (next) => {
    if (next === lastSaved.current) return
    setStatus('saving')
    try {
      await onSave(next)
      lastSaved.current = next
      setStatus('saved')
      setTimeout(() => setStatus('idle'), 1200)
    } catch {
      setStatus('idle')
    }
  }, [onSave])

  function handleChange(next) {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => flush(next), 600)
  }

  function handleBlur() {
    if (timer.current) clearTimeout(timer.current)
    flush(text)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  return (
    <div className="relative" ref={wrapRef}>
      <div className="flex items-start gap-1">
        <textarea
          rows={2}
          value={text}
          onChange={e => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Note…"
          className="w-full resize-none bg-transparent border border-transparent hover:border-border focus:border-accent focus:outline-none rounded px-1.5 py-1 text-xs text-text-primary placeholder:text-text-muted transition-colors"
        />
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          title={expanded ? 'Collapse note' : 'Expand note'}
          className="mt-1 shrink-0 text-text-muted hover:text-text-primary text-xs leading-none px-1"
        >
          {expanded ? '✕' : '⤢'}
        </button>
      </div>

      {status !== 'idle' && (
        <div className="absolute -bottom-3 right-6 text-[9px] text-text-muted">
          {status === 'saving' ? 'saving…' : 'saved'}
        </div>
      )}

      {expanded && anchor && createPortal(
        <>
          {/* Click-anywhere-else to close, so there's always a way out even if
              the panel itself ends up somewhere unexpected. */}
          <div className="fixed inset-0 z-30" onClick={() => setExpanded(false)} />
          <div
            className="fixed z-40 bg-surface border border-accent rounded-lg shadow-xl p-2"
            style={{
              // Anchored to the Notes cell and grown leftward, so it covers the
              // Notes column rather than the metric name or the data columns.
              // Clamped so the whole panel — Close button included — stays on
              // screen even for a row near the bottom of the viewport.
              top: Math.max(8, Math.min(anchor.top, window.innerHeight - PANEL_HEIGHT - 8)),
              left: Math.max(8, anchor.right - PANEL_WIDTH),
              width: PANEL_WIDTH,
            }}
          >
            <textarea
              autoFocus
              rows={8}
              value={text}
              onChange={e => handleChange(e.target.value)}
              onBlur={handleBlur}
              placeholder="Why this target?"
              className="w-full resize-none bg-transparent focus:outline-none text-xs text-text-primary placeholder:text-text-muted"
            />
            <div className="flex justify-between items-center pt-1 border-t border-border">
              <span className="text-[9px] text-text-muted">Autosaves · Esc to close</span>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-[10px] text-text-muted hover:text-text-primary px-1"
              >
                Close
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}

const SECTION_LABELS = {
  Operations: 'Operations (Drivers → Revenue)',
  'P&L': 'P&L',
  'Cash Flow': 'Cash Flow',
}

// cents → display dollars with commas, no decimals
function centsToDisplay(cents) {
  if (cents === null || cents === undefined) return ''
  return Math.round(cents / 100).toLocaleString()
}

// Parse dollar input string → cents integer
function parseToCents(str) {
  const cleaned = String(str).replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return Math.round(num * 100)
}

// Parse plain integer input → integer
function parseCount(str) {
  const cleaned = String(str).replace(/[,\s]/g, '')
  if (cleaned === '') return null
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

// Format a comparison column value (prior year or forecast)
function fmtComparison(val, type) {
  if (val === null || val === undefined) return '—'
  if (type === 'days') return String(val)
  if (type === 'count') return Number(val).toLocaleString()
  return `$${Math.round(val / 100).toLocaleString()}`
}

// Format a balance sheet dollar value (already in cents)
function fmtDollars(cents) {
  if (cents === null || cents === undefined || cents === 0) return '$0'
  const abs = Math.abs(Math.round(cents / 100))
  return (cents < 0 ? '-$' : '$') + abs.toLocaleString()
}

// Format a signed change value (cents) with +/- prefix
function fmtChange(cents) {
  if (!cents) return '—'
  const abs = Math.abs(Math.round(cents / 100))
  return (cents >= 0 ? '+$' : '-$') + abs.toLocaleString()
}

// Derived values (Revenue, Gross Profit, Net Cash Flow, the projected balance
// sheet…) are computed server-side in app/engine/targets.py — the single source
// of truth the Scoreboard also grades against — and arrive on every response.

export default function Targets() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [client, setClient] = useState(null)
  // Driver inputs: key → display string (what user typed)
  const [inputs, setInputs] = useState({})
  // metric key → advisor note text, loaded with the targets
  const [notes, setNotes] = useState({})
  // Per-metric display/entry mode: metric key → 'dollar' | 'pct'. Absent = 'dollar'.
  const [pctModes, setPctModes] = useState({})
  const modeOf = (key) => pctModes[key] ?? 'dollar'
  // Comparison data from API
  const [priorYearActuals, setPriorYearActuals] = useState({})
  const [forecastSummary, setForecastSummary] = useState({})
  const [priorEndingBalances, setPriorEndingBalances] = useState({})
  // Autosave replaces the Save button. committedRef is the last-persisted
  // display string per field; undoStack holds one entry per committed edit,
  // newest first, capped at UNDO_LIMIT and cleared on reload / year switch.
  const [undoStack, setUndoStack] = useState([])
  const [undoOpen, setUndoOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const committedRef = useRef({})
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  // Server-derived values; refreshed on load and after every committed edit.
  // Computed rows update on commit (blur / Enter / Tab), not while typing.
  const [derived, setDerived] = useState({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setUndoStack([])
    setUndoOpen(false)
    setPctModes({})
    try {
      const [c, t] = await Promise.all([getClient(id), getTargets(id, year)])
      setClient(c)
      setPriorYearActuals(t.prior_year_actuals ?? {})
      setForecastSummary(t.current_year_forecast ?? {})
      setPriorEndingBalances(t.prior_year_ending_balances ?? {})
      setDerived(t.derived ?? {})

      // Populate driver inputs only (computed metrics are re-derived on the fly)
      const driverKeys = new Set(METRICS.filter(m => !m.computed).map(m => m.key))
      const inputMap = {}
      for (const item of t.targets) {
        if (!driverKeys.has(item.metric_key)) continue
        if (item.target_type === 'cents') {
          inputMap[item.metric_key] = centsToDisplay(item.target_value)
        } else {
          inputMap[item.metric_key] = String(item.target_value)
        }
      }
      setInputs(inputMap)
      committedRef.current = { ...inputMap }

      // Notes load for every metric, including computed ones — you can annotate
      // a derived row even though you can't type a target into it.
      const noteMap = {}
      for (const item of t.targets) {
        if (item.notes) noteMap[item.metric_key] = item.notes
      }
      setNotes(noteMap)
    } catch {
      // No targets yet — fine
    } finally {
      setLoading(false)
    }
  }, [id, year])

  useEffect(() => { loadData() }, [loadData])

  function handleChange(key, value) {
    setInputs(prev => ({ ...prev, [key]: value }))
  }

  // Switch a metric between dollar and % of Revenue. For editable rows the typed
  // value is converted in place so the underlying amount doesn't change; computed
  // rows have nothing to convert (the toggle only affects how they're displayed).
  function handleModeToggle(metricKey, newMode, isComputed) {
    if (newMode === modeOf(metricKey)) return
    const rev = derived.revenue

    if (!isComputed && rev > 0) {
      let converted = null
      if (newMode === 'pct') {
        // 2 decimals on the editable value: at 1 decimal a $ -> % -> $ round trip
        // drifts ~$160 on a $525k revenue base, which looks like the app silently
        // changed the target. Read-only columns still display 1 decimal.
        const cents = parseToCents(inputs[metricKey] ?? '') ?? 0
        converted = (cents / rev * 100).toFixed(2)
      } else {
        const pct = parseFloat(String(inputs[metricKey] ?? '').replace(/[%,\s]/g, ''))
        if (!isNaN(pct)) converted = Math.round(Math.round(rev * pct / 100) / 100).toLocaleString()
      }
      if (converted !== null) {
        setInputs(prev => ({ ...prev, [metricKey]: converted }))
        // Same amount, new representation — the committed baseline follows it
        // so the toggle itself never shows up as an undoable edit.
        committedRef.current[metricKey] = converted
      }
    }

    setPctModes(prev => ({ ...prev, [metricKey]: newMode }))
  }

  // Notes persist on their own endpoint, so this never commits pending target
  // edits. Local state updates first so the box doesn't flicker back on save.
  const handleNoteSave = useCallback(async (metricKey, next) => {
    setNotes(prev => ({ ...prev, [metricKey]: next }))
    await saveTargetNote(id, year, metricKey, next)
  }, [id, year])

  // Render a comparison-column value, honouring the row's current mode. Each
  // column divides by its OWN revenue so the three columns stay comparable.
  function fmtColumn(value, metric, revenueBase) {
    if (metric.hasPercentToggle && modeOf(metric.key) === 'pct') {
      if (value === null || value === undefined || !revenueBase) return '—'
      return `${(value / revenueBase * 100).toFixed(1)}%`
    }
    return fmtComparison(value, metric.type)
  }

  // ── Autosave + undo ──────────────────────────────────────────────────────
  // Every target — drivers AND the computed rows the Scoreboard grades against —
  // is persisted together on each commit, so a driver change always ripples
  // into the stored Revenue / Gross Profit / Net Cash Flow. Built from explicit
  // inputs + modes snapshots rather than the memoised `derived`, so undo can
  // persist a restored state in the same tick it sets it.
  function buildTargetPayload(inp, modes) {
    // Drivers only. Computed metrics are derived server-side from these and
    // come back on the response; they are never sent or stored.
    const targets = []
    for (const metric of METRICS) {
      if (metric.computed) continue
      const raw = inp[metric.key] ?? ''
      if (raw.trim() === '') continue
      let val, ttype
      if (metric.hasPercentToggle && (modes[metric.key] ?? 'dollar') === 'pct') {
        // Typed as % of revenue: resolve to cents against the latest derived
        // revenue (refreshed on every commit, so a jobs edit lands first).
        const pct = parseFloat(String(raw).replace(/[%,\s]/g, ''))
        val = isNaN(pct) ? null : Math.round((derived.revenue || 0) * pct / 100)
        ttype = 'cents'
      } else if (metric.type === 'count' || metric.type === 'days') {
        val = parseCount(raw)
        ttype = metric.type
      } else {
        val = parseToCents(raw)
        ttype = 'cents'
      }
      if (val === null || val === undefined || isNaN(val)) continue
      targets.push({ metric_key: metric.key, target_value: val, target_type: ttype })
    }
    return targets
  }

  async function persist(inp, modes) {
    setSaving(true)
    setSaveStatus('saving')
    try {
      const resp = await saveTargets(id, year, buildTargetPayload(inp, modes))
      setDerived(resp.derived ?? {})
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 1200)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }

  // Commit one field — called on blur, Enter or Tab. One undo entry per commit,
  // the Excel model: each cell edit is one step. Typing alone never saves.
  function commitField(metric) {
    const key = metric.key
    const next = inputs[key] ?? ''
    const prev = committedRef.current[key] ?? ''
    if (next === prev) return
    committedRef.current[key] = next
    setUndoStack(stack =>
      [{ key, label: metric.label, prev, next, mode: modeOf(key), at: Date.now() }, ...stack]
        .slice(0, UNDO_LIMIT)
    )
    persist(inputs, pctModes)
  }

  // Undo the newest `count` entries. Picking an item in the dropdown undoes it
  // and everything above it, like Excel. Each entry also restores the $/% mode
  // it was entered under, so a value is never reinterpreted under another mode.
  function undo(count = 1) {
    const entries = undoStack.slice(0, count)
    if (entries.length === 0) return
    const nextInputs = { ...inputs }
    const nextModes = { ...pctModes }
    for (const e of entries) {
      nextInputs[e.key] = e.prev
      nextModes[e.key] = e.mode
      committedRef.current[e.key] = e.prev
    }
    setInputs(nextInputs)
    setPctModes(nextModes)
    setUndoStack(stack => stack.slice(count))
    setUndoOpen(false)
    persist(nextInputs, nextModes)
  }

  const hasPriorEnding = Object.keys(priorEndingBalances).length > 0
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/clients/${id}`)}
              className="text-text-muted hover:text-text-primary transition-colors text-sm"
            >
              {client?.name}
            </button>
            <span className="text-text-muted text-sm">/</span>
            <h1 className="font-display font-bold text-xl text-text-primary">Targets</h1>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">Annual targets per KPI — used to grade the Scoreboard</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  y === year ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          {/* Autosave status + Excel-style undo. Edits commit on blur/Enter/Tab;
              the main button undoes the last one, the caret lists recent edits
              and picking one undoes it plus everything above it. */}
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-text-muted min-w-[64px] text-right">
              {saveStatus === 'saving' && 'saving…'}
              {saveStatus === 'saved' && 'saved ✓'}
              {saveStatus === 'error' && <span className="text-[#c05a5a]">save failed</span>}
            </span>
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => undo(1)}
                disabled={undoStack.length === 0 || saving}
                title={undoStack[0] ? `Undo: ${undoStack[0].label}` : 'Nothing to undo'}
                className="px-3 py-2 rounded-l-lg border border-border bg-surface text-text-secondary text-sm font-medium hover:text-text-primary hover:border-text-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ↶ Undo
              </button>
              <button
                type="button"
                onClick={() => setUndoOpen(o => !o)}
                disabled={undoStack.length === 0}
                aria-label="Show recent edits"
                className="px-2 py-2 rounded-r-lg border border-l-0 border-border bg-surface text-text-muted text-xs hover:text-text-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                ▾
              </button>

              {undoOpen && undoStack.length > 0 && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setUndoOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 z-40 w-80 bg-surface border border-border rounded-lg shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-border font-mono text-[10px] uppercase tracking-widest text-text-muted">
                      Recent edits — click to undo through
                    </div>
                    <ul className="max-h-72 overflow-y-auto">
                      {undoStack.map((e, i) => (
                        <li key={e.at + e.key}>
                          <button
                            type="button"
                            onClick={() => undo(i + 1)}
                            title={i === 0 ? 'Undo this edit' : `Undo this and the ${i} newer edit${i > 1 ? 's' : ''}`}
                            className="w-full text-left px-3 py-2 text-[12px] hover:bg-surface-subtle border-b border-border/40 last:border-b-0 transition-colors"
                          >
                            <div className="text-text-primary font-medium">{e.label}</div>
                            <div className="font-mono text-[11px] text-text-muted">
                              {e.prev || '—'}{e.mode === 'pct' ? '%' : ''} → {e.next || '—'}{e.mode === 'pct' ? '%' : ''}
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl space-y-8">
          {/* KPI sections */}
          {SECTIONS.map(section => {
            const metrics = METRICS.filter(m => m.section === section)
            return (
              <section key={section}>
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
                  {SECTION_LABELS[section]}
                </h2>
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[26%]">
                          Metric
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[22%]">
                          {year} Target
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[16%]">
                          {year - 1} Actual
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[16%]">
                          {year} Forecast
                        </th>
                        <th className="text-left px-3 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[20%]">
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((metric, i) => {
                        const isLast = i === metrics.length - 1
                        const canPct = !!metric.hasPercentToggle
                        const isPct = canPct && modeOf(metric.key) === 'pct'

                        return (
                          <tr
                            key={metric.key}
                            className={[
                              !isLast ? 'border-b border-border' : '',
                              metric.computed ? 'bg-[rgba(0,0,0,0.02)]' : '',
                            ].join(' ')}
                          >
                            {/* Metric label */}
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                {metric.computed && (
                                  <span className="font-mono text-[10px] text-text-muted">=</span>
                                )}
                                <span className={`text-sm font-medium ${metric.computed ? 'text-text-secondary' : 'text-text-primary'}`}>
                                  {metric.label}
                                </span>
                              </div>
                            </td>

                            {/* Target — editable input or computed display */}
                            <td className="px-5 py-3 text-right">
                              {metric.computed ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* Display-only $ / % toggle on computed rows */}
                                  {canPct && (
                                    <div className="flex items-center rounded overflow-hidden border border-border">
                                      {['dollar', 'pct'].map(mode => (
                                        <button
                                          key={mode}
                                          onClick={() => handleModeToggle(metric.key, mode, true)}
                                          className={`px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                                            modeOf(metric.key) === mode
                                              ? 'bg-accent text-bg'
                                              : 'text-text-muted hover:text-text-secondary bg-transparent'
                                          }`}
                                        >
                                          {mode === 'dollar' ? '$' : '%'}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  <span className="font-mono text-sm text-text-secondary">
                                    {isPct
                                      ? (derived.revenue > 0
                                          ? `${(derived[metric.key] / derived.revenue * 100).toFixed(1)}%`
                                          : '—')
                                      : (
                                        <>
                                          {metric.type === 'cents' && (
                                            <span className="text-text-muted text-xs mr-0.5">$</span>
                                          )}
                                          {centsToDisplay(derived[metric.key]) || '—'}
                                        </>
                                      )}
                                  </span>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* COS $ / % toggle */}
                                  {canPct && (
                                    <div className="flex items-center rounded overflow-hidden border border-border">
                                      {['dollar', 'pct'].map(mode => (
                                        <button
                                          key={mode}
                                          onClick={() => handleModeToggle(metric.key, mode, metric.computed)}
                                          className={`px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                                            modeOf(metric.key) === mode
                                              ? 'bg-accent text-bg'
                                              : 'text-text-muted hover:text-text-secondary bg-transparent'
                                          }`}
                                        >
                                          {mode === 'dollar' ? '$' : '%'}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* Currency prefix */}
                                  {metric.type === 'cents' && !isPct && (
                                    <span className="text-text-muted text-sm">$</span>
                                  )}
                                  {isPct && (
                                    <span className="text-text-muted text-sm">%</span>
                                  )}
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={inputs[metric.key] ?? ''}
                                    placeholder="0"
                                    onChange={e => handleChange(metric.key, e.target.value)}
                                    onFocus={e => e.target.select()}
                                    onBlur={() => commitField(metric)}
                                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                                    className="w-28 text-right bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none py-0.5 font-mono text-sm text-text-primary placeholder:text-text-muted transition-colors"
                                  />
                                </div>
                              )}
                            </td>

                            {/* Prior year actual — as % of prior year's own revenue */}
                            <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                              {fmtColumn(priorYearActuals[metric.key], metric, priorYearActuals.revenue)}
                            </td>

                            {/* Current year forecast — as % of forecast revenue */}
                            <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                              {fmtColumn(forecastSummary[metric.key], metric, forecastSummary.revenue)}
                            </td>

                            {/* Advisor note — autosaves on its own endpoint, separate from targets */}
                            <td className="px-3 py-2 align-top">
                              <NoteCell
                                value={notes[metric.key] ?? ''}
                                onSave={next => handleNoteSave(metric.key, next)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}

          {/* Projected Balance Sheet */}
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Projected Balance Sheet (year-end)
            </h2>

            {!hasPriorEnding ? (
              <div className="bg-surface border border-border rounded-xl px-6 py-8 text-center">
                <p className="text-text-muted text-sm">
                  Import and confirm December {year - 1} actuals to enable projected balance sheet.
                </p>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[40%]">
                        Account
                      </th>
                      {/* Current year first — matches the column order of the
                          Operations / P&L / Cash Flow tables above. */}
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        {year} Projected
                      </th>
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        {year - 1} Ending
                      </th>
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Cash', hint: 'Prior cash + Net Cash Flow',
                        prior: derived.prior_cash, projected: derived.projected_cash },
                      { label: 'Accounts Receivable', hint: `Revenue / 365 × ${parseCount(inputs.dso_days ?? '') ?? 0} DSO days`,
                        prior: derived.prior_ar, projected: derived.target_ar },
                      { label: 'Inventory', hint: `COS / 365 × ${parseCount(inputs.dio_days ?? '') ?? 0} DIO days`,
                        prior: derived.prior_inventory, projected: derived.target_inventory },
                      { label: 'Other Current Assets', hint: 'Prior balance − sale/(purchase) driver',
                        prior: derived.prior_other_current_assets, projected: derived.proj_other_current_assets },
                      { label: 'Total Current Assets', kind: 'subtotal',
                        prior: derived.prior_total_current_assets, projected: derived.total_current_assets },
                      { label: 'Fixed Assets', hint: 'Prior balance − sale/(purchase) driver',
                        prior: derived.prior_fixed_assets, projected: derived.proj_fixed_assets },
                      { label: 'Other Long-Term Assets', hint: 'Held at prior balance',
                        prior: derived.prior_other_long_term_assets, projected: derived.proj_other_long_term_assets },
                      { label: 'Total Assets', kind: 'subtotal',
                        prior: derived.prior_total_assets, projected: derived.total_assets },
                      { label: 'Accounts Payable', hint: `COS / 365 × ${parseCount(inputs.dpo_days ?? '') ?? 0} DPO days`,
                        prior: derived.prior_ap, projected: derived.target_ap },
                      { label: 'Other Current Liabilities', hint: 'Prior balance + additions/(repayments) driver',
                        prior: derived.prior_other_current_liabilities, projected: derived.proj_other_current_liabilities },
                      { label: 'Total Current Liabilities', kind: 'subtotal',
                        prior: derived.prior_total_current_liabilities, projected: derived.total_current_liabilities },
                      { label: 'Long-Term Liabilities', hint: 'Prior balance + additions/(repayments) driver',
                        prior: derived.prior_long_term_liabilities, projected: derived.proj_long_term_liabilities },
                      { label: 'Total Liabilities', kind: 'subtotal',
                        prior: derived.prior_total_liabilities, projected: derived.total_liabilities },
                      { label: 'Equity', hint: 'Prior equity + Net Profit + Investments/(Draws)',
                        prior: derived.prior_equity, projected: derived.projected_equity },
                      { label: 'Total Liabilities & Equity', kind: 'check',
                        hint: 'Should equal Total Assets',
                        prior: derived.prior_total_liabilities_equity, projected: derived.total_liabilities_equity },
                    ].map(({ label, hint, prior, projected, kind }, i, arr) => {
                      const change = projected - prior
                      const isLast = i === arr.length - 1
                      const isSubtotal = kind === 'subtotal' || kind === 'check'
                      // Tie-out: a balanced sheet has Total L&E === Total Assets.
                      const balanced = kind === 'check'
                        ? projected === derived.total_assets
                        : null
                      return (
                        <tr
                          key={label}
                          className={[
                            !isLast ? 'border-b border-border' : '',
                            isSubtotal ? 'bg-surface-subtle' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <td className="px-5 py-3">
                            <div className={`text-sm text-text-primary ${isSubtotal ? 'font-semibold' : 'font-medium'}`}>
                              {label}
                              {balanced === true && <span className="ml-2 text-[10px] text-text-muted">✓ balanced</span>}
                              {balanced === false && (
                                <span className="ml-2 text-[10px] text-red-600">
                                  ✕ off by {fmtDollars(projected - derived.total_assets)}
                                </span>
                              )}
                            </div>
                            {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
                          </td>
                          <td className={`px-5 py-3 text-right font-mono text-sm ${isSubtotal ? 'text-text-primary font-semibold' : 'text-text-secondary font-medium'}`}>
                            {fmtDollars(projected)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                            {fmtDollars(prior)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                            {fmtChange(change)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Summary P&L — the projected year at a glance, beneath the balance sheet */}
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Summary P&amp;L ({year} target)
            </h2>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <tbody>
                  {[
                    { label: 'Income', value: derived.revenue },
                    { label: 'Cost of Sales', value: derived.cost_of_sales },
                    { label: 'Gross Profit', value: derived.gross_profit, kind: 'subtotal' },
                    { label: 'Total Expenses', value: derived.total_operating_expenses,
                      hint: 'Payroll + Marketing + Overhead' },
                    { label: 'Other Income / (Expense)', value: derived.other_income_expense },
                    { label: 'Net Income', value: derived.net_profit, kind: 'subtotal' },
                  ].map(({ label, value, hint, kind }, i, arr) => {
                    const isSubtotal = kind === 'subtotal'
                    return (
                      <tr
                        key={label}
                        className={[
                          i !== arr.length - 1 ? 'border-b border-border' : '',
                          isSubtotal ? 'bg-surface-subtle' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className="px-5 py-3 w-[40%]">
                          <div className={`text-sm text-text-primary ${isSubtotal ? 'font-semibold' : 'font-medium'}`}>
                            {label}
                          </div>
                          {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono text-sm ${isSubtotal ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                          {fmtDollars(value)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-text-muted text-[11px]">
            Rows marked <span className="font-mono">=</span> are computed from driver inputs.
            Cost of Sales can be entered as an annual dollar amount or as a % of the Revenue target.
            DSO/DIO/DPO targets drive the working capital cash flow impact and projected balance sheet.
            Targets are annual totals — the Scoreboard prorates by months elapsed when grading YTD.
          </p>
        </div>
      </div>
    </div>
  )
}
