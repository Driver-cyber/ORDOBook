import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForecastView } from '../api/forecast'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const S = {
  bg: '#f5f3ef',
  surface: '#ffffff',
  border: '#dedad4',
  text: '#1a1918',
  textSecondary: '#5a5751',
  textMuted: '#9a9590',
  gold: '#c8a96e',
  actualsText: '#b0aba5',
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmt = (cents) => {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

const fmtPct = (num, denom) => {
  if (!denom) return '—'
  return `${((num / denom) * 100).toFixed(1)}%`
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

// ── A single data row ─────────────────────────────────────────────────────────

function DataRow({ label, values, ytd, highlight = false, muted = false, indent = false }) {
  const color = highlight ? S.gold : muted ? S.textMuted : S.textSecondary
  const weight = highlight ? 'font-semibold' : 'font-normal'
  const topBorder = highlight ? `1px solid ${S.border}` : 'none'

  return (
    <tr style={{ borderTop: topBorder }}>
      <td className={`px-3 py-2 text-[12px] ${weight} ${indent ? 'pl-7' : ''}`}
          style={{ color, width: 185 }}>
        {label}
      </td>
      {values.map((v, i) => (
        <td key={i}
            className={`text-right px-2 py-2 font-mono text-[12px] ${weight}`}
            style={{ color: v?.isActual ? S.actualsText : color, minWidth: 58 }}>
          {v?.display ?? '—'}
        </td>
      ))}
      <td className={`text-right px-2 py-2 font-mono text-[12px] ${weight}`}
          style={{ color: highlight ? S.gold : S.textMuted }}>
        {ytd ?? '—'}
      </td>
    </tr>
  )
}

// ── Divider spacer ────────────────────────────────────────────────────────────

function Divider() {
  return (
    <tr>
      <td colSpan={14} style={{ borderTop: `1px solid ${S.border}`, padding: 0 }} />
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ForecastReport() {
  const { id, year } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const fiscalYear = Number(year)

  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const data = await getForecastView(clientId, fiscalYear)
      setPeriods(data.periods)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [clientId, fiscalYear])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: S.textMuted }}>Loading report…</span>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: '#b04040' }}>{error}</span>
      </main>
    )
  }

  // Build ordered 12-month array, filling gaps with null
  const periodByMonth = Object.fromEntries(periods.map(p => [p.month, p]))
  const ordered = Array.from({ length: 12 }, (_, i) => periodByMonth[i + 1] ?? null)
  const actualsMonths = new Set(periods.filter(p => p.source_type === 'actual').map(p => p.month))

  // Helper: build a value cell object for a period field
  const cell = (p, field) => ({
    display: fmt(p?.[field] ?? 0),
    isActual: p?.source_type === 'actual',
  })

  // YTD sum of a field
  const ytd = (field) => fmt(ordered.reduce((s, p) => s + (p?.[field] ?? 0), 0))

  // Gross margin % row: per month and YTD
  const gpPct = ordered.map(p => ({
    display: p ? fmtPct(p.gross_profit, p.revenue) : '—',
    isActual: p?.source_type === 'actual',
  }))
  const ytdRevenue = ordered.reduce((s, p) => s + (p?.revenue ?? 0), 0)
  const ytdGP = ordered.reduce((s, p) => s + (p?.gross_profit ?? 0), 0)
  const ytdGPPct = fmtPct(ytdGP, ytdRevenue)

  // Job count row
  const jobCountCells = ordered.map(p => ({
    display: p?.total_job_count ? String(p.total_job_count) : '—',
    isActual: p?.source_type === 'actual',
  }))
  const ytdJobs = ordered.reduce((s, p) => s + (p?.total_job_count ?? 0), 0)

  // Blended avg job value row
  const avgValueCells = ordered.map(p => ({
    display: p?.blended_avg_job_value ? fmt(p.blended_avg_job_value) : '—',
    isActual: p?.source_type === 'actual',
  }))

  return (
    <main className="flex-1 overflow-auto" style={{ background: S.bg }}>

      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-xl" style={{ color: S.text }}>
            12-Month Report
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: S.textMuted }}>
            {fiscalYear} · Dimmed values are confirmed actuals
          </p>
        </div>
        <button
          onClick={() => navigate(`/clients/${id}/forecast/${year}`)}
          className="px-4 py-1.5 rounded text-[12px] font-medium border transition-colors"
          style={{ borderColor: S.border, color: S.textSecondary, background: S.surface }}
        >
          ← Edit Drivers
        </button>
      </div>

      <div className="px-8 pb-16 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 960 }}>

          {/* Column headers */}
          <thead>
            <tr style={{ borderBottom: `1px solid ${S.border}` }}>
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
              <th className="text-right px-2 py-2 text-[11px] font-mono"
                  style={{ color: S.textMuted }}>
                YTD
              </th>
            </tr>
          </thead>

          <tbody>

            {/* ══ REVENUE ══════════════════════════════════════════════════════ */}
            <SectionHeader label="Revenue" />
            <DataRow label="Total Revenue" values={ordered.map(p => cell(p, 'revenue'))} ytd={ytd('revenue')} highlight />
            <DataRow label="Total Jobs" values={jobCountCells} ytd={String(ytdJobs)} muted />
            <DataRow label="Blended Avg Job Value" values={avgValueCells} ytd="—" muted />

            {/* ══ COST OF SALES ════════════════════════════════════════════════ */}
            <SectionHeader label="Cost of Sales" />
            <DataRow label="Cost of Sales" values={ordered.map(p => cell(p, 'cost_of_sales'))} ytd={ytd('cost_of_sales')} />
            <DataRow label="Gross Profit" values={ordered.map(p => cell(p, 'gross_profit'))} ytd={ytd('gross_profit')} highlight />
            <DataRow label="Gross Margin %" values={gpPct} ytd={ytdGPPct} muted />

            {/* ══ OPERATING EXPENSES ═══════════════════════════════════════════ */}
            <SectionHeader label="Operating Expenses" />
            <DataRow label="Payroll" values={ordered.map(p => cell(p, 'payroll_expenses'))} ytd={ytd('payroll_expenses')} />
            <DataRow label="Marketing / Advertising" values={ordered.map(p => cell(p, 'marketing_expenses'))} ytd={ytd('marketing_expenses')} indent />
            <DataRow label="Depreciation & Amort." values={ordered.map(p => cell(p, 'depreciation_amortization'))} ytd={ytd('depreciation_amortization')} indent />
            <DataRow label="Other Overhead" values={ordered.map(p => cell(p, 'overhead_expenses'))} ytd={ytd('overhead_expenses')} indent />
            <DataRow label="Total Other Expenses" values={ordered.map(p => cell(p, 'total_other_expenses'))} ytd={ytd('total_other_expenses')} />
            <DataRow
              label="Total Operating Expenses"
              values={ordered.map(p => ({
                display: fmt((p?.payroll_expenses ?? 0) + (p?.total_other_expenses ?? 0)),
                isActual: p?.source_type === 'actual',
              }))}
              ytd={fmt(ordered.reduce((s, p) => s + (p?.payroll_expenses ?? 0) + (p?.total_other_expenses ?? 0), 0))}
              highlight
            />

            {/* ══ PROFIT ═══════════════════════════════════════════════════════ */}
            <SectionHeader label="Profit" />
            <DataRow label="Net Operating Profit" values={ordered.map(p => cell(p, 'net_operating_profit'))} ytd={ytd('net_operating_profit')} highlight />
            <DataRow label="Other Income / Expense" values={ordered.map(p => cell(p, 'other_income_expense'))} ytd={ytd('other_income_expense')} muted />
            <Divider />
            <DataRow label="Net Profit" values={ordered.map(p => cell(p, 'net_profit'))} ytd={ytd('net_profit')} highlight />

          </tbody>
        </table>
      </div>
    </main>
  )
}
