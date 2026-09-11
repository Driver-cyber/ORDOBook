import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForecastView, createDrivers, updateDrivers, calculateForecast } from '../api/forecast'

// How many committed edits the Undo dropdown keeps (session memory only).
const UNDO_LIMIT = 20

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const fmt = (cents) => {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const fmtPct = (v) => (v === null || v === undefined || v === 0) ? '—' : `${Number(v).toFixed(1)}%`

const S = {
  bg: '#f5f3ef',
  surface: '#ffffff',
  border: '#dedad4',
  text: '#1a1918',
  textSecondary: '#5a5751',
  textMuted: '#9a9590',
  gold: '#c8a96e',
  goldDim: '#a07a3a',
  actualsText: '#b0aba5',
  actualsBg: 'transparent',
}

// Month header cells pin to the top of the grid's scroll box. Opaque so rows
// slide under them; the inset shadow stands in for the row's bottom border.
const stickyTh = {
  position: 'sticky', top: 0, zIndex: 5,
  background: S.bg, boxShadow: `inset 0 -1px 0 ${S.border}`,
}

// ── Static formula descriptions for derived fields ────────────────────────────

const DERIVED_FORMULAS = {
  gross_profit: 'Revenue − Cost of Sales',
  total_other_expenses: 'Marketing + Depreciation + Overhead',
  net_operating_profit: 'Gross Profit − Total Expenses',
  net_profit: 'Net Op Profit + Other Inc/Exp',
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

function Tooltip({ content, children }) {
  const [show, setShow] = useState(false)
  if (!content) return <>{children}</>
  return (
    <span
      className="relative inline-block cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          className="absolute z-50 bottom-full right-0 mb-1.5 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap pointer-events-none"
          style={{
            background: '#2a2724',
            color: '#e8e4de',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {content}
        </span>
      )}
    </span>
  )
}

// ── Shared input style ────────────────────────────────────────────────────────

const inputStyle = {
  background: '#ffffff',
  border: `1px solid #dedad4`,
  color: '#1a1918',
}

// ── Editable input cell (per-month) ──────────────────────────────────────────
// Money cells REST on the compact figure the totals use ($14.9k) and switch to
// the full number the moment they take focus, so a five-digit entry never shows
// as three digits in a narrow column. Rows without a `display` (job counts,
// days) are plain numbers and never need the compact form.

function DriverInput({ value, display, onChange, onCommit, step = 1, placeholder = '0' }) {
  const [local, setLocal] = useState(String(value ?? ''))
  const [editing, setEditing] = useState(false)
  const ref = useRef(null)
  useEffect(() => setLocal(String(value ?? '')), [value])
  // Select the full number once the cell has switched into edit mode.
  useEffect(() => { if (editing && ref.current) ref.current.select() }, [editing])

  const resting = display !== undefined && !editing
  return (
    <input
      ref={ref}
      type={resting ? 'text' : 'number'}
      readOnly={resting}
      min="0"
      step={step}
      placeholder={placeholder}
      value={resting ? display : local}
      onChange={e => { if (resting) return; setLocal(e.target.value); onChange(e.target.value) }}
      onFocus={e => { e.currentTarget.style.borderColor = S.gold; setEditing(true); if (display === undefined) e.currentTarget.select() }}
      onBlur={e => { e.currentTarget.style.borderColor = S.border; setEditing(false); if (onCommit) onCommit() }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none no-spin"
      style={inputStyle}
    />
  )
}

function EditCell(props) {
  return (
    <td className="px-1 py-1" style={{ minWidth: 58 }}>
      <DriverInput {...props} />
    </td>
  )
}

// ── Actuals cell — dimmed but readable, not locked ────────────────────────────

function ActualsCell({ display }) {
  return (
    <td className="text-right px-2 py-1.5 font-mono text-[12px]"
        style={{ color: S.actualsText, minWidth: 58 }}>
      {display}
    </td>
  )
}

// ── Autofill button ───────────────────────────────────────────────────────────

function AutofillBtn({ onFill }) {
  return (
    <td className="px-1" style={{ width: 22 }}>
      <button
        title="Copy first month across all months"
        onClick={onFill}
        className="w-5 h-5 rounded flex items-center justify-center text-[10px] transition-opacity opacity-40 hover:opacity-100"
        style={{ background: 'rgba(200,169,110,0.15)', color: S.goldDim, border: `1px solid rgba(200,169,110,0.35)` }}
      >
        →
      </button>
    </td>
  )
}

// ── Driver row — per-month editable cells, with autofill ─────────────────────
// actualsMonths: Set of month numbers that have real actuals (shown dimmed, still editable)

// $ | % switch for money rows. Purely a view/entry mode — nothing about how the
// value is stored changes. Matches the toggle on the Targets page.
function ModeToggle({ mode = 'dollar', onChange }) {
  return (
    <span className="inline-flex rounded overflow-hidden" style={{ border: `1px solid ${S.border}` }}>
      {['dollar', 'pct'].map(md => (
        <button
          key={md} type="button" onClick={() => onChange(md)}
          className="px-1.5 py-0.5 font-mono text-[10px] transition-colors"
          style={mode === md ? { background: S.gold, color: '#1a1918' } : { color: S.textMuted, background: 'transparent' }}
        >
          {md === 'dollar' ? '$' : '%'}
        </button>
      ))}
    </span>
  )
}

// compact: money rows — editable cells rest on the same compact figure as actuals cells.
function DriverRow({ label, monthInts, actualsMonths = new Set(), getValue, getDisplay, onChange, onCommit, onAutofill, ytd, mode, onToggleMode, compact = false }) {
  // Find the first non-actuals month for autofill source
  const firstForecastMonth = monthInts.find(m => !actualsMonths.has(m))

  const handleAutofill = () => {
    if (firstForecastMonth === undefined) return
    const sourceVal = getValue(firstForecastMonth)
    // Handled by the parent so the whole-row fill is a single undoable action
    // and still skips months that have confirmed actuals.
    if (onAutofill) onAutofill(sourceVal, label)
  }

  return (
    <tr>
      <AutofillBtn onFill={handleAutofill} />
      <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary, width: 210 }}>
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{label}</span>
          {onToggleMode && <span className="shrink-0"><ModeToggle mode={mode} onChange={onToggleMode} /></span>}
        </span>
      </td>
      {monthInts.map(m =>
        actualsMonths.has(m)
          ? <ActualsCell key={m} display={getDisplay ? getDisplay(m) : '—'} />
          : <EditCell key={m} value={getValue(m)} display={compact && getDisplay ? getDisplay(m) : undefined} step={mode === 'pct' ? 0.1 : 1} onChange={v => onChange(m, v)} onCommit={() => onCommit && onCommit(m, label)} />
      )}
      <td className="text-right px-2 py-1.5 font-mono text-[12px]"
          style={{ color: S.textMuted }}>
        {ytd ?? '—'}
      </td>
    </tr>
  )
}

// ── Calculated summary row ────────────────────────────────────────────────────

function CalcRow({ label, periods, field, fields, highlight = false, sublabel, format = fmt, mode, onToggleMode }) {
  const getVal = (p) => fields
    ? fields.reduce((s, f) => s + (p?.[f] ?? 0), 0)
    : (p?.[field] ?? 0)
  const total = (periods || []).reduce((s, p) => s + getVal(p), 0)
  const color = highlight ? S.gold : S.textSecondary
  // Display-only % of that month's revenue; the YTD cell is Σ value / Σ revenue.
  const isPct = mode === 'pct'
  const totalRev = (periods || []).reduce((s, p) => s + (p?.revenue ?? 0), 0)
  const cellText = (p) => {
    if (!isPct) return format(getVal(p))
    if (!p || !(p.revenue > 0)) return '—'
    return fmtPct(getVal(p) / p.revenue * 100)
  }
  const totalText = isPct
    ? (totalRev > 0 ? fmtPct(total / totalRev * 100) : '—')
    : format(total)

  const getTooltip = (p) => {
    if (!p) return null
    if (p.source_type === 'actual') return 'Confirmed actual'
    if (fields) return fields.map(f => {
      if (f === 'payroll_expenses') return 'Payroll'
      if (f === 'total_other_expenses') return 'Other Expenses'
      return f
    }).join(' + ')
    if (DERIVED_FORMULAS[field]) return DERIVED_FORMULAS[field]
    return p.calc_trace?.[field]?.formula ?? null
  }

  return (
    <tr style={{ borderTop: `1px solid ${S.border}` }}>
      <td /> {/* autofill column spacer */}
      <td className="px-3 py-2 text-[12px] font-semibold" style={{ color, width: 210 }}>
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>{label}</span>
          {onToggleMode && <span className="shrink-0"><ModeToggle mode={mode} onChange={onToggleMode} /></span>}
        </span>
        {sublabel && <span className="block text-[10px] font-normal" style={{ color: S.textMuted }}>{sublabel}</span>}
      </td>
      {(periods || []).map((p, i) => (
        <td key={i} className="text-right px-2 py-2 font-mono text-[12px] font-semibold"
            style={{ color, minWidth: 58 }}>
          <Tooltip content={getTooltip(p)}>
            {cellText(p)}
          </Tooltip>
        </td>
      ))}
      <td className="text-right px-2 py-2 font-mono text-[12px] font-semibold" style={{ color }}>
        {totalText}
      </td>
    </tr>
  )
}

// Job counts are plain integers, not cents — fmt() would render them as currency.
const fmtCount = (n) => (n === null || n === undefined) ? '—' : Number(n).toLocaleString()

// ── Sub-section label ─────────────────────────────────────────────────────────

function SubHeader({ label }) {
  return (
    <tr>
      <td colSpan={15} className="px-3 pt-3 pb-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: '#9a9590', opacity: 0.7 }}>
          {label}
        </span>
      </td>
    </tr>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionHeader({ label }) {
  return (
    <tr>
      <td colSpan={15} className="px-3 pt-6 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em]"
             style={{ color: S.textMuted }}>
          {label}
        </div>
        <div style={{ borderBottom: `1px solid ${S.border}`, marginTop: 4 }} />
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ForecastDrivers() {
  const { id, year } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const fiscalYear = Number(year)

  const [config, setConfig] = useState(null)
  const [periods, setPeriods] = useState([])
  const [draft, setDraft] = useState(null)
  // Autosave + undo. Edits commit on blur/Enter/Tab and each commit both saves
  // and recalculates (the drivers PUT recalculates server-side). committedRef
  // is the last-persisted config; undoStack holds one entry per commit at
  // field (12-month dict) granularity so an autofill is a single step.
  const [undoStack, setUndoStack] = useState([])
  // Per-row $/% view+entry mode for money rows. Session state, like Targets.
  const [rowModes, setRowModes] = useState({})
  const [undoOpen, setUndoOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState('idle') // idle | saving | saved | error
  const committedRef = useRef({})
  const seqRef = useRef(0)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  // Months that have real actuals — shown dimmed but still editable
  const actualsMonths = new Set(
    (periods || []).filter(p => p.source_type === 'actual').map(p => p.month)
  )

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await getForecastView(clientId, fiscalYear)
      adopt(data.config, data.periods)
    } catch (e) {
      if (e.message.includes('404') || e.message.includes('not found')) {
        try {
          const newConfig = await createDrivers(clientId, fiscalYear, {})
          adopt(newConfig, [])
          // Auto-run calculation so any existing actuals populate immediately
          const calculated = await calculateForecast(clientId, fiscalYear).catch(() => null)
          if (calculated) {
            const fresh = await getForecastView(clientId, fiscalYear)
            adopt(fresh.config, fresh.periods)
          } else {
            setPeriods([])
          }
        } catch (e2) { setError(e2.message) }
      } else { setError(e.message) }
    } finally { setLoading(false) }
  }, [clientId, fiscalYear])

  useEffect(() => { load() }, [load])

  // Server config -> local state, resetting the undo baseline. Used on load
  // and after Sync Actuals (a deliberate reset from imported data).
  function adopt(cfg, prds) {
    setConfig(cfg); setDraft(cfg); setPeriods(prds)
    committedRef.current = JSON.parse(JSON.stringify(cfg))
    setUndoStack([]); setUndoOpen(false)
  }

  // Live edit: keeps the cell showing what's typed. Not a commit.
  const setMonthField = (field, month, rawVal, scale = 1) => {
    const n = Number(rawVal) || 0
    if (field === 'cos_pct_monthly') {
      // $ entry pins the month to that amount; % entry sets the % and releases it.
      setDraft(prev => {
        const pct = { ...(prev.cos_pct_monthly || {}) }
        const fixed = { ...(prev.cos_fixed_monthly || {}) }
        if (modeOf(field) === 'dollar') fixed[String(month)] = Math.round(n * 100)
        else { pct[String(month)] = n; delete fixed[String(month)] }
        return { ...prev, cos_pct_monthly: pct, cos_fixed_monthly: fixed }
      })
      return
    }
    let val
    if (scale === 100 && modeOf(field) === 'pct') {
      // Entered as % of this month's revenue — store the cents it resolves to.
      val = Math.round(revAt(month) * n / 100)
    } else {
      val = n * scale
    }
    setDraft(prev => ({ ...prev, [field]: { ...(prev[field] || {}), [String(month)]: val } }))
  }

  const fmtV = (v, scale) => scale === 100 ? fmt(v ?? 0) : String(v ?? 0)
  const sameDict = (a = {}, b = {}) => {
    for (let m = 1; m <= 12; m++) if (Number(a[m] || 0) !== Number(b[m] || 0)) return false
    return true
  }

  // Save + recalculate. Only the computed rows are refreshed from the response;
  // the draft is left alone so a save landing mid-typing can't wipe the next
  // cell, and a sequence counter drops stale responses on fast Tab-through.
  async function persist(nextDraft) {
    const seq = ++seqRef.current
    setSaving(true); setSaveStatus('saving'); setError(null)
    try {
      await updateDrivers(clientId, fiscalYear, nextDraft)
      const view = await getForecastView(clientId, fiscalYear)
      if (seq !== seqRef.current) return
      setConfig(view.config); setPeriods(view.periods)
      setSaveStatus('saved'); setTimeout(() => setSaveStatus(st => st === 'saved' ? 'idle' : st), 1200)
    } catch (e) {
      if (seq === seqRef.current) { setSaveStatus('error'); setError(e.message) }
    } finally {
      if (seq === seqRef.current) setSaving(false)
    }
  }

  function pushUndo(entry) {
    setUndoStack(stack => [{ ...entry, at: Date.now() }, ...stack].slice(0, UNDO_LIMIT))
  }

  // One cell committed (blur / Enter / Tab). One undo entry per commit.
  function commitMonthField(field, month, label, scale = 1) {
    if (field === 'cos_pct_monthly') {
      const prevPct = committedRef.current.cos_pct_monthly || {}
      const prevFixed = committedRef.current.cos_fixed_monthly || {}
      const pct = draft.cos_pct_monthly || {}
      const fixed = draft.cos_fixed_monthly || {}
      if (sameDict(prevPct, pct) && sameFixed(prevFixed, fixed)) return
      committedRef.current.cos_pct_monthly = { ...pct }
      committedRef.current.cos_fixed_monthly = { ...fixed }
      const mk = String(month)
      const shown = mk in fixed ? `${fmt(fixed[mk])} (pinned)` : `${pct[mk] ?? 0}%`
      pushUndo({ label: `${label} · ${MONTHS[month - 1]} → ${shown}`,
                 fields: { cos_pct_monthly: { ...prevPct }, cos_fixed_monthly: { ...prevFixed } } })
      persist(draft)
      return
    }
    const prev = committedRef.current[field] || {}
    const next = draft[field] || {}
    if (sameDict(prev, next)) return
    committedRef.current[field] = { ...next }
    pushUndo({
      field,
      label: `${label} · ${MONTHS[month - 1]}: ${fmtV(prev[month], scale)} → ${fmtV(next[month], scale)}`,
      prev: { ...prev },
    })
    persist(draft)
  }

  // Row autofill: copy the first forecast month across the remaining forecast
  // months, skipping confirmed actuals. One undo entry for the whole row.
  const autofillField = (field, val, label, scale = 1) => {
    const n = Number(val) || 0
    if (field === 'cos_pct_monthly') {
      const pct = { ...(draft.cos_pct_monthly || {}) }
      const fixed = { ...(draft.cos_fixed_monthly || {}) }
      const dollar = modeOf(field) === 'dollar'
      for (let m = 1; m <= 12; m++) {
        if (actualsMonths.has(m)) continue
        if (dollar) fixed[String(m)] = Math.round(n * 100)
        else { pct[String(m)] = n; delete fixed[String(m)] }
      }
      const prevPct = committedRef.current.cos_pct_monthly || {}
      const prevFixed = committedRef.current.cos_fixed_monthly || {}
      if (sameDict(prevPct, pct) && sameFixed(prevFixed, fixed)) return
      const nextDraft = { ...draft, cos_pct_monthly: pct, cos_fixed_monthly: fixed }
      setDraft(nextDraft)
      committedRef.current.cos_pct_monthly = { ...pct }
      committedRef.current.cos_fixed_monthly = { ...fixed }
      pushUndo({ label: `${label} · fill row → ${dollar ? fmt(n * 100) + ' (pinned)' : n + '%'}`,
                 fields: { cos_pct_monthly: { ...prevPct }, cos_fixed_monthly: { ...prevFixed } } })
      persist(nextDraft)
      return
    }
    const filled = { ...(draft[field] || {}) }
    const pctEntry = scale === 100 && modeOf(field) === 'pct'
    for (let m = 1; m <= 12; m++) {
      if (actualsMonths.has(m)) continue
      filled[String(m)] = pctEntry ? Math.round(revAt(m) * n / 100) : n * scale
    }
    const prev = committedRef.current[field] || {}
    if (sameDict(prev, filled)) return
    const nextDraft = { ...draft, [field]: filled }
    setDraft(nextDraft)
    committedRef.current[field] = { ...filled }
    const shown = pctEntry ? `${n}%` : fmtV(filled[String(1)], scale)
    pushUndo({ field, label: `${label} · fill row → ${shown}`, prev: { ...prev } })
    persist(nextDraft)
  }

  // Undo the newest `count` entries — picking an item in the list undoes it and
  // everything above it, like Excel. Restores the whole field dict per entry.
  function undo(count = 1) {
    const entries = undoStack.slice(0, count)
    if (entries.length === 0) return
    const nextDraft = { ...draft }
    for (const e of entries) {
      const restore = e.fields ?? { [e.field]: e.prev }
      for (const [fld, prev] of Object.entries(restore)) {
        nextDraft[fld] = { ...prev }
        committedRef.current[fld] = { ...prev }
      }
    }
    setDraft(nextDraft)
    setUndoStack(stack => stack.slice(count))
    setUndoOpen(false)
    persist(nextDraft)
  }

  const handleSyncActuals = async () => {
    setSyncing(true); setError(null)
    try {
      await calculateForecast(clientId, fiscalYear)
      const updated = await getForecastView(clientId, fiscalYear)
      adopt(updated.config, updated.periods)
    } catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: S.textMuted }}>Loading forecast…</span>
      </main>
    )
  }

  const monthInts = Array.from({ length: 12 }, (_, i) => i + 1)
  const periodByMonth = Object.fromEntries((periods || []).map(p => [p.month, p]))
  const orderedPeriods = monthInts.map(m => periodByMonth[m] ?? null)

  // Draft value helpers
  const dv = (field, month) => draft?.[field]?.[String(month)] ?? 0
  const dvFloat = (field, month) => {
    const v = draft?.[field]?.[String(month)]
    return (v !== null && v !== undefined) ? v : ''
  }

  // Actuals-derived display for COS %
  // ── $ / % of revenue ──────────────────────────────────────────────────────
  // The denominator is the engine's revenue for that month: actual revenue on
  // actuals months, jobs × avg value on forecast months. COS defaults to % since
  // that's its native unit; every other money row defaults to $.
  const modeOf = f => rowModes[f] ?? (f === 'cos_pct_monthly' ? 'pct' : 'dollar')
  const setMode = (f, md) => setRowModes(prev => ({ ...prev, [f]: md }))
  const revAt = m => periodByMonth[m]?.revenue ?? 0
  const pctOfRev = (cents, m) => revAt(m) > 0 ? cents / revAt(m) * 100 : null
  // Editable value for a money row under its mode: whole dollars, or % (1dp).
  // `fallback` covers rows that still read an older non-monthly field when the
  // monthly one is empty.
  const viewValue = (f, m, fallback = 0) => {
    const cents = dv(f, m) || fallback
    return modeOf(f) === 'pct' ? (pctOfRev(cents, m) ?? 0).toFixed(1) : Math.round(cents / 100)
  }
  // Read-only (actuals month) display under the row's mode.
  const viewDisplay = (f, m, fallback = 0) => {
    const cents = dv(f, m) || fallback
    if (modeOf(f) !== 'pct') return fmt(cents)
    const pct = pctOfRev(cents, m)
    return pct === null ? '—' : `${pct.toFixed(1)}%`
  }
  // Actuals months on the cash-flow driver rows: the engine derives the balance
  // sheet deltas (other current assets, current debt, long-term debt) from the
  // imported statements and stores them on the period — show those, under the
  // row's $/% mode, not the driver's (meaningless) value. Capex and owner draws
  // are NOT derived for actuals months yet (see NEXT-SESSION), so they read "—".
  const periodDisplay = (f, periodField, m) => {
    const p = periodByMonth[m]
    if (!p || p[periodField] === null || p[periodField] === undefined) return '—'
    const cents = p[periodField]
    if (modeOf(f) !== 'pct') return fmt(cents)
    const pct = pctOfRev(cents, m)
    return pct === null ? '—' : `${pct.toFixed(1)}%`
  }
  // COS is STORED as a % of revenue. In $ mode we show/enter the dollars it
  // resolves to at that month's revenue.
  // A month with a fixed $ entry is PINNED: it shows that amount (or the % it
  // implies) and does not move with revenue. Entering a % releases the pin.
  const cosFixed = m => {
    const v = draft?.cos_fixed_monthly?.[String(m)]
    return (v === null || v === undefined) ? null : Number(v)
  }
  const cosView = m => {
    const fx = cosFixed(m)
    if (modeOf('cos_pct_monthly') === 'pct') {
      if (fx !== null) return revAt(m) > 0 ? +(fx / revAt(m) * 100).toFixed(1) : ''
      return dvFloat('cos_pct_monthly', m)
    }
    if (fx !== null) return Math.round(fx / 100)
    return Math.round(revAt(m) * (Number(dv('cos_pct_monthly', m)) || 0) / 100 / 100)
  }
  // Resting text for a forecast COS cell: the % it carries, or the $ it resolves to.
  const cosRestDisplay = m => {
    if (modeOf('cos_pct_monthly') === 'pct') {
      const v = cosView(m)
      return v === '' ? '—' : `${Number(v).toFixed(1)}%`
    }
    return fmt(cosView(m) * 100)
  }
  // COS commits touch two dicts (pct + fixed); compare both, presence-sensitive
  // for the fixed one because a pinned $0 is not the same as no pin.
  const sameFixed = (a = {}, b = {}) =>
    JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort())

  const actualsCosDisplay = (month) => {
    const p = periodByMonth[month]
    if (!p || p.revenue === 0) return '—'
    if (modeOf('cos_pct_monthly') === 'dollar') return fmt(p.cost_of_sales)
    return fmtPct(p.cost_of_sales / p.revenue * 100)
  }

  return (
    <main className="flex-1 flex flex-col overflow-hidden" style={{ background: S.bg }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-xl" style={{ color: S.text }}>Forecast</h1>
          <p className="text-[12px] mt-0.5" style={{ color: S.textMuted }}>
            {fiscalYear} · Dimmed months have confirmed actuals · → copies first month across the row
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] min-w-[72px] text-right" style={{ color: saveStatus === 'error' ? '#b04040' : S.textMuted }}>
            {saveStatus === 'saving' && 'saving…'}
            {saveStatus === 'saved' && 'saved ✓'}
            {saveStatus === 'error' && 'save failed'}
          </span>
          <button
            onClick={() => navigate(`/clients/${id}/reports/forecast/${year}`)}
            className="px-4 py-1.5 rounded text-[12px] font-medium border transition-colors"
            style={{ borderColor: S.border, color: S.textSecondary, background: S.surface }}
          >
            View Report →
          </button>
          <button
            onClick={handleSyncActuals}
            disabled={syncing || saving}
            title="Re-run engine from imported actuals — fixes any months where actuals were overwritten"
            className="px-4 py-1.5 rounded text-[12px] font-medium border transition-opacity"
            style={{ borderColor: S.border, color: S.textSecondary, background: S.surface, opacity: (syncing || saving) ? 0.6 : 1 }}
          >
            {syncing ? 'Syncing…' : '↻ Sync Actuals'}
          </button>
          {/* Edits save and recalculate on blur/Enter/Tab, so there's no
              Recalculate button. Undo reverts the last committed edit; the caret
              lists recent edits and picking one undoes it and everything newer. */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => undo(1)}
              disabled={undoStack.length === 0 || saving || syncing}
              title={undoStack[0] ? `Undo: ${undoStack[0].label}` : 'Nothing to undo'}
              className="px-3 py-1.5 rounded-l text-[12px] font-medium border transition-opacity"
              style={{ borderColor: S.border, color: S.textSecondary, background: S.surface, opacity: (undoStack.length === 0 || saving || syncing) ? 0.5 : 1 }}
            >
              ↶ Undo
            </button>
            <button
              type="button"
              onClick={() => setUndoOpen(o => !o)}
              disabled={undoStack.length === 0}
              aria-label="Show recent edits"
              className="px-2 py-1.5 rounded-r text-[11px] border border-l-0 transition-opacity"
              style={{ borderColor: S.border, color: S.textMuted, background: S.surface, opacity: undoStack.length === 0 ? 0.5 : 1 }}
            >
              ▾
            </button>
            {undoOpen && undoStack.length > 0 && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setUndoOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-40 w-96 rounded-lg overflow-hidden"
                     style={{ background: S.surface, border: `1px solid ${S.border}`, boxShadow: '0 12px 32px rgba(0,0,0,0.12)' }}>
                  <div className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
                       style={{ color: S.textMuted, borderBottom: `1px solid ${S.border}` }}>
                    Recent edits — click to undo through
                  </div>
                  <ul className="max-h-72 overflow-y-auto">
                    {undoStack.map((e, i) => (
                      <li key={e.at + (e.field ?? 'cos')}>
                        <button
                          type="button"
                          onClick={() => undo(i + 1)}
                          title={i === 0 ? 'Undo this edit' : `Undo this and the ${i} newer edit${i > 1 ? 's' : ''}`}
                          className="w-full text-left px-3 py-2 text-[12px] transition-colors hover:bg-[rgba(0,0,0,0.03)]"
                          style={{ color: S.text, borderBottom: `1px solid ${S.border}` }}
                        >
                          {e.label}
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

      {error && (
        <div className="mx-8 mb-4 px-4 py-2 rounded text-[12px]"
             style={{ background: 'rgba(192,90,90,0.07)', color: '#b04040', border: '1px solid rgba(192,90,90,0.2)' }}>
          {error}
        </div>
      )}

      {/* The grid is its own scroll box (both axes) so the month header can pin to
          its top while the page title and buttons stay put above it. */}
      <div className="flex-1 min-h-0 px-8 pb-16 overflow-auto scroll-visible">
        <table
          className="w-full border-collapse"
          style={{ minWidth: 980 }}
          onKeyDown={e => {
            if (e.key !== 'Tab') return
            const table = e.currentTarget
            const inputs = Array.from(table.querySelectorAll('input[type="number"]'))
            const idx = inputs.indexOf(e.target)
            if (idx === -1) return
            const td = e.target.closest('td')
            const tr = td?.closest('tr')
            if (!td || !tr) return
            const colIdx = Array.from(tr.cells).indexOf(td)
            const colInputs = inputs.filter(inp => {
              const t = inp.closest('td'); const r = t?.closest('tr')
              return t && r && Array.from(r.cells).indexOf(t) === colIdx
            })
            const pos = colInputs.indexOf(e.target)
            const next = e.shiftKey ? colInputs[pos - 1] : colInputs[pos + 1]
            if (next) { e.preventDefault(); next.focus(); next.select() }
          }}
        >
          <thead>
            {/* Sticky cells, not a sticky row: with border-collapse a row's border
                doesn't travel, so the rule is drawn as an inset shadow on each cell. */}
            <tr>
              <th style={{ ...stickyTh, width: 22 }} /> {/* autofill button column */}
              <th className="text-left px-3 py-2 text-[11px] font-mono uppercase tracking-[0.1em]"
                  style={{ ...stickyTh, color: S.textMuted, width: 210 }} />
              {MONTHS.map((m, i) => (
                <th key={m} className="text-right px-2 py-2 text-[11px] font-mono"
                    style={{
                      ...stickyTh,
                      color: actualsMonths.has(i + 1) ? S.actualsText : S.textSecondary,
                      minWidth: 58,
                    }}>
                  {m}
                  {actualsMonths.has(i + 1) && (
                    <span className="ml-0.5 text-[8px]" style={{ color: S.textMuted }}>✓</span>
                  )}
                </th>
              ))}
              <th className="text-right px-2 py-2 text-[11px] font-mono" style={{ ...stickyTh, color: S.textMuted }}>YTD</th>
            </tr>
          </thead>

          <tbody>

            {/* ══ REVENUE ══════════════════════════════════════════════════════ */}
            <SectionHeader label="Revenue Model" />

            <DriverRow
              label="Small Jobs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('small_job_counts', m)}
              onChange={(m, v) => setMonthField('small_job_counts', m, v)}
              onCommit={(m, lbl) => commitMonthField('small_job_counts', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('small_job_counts', val, lbl, 1)}
              ytd={monthInts.reduce((s, m) => s + dv('small_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Small ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('small_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('small_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('small_job_avg_value_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('small_job_avg_value_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('small_job_avg_value_monthly', val, lbl, 100)}
            />

            <DriverRow
              label="Medium Jobs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('medium_job_counts', m)}
              onChange={(m, v) => setMonthField('medium_job_counts', m, v)}
              onCommit={(m, lbl) => commitMonthField('medium_job_counts', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('medium_job_counts', val, lbl, 1)}
              ytd={monthInts.reduce((s, m) => s + dv('medium_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Medium ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('medium_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('medium_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('medium_job_avg_value_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('medium_job_avg_value_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('medium_job_avg_value_monthly', val, lbl, 100)}
            />

            <DriverRow
              label="Large Jobs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('large_job_counts', m)}
              onChange={(m, v) => setMonthField('large_job_counts', m, v)}
              onCommit={(m, lbl) => commitMonthField('large_job_counts', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('large_job_counts', val, lbl, 1)}
              ytd={monthInts.reduce((s, m) => s + dv('large_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Large ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('large_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('large_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('large_job_avg_value_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('large_job_avg_value_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('large_job_avg_value_monthly', val, lbl, 100)}
            />

            {/* Small + Medium + Large, summed by the engine as total_job_count */}
            <CalcRow label="Total Jobs" periods={orderedPeriods} field="total_job_count" format={fmtCount} />
            <CalcRow label="Total Revenue" periods={orderedPeriods} field="revenue" highlight />

            {/* ══ COST OF SALES ═════════════════════════════════════════════════ */}
            <SectionHeader label="Cost of Sales" />

            <tr>
              <AutofillBtn onFill={() => {
                const firstForecast = monthInts.find(m => !actualsMonths.has(m))
                if (firstForecast === undefined) return
                // Same fill-from-first-forecast-month behaviour, now committed as
                // one undoable action like every other row.
                autofillField('cos_pct_monthly', cosView(firstForecast), 'COS', 1)
              }} />
              <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary }}>
                <span className="inline-flex items-center gap-2">
                  COS
                  <ModeToggle mode={modeOf('cos_pct_monthly')} onChange={md => setMode('cos_pct_monthly', md)} />
                </span>
                <span className="block text-[10px]" style={{ color: S.textMuted }}>% of revenue · a $ entry pins that month</span>
              </td>
              {monthInts.map(m =>
                actualsMonths.has(m)
                  ? <ActualsCell key={m} display={actualsCosDisplay(m)} />
                  : (
                    <td key={m} className="px-1 py-1 relative" style={{ minWidth: 58 }}>
                      {cosFixed(m) !== null && (
                        <span title="Pinned $ entry — does not move with revenue. Enter a % to release."
                              className="absolute left-1 top-0 font-mono text-[9px]" style={{ color: S.gold }}>$</span>
                      )}
                      <DriverInput
                        step={modeOf('cos_pct_monthly') === 'pct' ? 0.1 : 1}
                        placeholder={modeOf('cos_pct_monthly') === 'pct' ? '0.0' : '0'}
                        value={cosView(m)}
                        display={cosRestDisplay(m)}
                        onChange={v => setMonthField('cos_pct_monthly', m, v, 1)}
                        onCommit={() => commitMonthField('cos_pct_monthly', m, 'COS', 1)}
                      />
                    </td>
                  )
              )}
              <td className="text-right px-2 py-1.5 font-mono text-[12px]" style={{ color: S.textMuted }}>
                —
              </td>
            </tr>

            <CalcRow label="Cost of Sales ($)" periods={orderedPeriods} field="cost_of_sales" />
            <CalcRow label="Gross Profit" periods={orderedPeriods} field="gross_profit" highlight />

            {/* ══ PAYROLL ═══════════════════════════════════════════════════════ */}
            <SectionHeader label="Payroll" />

            <DriverRow
              label="Cost / Pay Run ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('cost_per_pay_run_monthly', m, draft?.cost_per_pay_run ?? 0)}
              getDisplay={m => viewDisplay('cost_per_pay_run_monthly', m, draft?.cost_per_pay_run ?? 0)}
              onChange={(m, v) => setMonthField('cost_per_pay_run_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('cost_per_pay_run_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('cost_per_pay_run_monthly', val, lbl, 100)}
            />

            <DriverRow
              label="Pay Runs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('pay_runs_per_month', m)}
              onChange={(m, v) => setMonthField('pay_runs_per_month', m, v)}
              onCommit={(m, lbl) => commitMonthField('pay_runs_per_month', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('pay_runs_per_month', val, lbl, 1)}
              ytd={monthInts.reduce((s, m) => s + dv('pay_runs_per_month', m), 0)}
            />
            <DriverRow
              label="One-off / Irregular ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('payroll_one_off', m)}
              getDisplay={m => viewDisplay('payroll_one_off', m)}
              onChange={(m, v) => setMonthField('payroll_one_off', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('payroll_one_off', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('payroll_one_off', val, lbl, 100)}
            />
            <CalcRow label="Total Payroll" periods={orderedPeriods} field="payroll_expenses" highlight
              mode={modeOf('total_payroll')} onToggleMode={md => setMode('total_payroll', md)} />

            {/* ══ OTHER EXPENSES ════════════════════════════════════════════════ */}
            <SectionHeader label="Other Expenses" />

            <DriverRow
              label="Marketing / Advertising ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('marketing_monthly', m)}
              getDisplay={m => viewDisplay('marketing_monthly', m)}
              mode={modeOf('marketing_monthly')} onToggleMode={md => setMode('marketing_monthly', md)}
              onChange={(m, v) => setMonthField('marketing_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('marketing_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('marketing_monthly', val, lbl, 100)}
            />
            <DriverRow
              label="Depreciation & Amort. ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('depreciation_monthly', m)}
              getDisplay={m => viewDisplay('depreciation_monthly', m)}
              mode={modeOf('depreciation_monthly')} onToggleMode={md => setMode('depreciation_monthly', md)}
              onChange={(m, v) => setMonthField('depreciation_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('depreciation_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('depreciation_monthly', val, lbl, 100)}
            />
            <DriverRow
              label="Other Overhead ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('other_overhead_monthly', m)}
              getDisplay={m => viewDisplay('other_overhead_monthly', m)}
              mode={modeOf('other_overhead_monthly')} onToggleMode={md => setMode('other_overhead_monthly', md)}
              onChange={(m, v) => setMonthField('other_overhead_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('other_overhead_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('other_overhead_monthly', val, lbl, 100)}
            />
            <CalcRow
              label="Total Other Expenses"
              periods={orderedPeriods}
              field="total_other_expenses"
              sublabel="Marketing + Depreciation + Overhead"
            />

            {/* ══ OTHER INCOME / EXPENSE ════════════════════════════════════════ */}
            <SectionHeader label="Other Income / Expense" />

            <DriverRow
              label="Other Income / Expense ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('other_income_expense_monthly', m)}
              getDisplay={m => viewDisplay('other_income_expense_monthly', m)}
              mode={modeOf('other_income_expense_monthly')} onToggleMode={md => setMode('other_income_expense_monthly', md)}
              onChange={(m, v) => setMonthField('other_income_expense_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('other_income_expense_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('other_income_expense_monthly', val, lbl, 100)}
            />

            {/* ══ P&L SUMMARY ═══════════════════════════════════════════════════ */}
            <SectionHeader label="P&L Summary" />
            <CalcRow label="Total Revenue" periods={orderedPeriods} field="revenue" highlight />
            <CalcRow label="Cost of Sales" periods={orderedPeriods} field="cost_of_sales" />
            <CalcRow label="Gross Profit" periods={orderedPeriods} field="gross_profit" highlight />
            <CalcRow label="Total Expenses" periods={orderedPeriods} fields={["payroll_expenses", "total_other_expenses"]} />
            <CalcRow label="Net Operating Profit" periods={orderedPeriods} field="net_operating_profit" highlight />
            <CalcRow label="Other Income / Expense" periods={orderedPeriods} field="other_income_expense" />
            <CalcRow label="Net Profit" periods={orderedPeriods} field="net_profit" highlight />

            {/* ══ CASH FLOW ══════════════════════════════════════════════════════ */}
            <SectionHeader label="Cash Flow" />

            <SubHeader label="Working Capital" />
            <DriverRow
              label="DSO — Days Sales Outstanding"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('dso_monthly', m)}
              getDisplay={m => {
                const days = periodByMonth[m]?.dso_days
                return (days !== undefined && days !== null) ? `${days} days` : '—'
              }}
              onChange={(m, v) => setMonthField('dso_monthly', m, v)}
              onCommit={(m, lbl) => commitMonthField('dso_monthly', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('dso_monthly', val, lbl, 1)}
            />
            <DriverRow
              label="DIO — Days Inventory Outstanding"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('dio_monthly', m)}
              getDisplay={m => {
                const days = periodByMonth[m]?.dio_days
                return (days !== undefined && days !== null) ? `${days} days` : '—'
              }}
              onChange={(m, v) => setMonthField('dio_monthly', m, v)}
              onCommit={(m, lbl) => commitMonthField('dio_monthly', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('dio_monthly', val, lbl, 1)}
            />
            <DriverRow
              label="DPO — Days Payable Outstanding"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('dpo_monthly', m)}
              getDisplay={m => {
                const days = periodByMonth[m]?.dpo_days
                return (days !== undefined && days !== null) ? `${days} days` : '—'
              }}
              onChange={(m, v) => setMonthField('dpo_monthly', m, v)}
              onCommit={(m, lbl) => commitMonthField('dpo_monthly', m, lbl, 1)}
              onAutofill={(val, lbl) => autofillField('dpo_monthly', val, lbl, 1)}
            />
            <DriverRow
              label="Owner Distributions ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('owner_distributions', m)}
              mode={modeOf('owner_distributions')} onToggleMode={md => setMode('owner_distributions', md)}
              getDisplay={m => actualsMonths.has(m) ? periodDisplay('owner_distributions', 'owner_distributions', m) : viewDisplay('owner_distributions', m)}
              onChange={(m, v) => setMonthField('owner_distributions', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('owner_distributions', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('owner_distributions', val, lbl, 100)}
            />

            <SubHeader label="Investing & Financing" />
            <DriverRow
              label="Capital Expenditures ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('capex_monthly', m)}
              getDisplay={m => actualsMonths.has(m) ? periodDisplay('capex_monthly', 'capex', m) : viewDisplay('capex_monthly', m)}
              mode={modeOf('capex_monthly')} onToggleMode={md => setMode('capex_monthly', md)}
              onChange={(m, v) => setMonthField('capex_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('capex_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('capex_monthly', val, lbl, 100)}
            />
            <DriverRow
              label="Other Current Assets Δ ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('other_current_assets_change_monthly', m)}
              getDisplay={m => periodDisplay('other_current_assets_change_monthly', 'other_current_assets_change', m)}
              mode={modeOf('other_current_assets_change_monthly')} onToggleMode={md => setMode('other_current_assets_change_monthly', md)}
              onChange={(m, v) => setMonthField('other_current_assets_change_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('other_current_assets_change_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('other_current_assets_change_monthly', val, lbl, 100)}
            />
            <DriverRow
              label="Current Debt Change ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('current_debt_change_monthly', m)}
              getDisplay={m => periodDisplay('current_debt_change_monthly', 'current_debt_change', m)}
              mode={modeOf('current_debt_change_monthly')} onToggleMode={md => setMode('current_debt_change_monthly', md)}
              onChange={(m, v) => setMonthField('current_debt_change_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('current_debt_change_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('current_debt_change_monthly', val, lbl, 100)}
            />
            <DriverRow
              label="Long-Term Debt Change ($)"
              compact
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => viewValue('long_term_debt_change_monthly', m)}
              getDisplay={m => periodDisplay('long_term_debt_change_monthly', 'long_term_debt_change', m)}
              mode={modeOf('long_term_debt_change_monthly')} onToggleMode={md => setMode('long_term_debt_change_monthly', md)}
              onChange={(m, v) => setMonthField('long_term_debt_change_monthly', m, v, 100)}
              onCommit={(m, lbl) => commitMonthField('long_term_debt_change_monthly', m, lbl, 100)}
              onAutofill={(val, lbl) => autofillField('long_term_debt_change_monthly', val, lbl, 100)}
            />

            <CalcRow label="Net Cash Flow" periods={orderedPeriods} field="net_cash_flow" highlight />

            {/* ══ PROJECTED BALANCE SHEET ════════════════════════════════════════ */}
            <SectionHeader label="Projected Balance Sheet" />

            <SubHeader label="Assets" />
            <CalcRow label="Accounts Receivable"  periods={orderedPeriods} field="projected_ar" />
            <CalcRow label="Inventory"            periods={orderedPeriods} field="projected_inventory" />
            <CalcRow label="Other Current Assets" periods={orderedPeriods} field="projected_other_current_assets" />

            <SubHeader label="Liabilities" />
            <CalcRow label="Accounts Payable"          periods={orderedPeriods} field="projected_ap" />
            <CalcRow label="Other Current Liabilities"  periods={orderedPeriods} field="projected_current_debt" />
            <CalcRow label="Long-Term Liabilities"      periods={orderedPeriods} field="projected_long_term_debt" />

          </tbody>
        </table>
      </div>
    </main>
  )
}
