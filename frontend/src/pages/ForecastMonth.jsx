import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getForecastView } from '../api/forecast'

// Single-month card view of the forecast — the same shape as the actuals month
// detail, for a projected month too. Reached by clicking a month header on the
// Forecast (Workspace or Report). Esc or ← Back returns to where you came from.

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmt(cents) {
  if (cents === undefined || cents === null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(cents / 100)
}

function Row({ label, value, calculated = false, text, onOpen }) {
  const shown = text !== undefined ? text : fmt(value)
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border/50 ${calculated ? 'bg-surface2/30' : ''}`}>
      <span className={`text-[12px] ${calculated ? 'text-text-muted font-medium' : 'text-text-secondary'} pl-4`}>
        {onOpen ? (
          <button type="button" onClick={onOpen} title="Open the accounts behind this figure"
                  className="hover:underline decoration-dashed underline-offset-2">{label} →</button>
        ) : label}
      </span>
      <span className={`font-mono text-[12px] pr-4 ${
        calculated ? 'text-text-primary' : (text === undefined && value < 0) ? 'text-[#c05a5a]' : 'text-text-secondary'
      }`}>{shown}</span>
    </div>
  )
}

function SectionHeader({ label }) {
  return (
    <div className="px-4 py-2 bg-surface2/50 border-b border-border/50">
      <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">{label}</span>
    </div>
  )
}

function Card({ title, children }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display font-semibold text-sm text-text-primary">{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function ForecastMonth() {
  const { id, year, month } = useParams()
  const navigate = useNavigate()
  const clientId = Number(id)
  const fiscalYear = Number(year)
  const m = Number(month)
  const [periods, setPeriods] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    getForecastView(clientId, fiscalYear)
      .then(d => setPeriods(d.periods))
      .catch(e => setError(e.message || 'Could not load the forecast'))
  }, [clientId, fiscalYear])

  // Back = wherever you came from; fall back to the report if opened directly.
  const goBack = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate(`/clients/${id}/reports/forecast/${fiscalYear}`)
  }
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') goBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const p = periods?.find(x => x.month === m)

  if (error) return <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm">{error}</div>
  if (!periods) return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>

  const isActual = p?.source_type === 'actual'
  const totalOpex = (p?.payroll_expenses ?? 0) + (p?.total_other_expenses ?? 0)
  const monthLink = (mm) => `/clients/${id}/forecast/${fiscalYear}/month/${mm}`

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={goBack} className="hover:text-text-secondary transition-colors">← Back</button>
            <span>/</span>
            <span className="text-text-secondary">Forecast {fiscalYear}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-xl text-text-primary">{MONTH_NAMES[m]} {fiscalYear}</h1>
            {p && (
              <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                isActual ? 'text-text-muted border-border' : 'text-[#c8a96e] border-[rgba(200,169,110,0.3)]'
              }`}>
                {isActual ? 'confirmed actual' : 'forecast'}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(monthLink(m - 1))} disabled={m <= 1}
                  className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30" aria-label="Previous month">‹</button>
          <button onClick={() => navigate(monthLink(m + 1))} disabled={m >= 12}
                  className="w-8 h-8 rounded-lg border border-border text-text-secondary hover:text-text-primary disabled:opacity-30" aria-label="Next month">›</button>
          {isActual && (
            <button onClick={() => navigate(`/clients/${id}/actuals/${fiscalYear}/${m}`)}
                    className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors">
              Imported actuals →
            </button>
          )}
          <button onClick={() => navigate(`/clients/${id}/workspace/forecast/${fiscalYear}`)}
                  className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors">
            Edit Drivers
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!p ? (
          <div className="max-w-md bg-surface border border-border rounded-xl px-6 py-8 text-center">
            <p className="font-display font-semibold text-text-primary mb-1">No forecast for this month yet</p>
            <p className="text-text-muted text-[12px]">Open the Forecast drivers and it will calculate.</p>
          </div>
        ) : (
          <div className="max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6">

            <Card title="Income Statement">
              <SectionHeader label="Revenue" />
              <Row label="Revenue" value={p.revenue} />
              <Row label="Cost of Sales" value={p.cost_of_sales} />
              <Row label="Gross Profit" value={p.gross_profit} calculated />
              <SectionHeader label="Operating Expenses" />
              <Row label="Payroll" value={p.payroll_expenses} />
              <Row label="Marketing" value={p.marketing_expenses} />
              <Row label="Depreciation & Amortization" value={p.depreciation_amortization} />
              <Row label="Overhead" value={p.overhead_expenses}
                   onOpen={isActual ? () => navigate(`/clients/${id}/actuals/${fiscalYear}/overhead/${m}`) : undefined} />
              <Row label="Total Operating Expenses" value={totalOpex} calculated />
              <Row label="Net Operating Profit" value={p.net_operating_profit} calculated />
              <SectionHeader label="Other" />
              <Row label="Other Income / (Expense)" value={p.other_income_expense} />
              <Row label="Net Profit" value={p.net_profit} calculated />
              <SectionHeader label="Operations" />
              <Row label="Jobs" text={p.total_job_count ? String(p.total_job_count) : '—'} />
              <Row label="Blended Avg Job Value" value={p.blended_avg_job_value} />
            </Card>

            <div className="space-y-6">
              <Card title="Cash Flow">
                <Row label="Net Profit" value={p.net_profit} />
                <Row label="Owner Investments / (Draws)" value={p.owner_distributions} />
                <SectionHeader label="Working Capital" />
                <Row label="AR Change" value={-(p.ar_change ?? 0)} />
                <Row label="Inventory Change" value={-(p.inventory_change ?? 0)} />
                <Row label="AP Change" value={p.ap_change} />
                <Row label="DSO / DIO / DPO" text={`${p.dso_days}d / ${p.dio_days}d / ${p.dpo_days}d`} />
                <SectionHeader label="Investing & Financing" />
                <Row label="Other Current Assets Δ" value={p.other_current_assets_change} />
                <Row label="Capital Expenditures" value={p.capex} />
                <Row label="Change in Current Liabilities" value={p.current_debt_change} />
                <Row label="Long-Term Debt Change" value={p.long_term_debt_change} />
                <Row label="Net Cash Flow" value={p.net_cash_flow} calculated />
                <div className="px-4 py-2 text-[10px] text-text-muted">Shown as cash: outflows negative, so the lines add to Net Cash Flow.</div>
              </Card>

              <Card title={isActual ? 'Balance Sheet' : 'Projected Balance Sheet'}>
                <SectionHeader label="Assets" />
                <Row label="Cash" value={p.projected_cash} />
                <Row label="Accounts Receivable" value={p.projected_ar} />
                <Row label="Inventory" value={p.projected_inventory} />
                <Row label="Other Current Assets" value={p.projected_other_current_assets} />
                <Row label="Total Current Assets" value={p.projected_total_current_assets} calculated />
                <Row label="Fixed Assets" value={p.projected_fixed_assets} />
                <Row label="Other Long-Term Assets" value={p.projected_other_lt_assets} />
                <Row label="Total Assets" value={p.projected_total_assets} calculated />
                <SectionHeader label="Liabilities & Equity" />
                <Row label="Accounts Payable" value={p.projected_ap} />
                <Row label="Other Current Liabilities" value={p.projected_current_debt} />
                <Row label="Total Current Liabilities" value={p.projected_total_current_liabilities} calculated />
                <Row label="Long-Term Liabilities" value={p.projected_long_term_debt} />
                <Row label="Total Liabilities" value={p.projected_total_liabilities} calculated />
                <Row label="Equity" value={p.projected_equity} calculated />
                <Row label="Total Liabilities & Equity" value={(p.projected_total_liabilities ?? 0) + (p.projected_equity ?? 0)} calculated />
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
