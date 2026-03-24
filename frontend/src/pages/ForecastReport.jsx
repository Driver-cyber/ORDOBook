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

// ── Derived formula descriptions ─────────────────────────────────────────────

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
          <Tooltip content={v?.trace}>
            {v?.display ?? '—'}
          </Tooltip>
        </td>
      ))}
      <td className={`text-right px-2 py-2 font-mono text-[12px] ${weight}`}
          style={{ color: highlight ? S.gold : S.textMuted }}>
        {ytd ?? '—'}
      </td>
    </tr>
  )
}

// ── Sub-section label (lightweight, within a section) ─────────────────────────

function SubHeader({ label }) {
  return (
    <tr>
      <td colSpan={14} className="px-3 pt-3 pb-0.5">
        <span className="font-mono text-[9px] uppercase tracking-[0.14em]"
              style={{ color: S.textMuted, opacity: 0.7 }}>
          {label}
        </span>
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
    trace: p?.source_type === 'actual'
      ? 'Confirmed actual'
      : (DERIVED_FORMULAS[field] ?? p?.calc_trace?.[field]?.formula ?? null),
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

  // Stored delta fields — build cell from stored field (sign already correct from engine)
  const deltaCell = (p, field) => {
    if (!p) return { display: '—', isActual: false, trace: null }
    return {
      display: fmt(p[field] ?? 0),
      isActual: p.source_type === 'actual',
      trace: p.source_type === 'actual' ? 'Confirmed actual' : null,
    }
  }
  const arChangeCells  = ordered.map(p => deltaCell(p, 'ar_change'))
  const invChangeCells = ordered.map(p => deltaCell(p, 'inventory_change'))
  const apChangeCells  = ordered.map(p => deltaCell(p, 'ap_change'))
  const capexCells     = ordered.map(p => deltaCell(p, 'capex'))
  const otherCaCells   = ordered.map(p => deltaCell(p, 'other_current_assets_change'))
  const currDebtCells  = ordered.map(p => deltaCell(p, 'current_debt_change'))
  const ltDebtCells    = ordered.map(p => deltaCell(p, 'long_term_debt_change'))

  // For Projected Balances — show ending value (Dec or latest), not a sum
  const lastBalance = (field) =>
    [...ordered].reverse().find(p => p?.[field] != null)?.[field] ?? null
  const lastBalanceFmt = (field) => {
    const last = lastBalance(field)
    return last != null ? fmt(last) : '—'
  }

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
                trace: p?.source_type === 'actual' ? 'Confirmed actual' : 'Payroll + Other Expenses',
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

            {/* ══ CASH FLOW ════════════════════════════════════════════════════ */}
            <SectionHeader label="Cash Flow" />

            <SubHeader label="Working Capital" />
            <DataRow label="AR Change"           values={arChangeCells}  ytd={ytd('ar_change')} muted />
            <DataRow label="Inventory Change"    values={invChangeCells} ytd={ytd('inventory_change')} muted />
            <DataRow label="AP Change"           values={apChangeCells}  ytd={ytd('ap_change')} muted />
            <DataRow label="Owner Distributions" values={ordered.map(p => cell(p, 'owner_distributions'))} ytd={ytd('owner_distributions')} />
            <DataRow label="Tax Savings Reserve" values={ordered.map(p => cell(p, 'owner_tax_savings'))} ytd={ytd('owner_tax_savings')} />

            <SubHeader label="Investing & Financing" />
            <DataRow label="CapEx"                  values={capexCells}    ytd={ytd('capex')} muted />
            <DataRow label="Other Current Assets Δ" values={otherCaCells}  ytd={ytd('other_current_assets_change')} muted />
            <DataRow label="Current Debt Change"    values={currDebtCells} ytd={ytd('current_debt_change')} muted />
            <DataRow label="LT Debt Change"         values={ltDebtCells}   ytd={ytd('long_term_debt_change')} muted />

            <Divider />
            <DataRow label="Net Cash Flow" values={ordered.map(p => cell(p, 'net_cash_flow'))} ytd={ytd('net_cash_flow')} highlight />

            {/* ══ PROJECTED BALANCE SHEET ══════════════════════════════════════ */}
            <SectionHeader label="Projected Balance Sheet" />

            <SubHeader label="Assets" />
            <DataRow label="Accounts Receivable"  values={ordered.map(p => cell(p, 'projected_ar'))}                   ytd={lastBalanceFmt('projected_ar')} indent />
            <DataRow label="Inventory"            values={ordered.map(p => cell(p, 'projected_inventory'))}             ytd={lastBalanceFmt('projected_inventory')} indent muted />
            <DataRow label="Other Current Assets" values={ordered.map(p => cell(p, 'projected_other_current_assets'))} ytd={lastBalanceFmt('projected_other_current_assets')} indent muted />
            {/* Cash, Total Current Assets, Non-Current Assets, Total Assets — Phase 3d */}

            <SubHeader label="Liabilities" />
            <DataRow label="Accounts Payable"        values={ordered.map(p => cell(p, 'projected_ap'))}           ytd={lastBalanceFmt('projected_ap')} indent />
            <DataRow label="Other Current Liabilities" values={ordered.map(p => cell(p, 'projected_current_debt'))} ytd={lastBalanceFmt('projected_current_debt')} indent muted />
            <DataRow label="Long-Term Liabilities"   values={ordered.map(p => cell(p, 'projected_long_term_debt'))} ytd={lastBalanceFmt('projected_long_term_debt')} indent muted />
            {/* Total Liabilities, Total Equity — Phase 3d */}

            {/* ══ PROJECTED P&L SUMMARY ════════════════════════════════════════ */}
            <SectionHeader label="Projected P&L Summary" />
            <DataRow label="Revenue"               values={ordered.map(p => cell(p, 'revenue'))}               ytd={ytd('revenue')} highlight />
            <DataRow label="Cost of Sales"         values={ordered.map(p => cell(p, 'cost_of_sales'))}         ytd={ytd('cost_of_sales')} indent muted />
            <DataRow label="Gross Profit"          values={ordered.map(p => cell(p, 'gross_profit'))}          ytd={ytd('gross_profit')} highlight />
            <DataRow label="Payroll"               values={ordered.map(p => cell(p, 'payroll_expenses'))}      ytd={ytd('payroll_expenses')} indent muted />
            <DataRow label="Marketing / Advertising" values={ordered.map(p => cell(p, 'marketing_expenses'))} ytd={ytd('marketing_expenses')} indent muted />
            <DataRow label="Depreciation & Amort." values={ordered.map(p => cell(p, 'depreciation_amortization'))} ytd={ytd('depreciation_amortization')} indent muted />
            <DataRow label="Other Overhead"        values={ordered.map(p => cell(p, 'overhead_expenses'))}    ytd={ytd('overhead_expenses')} indent muted />
            <DataRow label="Total Operating Expenses"
              values={ordered.map(p => ({
                display: fmt((p?.payroll_expenses ?? 0) + (p?.total_other_expenses ?? 0)),
                isActual: p?.source_type === 'actual',
                trace: 'Payroll + Other Expenses',
              }))}
              ytd={fmt(ordered.reduce((s, p) => s + (p?.payroll_expenses ?? 0) + (p?.total_other_expenses ?? 0), 0))}
            />
            <DataRow label="Other Income / Expense" values={ordered.map(p => cell(p, 'other_income_expense'))} ytd={ytd('other_income_expense')} muted />
            <Divider />
            <DataRow label="Net Profit"            values={ordered.map(p => cell(p, 'net_profit'))}            ytd={ytd('net_profit')} highlight />

          </tbody>
        </table>
      </div>
    </main>
  )
}
