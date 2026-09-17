// Actuals grid — the month-by-month Balance Sheet / P&L view of imported
// actuals. Rendered by the Workspace → Actuals tab (one fiscal year per
// screen); the old standalone /actuals/history route now redirects there.

import { calcs } from '../lib/actuals'

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const S = {
  bg: '#f5f3ef',
  surface: '#ffffff',
  border: '#dedad4',
  text: '#1a1918',
  textSecondary: '#5a5751',
  textMuted: '#9a9590',
  gold: '#c8a96e',
  red: '#c05a5a',
  rowLine: 'rgba(222,218,212,0.55)',
  band: '#f7f5f2',
  calcBg: '#faf9f7',
}

export function fmt(cents) {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

// The label column pins left and the month header pins top; the corner cell
// does both and sits above each. Backgrounds are opaque so rows slide under.
const stickyLeft = { position: 'sticky', left: 0, zIndex: 1 }
const stickyTop = { position: 'sticky', top: 0, background: S.surface, zIndex: 3, boxShadow: `inset 0 -1px 0 ${S.border}` }
const stickyCorner = { ...stickyTop, left: 0, zIndex: 4 }

function SectionHeader({ label, colCount }) {
  return (
    <tr style={{ background: S.band, borderBottom: `1px solid ${S.rowLine}` }}>
      <td colSpan={colCount + 1} className="px-3 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.15em]" style={{ color: S.textMuted }}>
          {label}
        </span>
      </td>
    </tr>
  )
}

function DataRow({ label, values, highlight = false, muted = false, indent = false, isText = false, onCell, cellTitle }) {
  const color = highlight ? S.text : muted ? S.textMuted : S.textSecondary
  const weight = highlight ? 'font-semibold' : 'font-normal'
  const rowBg = highlight ? S.calcBg : S.surface

  return (
    <tr style={{ borderBottom: `1px solid ${S.rowLine}`, background: rowBg }}>
      <td
        className={`px-3 py-2 text-[12px] ${weight} ${indent ? 'pl-7' : ''}`}
        style={{ color: highlight ? S.textSecondary : color, width: 210, background: rowBg, ...stickyLeft }}
      >
        {label}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={`text-right px-3 py-2 font-mono text-[12px] ${weight}`}
          style={{
            color: isText ? color : (typeof v === 'number' && v < 0 && !highlight ? S.red : color),
            minWidth: 80,
          }}
        >
          {onCell ? (
            <button type="button" onClick={() => onCell(i)} title={cellTitle}
                    className="w-full text-right hover:underline decoration-dashed underline-offset-2"
                    style={{ color: 'inherit' }}>
              {isText ? v : fmt(v)}
            </button>
          ) : (isText ? v : fmt(v))}
        </td>
      ))}
    </tr>
  )
}

function Divider({ colCount }) {
  return (
    <tr>
      <td colSpan={colCount + 1} style={{ borderTop: `1px solid ${S.border}`, padding: 0 }} />
    </tr>
  )
}


/**
 * The grid itself. `periods` are full actuals detail records in month order;
 * `onOpenMonth(period)` makes each month header a link to that month's detail.
 * The caller owns the scroll box so it can place the grid under its own header.
 */
export function ActualsGrid({ periods, onOpenMonth, onOpenOverhead }) {
  const computed = periods.map(calcs)
  const n = periods.length

  return (
    <div className="rounded-xl inline-block min-w-full" style={{ background: S.surface, border: `1px solid ${S.border}` }}>
    <table className="border-collapse w-full">
      <thead>
        <tr>
          <th className="text-left px-3 py-2" style={{ width: 210, ...stickyCorner }} />
          {periods.map((p, i) => (
            <th key={i} className="text-right px-3 py-2" style={{ minWidth: 80, ...stickyTop }}>
              <button
                type="button"
                onClick={() => onOpenMonth && onOpenMonth(p)}
                title={`Open ${MONTH_ABBR[p.month]} ${p.fiscal_year}`}
                className="flex flex-col items-end gap-0.5 w-full transition-colors"
                style={{ color: S.textSecondary }}
                onMouseEnter={e => { e.currentTarget.style.color = S.gold }}
                onMouseLeave={e => { e.currentTarget.style.color = S.textSecondary }}
              >
                <span className="font-mono text-[11px]">
                  <span>{MONTH_ABBR[p.month]}</span>{' '}
                  <span style={{ color: S.textMuted, fontSize: 10 }}>
                    '{String(p.fiscal_year).slice(2)}
                  </span>
                </span>
                {/* Only drafts get a marker — everything on this grid is an actual. */}
                {p.status === 'draft' && (
                  <span className="font-mono text-[9px]" style={{ color: S.gold }}>● draft</span>
                )}
              </button>
            </th>
          ))}
        </tr>
      </thead>

      <tbody>

        {/* ══ BALANCE SHEET — ASSETS ══════════════════════════════════════ */}
        <SectionHeader label="Assets" colCount={n} />
        <DataRow label="Cash"                   values={periods.map(d => d.cash)} />
        <DataRow label="Accounts Receivable"    values={periods.map(d => d.accounts_receivable)} />
        <DataRow label="Inventory"              values={periods.map(d => d.inventory)} />
        <DataRow label="Other Current Assets"   values={periods.map(d => d.other_current_assets)} />
        <DataRow label="Total Current Assets"   values={computed.map(c => c.totalCurrentAssets)}  highlight />
        <DataRow label="Fixed Assets"           values={periods.map(d => d.total_fixed_assets)} />
        <DataRow label="Other LT Assets"        values={periods.map(d => d.total_other_long_term_assets)} />
        <DataRow label="Total Assets"           values={computed.map(c => c.totalAssets)}         highlight />

        {/* ══ BALANCE SHEET — LIABILITIES ═════════════════════════════════ */}
        <SectionHeader label="Liabilities" colCount={n} />
        <DataRow label="Accounts Payable"          values={periods.map(d => d.accounts_payable)} />
        <DataRow label="Other Current Liabilities" values={periods.map(d => d.other_current_liabilities)} />
        <DataRow label="Total Current Liabilities" values={computed.map(c => c.totalCurrentLiabilities)} highlight />
        <DataRow label="Long-Term Liabilities"     values={periods.map(d => d.total_long_term_liabilities)} />
        <DataRow label="Total Liabilities"         values={computed.map(c => c.totalLiabilities)}           highlight />

        {/* ══ BALANCE SHEET — EQUITY ══════════════════════════════════════ */}
        <SectionHeader label="Equity" colCount={n} />
        <DataRow label="Equity (excl. Net Profit)"  values={periods.map(d => d.equity_before_net_profit)} />
        <DataRow label="Owner Investments / (Distributions)" values={periods.map(d => d.owner_distributions ?? 0)} />
        <DataRow label="Net Profit for Year"         values={periods.map(d => d.net_profit_for_year)} />
        <DataRow label="Total Equity"                values={computed.map(c => c.totalEquity)}           highlight />
        <DataRow label="Total Liabilities & Equity"  values={computed.map(c => c.totalLiabilitiesEquity)} highlight />

        {/* ══ OPERATIONS (non-accounting) ═══════════════════════════════ */}
        <SectionHeader label="Operations" colCount={n} />
        <DataRow label="Job Count"           values={periods.map(d => String(d.job_count))} muted isText />

        {/* ══ INCOME STATEMENT ════════════════════════════════════════════ */}
        <SectionHeader label="Income Statement" colCount={n} />
        <DataRow label="Revenue"            values={periods.map(d => d.revenue)}         highlight />
        <DataRow label="Cost of Sales"       values={periods.map(d => d.cost_of_sales)} />
        <DataRow label="Gross Profit"        values={computed.map(c => c.grossProfit)}   highlight />

        <SectionHeader label="Operating Expenses" colCount={n} />
        <DataRow label="Payroll"                    values={periods.map(d => d.payroll_expenses)} />
        <DataRow label="Marketing"                  values={periods.map(d => d.marketing_expenses)} indent />
        <DataRow label="Depreciation & Amort."      values={periods.map(d => d.depreciation_amortization)} indent />
        <DataRow label="Overhead"                   values={periods.map(d => d.overhead_expenses)} indent
                 onCell={onOpenOverhead ? (i => onOpenOverhead(periods[i])) : undefined}
                 cellTitle="Open the accounts behind this figure" />
        <DataRow label="Total Expenses"             values={computed.map(c => c.totalExpenses)}    highlight />
        <DataRow label="Net Operating Profit"       values={computed.map(c => c.netOperatingProfit)} highlight />

        <SectionHeader label="Other" colCount={n} />
        <DataRow label="Other Income / (Expense)" values={periods.map(d => d.other_income_expense)} muted />
        <Divider colCount={n} />
        <DataRow label="Net Profit" values={computed.map(c => c.netProfit)} highlight />

        {/* ══ CASH FLOW INDICATORS ════════════════════════════════════════ */}
        <SectionHeader label="Cash Flow Indicators" colCount={n} />
        <DataRow label="Days Sales Outstanding (DSO)"      values={computed.map(c => `${c.dso}d`)} muted isText />
        <DataRow label="Days Inventory Outstanding (DIO)"  values={computed.map(c => `${c.dio}d`)} muted isText />
        <DataRow label="Days Payable Outstanding (DPO)"    values={computed.map(c => `${c.dpo}d`)} muted isText />

        <SectionHeader label="Working Capital Balances" colCount={n} />
        <DataRow label="Accounts Receivable" values={periods.map(d => d.accounts_receivable)} />
        <DataRow label="Inventory"           values={periods.map(d => d.inventory)} />
        <DataRow label="Accounts Payable"    values={periods.map(d => d.accounts_payable)} />
        <Divider colCount={n} />
        <DataRow label="Net Profit"          values={computed.map(c => c.netProfit)} highlight />

      </tbody>
    </table>
    </div>
  )
}

