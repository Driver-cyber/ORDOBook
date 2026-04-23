import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { getActuals, getActualsDetail } from '../api/ingestion'

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmt(cents) {
  if (cents === undefined || cents === null) return '—'
  const dollars = cents / 100
  const neg = dollars < 0
  const abs = Math.abs(dollars)
  let s
  if (abs >= 1_000_000) s = `$${(abs / 1_000_000).toFixed(2)}M`
  else s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(abs)
  return neg ? `(${s})` : s
}

function SectionHead({ label }) {
  return (
    <div className="px-5 py-1.5 bg-surface/60 border-b border-border/40">
      <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted">{label}</span>
    </div>
  )
}

function Row({ label, value, bold = false, indent = false }) {
  const neg = typeof value === 'number' && value < 0
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border/30 ${bold ? 'bg-surface/40' : ''}`}>
      <span className={`text-[12px] ${indent ? 'pl-8' : 'pl-5'} ${bold ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
        {label}
      </span>
      <span className={`font-mono text-[12px] pr-5 ${bold ? 'font-semibold text-text-primary' : neg ? 'text-[#c05a5a]' : 'text-text-secondary'}`}>
        {typeof value === 'number' ? fmt(value) : value || '—'}
      </span>
    </div>
  )
}

export default function ReportsActuals() {
  const { id } = useParams()
  const [periods, setPeriods] = useState([])
  const [selected, setSelected] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    getActuals(id)
      .then(all => {
        const confirmed = all.filter(p => p.status === 'confirmed')
        setPeriods(all)
        // Default to latest confirmed, or latest overall
        const best = confirmed.length > 0 ? confirmed[confirmed.length - 1] : all[all.length - 1]
        if (best) setSelected(best)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (!selected) return
    setDetailLoading(true)
    getActualsDetail(id, selected.fiscal_year, selected.month)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setDetailLoading(false))
  }, [id, selected])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  if (periods.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="text-text-muted text-3xl mb-3">◎</div>
      <p className="font-display font-semibold text-text-primary mb-1">No actuals imported</p>
      <p className="text-text-muted text-[12px]">Import QuickBooks data from the Workspace tab to get started.</p>
    </div>
  )

  // Derived values
  const d = data
  const grossProfit = d ? d.revenue - d.cost_of_sales : null
  const totalExpenses = d ? (d.total_expenses || (d.payroll_expenses + d.marketing_expenses + d.depreciation_amortization + d.overhead_expenses)) : null
  const netOpProfit = d ? grossProfit - totalExpenses : null
  const netProfit = d ? netOpProfit + d.other_income_expense : null
  const totalCurrentAssets = d ? d.cash + d.accounts_receivable + d.inventory + d.other_current_assets : null
  const totalAssets = d ? totalCurrentAssets + d.total_fixed_assets + d.total_other_long_term_assets : null
  const totalCurrentLiab = d ? d.accounts_payable + d.other_current_liabilities : null
  const totalLiab = d ? totalCurrentLiab + d.total_long_term_liabilities : null
  const totalEquity = d ? d.equity_before_net_profit + d.net_profit_for_year : null
  const totalLiabEquity = d ? totalLiab + totalEquity : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Actuals</h1>
          {selected && (
            <p className="text-text-muted text-[12px] mt-0.5">
              {MONTH_NAMES[selected.month]} {selected.fiscal_year}
              {selected.status === 'draft' && <span className="ml-2 text-accent">· draft</span>}
            </p>
          )}
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-text-muted">Period:</span>
          <select
            value={selected ? `${selected.fiscal_year}-${selected.month}` : ''}
            onChange={e => {
              const [y, m] = e.target.value.split('-').map(Number)
              setSelected(periods.find(p => p.fiscal_year === y && p.month === m))
            }}
            className="border border-border rounded-lg px-2 py-1.5 text-[12px] text-text-primary
              bg-bg outline-none focus:border-accent/50 transition-colors cursor-pointer"
          >
            {[...periods].reverse().map(p => (
              <option key={p.id} value={`${p.fiscal_year}-${p.month}`}>
                {MONTH_NAMES[p.month]} {p.fiscal_year}
                {p.status === 'draft' ? ' (draft)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {detailLoading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm">Loading…</div>
        ) : !d ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm">No data for this period.</div>
        ) : (
          <div className="max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Income Statement */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-display font-semibold text-sm text-text-primary">Income Statement</h2>
                <p className="text-text-muted text-[11px] mt-0.5">
                  {MONTH_NAMES[selected.month]} {selected.fiscal_year}
                </p>
              </div>
              <SectionHead label="Revenue" />
              <Row label="Revenue" value={d.revenue} />
              <Row label="Cost of Sales" value={d.cost_of_sales} />
              <Row label="Gross Profit" value={grossProfit} bold />
              <SectionHead label="Operating Expenses" />
              <Row label="Payroll" value={d.payroll_expenses} indent />
              <Row label="Marketing" value={d.marketing_expenses} indent />
              <Row label="Depreciation & Amortization" value={d.depreciation_amortization} indent />
              <Row label="Overhead" value={d.overhead_expenses} indent />
              <Row label="Total Expenses" value={totalExpenses} bold />
              <Row label="Net Operating Profit" value={netOpProfit} bold />
              <SectionHead label="Other" />
              <Row label="Other Income / (Expense)" value={d.other_income_expense} />
              <Row label="Net Profit" value={netProfit} bold />
            </div>

            {/* Balance Sheet */}
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-display font-semibold text-sm text-text-primary">Balance Sheet</h2>
                <p className="text-text-muted text-[11px] mt-0.5">
                  As of {MONTH_NAMES[selected.month]} {selected.fiscal_year}
                </p>
              </div>
              <SectionHead label="Current Assets" />
              <Row label="Cash" value={d.cash} indent />
              <Row label="Accounts Receivable" value={d.accounts_receivable} indent />
              <Row label="Inventory" value={d.inventory} indent />
              <Row label="Other Current Assets" value={d.other_current_assets} indent />
              <Row label="Total Current Assets" value={totalCurrentAssets} bold />
              <SectionHead label="Long-Term Assets" />
              <Row label="Fixed Assets" value={d.total_fixed_assets} indent />
              <Row label="Other Long-Term Assets" value={d.total_other_long_term_assets} indent />
              <Row label="Total Assets" value={totalAssets} bold />
              <SectionHead label="Current Liabilities" />
              <Row label="Accounts Payable" value={d.accounts_payable} indent />
              <Row label="Other Current Liabilities" value={d.other_current_liabilities} indent />
              <Row label="Total Current Liabilities" value={totalCurrentLiab} bold />
              <SectionHead label="Long-Term Liabilities" />
              <Row label="Long-Term Liabilities" value={d.total_long_term_liabilities} indent />
              <Row label="Total Liabilities" value={totalLiab} bold />
              <SectionHead label="Equity" />
              <Row label="Retained Equity" value={d.equity_before_net_profit} indent />
              <Row label="Net Profit for Year" value={d.net_profit_for_year} indent />
              <Row label="Total Equity" value={totalEquity} bold />
              <Row label="Total Liabilities & Equity" value={totalLiabEquity} bold />
            </div>

          </div>
        )}
      </div>
    </div>
  )
}
