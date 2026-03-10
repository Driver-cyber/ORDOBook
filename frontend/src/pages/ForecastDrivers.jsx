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
  bg: '#1a1d22',
  surface: '#1e2025',
  border: '#2a2d35',
  text: '#f0f0ee',
  textSecondary: '#8a8f9e',
  textMuted: '#4a4f5e',
  gold: '#c8a96e',
  locked: '#1e2025',
  lockedText: '#5a5f6e',
}

// ── Editable input cell ───────────────────────────────────────────────────────

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
        className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
        style={{
          background: 'rgba(200,169,110,0.06)',
          border: `1px solid ${S.border}`,
          color: S.text,
        }}
        onFocus={e => e.currentTarget.style.borderColor = S.gold}
        onBlur={e => e.currentTarget.style.borderColor = S.border}
      />
    </td>
  )
}

// ── Locked (actuals) cell ─────────────────────────────────────────────────────

function LockedCell({ display }) {
  return (
    <td className="text-right px-2 py-1.5 font-mono text-[12px]"
        style={{ color: S.lockedText, background: S.locked, minWidth: 58 }}>
      {display}
    </td>
  )
}

// ── Row with mixed locked/editable cells ──────────────────────────────────────

function DriverRow({ label, monthInts, lockedMonths, getValue, getDisplay, onChange, ytd }) {
  return (
    <tr>
      <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary, width: 190 }}>
        {label}
      </td>
      {monthInts.map(m =>
        lockedMonths.has(m)
          ? <LockedCell key={m} display={getDisplay ? getDisplay(m) : getValue(m)} />
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

function CalcRow({ label, periods, field, highlight = false }) {
  const total = (periods || []).reduce((s, p) => s + (p?.[field] ?? 0), 0)
  const color = highlight ? S.gold : S.textSecondary
  return (
    <tr style={{ borderTop: `1px solid ${S.border}` }}>
      <td className="px-3 py-2 text-[12px] font-semibold" style={{ color }}>
        {label}
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
      <td colSpan={14} className="px-3 pt-6 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em]"
             style={{ color: S.textMuted }}>
          {label}
        </div>
        <div style={{ borderBottom: `1px solid ${S.border}`, marginTop: 4 }} />
      </td>
    </tr>
  )
}

// ── Annual scalar input (same value shown in every forecast month) ─────────────

function ScalarRow({ label, cents, locked, onChange }) {
  const dollars = Math.round((cents ?? 0) / 100)
  return (
    <tr>
      <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary }}>{label}</td>
      {Array.from({ length: 12 }, (_, i) => i + 1).map(m =>
        locked
          ? <LockedCell key={m} display={fmt((cents ?? 0))} />
          : (
            <td key={m} className="px-1 py-1" style={{ minWidth: 58 }}>
              <input
                type="number" min="0" value={dollars}
                onChange={e => onChange((Number(e.target.value) || 0) * 100)}
                className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
                style={{ background: 'rgba(200,169,110,0.06)', border: `1px solid ${S.border}`, color: S.text }}
                onFocus={e => e.currentTarget.style.borderColor = S.gold}
                onBlur={e => e.currentTarget.style.borderColor = S.border}
              />
            </td>
          )
      )}
      <td />
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

  const lockedMonths = new Set(
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

  // Update a scalar (annual) field
  const setScalar = (field, val) => {
    setDraft(prev => ({ ...prev, [field]: val }))
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

  // Helpers for draft values
  const dv = (field, month) => draft?.[field]?.[String(month)] ?? 0
  const dvFloat = (field, month) => {
    const v = draft?.[field]?.[String(month)]
    return (v !== null && v !== undefined) ? v : ''
  }

  // For locked COS % cells: derive from actuals period data
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
            {fiscalYear} · Locked months (✓) use confirmed actuals · Edit forecast months freely
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
            style={{ background: S.gold, color: '#1a1d22', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving…' : 'Recalculate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-8 mb-4 px-4 py-2 rounded text-[12px]"
             style={{ background: 'rgba(220,60,60,0.12)', color: '#e06060', border: '1px solid rgba(220,60,60,0.2)' }}>
          {error}
        </div>
      )}

      <div className="px-8 pb-16 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 960 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${S.border}` }}>
              <th className="text-left px-3 py-2 text-[11px] font-mono uppercase tracking-[0.1em]"
                  style={{ color: S.textMuted, width: 190 }} />
              {MONTHS.map((m, i) => (
                <th key={m} className="text-right px-2 py-2 text-[11px] font-mono"
                    style={{ color: lockedMonths.has(i + 1) ? S.textMuted : S.textSecondary, minWidth: 58 }}>
                  {m}{lockedMonths.has(i + 1) && <span className="ml-0.5 text-[8px]" style={{ color: S.textMuted }}>✓</span>}
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
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => dv('small_job_counts', m)}
              onChange={(m, v) => setMonthField('small_job_counts', m, v)}
              ytd={monthInts.reduce((s, m) => s + dv('small_job_counts', m), 0)}
            />
            <ScalarRow
              label="Avg Value — Small ($)"
              cents={draft?.small_job_avg_value ?? 0}
              locked={false}
              onChange={v => setScalar('small_job_avg_value', v)}
            />

            <DriverRow
              label="Medium Jobs"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => dv('medium_job_counts', m)}
              onChange={(m, v) => setMonthField('medium_job_counts', m, v)}
              ytd={monthInts.reduce((s, m) => s + dv('medium_job_counts', m), 0)}
            />
            <ScalarRow
              label="Avg Value — Medium ($)"
              cents={draft?.medium_job_avg_value ?? 0}
              locked={false}
              onChange={v => setScalar('medium_job_avg_value', v)}
            />

            <DriverRow
              label="Large Jobs"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => dv('large_job_counts', m)}
              onChange={(m, v) => setMonthField('large_job_counts', m, v)}
              ytd={monthInts.reduce((s, m) => s + dv('large_job_counts', m), 0)}
            />
            <ScalarRow
              label="Avg Value — Large ($)"
              cents={draft?.large_job_avg_value ?? 0}
              locked={false}
              onChange={v => setScalar('large_job_avg_value', v)}
            />

            <CalcRow label="Total Revenue" periods={orderedPeriods} field="revenue" highlight />

            {/* ══ COST OF SALES ═════════════════════════════════════════════════ */}
            <SectionHeader label="Cost of Sales" />

            {/* COS % — locked months show derived %, forecast months are editable */}
            <tr>
              <td className="px-3 py-1.5 text-[12px]" style={{ color: S.textSecondary }}>
                COS %
              </td>
              {monthInts.map(m =>
                lockedMonths.has(m)
                  ? <LockedCell key={m} display={actualsCosDisplay(m)} />
                  : (
                    <td key={m} className="px-1 py-1" style={{ minWidth: 58 }}>
                      <input
                        type="number" min="0" max="100" step="0.1"
                        placeholder="0.0"
                        value={dvFloat('cos_pct_monthly', m)}
                        onChange={e => setMonthField('cos_pct_monthly', m, e.target.value, 1)}
                        className="w-full text-right font-mono text-[12px] px-1.5 py-1 rounded outline-none"
                        style={{ background: 'rgba(200,169,110,0.06)', border: `1px solid ${S.border}`, color: S.text }}
                        onFocus={e => e.currentTarget.style.borderColor = S.gold}
                        onBlur={e => e.currentTarget.style.borderColor = S.border}
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

            <ScalarRow
              label="Cost / Pay Run ($)"
              cents={draft?.cost_per_pay_run ?? 0}
              locked={false}
              onChange={v => setScalar('cost_per_pay_run', v)}
            />
            <DriverRow
              label="Pay Runs"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => dv('pay_runs_per_month', m)}
              onChange={(m, v) => setMonthField('pay_runs_per_month', m, v)}
              ytd={monthInts.reduce((s, m) => s + dv('pay_runs_per_month', m), 0)}
            />
            <DriverRow
              label="One-off / Irregular ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('payroll_one_off', m) / 100)}
              getDisplay={m => fmt(dv('payroll_one_off', m))}
              onChange={(m, v) => setMonthField('payroll_one_off', m, v, 100)}
            />
            <CalcRow label="Total Payroll" periods={orderedPeriods} field="payroll_expenses" highlight />

            {/* ══ OTHER EXPENSES ════════════════════════════════════════════════ */}
            <SectionHeader label="Other Expenses" />

            <DriverRow
              label="Marketing / Advertising ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('marketing_monthly', m) / 100)}
              getDisplay={m => fmt(dv('marketing_monthly', m))}
              onChange={(m, v) => setMonthField('marketing_monthly', m, v, 100)}
            />
            <DriverRow
              label="Depreciation & Amort. ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('depreciation_monthly', m) / 100)}
              getDisplay={m => fmt(dv('depreciation_monthly', m))}
              onChange={(m, v) => setMonthField('depreciation_monthly', m, v, 100)}
            />
            <CalcRow label="Total Other Expenses" periods={orderedPeriods} field="overhead_expenses" />

            {/* ══ OTHER INCOME / EXPENSE ════════════════════════════════════════ */}
            <SectionHeader label="Other Income / Expense" />

            <DriverRow
              label="Other Income / Expense ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('other_income_expense_monthly', m) / 100)}
              getDisplay={m => fmt(dv('other_income_expense_monthly', m))}
              onChange={(m, v) => setMonthField('other_income_expense_monthly', m, v, 100)}
            />

            {/* ══ OWNER DRAWS ═══════════════════════════════════════════════════ */}
            <SectionHeader label="Owner Draws" />

            <DriverRow
              label="Distributions ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('owner_distributions', m) / 100)}
              getDisplay={m => fmt(dv('owner_distributions', m))}
              onChange={(m, v) => setMonthField('owner_distributions', m, v, 100)}
            />
            <DriverRow
              label="Tax Savings ($)"
              monthInts={monthInts} lockedMonths={lockedMonths}
              getValue={m => Math.round(dv('owner_tax_savings', m) / 100)}
              getDisplay={m => fmt(dv('owner_tax_savings', m))}
              onChange={(m, v) => setMonthField('owner_tax_savings', m, v, 100)}
            />
            <CalcRow label="Total Draws" periods={orderedPeriods} field="owner_total_draws" />

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
