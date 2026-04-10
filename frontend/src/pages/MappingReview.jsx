import { useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { confirmImport } from '../api/ingestion'

const CATEGORIES = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'cost_of_sales', label: 'Cost of Sales' },
  { value: 'payroll_expenses', label: 'Payroll Expenses' },
  { value: 'marketing_expenses', label: 'Marketing Expenses' },
  { value: 'depreciation_amortization', label: 'Depreciation & Amortization' },
  { value: 'overhead_expenses', label: 'Overhead Expenses' },
  { value: 'other_income_expense', label: 'Other Income / Expense' },
  { value: 'cash', label: 'Cash' },
  { value: 'accounts_receivable', label: 'Accounts Receivable' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'other_current_assets', label: 'Other Current Assets' },
  { value: 'total_fixed_assets', label: 'Fixed Assets' },
  { value: 'total_other_long_term_assets', label: 'Other Long-Term Assets' },
  { value: 'accounts_payable', label: 'Accounts Payable' },
  { value: 'other_current_liabilities', label: 'Other Current Liabilities' },
  { value: 'total_long_term_liabilities', label: 'Long-Term Liabilities' },
  { value: 'equity_before_net_profit', label: 'Equity (excl. Net Profit)' },
  { value: 'net_profit_for_year', label: 'Net Profit for Year (BS)' },
  { value: 'excluded', label: '— Exclude this account —' },
]

const CAT_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]))

function fmt(cents) {
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(dollars)
}

function computeTotals(rows, mappings, periods) {
  const result = {}
  periods.forEach(p => {
    const cats = {}
    rows.forEach(row => {
      if (row.row_type !== 'line_item') return
      const key = `${row.section}::${row.account_name}`
      const m = mappings[key]
      if (!m || m.ordobook_category === 'excluded') return
      const cat = m.ordobook_category
      const val = row.values[p] || 0
      // QB reports "Other Expenses" as positive values, but they reduce net profit.
      // Store them as negative so other_income_expense correctly reflects the net.
      const sign = (cat === 'other_income_expense' && row.section === 'other_expenses') ? -1 : 1
      cats[cat] = (cats[cat] || 0) + val * sign
    })
    // QB's "Total Expenses" = ALL rows in the expenses section, regardless of how they're
    // mapped (including excluded accounts). This matches the "Total Expenses" subtotal
    // QB shows right before Other Income/Expense and is used for accurate Net Income.
    cats['total_expenses'] = rows
      .filter(r => r.row_type === 'line_item' && r.section === 'expenses')
      .reduce((sum, r) => sum + (r.values[p] || 0), 0)
    // Overhead is the residual: everything in total_expenses not already in the other 3 buckets.
    // This matches the reference workbook definition "Overhead Expenses (less Payroll, Dep)".
    cats['overhead_expenses'] = cats['total_expenses']
      - (cats['payroll_expenses'] || 0)
      - (cats['marketing_expenses'] || 0)
      - (cats['depreciation_amortization'] || 0)
    result[p] = cats
  })
  return result
}

export default function MappingReview() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { preview, sourceFiles } = location.state || {}

  // mappings keyed by `${section}::${account_name}` → {ordobook_category, report_type}
  const [mappings, setMappings] = useState(() => {
    if (!preview) return {}
    const m = {}
    preview.suggestions.forEach(s => {
      const row = preview.rows.find(r => r.account_name === s.qb_account_name && r.row_type === 'line_item')
      if (!row) return
      const key = `${row.section}::${row.account_name}`
      m[key] = { ordobook_category: s.suggested_category, report_type: s.report_type }
    })
    return m
  })

  // job counts per period — pre-populated from invoice report if uploaded
  const [jobCounts, setJobCounts] = useState(() => {
    if (!preview) return {}
    const initial = Object.fromEntries(preview.periods_detected.map(p => [p, 0]))
    if (preview.job_counts) {
      Object.entries(preview.job_counts).forEach(([period, count]) => {
        if (period in initial) initial[period] = count
      })
    }
    return initial
  })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Derive rows/periods before any early return so hooks are always called in the same order
  const periods = preview?.periods_detected ?? []
  const rows = preview ? preview.rows.filter(r => r.row_type === 'line_item') : []
  const totals = useMemo(() => computeTotals(rows, mappings, periods), [rows, mappings, periods])

  if (!preview) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-muted text-sm">
        No upload data found. <button onClick={() => navigate(`/clients/${id}/upload`)} className="ml-2 text-accent underline">Go back</button>
      </div>
    )
  }

  // Separate P&L and BS rows
  const plRows = rows.filter(r => ['income', 'cogs', 'expenses', 'other_income', 'other_expenses'].includes(r.section))
  const bsRows = rows.filter(r => ['assets', 'liabilities', 'liabilities_equity', 'equity'].includes(r.section))

  const setMapping = (row, category) => {
    const key = `${row.section}::${row.account_name}`
    setMappings(prev => ({
      ...prev,
      [key]: { ...prev[key], ordobook_category: category },
    }))
  }

  const needsReview = preview.suggestions.filter(s => s.needs_review && s.confidence !== 'saved').length

  const handleConfirm = async () => {
    setSaving(true)
    setError(null)
    try {
      // Build mapping decisions list (deduplicated by report_type + account_name)
      const seen = new Set()
      const mappingDecisions = []
      rows.forEach(row => {
        const key = `${row.section}::${row.account_name}`
        const m = mappings[key]
        if (!m) return
        const dedupeKey = `${m.report_type}::${row.account_name}`
        if (seen.has(dedupeKey)) return
        seen.add(dedupeKey)
        mappingDecisions.push({
          qb_account_name: row.account_name,
          report_type: m.report_type,
          ordobook_category: m.ordobook_category,
          is_excluded: m.ordobook_category === 'excluded',
        })
      })

      // Build period values
      const periodPayloads = periods.map(label => {
        const parts = label.split(' ')
        const monthNames = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
          July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 }
        return {
          label,
          fiscal_year: parseInt(parts[1]),
          month: monthNames[parts[0]],
          job_count: jobCounts[label] || 0,
          categories: totals[label] || {},
        }
      })

      await confirmImport(id, {
        mappings: mappingDecisions,
        periods: periodPayloads,
        raw_rows: preview.rows,
        source_files: sourceFiles || [],
      })

      navigate(`/clients/${id}`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed')
      setSaving(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={() => navigate(`/clients/${id}`)} className="hover:text-text-secondary transition-colors">Workspace</button>
            <span>/</span>
            <button onClick={() => navigate(`/clients/${id}/upload`)} className="hover:text-text-secondary transition-colors">Import</button>
            <span>/</span>
            <span className="text-text-secondary">Review Mapping</span>
          </div>
          <h1 className="font-display font-bold text-xl text-text-primary">Review Account Mapping</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            {periods.length} {periods.length === 1 ? 'period' : 'periods'} detected: {periods.join(', ')}
            {needsReview > 0 && (
              <span className="ml-2 text-[#c8a96e]">· {needsReview} accounts need review</span>
            )}
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Confirm & Import'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-8 py-6 space-y-8">

          {error && (
            <div className="bg-[rgba(192,90,90,0.08)] border border-[rgba(192,90,90,0.2)] rounded-xl px-4 py-3 text-[12px] text-[#c05a5a]">
              {error}
            </div>
          )}

          {/* Job counts per period */}
          <section className="bg-surface border border-border rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-text-primary mb-4">
              Job / Transaction Counts
            </h2>
            <div className="flex flex-wrap gap-4">
              {periods.map(p => (
                <div key={p}>
                  <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
                    {p}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={jobCounts[p] || 0}
                    onChange={e => setJobCounts(prev => ({ ...prev, [p]: parseInt(e.target.value) || 0 }))}
                    className="w-24 bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary font-mono focus:outline-none focus:border-accent transition-colors"
                  />
                </div>
              ))}
            </div>
          </section>

          {/* Running totals */}
          <section className="bg-surface border border-border rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-text-primary mb-1">
              Category Totals — {periods[0]}
            </h2>
            <p className="text-[11px] text-text-muted mb-4">Live preview of your mapping for the first period. Updates as you reassign accounts below.</p>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px]">
              {Object.entries(totals[periods[0]] || {})
                .filter(([, v]) => v !== 0)
                .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                .map(([cat, cents]) => (
                  <div key={cat} className="flex justify-between items-center py-0.5 border-b border-border/40">
                    <span className="text-text-muted">{CAT_LABEL[cat] || cat}</span>
                    <span className={`font-mono text-[11px] ${cents < 0 ? 'text-[#c05a5a]' : 'text-text-secondary'}`}>
                      {fmt(cents)}
                    </span>
                  </div>
                ))
              }
            </div>
          </section>

          {/* P&L accounts */}
          {plRows.length > 0 && (
            <MappingTable
              title="Profit & Loss Accounts"
              rows={plRows}
              mappings={mappings}
              periods={periods}
              onSetMapping={setMapping}
              suggestions={preview.suggestions}
            />
          )}

          {/* Balance Sheet accounts */}
          {bsRows.length > 0 && (
            <MappingTable
              title="Balance Sheet Accounts"
              rows={bsRows}
              mappings={mappings}
              periods={periods}
              onSetMapping={setMapping}
              suggestions={preview.suggestions}
            />
          )}

        </div>
      </div>
    </div>
  )
}

function MappingTable({ title, rows, mappings, periods, onSetMapping, suggestions }) {
  const suggestionMap = Object.fromEntries(
    suggestions.map(s => [`${s.qb_account_name}`, s])
  )

  return (
    <section className="bg-surface border border-border rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="font-display font-semibold text-sm text-text-primary">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[35%]">
                QB Account
              </th>
              <th className="text-left px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[30%]">
                ORDOBOOK Category
              </th>
              {periods.slice(0, 3).map(p => (
                <th key={p} className="text-right px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  {p.split(' ')[0].slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const key = `${row.section}::${row.account_name}`
              const m = mappings[key]
              const suggestion = suggestionMap[row.account_name]
              const needsReview = suggestion?.needs_review && suggestion?.confidence !== 'saved'

              const isSaved = suggestion?.confidence === 'saved'
              const isNew = !isSaved

              return (
                <tr
                  key={key}
                  className={`border-b border-border/50 hover:bg-surface2/50 ${isNew ? 'bg-[rgba(92,158,110,0.04)]' : ''}`}
                >
                  <td className={`py-2.5 ${isNew ? 'pl-4 border-l-2 border-[#5c9e6e]' : 'px-5'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`${isSaved ? 'text-text-muted' : 'text-text-secondary'}`}>
                        {row.account_name}
                      </span>
                      {isSaved && (
                        <span className="font-mono text-[8px] text-text-muted border border-border rounded px-1">saved</span>
                      )}
                      {isNew && (
                        <span className="font-mono text-[8px] text-[#5c9e6e] border border-[rgba(92,158,110,0.45)] bg-[rgba(92,158,110,0.07)] rounded px-1">new</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={m?.ordobook_category || 'overhead_expenses'}
                      onChange={e => onSetMapping(row, e.target.value)}
                      className={`w-full bg-surface2 border rounded-md px-2 py-1 text-[12px] text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none ${
                        isNew ? 'border-[rgba(92,158,110,0.45)]' : 'border-border'
                      }`}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  {periods.slice(0, 3).map(p => (
                    <td key={p} className="px-4 py-2.5 text-right font-mono text-[11px] text-text-muted">
                      {row.values[p] ? fmt(row.values[p]) : '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
