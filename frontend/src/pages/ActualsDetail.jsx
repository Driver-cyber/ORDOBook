import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getActualsDetail, updateActuals } from '../api/ingestion'

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function fmt(cents) {
  if (cents === undefined || cents === null) return '—'
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(dollars)
}

function Row({ label, value, calculated = false }) {
  return (
    <div className={`flex items-center justify-between py-2 border-b border-border/50 ${calculated ? 'bg-surface2/30' : ''}`}>
      <span className={`text-[12px] ${calculated ? 'text-text-muted font-medium' : 'text-text-secondary'} pl-4`}>
        {label}
      </span>
      <span className={`font-mono text-[12px] pr-4 ${
        calculated ? 'text-text-primary' : value < 0 ? 'text-[#c05a5a]' : 'text-text-secondary'
      }`}>
        {fmt(value)}
      </span>
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

export default function ActualsDetail() {
  const { id, year, month } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingJobs, setEditingJobs] = useState(false)
  const [jobCount, setJobCount] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getActualsDetail(id, year, month)
      .then(d => { setData(d); setJobCount(d.job_count) })
      .catch(() => setError('Period not found'))
      .finally(() => setLoading(false))
  }, [id, year, month])

  const handleConfirm = async () => {
    setSaving(true)
    try {
      await updateActuals(id, year, month, { status: 'confirmed', job_count: jobCount })
      navigate(`/clients/${id}`)
    } catch {}
    setSaving(false)
  }

  const handleSaveJobs = async () => {
    setSaving(true)
    try {
      const updated = await updateActuals(id, year, month, { job_count: jobCount })
      setData(updated)
      setEditingJobs(false)
    } catch {}
    setSaving(false)
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  if (error) return <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm">{error}</div>

  // Calculated values
  const grossProfit = data.revenue - data.cost_of_sales
  // Use QB's stored "Total Expenses" subtotal (all expense-section accounts, including excluded).
  // Fall back to summing categories if record predates migration 005.
  const totalExpenses = data.total_expenses ||
    (data.payroll_expenses + data.marketing_expenses + data.depreciation_amortization + data.overhead_expenses)
  const netOperatingProfit = grossProfit - totalExpenses
  const netProfit = netOperatingProfit + data.other_income_expense
  const totalCurrentAssets = data.cash + data.accounts_receivable + data.inventory + data.other_current_assets
  const totalAssets = totalCurrentAssets + data.total_fixed_assets + data.total_other_long_term_assets
  const totalCurrentLiabilities = data.accounts_payable + data.other_current_liabilities
  const totalLiabilities = totalCurrentLiabilities + data.total_long_term_liabilities
  const totalEquity = data.equity_before_net_profit + data.net_profit_for_year
  const totalLiabilitiesEquity = totalLiabilities + totalEquity

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={() => navigate(`/clients/${id}`)} className="hover:text-text-secondary transition-colors">← Workspace</button>
            <span>/</span>
            <span className="text-text-secondary">{MONTH_NAMES[month]} {year}</span>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="font-display font-bold text-xl text-text-primary">
              {MONTH_NAMES[month]} {year}
            </h1>
            <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded border ${
              data.status === 'confirmed'
                ? 'text-text-muted border-border'
                : 'text-[#c8a96e] border-[rgba(200,169,110,0.3)]'
            }`}>
              {data.status}
            </span>
          </div>
        </div>
        {data.status !== 'confirmed' && (
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving…' : 'Confirm Period'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* Income Statement */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display font-semibold text-sm text-text-primary">Income Statement</h2>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-text-muted">
                  {editingJobs ? '' : `${data.job_count} jobs`}
                </span>
                {editingJobs ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={jobCount}
                      onChange={e => setJobCount(parseInt(e.target.value) || 0)}
                      className="w-16 bg-surface2 border border-accent rounded px-2 py-0.5 text-[12px] font-mono text-text-primary focus:outline-none"
                      autoFocus
                    />
                    <button onClick={handleSaveJobs} disabled={saving} className="text-[11px] text-accent hover:text-[#d4b87a]">save</button>
                    <button onClick={() => setEditingJobs(false)} className="text-[11px] text-text-muted hover:text-text-secondary">cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setEditingJobs(true)} className="font-mono text-[10px] text-text-muted hover:text-accent transition-colors">edit</button>
                )}
              </div>
            </div>
            <SectionHeader label="Revenue" />
            <Row label="Revenue" value={data.revenue} />
            <Row label="Cost of Sales" value={data.cost_of_sales} />
            <Row label="Gross Profit" value={grossProfit} calculated />
            <SectionHeader label="Operating Expenses" />
            <Row label="Payroll" value={data.payroll_expenses} />
            <Row label="Marketing" value={data.marketing_expenses} />
            <Row label="Depreciation & Amortization" value={data.depreciation_amortization} />
            <Row label="Overhead" value={data.overhead_expenses} />
            <Row label="Total Expenses" value={totalExpenses} calculated />
            <Row label="Net Operating Profit" value={netOperatingProfit} calculated />
            <SectionHeader label="Other" />
            <Row label="Other Income / (Expense)" value={data.other_income_expense} />
            <Row label="Net Profit" value={netProfit} calculated />
          </div>

          {/* Balance Sheet */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="font-display font-semibold text-sm text-text-primary">Balance Sheet</h2>
            </div>
            <SectionHeader label="Assets" />
            <Row label="Cash" value={data.cash} />
            <Row label="Accounts Receivable" value={data.accounts_receivable} />
            <Row label="Inventory" value={data.inventory} />
            <Row label="Other Current Assets" value={data.other_current_assets} />
            <Row label="Total Current Assets" value={totalCurrentAssets} calculated />
            <Row label="Fixed Assets" value={data.total_fixed_assets} />
            <Row label="Other Long-Term Assets" value={data.total_other_long_term_assets} />
            <Row label="Total Assets" value={totalAssets} calculated />
            <SectionHeader label="Liabilities" />
            <Row label="Accounts Payable" value={data.accounts_payable} />
            <Row label="Other Current Liabilities" value={data.other_current_liabilities} />
            <Row label="Total Current Liabilities" value={totalCurrentLiabilities} calculated />
            <Row label="Long-Term Liabilities" value={data.total_long_term_liabilities} />
            <Row label="Total Liabilities" value={totalLiabilities} calculated />
            <SectionHeader label="Equity" />
            <Row label="Equity (excl. Net Profit)" value={data.equity_before_net_profit} />
            <Row label="Net Profit for Year" value={data.net_profit_for_year} />
            <Row label="Total Equity" value={totalEquity} calculated />
            <Row label="Total Liabilities & Equity" value={totalLiabilitiesEquity} calculated />
          </div>

        </div>

        {/* Metadata */}
        {data.source_files?.length > 0 && (
          <div className="mt-4 max-w-3xl">
            <p className="font-mono text-[10px] text-text-muted">
              Source: {data.source_files.join(', ')}
              {data.uploaded_at && ` · Imported ${new Date(data.uploaded_at).toLocaleDateString()}`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
