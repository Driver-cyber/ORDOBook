import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getActuals, getActualsDetail, updateActuals, getMappingReviewData } from '../api/ingestion'
import { calculateForecast } from '../api/forecast'

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
}

function fmt(cents) {
  if (cents === null || cents === undefined) return '—'
  const dollars = cents / 100
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`
  if (Math.abs(dollars) >= 1000) return `$${(dollars / 1000).toFixed(1)}k`
  return `$${dollars.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function SectionHeader({ label, colCount }) {
  return (
    <tr>
      <td colSpan={colCount + 1} className="px-3 pt-6 pb-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.15em]"
             style={{ color: S.textMuted }}>
          {label}
        </div>
        <div style={{ borderBottom: `1px solid ${S.border}`, marginTop: 4 }} />
      </td>
    </tr>
  )
}

function DataRow({ label, values, highlight = false, muted = false, indent = false, isText = false }) {
  const color = highlight ? S.gold : muted ? S.textMuted : S.textSecondary
  const weight = highlight ? 'font-semibold' : 'font-normal'
  const topBorder = highlight ? `1px solid ${S.border}` : 'none'

  return (
    <tr style={{ borderTop: topBorder }}>
      <td
        className={`px-3 py-2 text-[12px] ${weight} ${indent ? 'pl-7' : ''}`}
        style={{ color, width: 210, position: 'sticky', left: 0, background: S.bg, zIndex: 1 }}
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
          {isText ? v : fmt(v)}
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

function calcs(d) {
  const grossProfit = d.revenue - d.cost_of_sales
  const totalExpenses = d.total_expenses ||
    (d.payroll_expenses + d.marketing_expenses + d.depreciation_amortization + d.overhead_expenses)
  const netOperatingProfit = grossProfit - totalExpenses
  const netProfit = netOperatingProfit + d.other_income_expense
  const totalCurrentAssets = d.cash + d.accounts_receivable + d.inventory + d.other_current_assets
  const totalAssets = totalCurrentAssets + d.total_fixed_assets + d.total_other_long_term_assets
  const totalCurrentLiabilities = d.accounts_payable + d.other_current_liabilities
  const totalLiabilities = totalCurrentLiabilities + d.total_long_term_liabilities
  const totalEquity = d.equity_before_net_profit + d.net_profit_for_year
  const totalLiabilitiesEquity = totalLiabilities + totalEquity
  const dso = d.revenue > 0 ? Math.round(d.accounts_receivable / d.revenue * 30) : 0
  const dio = d.cost_of_sales > 0 ? Math.round(d.inventory / d.cost_of_sales * 30) : 0
  const dpo = d.cost_of_sales > 0 ? Math.round(d.accounts_payable / d.cost_of_sales * 30) : 0
  return {
    grossProfit, totalExpenses, netOperatingProfit, netProfit,
    totalCurrentAssets, totalAssets, totalCurrentLiabilities, totalLiabilities,
    totalEquity, totalLiabilitiesEquity, dso, dio, dpo,
  }
}

export default function ActualsHistory() {
  const { id } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)

  const [periods, setPeriods] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [loadingMapping, setLoadingMapping] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const list = await getActuals(clientId)
      if (list.length === 0) { setPeriods([]); setLoading(false); return }
      const details = await Promise.all(
        list.map(p => getActualsDetail(clientId, p.fiscal_year, p.month))
      )
      // Backend already orders by fiscal_year, month ASC
      setPeriods(details)
    } catch (e) {
      setError(e.message || 'Failed to load actuals history')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const draftPeriods = periods.filter(p => p.status === 'draft')

  const handleConfirmAll = async () => {
    setConfirming(true)
    setError(null)
    try {
      await Promise.all(
        draftPeriods.map(p => updateActuals(clientId, p.fiscal_year, p.month, { status: 'confirmed' }))
      )
      // Auto-sync forecast for each affected fiscal year — silently skip missing configs
      const affectedYears = [...new Set(draftPeriods.map(p => p.fiscal_year))]
      await Promise.all(affectedYears.map(y => calculateForecast(clientId, y).catch(() => {})))
      await load()
    } catch (e) {
      setError(e.message || 'Failed to confirm actuals')
    }
    setConfirming(false)
  }

  const handleReviewMapping = async () => {
    setLoadingMapping(true)
    try {
      const preview = await getMappingReviewData(clientId)
      navigate(`/clients/${id}/mapping-review`, {
        state: { preview, sourceFiles: preview.source_files || [] }
      })
    } catch (e) {
      alert('Could not load import data. Try re-importing your QB files.')
    } finally {
      setLoadingMapping(false)
    }
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: S.textMuted }}>Loading history…</span>
      </main>
    )
  }

  if (error) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: S.red }}>{error}</span>
      </main>
    )
  }

  if (periods.length === 0) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-3" style={{ background: S.bg }}>
        <span className="font-mono text-[12px]" style={{ color: S.textMuted }}>No actuals imported yet.</span>
        <button
          onClick={() => navigate(`/clients/${id}/upload`)}
          className="px-4 py-1.5 rounded text-[12px] font-medium border"
          style={{ borderColor: S.border, color: S.textSecondary, background: S.surface }}
        >
          Import Data
        </button>
      </main>
    )
  }

  const computed = periods.map(calcs)
  const n = periods.length

  return (
    <main className="flex-1 overflow-auto" style={{ background: S.bg }}>

      {/* Header */}
      <div className="px-8 pt-8 pb-4 flex items-center justify-between">
        <div>
          <h1 className="font-display font-semibold text-xl" style={{ color: S.text }}>
            Actuals History
          </h1>
          <p className="text-[12px] mt-0.5" style={{ color: S.textMuted }}>
            {n} period{n !== 1 ? 's' : ''} imported
            {draftPeriods.length > 0 && (
              <span style={{ color: S.gold }}> · {draftPeriods.length} pending confirmation</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {draftPeriods.length > 0 && (
            <button
              onClick={handleConfirmAll}
              disabled={confirming}
              className="px-4 py-1.5 rounded text-[12px] font-medium transition-colors"
              style={{
                background: S.gold,
                color: '#fff',
                opacity: confirming ? 0.5 : 1,
                cursor: confirming ? 'not-allowed' : 'pointer',
              }}
            >
              {confirming ? 'Confirming…' : `Confirm All (${draftPeriods.length})`}
            </button>
          )}
          <button
            onClick={handleReviewMapping}
            disabled={loadingMapping}
            className="px-4 py-1.5 rounded text-[12px] font-medium border"
            style={{ borderColor: S.border, color: S.textSecondary, background: S.surface, opacity: loadingMapping ? 0.5 : 1, cursor: loadingMapping ? 'not-allowed' : 'pointer' }}
          >
            {loadingMapping ? 'Loading…' : 'Review Mapping'}
          </button>
          <button
            onClick={() => navigate(`/clients/${id}`)}
            className="px-4 py-1.5 rounded text-[12px] font-medium border"
            style={{ borderColor: S.border, color: S.textSecondary, background: S.surface }}
          >
            ← Workspace
          </button>
        </div>
      </div>

      <div className="px-8 pb-16 overflow-x-auto">
        <table className="border-collapse">

          {/* Column headers */}
          <thead>
            <tr style={{ borderBottom: `1px solid ${S.border}` }}>
              <th
                className="text-left px-3 py-2"
                style={{
                  width: 210,
                  position: 'sticky', left: 0,
                  background: S.bg, zIndex: 2,
                }}
              />
              {periods.map((p, i) => (
                <th key={i} className="text-right px-3 py-2" style={{ minWidth: 80 }}>
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="font-mono text-[11px]" style={{ color: S.textSecondary }}>
                      {MONTH_ABBR[p.month]}{' '}
                      <span style={{ color: S.textMuted, fontSize: 10 }}>
                        '{String(p.fiscal_year).slice(2)}
                      </span>
                    </span>
                    <span
                      className="font-mono text-[9px]"
                      style={{ color: p.status === 'draft' ? S.gold : S.textMuted }}
                    >
                      {p.status === 'draft' ? '● draft' : '✓'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>

            {/* ══ INCOME STATEMENT ════════════════════════════════════════════ */}
            <SectionHeader label="Income Statement" colCount={n} />
            <DataRow label="Revenue"            values={periods.map(d => d.revenue)}         highlight />
            <DataRow label="Job Count"           values={periods.map(d => String(d.job_count))} muted isText />
            <DataRow label="Cost of Sales"       values={periods.map(d => d.cost_of_sales)} />
            <DataRow label="Gross Profit"        values={computed.map(c => c.grossProfit)}   highlight />

            <SectionHeader label="Operating Expenses" colCount={n} />
            <DataRow label="Payroll"                    values={periods.map(d => d.payroll_expenses)} />
            <DataRow label="Marketing"                  values={periods.map(d => d.marketing_expenses)} indent />
            <DataRow label="Depreciation & Amort."      values={periods.map(d => d.depreciation_amortization)} indent />
            <DataRow label="Overhead"                   values={periods.map(d => d.overhead_expenses)} indent />
            <DataRow label="Total Expenses"             values={computed.map(c => c.totalExpenses)}    highlight />
            <DataRow label="Net Operating Profit"       values={computed.map(c => c.netOperatingProfit)} highlight />

            <SectionHeader label="Other" colCount={n} />
            <DataRow label="Other Income / (Expense)" values={periods.map(d => d.other_income_expense)} muted />
            <Divider colCount={n} />
            <DataRow label="Net Profit" values={computed.map(c => c.netProfit)} highlight />

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
            <DataRow label="Net Profit for Year"         values={periods.map(d => d.net_profit_for_year)} />
            <DataRow label="Total Equity"                values={computed.map(c => c.totalEquity)}           highlight />
            <DataRow label="Total Liabilities & Equity"  values={computed.map(c => c.totalLiabilitiesEquity)} highlight />

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

    </main>
  )
}
