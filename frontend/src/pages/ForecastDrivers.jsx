import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getForecastView, createDrivers, updateDrivers } from '../api/forecast'

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
    if (onAutofill) onAutofill(sourceVal)
  }

  return (
    <tr>
      <AutofillBtn onFill={handleAutofill} />
      <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary, width: 185 }}>
        {label}
      </td>
      {monthInts.map(m =>
        actualsMonths.has(m)
          ? <ActualsCell key={m} display={getDisplay ? getDisplay(m) : getValue(m)} />
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

function CalcRow({ label, periods, field, highlight = false, sublabel }) {
  const total = (periods || []).reduce((s, p) => s + (p?.[field] ?? 0), 0)
  const color = highlight ? S.gold : S.textSecondary
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
          {fmt(p?.[field] ?? 0)}
        </td>
      ))}
      <td className="text-right px-2 py-2 font-mono text-[12px] font-semibold" style={{ color }}>
        {fmt(total)}
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
  const clientId = Number(id)
  const fiscalYear = Number(year)

  const [config, setConfig] = useState(null)
  const [periods, setPeriods] = useState([])
  const [draft, setDraft] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
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
          setConfig(newConfig); setDraft(newConfig); setPeriods([])
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
            onClick={handleRecalculate}
            disabled={saving}
            className="px-4 py-1.5 rounded text-[12px] font-medium transition-opacity"
            style={{ background: S.gold, color: '#1a1918', opacity: saving ? 0.6 : 1 }}
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
        <table className="w-full border-collapse" style={{ minWidth: 980 }}>
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

            <tr>
              <td /> {/* no autofill for scalar */}
              <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary, width: 185 }}>
                Cost / Pay Run ($)
              </td>
              {monthInts.map(m => (
                <td key={m} className="px-1 py-1" style={{ minWidth: 58 }}>
                  <input
                    type="number" min="0"
                    value={Math.round((draft?.cost_per_pay_run ?? 0) / 100)}
                    onChange={e => {
                      setDraft(prev => ({ ...prev, cost_per_pay_run: (Number(e.target.value) || 0) * 100 }))
                      setDirty(true)
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = S.gold; e.currentTarget.select() }}
                    onBlur={e => e.currentTarget.style.borderColor = S.border}
                    className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
                    style={inputStyle}
                  />
                </td>
              ))}
              <td />
            </tr>

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
            <CalcRow label="Net Operating Profit" periods={orderedPeriods} field="net_operating_profit" highlight />
            <CalcRow label="Net Profit" periods={orderedPeriods} field="net_profit" highlight />

          </tbody>
        </table>
      </div>
    </main>
  )
}
