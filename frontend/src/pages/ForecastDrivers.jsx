import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForecastView, createDrivers, updateDrivers, calculateForecast } from '../api/forecast'

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

function EditCell({ value, onChange, step = 1, placeholder = '0' }) {
  const [local, setLocal] = useState(String(value ?? ''))
  useEffect(() => setLocal(String(value ?? '')), [value])

  return (
    <td className="px-1 py-1" style={{ minWidth: 58 }}>
      <input
        type="number"
        min="0"
        step={step}
        placeholder={placeholder}
        value={local}
        onChange={e => { setLocal(e.target.value); onChange(e.target.value) }}
        onFocus={e => { e.currentTarget.style.borderColor = S.gold; e.currentTarget.select() }}
        onBlur={e => e.currentTarget.style.borderColor = S.border}
        className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
        style={inputStyle}
      />
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

function DriverRow({ label, monthInts, actualsMonths = new Set(), getValue, getDisplay, onChange, onAutofill, ytd }) {
  // Find the first non-actuals month for autofill source
  const firstForecastMonth = monthInts.find(m => !actualsMonths.has(m))

  const handleAutofill = () => {
    if (firstForecastMonth === undefined) return
    const sourceVal = getValue(firstForecastMonth)
    monthInts.forEach(m => {
      if (!actualsMonths.has(m)) onChange(m, String(sourceVal))
    })
  }

  return (
    <tr>
      <AutofillBtn onFill={handleAutofill} />
      <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary, width: 185 }}>
        {label}
      </td>
      {monthInts.map(m =>
        actualsMonths.has(m)
          ? <ActualsCell key={m} display={getDisplay ? getDisplay(m) : '—'} />
          : <EditCell key={m} value={getValue(m)} onChange={v => onChange(m, v)} />
      )}
      <td className="text-right px-2 py-1.5 font-mono text-[12px]"
          style={{ color: S.textMuted }}>
        {ytd ?? '—'}
      </td>
    </tr>
  )
}

// ── Calculated summary row ────────────────────────────────────────────────────

function CalcRow({ label, periods, field, fields, highlight = false, sublabel }) {
  const getVal = (p) => fields
    ? fields.reduce((s, f) => s + (p?.[f] ?? 0), 0)
    : (p?.[field] ?? 0)
  const total = (periods || []).reduce((s, p) => s + getVal(p), 0)
  const color = highlight ? S.gold : S.textSecondary

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
      <td className="px-3 py-2 text-[12px] font-semibold" style={{ color, width: 185 }}>
        {label}
        {sublabel && <span className="block text-[10px] font-normal" style={{ color: S.textMuted }}>{sublabel}</span>}
      </td>
      {(periods || []).map((p, i) => (
        <td key={i} className="text-right px-2 py-2 font-mono text-[12px] font-semibold"
            style={{ color, minWidth: 58 }}>
          <Tooltip content={getTooltip(p)}>
            {fmt(getVal(p))}
          </Tooltip>
        </td>
      ))}
      <td className="text-right px-2 py-2 font-mono text-[12px] font-semibold" style={{ color }}>
        {fmt(total)}
      </td>
    </tr>
  )
}

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
  const [dirty, setDirty] = useState(false)
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
      setConfig(data.config); setDraft(data.config); setPeriods(data.periods)
    } catch (e) {
      if (e.message.includes('404') || e.message.includes('not found')) {
        try {
          const newConfig = await createDrivers(clientId, fiscalYear, {})
          setConfig(newConfig); setDraft(newConfig)
          // Auto-run calculation so any existing actuals populate immediately
          const calculated = await calculateForecast(clientId, fiscalYear).catch(() => null)
          if (calculated) {
            const fresh = await getForecastView(clientId, fiscalYear)
            setConfig(fresh.config); setDraft(fresh.config); setPeriods(fresh.periods)
          } else {
            setPeriods([])
          }
        } catch (e2) { setError(e2.message) }
      } else { setError(e.message) }
    } finally { setLoading(false) }
  }, [clientId, fiscalYear])

  useEffect(() => { load() }, [load])

  // Update a per-month JSONB field
  const setMonthField = (field, month, rawVal, scale = 1) => {
    const val = (Number(rawVal) || 0) * scale
    setDraft(prev => ({ ...prev, [field]: { ...(prev[field] || {}), [String(month)]: val } }))
    setDirty(true)
  }

  // Autofill a per-month field — set all months to a given value
  const autofillField = (field, val) => {
    const filled = {}
    for (let m = 1; m <= 12; m++) filled[String(m)] = val
    setDraft(prev => ({ ...prev, [field]: filled }))
    setDirty(true)
  }

  const handleSyncActuals = async () => {
    setSyncing(true); setError(null)
    try {
      await calculateForecast(clientId, fiscalYear)
      const updated = await getForecastView(clientId, fiscalYear)
      setConfig(updated.config); setDraft(updated.config); setPeriods(updated.periods)
      setDirty(false)
    } catch (e) { setError(e.message) }
    finally { setSyncing(false) }
  }

  const handleRecalculate = async () => {
    setSaving(true); setError(null)
    try {
      await updateDrivers(clientId, fiscalYear, draft)
      const updated = await getForecastView(clientId, fiscalYear)
      setConfig(updated.config); setDraft(updated.config); setPeriods(updated.periods)
      setDirty(false)
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
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
  const actualsCosDisplay = (month) => {
    const p = periodByMonth[month]
    if (!p || p.revenue === 0) return '—'
    return fmtPct(p.cost_of_sales / p.revenue * 100)
  }

  return (
    <main className="flex-1 overflow-auto" style={{ background: S.bg }}>
      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-xl" style={{ color: S.text }}>Forecast</h1>
          <p className="text-[12px] mt-0.5" style={{ color: S.textMuted }}>
            {fiscalYear} · Dimmed months have confirmed actuals · → copies first month across the row
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="text-[11px] font-mono" style={{ color: S.gold }}>Unsaved changes</span>
          )}
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
          <button
            onClick={handleRecalculate}
            disabled={saving || syncing}
            className="px-4 py-1.5 rounded text-[12px] font-medium transition-opacity"
            style={{ background: S.gold, color: '#1a1918', opacity: (saving || syncing) ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Recalculate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-8 mb-4 px-4 py-2 rounded text-[12px]"
             style={{ background: 'rgba(192,90,90,0.07)', color: '#b04040', border: '1px solid rgba(192,90,90,0.2)' }}>
          {error}
        </div>
      )}

      <div className="px-8 pb-16 overflow-x-auto">
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
            <tr style={{ borderBottom: `1px solid ${S.border}` }}>
              <th style={{ width: 22 }} /> {/* autofill button column */}
              <th className="text-left px-3 py-2 text-[11px] font-mono uppercase tracking-[0.1em]"
                  style={{ color: S.textMuted, width: 185 }} />
              {MONTHS.map((m, i) => (
                <th key={m} className="text-right px-2 py-2 text-[11px] font-mono"
                    style={{
                      color: actualsMonths.has(i + 1) ? S.actualsText : S.textSecondary,
                      minWidth: 58,
                    }}>
                  {m}
                  {actualsMonths.has(i + 1) && (
                    <span className="ml-0.5 text-[8px]" style={{ color: S.textMuted }}>✓</span>
                  )}
                </th>
              ))}
              <th className="text-right px-2 py-2 text-[11px] font-mono" style={{ color: S.textMuted }}>YTD</th>
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
              onAutofill={val => autofillField('small_job_counts', val)}
              ytd={monthInts.reduce((s, m) => s + dv('small_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Small ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('small_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('small_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('small_job_avg_value_monthly', m, v, 100)}
              onAutofill={val => autofillField('small_job_avg_value_monthly', val * 100)}
            />

            <DriverRow
              label="Medium Jobs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('medium_job_counts', m)}
              onChange={(m, v) => setMonthField('medium_job_counts', m, v)}
              onAutofill={val => autofillField('medium_job_counts', val)}
              ytd={monthInts.reduce((s, m) => s + dv('medium_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Medium ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('medium_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('medium_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('medium_job_avg_value_monthly', m, v, 100)}
              onAutofill={val => autofillField('medium_job_avg_value_monthly', val * 100)}
            />

            <DriverRow
              label="Large Jobs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('large_job_counts', m)}
              onChange={(m, v) => setMonthField('large_job_counts', m, v)}
              onAutofill={val => autofillField('large_job_counts', val)}
              ytd={monthInts.reduce((s, m) => s + dv('large_job_counts', m), 0)}
            />
            <DriverRow
              label="Avg Value — Large ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('large_job_avg_value_monthly', m) / 100)}
              getDisplay={m => fmt(dv('large_job_avg_value_monthly', m))}
              onChange={(m, v) => setMonthField('large_job_avg_value_monthly', m, v, 100)}
              onAutofill={val => autofillField('large_job_avg_value_monthly', val * 100)}
            />

            <CalcRow label="Total Revenue" periods={orderedPeriods} field="revenue" highlight />

            {/* ══ COST OF SALES ═════════════════════════════════════════════════ */}
            <SectionHeader label="Cost of Sales" />

            <tr>
              <AutofillBtn onFill={() => {
                const firstForecast = monthInts.find(m => !actualsMonths.has(m))
                if (firstForecast === undefined) return
                const val = dvFloat('cos_pct_monthly', firstForecast)
                const filled = {}
                monthInts.forEach(m => { if (!actualsMonths.has(m)) filled[String(m)] = Number(val) || 0 })
                setDraft(prev => ({ ...prev, cos_pct_monthly: { ...(prev.cos_pct_monthly || {}), ...filled } }))
                setDirty(true)
              }} />
              <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary }}>
                COS %
              </td>
              {monthInts.map(m =>
                actualsMonths.has(m)
                  ? <ActualsCell key={m} display={actualsCosDisplay(m)} />
                  : (
                    <td key={m} className="px-1 py-1" style={{ minWidth: 58 }}>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        placeholder="0.0"
                        value={dvFloat('cos_pct_monthly', m)}
                        onChange={e => setMonthField('cos_pct_monthly', m, e.target.value, 1)}
                        onFocus={e => { e.currentTarget.style.borderColor = S.gold; e.currentTarget.select() }}
                        onBlur={e => e.currentTarget.style.borderColor = S.border}
                        className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
                        style={inputStyle}
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
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('cost_per_pay_run_monthly', m) / 100) || Math.round((draft?.cost_per_pay_run ?? 0) / 100)}
              getDisplay={m => fmt(dv('cost_per_pay_run_monthly', m) || draft?.cost_per_pay_run || 0)}
              onChange={(m, v) => setMonthField('cost_per_pay_run_monthly', m, v, 100)}
              onAutofill={val => autofillField('cost_per_pay_run_monthly', val * 100)}
            />

            <DriverRow
              label="Pay Runs"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => dv('pay_runs_per_month', m)}
              onChange={(m, v) => setMonthField('pay_runs_per_month', m, v)}
              onAutofill={val => autofillField('pay_runs_per_month', val)}
              ytd={monthInts.reduce((s, m) => s + dv('pay_runs_per_month', m), 0)}
            />
            <DriverRow
              label="One-off / Irregular ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('payroll_one_off', m) / 100)}
              getDisplay={m => fmt(dv('payroll_one_off', m))}
              onChange={(m, v) => setMonthField('payroll_one_off', m, v, 100)}
              onAutofill={val => autofillField('payroll_one_off', val * 100)}
            />
            <CalcRow label="Total Payroll" periods={orderedPeriods} field="payroll_expenses" highlight />

            {/* ══ OTHER EXPENSES ════════════════════════════════════════════════ */}
            <SectionHeader label="Other Expenses" />

            <DriverRow
              label="Marketing / Advertising ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('marketing_monthly', m) / 100)}
              getDisplay={m => fmt(dv('marketing_monthly', m))}
              onChange={(m, v) => setMonthField('marketing_monthly', m, v, 100)}
              onAutofill={val => autofillField('marketing_monthly', val * 100)}
            />
            <DriverRow
              label="Depreciation & Amort. ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('depreciation_monthly', m) / 100)}
              getDisplay={m => fmt(dv('depreciation_monthly', m))}
              onChange={(m, v) => setMonthField('depreciation_monthly', m, v, 100)}
              onAutofill={val => autofillField('depreciation_monthly', val * 100)}
            />
            <DriverRow
              label="Other Overhead ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('other_overhead_monthly', m) / 100)}
              getDisplay={m => fmt(dv('other_overhead_monthly', m))}
              onChange={(m, v) => setMonthField('other_overhead_monthly', m, v, 100)}
              onAutofill={val => autofillField('other_overhead_monthly', val * 100)}
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
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('other_income_expense_monthly', m) / 100)}
              getDisplay={m => fmt(dv('other_income_expense_monthly', m))}
              onChange={(m, v) => setMonthField('other_income_expense_monthly', m, v, 100)}
              onAutofill={val => autofillField('other_income_expense_monthly', val * 100)}
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
              onAutofill={val => autofillField('dso_monthly', val)}
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
              onAutofill={val => autofillField('dio_monthly', val)}
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
              onAutofill={val => autofillField('dpo_monthly', val)}
            />
            <DriverRow
              label="Owner Distributions ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('owner_distributions', m) / 100)}
              getDisplay={m => fmt(periodByMonth[m]?.owner_distributions ?? 0)}
              onChange={(m, v) => setMonthField('owner_distributions', m, v, 100)}
              onAutofill={val => autofillField('owner_distributions', val * 100)}
            />
            <DriverRow
              label="Tax Savings Reserve ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('owner_tax_savings', m) / 100)}
              getDisplay={m => fmt(periodByMonth[m]?.owner_tax_savings ?? 0)}
              onChange={(m, v) => setMonthField('owner_tax_savings', m, v, 100)}
              onAutofill={val => autofillField('owner_tax_savings', val * 100)}
            />

            <SubHeader label="Investing & Financing" />
            <DriverRow
              label="Capital Expenditures ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('capex_monthly', m) / 100)}
              getDisplay={m => fmt(dv('capex_monthly', m))}
              onChange={(m, v) => setMonthField('capex_monthly', m, v, 100)}
              onAutofill={val => autofillField('capex_monthly', val * 100)}
            />
            <DriverRow
              label="Other Current Assets Δ ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('other_current_assets_change_monthly', m) / 100)}
              getDisplay={m => fmt(dv('other_current_assets_change_monthly', m))}
              onChange={(m, v) => setMonthField('other_current_assets_change_monthly', m, v, 100)}
              onAutofill={val => autofillField('other_current_assets_change_monthly', val * 100)}
            />
            <DriverRow
              label="Current Debt Change ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('current_debt_change_monthly', m) / 100)}
              getDisplay={m => fmt(dv('current_debt_change_monthly', m))}
              onChange={(m, v) => setMonthField('current_debt_change_monthly', m, v, 100)}
              onAutofill={val => autofillField('current_debt_change_monthly', val * 100)}
            />
            <DriverRow
              label="Long-Term Debt Change ($)"
              monthInts={monthInts} actualsMonths={actualsMonths}
              getValue={m => Math.round(dv('long_term_debt_change_monthly', m) / 100)}
              getDisplay={m => fmt(dv('long_term_debt_change_monthly', m))}
              onChange={(m, v) => setMonthField('long_term_debt_change_monthly', m, v, 100)}
              onAutofill={val => autofillField('long_term_debt_change_monthly', val * 100)}
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
