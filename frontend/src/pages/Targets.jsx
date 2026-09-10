import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getTargets, saveTargets } from '../api/targets'

// Metrics in UI display order.
// computed=true: value is derived from driver inputs — shown read-only.
// hasPercentToggle=true: field can be entered as $ or % of revenue.
const METRICS = [
  // Operations — inputs that drive Revenue
  { key: 'total_jobs',            label: 'Total Jobs',             type: 'count', section: 'Operations', computed: false },
  { key: 'blended_avg_job_value', label: 'Avg Job Value',          type: 'cents', section: 'Operations', computed: false },
  { key: 'revenue',               label: 'Revenue',                type: 'cents', section: 'Operations', computed: true },
  // P&L
  { key: 'cost_of_sales',         label: 'Cost of Sales',          type: 'cents', section: 'P&L', computed: false, hasPercentToggle: true },
  { key: 'gross_profit',          label: 'Gross Profit',           type: 'cents', section: 'P&L', computed: true },
  { key: 'payroll_expenses',      label: 'Payroll Expenses',       type: 'cents', section: 'P&L', computed: false },
  { key: 'marketing_expenses',    label: 'Marketing Expenses',     type: 'cents', section: 'P&L', computed: false },
  { key: 'overhead_expenses',     label: 'Overhead Expenses',      type: 'cents', section: 'P&L', computed: false },
  { key: 'net_operating_profit',  label: 'Net Operating Profit',   type: 'cents', section: 'P&L', computed: true },
  { key: 'other_income_expense',  label: 'Other Income / Expense', type: 'cents', section: 'P&L', computed: false },
  { key: 'net_profit',            label: 'Net Profit',             type: 'cents', section: 'P&L', computed: true },
  // Cash Flow — driver order mirrors the reference workbook: asset-side drivers,
  // then liability-side, then owner. Money drivers are SIGNED CASH AMOUNTS:
  // a purchase/repayment is entered negative because it reduces cash.
  { key: 'dso_days',                    label: 'DSO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'dio_days',                    label: 'DIO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'cf_other_current_assets',     label: 'Sale or (Purchase) of Other Current Assets',          type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'cf_fixed_assets',             label: 'Sale or (Purchase) of Other Long-Term & Fixed Assets', type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'dpo_days',                    label: 'DPO (Days)',                                          type: 'days',  section: 'Cash Flow', computed: false },
  { key: 'cf_current_debt',             label: 'Additions or (Repayments) to Other Current Debt',     type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'cf_long_term_debt',           label: 'Additions or (Repayments) to Long-Term Debt',         type: 'cents', section: 'Cash Flow', computed: false },
  { key: 'owner_total_draws',           label: 'Investments or (Draws) by Owner',                     type: 'cents', section: 'Cash Flow', computed: false },
  // Computed roll-ups. Asset/liability change rows absorb both the working-capital
  // effect of DSO/DIO/DPO and the explicit drivers above, so the documented
  // Net CF formula stays intact:
  //   Net CF = Net Profit − Owner Draws + CF: Asset Changes + CF: Liability Changes
  { key: 'cf_assets_change',      label: 'CF: Asset Changes',      type: 'cents', section: 'Cash Flow', computed: true },
  { key: 'cf_liabilities_change', label: 'CF: Liability Changes',  type: 'cents', section: 'Cash Flow', computed: true },
  { key: 'net_cash_flow',         label: 'Net Cash Flow',          type: 'cents', section: 'Cash Flow', computed: true },
]

const SECTIONS = ['Operations', 'P&L', 'Cash Flow']

const SECTION_LABELS = {
  Operations: 'Operations (Drivers → Revenue)',
  'P&L': 'P&L',
  'Cash Flow': 'Cash Flow',
}

// cents → display dollars with commas, no decimals
function centsToDisplay(cents) {
  if (cents === null || cents === undefined) return ''
  return Math.round(cents / 100).toLocaleString()
}

// Parse dollar input string → cents integer
function parseToCents(str) {
  const cleaned = String(str).replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const num = parseFloat(cleaned)
  if (isNaN(num)) return null
  return Math.round(num * 100)
}

// Parse plain integer input → integer
function parseCount(str) {
  const cleaned = String(str).replace(/[,\s]/g, '')
  if (cleaned === '') return null
  const num = parseInt(cleaned, 10)
  return isNaN(num) ? null : num
}

// Format a comparison column value (prior year or forecast)
function fmtComparison(val, type) {
  if (val === null || val === undefined) return '—'
  if (type === 'days') return String(val)
  if (type === 'count') return Number(val).toLocaleString()
  return `$${Math.round(val / 100).toLocaleString()}`
}

// Format a balance sheet dollar value (already in cents)
function fmtDollars(cents) {
  if (cents === null || cents === undefined || cents === 0) return '$0'
  const abs = Math.abs(Math.round(cents / 100))
  return (cents < 0 ? '-$' : '$') + abs.toLocaleString()
}

// Format a signed change value (cents) with +/- prefix
function fmtChange(cents) {
  if (!cents) return '—'
  const abs = Math.abs(Math.round(cents / 100))
  return (cents >= 0 ? '+$' : '-$') + abs.toLocaleString()
}

/**
 * Compute all derived values from driver inputs + prior year ending balances.
 *
 * Cash flow impact of working capital changes:
 *   Target AR  = Annual Revenue / 365 × DSO target
 *   Target Inv = Annual COS     / 365 × DIO target
 *   Target AP  = Annual COS     / 365 × DPO target
 *
 *   cf_assets_change     = -(ΔAR + ΔInventory)   — positive = favorable (assets decreased)
 *   cf_liabilities_change = ΔAP                   — positive = favorable (liabilities increased)
 *   Net Cash Flow        = Net Profit − Owner Draws + cf_assets_change + cf_liabilities_change
 */
function computeDerived(inputs, cosMode, priorEnding) {
  // P&L
  const totalJobs = parseCount(inputs.total_jobs ?? '') ?? 0
  const avgJobValue = parseToCents(inputs.blended_avg_job_value ?? '') ?? 0
  const revenue = totalJobs * avgJobValue

  let cosCents
  if (cosMode === 'pct') {
    const pct = parseFloat(String(inputs.cost_of_sales ?? '').replace(/[%,\s]/g, ''))
    cosCents = isNaN(pct) ? 0 : Math.round(revenue * pct / 100)
  } else {
    cosCents = parseToCents(inputs.cost_of_sales ?? '') ?? 0
  }

  const grossProfit = revenue - cosCents
  const payroll = parseToCents(inputs.payroll_expenses ?? '') ?? 0
  const marketing = parseToCents(inputs.marketing_expenses ?? '') ?? 0
  const overhead = parseToCents(inputs.overhead_expenses ?? '') ?? 0
  const netOpProfit = grossProfit - payroll - marketing - overhead
  const otherIE = parseToCents(inputs.other_income_expense ?? '') ?? 0
  const netProfit = netOpProfit + otherIE

  // Cash Flow
  const dso = parseCount(inputs.dso_days ?? '') ?? 0
  const dio = parseCount(inputs.dio_days ?? '') ?? 0
  const dpo = parseCount(inputs.dpo_days ?? '') ?? 0
  const ownerDraws = parseToCents(inputs.owner_total_draws ?? '') ?? 0

  // Explicit cash flow drivers — SIGNED cash amounts. A purchase or repayment is
  // negative (reduces cash); a sale or new borrowing is positive.
  const cfOtherCA = parseToCents(inputs.cf_other_current_assets ?? '') ?? 0
  const cfFixedLT = parseToCents(inputs.cf_fixed_assets ?? '') ?? 0
  const cfCurDebt = parseToCents(inputs.cf_current_debt ?? '') ?? 0
  const cfLTDebt  = parseToCents(inputs.cf_long_term_debt ?? '') ?? 0

  // Prior year ending balances (from December actuals of prior year)
  const priorAR = priorEnding?.accounts_receivable ?? 0
  const priorInventory = priorEnding?.inventory ?? 0
  const priorAP = priorEnding?.accounts_payable ?? 0
  const priorCash = priorEnding?.cash ?? 0
  const priorEquity = priorEnding?.equity ?? 0
  const priorOtherCA = priorEnding?.other_current_assets ?? 0
  const priorFixed = priorEnding?.total_fixed_assets ?? 0
  const priorOtherLTA = priorEnding?.total_other_long_term_assets ?? 0
  const priorOtherCL = priorEnding?.other_current_liabilities ?? 0
  const priorLTL = priorEnding?.total_long_term_liabilities ?? 0

  // Target working capital balances (annual rate → daily × days outstanding)
  const targetAR       = (dso > 0 && revenue > 0)   ? Math.round(revenue   / 365 * dso) : priorAR
  const targetInventory = (dio > 0 && cosCents > 0)  ? Math.round(cosCents  / 365 * dio) : priorInventory
  const targetAP       = (dpo > 0 && cosCents > 0)   ? Math.round(cosCents  / 365 * dpo) : priorAP

  // Delta vs prior year ending balance
  const arChange        = targetAR        - priorAR
  const inventoryChange = targetInventory - priorInventory
  const apChange        = targetAP        - priorAP

  // Net CF impact of asset moves: working capital (AR/inventory) plus the explicit
  // other-current-asset and fixed-asset drivers, which are already signed cash amounts.
  const cfAssetsChange      = -(arChange + inventoryChange) + cfOtherCA + cfFixedLT
  // Liability side: AP working capital plus explicit debt movements.
  const cfLiabilitiesChange = apChange + cfCurDebt + cfLTDebt

  // Net Cash Flow = Net Profit − Owner Draws + CF Asset Changes + CF Liability Changes
  const netCashFlow = netProfit - ownerDraws + cfAssetsChange + cfLiabilitiesChange

  // ── Projected Balance Sheet ───────────────────────────────────────────────
  // Balance movements are the mirror of the cash movements above: a purchase is
  // negative cash and therefore increases the asset, so the balance subtracts the
  // driver. New borrowing is positive cash and increases the liability, so it adds.
  const projectedCash    = priorCash + netCashFlow
  const projOtherCA      = priorOtherCA - cfOtherCA
  const projFixedAssets  = Math.max(0, priorFixed - cfFixedLT)
  const projOtherLTA     = priorOtherLTA
  const projOtherCL      = priorOtherCL + cfCurDebt
  const projLTL          = priorLTL + cfLTDebt
  const projectedEquity  = priorEquity + netProfit - ownerDraws

  // Subtotals
  const totalCurrentAssets      = projectedCash + targetAR + targetInventory + projOtherCA
  const totalAssets             = totalCurrentAssets + projFixedAssets + projOtherLTA
  const totalCurrentLiabilities = targetAP + projOtherCL
  const totalLiabilities        = totalCurrentLiabilities + projLTL
  // Tie-out check: this should equal totalAssets on a balanced sheet.
  const totalLiabilitiesEquity  = totalLiabilities + projectedEquity

  // Summary P&L (mirrors the projected year)
  const totalOperatingExpenses = payroll + marketing + overhead

  return {
    // P&L computed
    revenue,
    cost_of_sales: cosCents,
    gross_profit: grossProfit,
    net_operating_profit: netOpProfit,
    net_profit: netProfit,
    // CF computed
    cf_assets_change: cfAssetsChange,
    cf_liabilities_change: cfLiabilitiesChange,
    net_cash_flow: netCashFlow,
    // Projected Balance Sheet
    target_ar: targetAR,
    target_inventory: targetInventory,
    target_ap: targetAP,
    projected_cash: projectedCash,
    projected_equity: projectedEquity,
    proj_other_current_assets: projOtherCA,
    proj_fixed_assets: projFixedAssets,
    proj_other_long_term_assets: projOtherLTA,
    proj_other_current_liabilities: projOtherCL,
    proj_long_term_liabilities: projLTL,
    total_current_assets: totalCurrentAssets,
    total_assets: totalAssets,
    total_current_liabilities: totalCurrentLiabilities,
    total_liabilities: totalLiabilities,
    total_liabilities_equity: totalLiabilitiesEquity,
    // Summary P&L
    total_operating_expenses: totalOperatingExpenses,
    other_income_expense: otherIE,
    // Prior year ending (pass through for BS display)
    prior_cash: priorCash,
    prior_ar: priorAR,
    prior_inventory: priorInventory,
    prior_ap: priorAP,
    prior_equity: priorEquity,
    prior_other_current_assets: priorOtherCA,
    prior_fixed_assets: priorFixed,
    prior_other_long_term_assets: priorOtherLTA,
    prior_other_current_liabilities: priorOtherCL,
    prior_long_term_liabilities: priorLTL,
    prior_total_current_assets: priorCash + priorAR + priorInventory + priorOtherCA,
    prior_total_assets: priorCash + priorAR + priorInventory + priorOtherCA + priorFixed + priorOtherLTA,
    prior_total_current_liabilities: priorAP + priorOtherCL,
    prior_total_liabilities: priorAP + priorOtherCL + priorLTL,
    prior_total_liabilities_equity: priorAP + priorOtherCL + priorLTL + priorEquity,
  }
}

export default function Targets() {
  const { id } = useParams()
  const navigate = useNavigate()
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [client, setClient] = useState(null)
  // Driver inputs: key → display string (what user typed)
  const [inputs, setInputs] = useState({})
  // COS mode: 'dollar' | 'pct'
  const [cosMode, setCosMode] = useState('dollar')
  // Comparison data from API
  const [priorYearActuals, setPriorYearActuals] = useState({})
  const [forecastSummary, setForecastSummary] = useState({})
  const [priorEndingBalances, setPriorEndingBalances] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const derived = useMemo(
    () => computeDerived(inputs, cosMode, priorEndingBalances),
    [inputs, cosMode, priorEndingBalances]
  )

  const loadData = useCallback(async () => {
    setLoading(true)
    setDirty(false)
    setCosMode('dollar')
    try {
      const [c, t] = await Promise.all([getClient(id), getTargets(id, year)])
      setClient(c)
      setPriorYearActuals(t.prior_year_actuals ?? {})
      setForecastSummary(t.current_year_forecast ?? {})
      setPriorEndingBalances(t.prior_year_ending_balances ?? {})

      // Populate driver inputs only (computed metrics are re-derived on the fly)
      const driverKeys = new Set(METRICS.filter(m => !m.computed).map(m => m.key))
      const inputMap = {}
      for (const item of t.targets) {
        if (!driverKeys.has(item.metric_key)) continue
        if (item.target_type === 'cents') {
          inputMap[item.metric_key] = centsToDisplay(item.target_value)
        } else {
          inputMap[item.metric_key] = String(item.target_value)
        }
      }
      setInputs(inputMap)
    } catch {
      // No targets yet — fine
    } finally {
      setLoading(false)
    }
  }, [id, year])

  useEffect(() => { loadData() }, [loadData])

  function handleChange(key, value) {
    setInputs(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }

  // Switch COS mode and convert the displayed value in-place
  function handleCOSModeToggle(newMode) {
    if (newMode === cosMode) return
    const rev = derived.revenue
    if (newMode === 'pct' && rev > 0) {
      const cents = parseToCents(inputs.cost_of_sales ?? '') ?? 0
      setInputs(prev => ({ ...prev, cost_of_sales: (cents / rev * 100).toFixed(1) }))
    } else if (newMode === 'dollar') {
      const pct = parseFloat(String(inputs.cost_of_sales ?? '').replace(/[%,\s]/g, ''))
      if (!isNaN(pct) && rev > 0) {
        const cents = Math.round(rev * pct / 100)
        setInputs(prev => ({ ...prev, cost_of_sales: Math.round(cents / 100).toLocaleString() }))
      }
    }
    setCosMode(newMode)
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const targets = []
      const anyDriverSet = METRICS
        .filter(m => !m.computed)
        .some(m => (inputs[m.key] ?? '').trim() !== '')

      for (const metric of METRICS) {
        let val, ttype

        if (metric.computed) {
          if (!anyDriverSet) continue
          val = derived[metric.key]
          if (val === null || val === undefined) continue
          ttype = 'cents'
        } else {
          const raw = inputs[metric.key] ?? ''
          if (raw.trim() === '') continue

          if (metric.key === 'cost_of_sales' && cosMode === 'pct') {
            val = derived.cost_of_sales
            ttype = 'cents'
          } else if (metric.type === 'count' || metric.type === 'days') {
            val = parseCount(raw)
            ttype = metric.type
          } else {
            val = parseToCents(raw)
            ttype = 'cents'
          }
        }

        if (val === null || val === undefined || isNaN(val)) continue
        targets.push({ metric_key: metric.key, target_value: val, target_type: ttype })
      }

      await saveTargets(id, year, targets)
      await loadData()
    } catch {
      alert('Failed to save targets. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const hasPriorEnding = Object.keys(priorEndingBalances).length > 0
  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]

  if (loading) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/clients/${id}`)}
              className="text-text-muted hover:text-text-primary transition-colors text-sm"
            >
              {client?.name}
            </button>
            <span className="text-text-muted text-sm">/</span>
            <h1 className="font-display font-bold text-xl text-text-primary">Targets</h1>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">Annual targets per KPI — used to grade the Scoreboard</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  y === year ? 'bg-accent text-bg' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
          <button
            onClick={handleSave}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Save Targets'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-4xl space-y-8">
          {dirty && (
            <div className="bg-[rgba(200,169,110,0.12)] border border-[rgba(200,169,110,0.3)] rounded-lg px-4 py-2.5 text-[#a07a3a] text-sm">
              Unsaved changes — click Save Targets to apply.
            </div>
          )}

          {/* KPI sections */}
          {SECTIONS.map(section => {
            const metrics = METRICS.filter(m => m.section === section)
            return (
              <section key={section}>
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
                  {SECTION_LABELS[section]}
                </h2>
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[32%]">
                          Metric
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[28%]">
                          {year} Target
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[20%]">
                          {year - 1} Actual
                        </th>
                        <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[20%]">
                          {year} Forecast
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map((metric, i) => {
                        const isLast = i === metrics.length - 1
                        const isCOS = metric.key === 'cost_of_sales'

                        return (
                          <tr
                            key={metric.key}
                            className={[
                              !isLast ? 'border-b border-border' : '',
                              metric.computed ? 'bg-[rgba(0,0,0,0.02)]' : '',
                            ].join(' ')}
                          >
                            {/* Metric label */}
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-1.5">
                                {metric.computed && (
                                  <span className="font-mono text-[10px] text-text-muted">=</span>
                                )}
                                <span className={`text-sm font-medium ${metric.computed ? 'text-text-secondary' : 'text-text-primary'}`}>
                                  {metric.label}
                                </span>
                              </div>
                            </td>

                            {/* Target — editable input or computed display */}
                            <td className="px-5 py-3 text-right">
                              {metric.computed ? (
                                <span className="font-mono text-sm text-text-secondary">
                                  {metric.type === 'cents' && (
                                    <span className="text-text-muted text-xs mr-0.5">$</span>
                                  )}
                                  {centsToDisplay(derived[metric.key]) || '—'}
                                </span>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  {/* COS $ / % toggle */}
                                  {isCOS && (
                                    <div className="flex items-center rounded overflow-hidden border border-border">
                                      {['dollar', 'pct'].map(mode => (
                                        <button
                                          key={mode}
                                          onClick={() => handleCOSModeToggle(mode)}
                                          className={`px-1.5 py-0.5 font-mono text-[10px] transition-colors ${
                                            cosMode === mode
                                              ? 'bg-accent text-bg'
                                              : 'text-text-muted hover:text-text-secondary bg-transparent'
                                          }`}
                                        >
                                          {mode === 'dollar' ? '$' : '%'}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {/* Currency prefix */}
                                  {metric.type === 'cents' && !(isCOS && cosMode === 'pct') && (
                                    <span className="text-text-muted text-sm">$</span>
                                  )}
                                  {isCOS && cosMode === 'pct' && (
                                    <span className="text-text-muted text-sm">%</span>
                                  )}
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    value={inputs[metric.key] ?? ''}
                                    placeholder="0"
                                    onChange={e => handleChange(metric.key, e.target.value)}
                                    onFocus={e => e.target.select()}
                                    className="w-28 text-right bg-transparent border-b border-transparent hover:border-border focus:border-accent focus:outline-none py-0.5 font-mono text-sm text-text-primary placeholder:text-text-muted transition-colors"
                                  />
                                </div>
                              )}
                            </td>

                            {/* Prior year actual */}
                            <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                              {fmtComparison(priorYearActuals[metric.key], metric.type)}
                            </td>

                            {/* Current year forecast */}
                            <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                              {fmtComparison(forecastSummary[metric.key], metric.type)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            )
          })}

          {/* Projected Balance Sheet */}
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Projected Balance Sheet (year-end)
            </h2>

            {!hasPriorEnding ? (
              <div className="bg-surface border border-border rounded-xl px-6 py-8 text-center">
                <p className="text-text-muted text-sm">
                  Import and confirm December {year - 1} actuals to enable projected balance sheet.
                </p>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[40%]">
                        Account
                      </th>
                      {/* Current year first — matches the column order of the
                          Operations / P&L / Cash Flow tables above. */}
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        {year} Projected
                      </th>
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        {year - 1} Ending
                      </th>
                      <th className="text-right px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                        Change
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: 'Cash', hint: 'Prior cash + Net Cash Flow',
                        prior: derived.prior_cash, projected: derived.projected_cash },
                      { label: 'Accounts Receivable', hint: `Revenue / 365 × ${parseCount(inputs.dso_days ?? '') ?? 0} DSO days`,
                        prior: derived.prior_ar, projected: derived.target_ar },
                      { label: 'Inventory', hint: `COS / 365 × ${parseCount(inputs.dio_days ?? '') ?? 0} DIO days`,
                        prior: derived.prior_inventory, projected: derived.target_inventory },
                      { label: 'Other Current Assets', hint: 'Prior balance − sale/(purchase) driver',
                        prior: derived.prior_other_current_assets, projected: derived.proj_other_current_assets },
                      { label: 'Total Current Assets', kind: 'subtotal',
                        prior: derived.prior_total_current_assets, projected: derived.total_current_assets },
                      { label: 'Fixed Assets', hint: 'Prior balance − sale/(purchase) driver',
                        prior: derived.prior_fixed_assets, projected: derived.proj_fixed_assets },
                      { label: 'Other Long-Term Assets', hint: 'Held at prior balance',
                        prior: derived.prior_other_long_term_assets, projected: derived.proj_other_long_term_assets },
                      { label: 'Total Assets', kind: 'subtotal',
                        prior: derived.prior_total_assets, projected: derived.total_assets },
                      { label: 'Accounts Payable', hint: `COS / 365 × ${parseCount(inputs.dpo_days ?? '') ?? 0} DPO days`,
                        prior: derived.prior_ap, projected: derived.target_ap },
                      { label: 'Other Current Liabilities', hint: 'Prior balance + additions/(repayments) driver',
                        prior: derived.prior_other_current_liabilities, projected: derived.proj_other_current_liabilities },
                      { label: 'Total Current Liabilities', kind: 'subtotal',
                        prior: derived.prior_total_current_liabilities, projected: derived.total_current_liabilities },
                      { label: 'Long-Term Liabilities', hint: 'Prior balance + additions/(repayments) driver',
                        prior: derived.prior_long_term_liabilities, projected: derived.proj_long_term_liabilities },
                      { label: 'Total Liabilities', kind: 'subtotal',
                        prior: derived.prior_total_liabilities, projected: derived.total_liabilities },
                      { label: 'Equity', hint: 'Prior equity + Net Profit − Owner Draws',
                        prior: derived.prior_equity, projected: derived.projected_equity },
                      { label: 'Total Liabilities & Equity', kind: 'check',
                        hint: 'Should equal Total Assets',
                        prior: derived.prior_total_liabilities_equity, projected: derived.total_liabilities_equity },
                    ].map(({ label, hint, prior, projected, kind }, i, arr) => {
                      const change = projected - prior
                      const isLast = i === arr.length - 1
                      const isSubtotal = kind === 'subtotal' || kind === 'check'
                      // Tie-out: a balanced sheet has Total L&E === Total Assets.
                      const balanced = kind === 'check'
                        ? projected === derived.total_assets
                        : null
                      return (
                        <tr
                          key={label}
                          className={[
                            !isLast ? 'border-b border-border' : '',
                            isSubtotal ? 'bg-surface-subtle' : '',
                          ].filter(Boolean).join(' ')}
                        >
                          <td className="px-5 py-3">
                            <div className={`text-sm text-text-primary ${isSubtotal ? 'font-semibold' : 'font-medium'}`}>
                              {label}
                              {balanced === true && <span className="ml-2 text-[10px] text-text-muted">✓ balanced</span>}
                              {balanced === false && (
                                <span className="ml-2 text-[10px] text-red-600">
                                  ✕ off by {fmtDollars(projected - derived.total_assets)}
                                </span>
                              )}
                            </div>
                            {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
                          </td>
                          <td className={`px-5 py-3 text-right font-mono text-sm ${isSubtotal ? 'text-text-primary font-semibold' : 'text-text-secondary font-medium'}`}>
                            {fmtDollars(projected)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                            {fmtDollars(prior)}
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-sm text-text-muted">
                            {fmtChange(change)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Summary P&L — the projected year at a glance, beneath the balance sheet */}
          <section>
            <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Summary P&amp;L ({year} target)
            </h2>
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <table className="w-full">
                <tbody>
                  {[
                    { label: 'Income', value: derived.revenue },
                    { label: 'Cost of Sales', value: derived.cost_of_sales },
                    { label: 'Gross Profit', value: derived.gross_profit, kind: 'subtotal' },
                    { label: 'Total Expenses', value: derived.total_operating_expenses,
                      hint: 'Payroll + Marketing + Overhead' },
                    { label: 'Other Income / (Expense)', value: derived.other_income_expense },
                    { label: 'Net Income', value: derived.net_profit, kind: 'subtotal' },
                  ].map(({ label, value, hint, kind }, i, arr) => {
                    const isSubtotal = kind === 'subtotal'
                    return (
                      <tr
                        key={label}
                        className={[
                          i !== arr.length - 1 ? 'border-b border-border' : '',
                          isSubtotal ? 'bg-surface-subtle' : '',
                        ].filter(Boolean).join(' ')}
                      >
                        <td className="px-5 py-3 w-[40%]">
                          <div className={`text-sm text-text-primary ${isSubtotal ? 'font-semibold' : 'font-medium'}`}>
                            {label}
                          </div>
                          {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
                        </td>
                        <td className={`px-5 py-3 text-right font-mono text-sm ${isSubtotal ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
                          {fmtDollars(value)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <p className="text-text-muted text-[11px]">
            Rows marked <span className="font-mono">=</span> are computed from driver inputs.
            Cost of Sales can be entered as an annual dollar amount or as a % of the Revenue target.
            DSO/DIO/DPO targets drive the working capital cash flow impact and projected balance sheet.
            Targets are annual totals — the Scoreboard prorates by months elapsed when grading YTD.
          </p>
        </div>
      </div>
    </div>
  )
}
