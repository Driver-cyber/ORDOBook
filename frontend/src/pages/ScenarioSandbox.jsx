import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { calculateScenarios } from '../api/scenarios'

// ─── Constants ────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()

const DEFAULT_SCENARIO = (name) => ({
  name,
  total_jobs: 0,
  avg_job_value: 0,
  cos_pct: 0.0,
  payroll: 0,
  marketing: 0,
  overhead: 0,
  other_income_expense: 0,
  owner_draws: 0,
  dso: 0,
  dio: 0,
  dpo: 0,
})

const DRIVER_ROWS = [
  { key: 'name',                label: 'Scenario Name',       type: 'text'    },
  { key: '_sep_ops',            label: 'OPERATIONS',          type: 'section' },
  { key: 'total_jobs',          label: 'Total Jobs',          type: 'count'   },
  { key: 'avg_job_value',       label: 'Avg Job Value',       type: 'dollars' },
  { key: '_sep_pl',             label: 'P&L',                 type: 'section' },
  { key: 'cos_pct',             label: 'COS %',               type: 'pct'     },
  { key: 'payroll',             label: 'Payroll',             type: 'dollars' },
  { key: 'marketing',           label: 'Marketing',           type: 'dollars' },
  { key: 'overhead',            label: 'Overhead',            type: 'dollars' },
  { key: 'other_income_expense',label: 'Other Income/Exp',    type: 'dollars_signed' },
  { key: '_sep_cf',             label: 'CASH FLOW',           type: 'section' },
  { key: 'owner_draws',         label: 'Owner Draws',         type: 'dollars' },
  { key: 'dso',                 label: 'DSO (days)',           type: 'days'    },
  { key: 'dio',                 label: 'DIO (days)',           type: 'days'    },
  { key: 'dpo',                 label: 'DPO (days)',           type: 'days'    },
]

const RESULT_ROWS = [
  { key: 'revenue',            label: 'Revenue',              type: 'cents' },
  { key: 'cost_of_sales',      label: 'Cost of Sales',        type: 'cents' },
  { key: 'gross_profit',       label: 'Gross Profit',         type: 'cents', highlight: true },
  { key: 'payroll_expenses',   label: 'Payroll',              type: 'cents' },
  { key: 'marketing_expenses', label: 'Marketing',            type: 'cents' },
  { key: 'overhead_expenses',  label: 'Overhead',             type: 'cents' },
  { key: 'net_operating_profit', label: 'Net Op Profit',      type: 'cents', highlight: true },
  { key: 'other_income_expense', label: 'Other Inc/Exp',      type: 'cents_signed' },
  { key: 'net_profit',         label: 'Net Profit',           type: 'cents', highlight: true },
  { key: 'owner_total_draws',  label: 'Owner Draws',          type: 'cents' },
  { key: 'net_cash_flow',      label: 'Net Cash Flow',        type: 'cents', highlight: true },
]

// Client-view shows only these result keys
const CLIENT_VIEW_KEYS = new Set([
  'revenue', 'gross_profit', 'net_profit', 'net_cash_flow',
])

// ─── Formatting helpers ───────────────────────────────────────────────────────

function fmtCents(v, signed = false) {
  if (v === null || v === undefined) return '—'
  const dollars = v / 100
  const abs = Math.abs(dollars)
  const sign = dollars < 0 ? '-' : (signed && dollars > 0 ? '+' : '')
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs).toLocaleString()}`
  return `${sign}$${Math.round(abs)}`
}

function fmtInput(value, type) {
  if (type === 'dollars' || type === 'dollars_signed') return value === 0 ? '' : String(Math.round(value / 100))
  if (type === 'pct') return value === 0 ? '' : String(value)
  if (type === 'count' || type === 'days') return value === 0 ? '' : String(value)
  return value
}

function parseInput(raw, type) {
  if (raw === '' || raw === null) return 0
  const n = parseFloat(raw.replace(/,/g, ''))
  if (isNaN(n)) return 0
  if (type === 'dollars' || type === 'dollars_signed') return Math.round(n * 100)
  return n
}

function resultFmt(v, type) {
  if (type === 'cents') return fmtCents(v)
  if (type === 'cents_signed') return fmtCents(v, true)
  return v
}

// ─── Input cell ───────────────────────────────────────────────────────────────

function DriverInput({ value, type, onChange }) {
  const [raw, setRaw] = useState(() => fmtInput(value, type))

  // Sync if parent value changes (e.g. on reset)
  useEffect(() => {
    setRaw(fmtInput(value, type))
  }, [value, type])

  const commit = () => {
    const parsed = parseInput(raw, type)
    onChange(parsed)
    setRaw(fmtInput(parsed, type))
  }

  const prefix = (type === 'dollars' || type === 'dollars_signed') ? '$' : ''
  const suffix = type === 'pct' ? '%' : type === 'days' ? 'd' : ''

  return (
    <div className="relative flex items-center">
      {prefix && <span className="absolute left-2 text-text-muted text-[12px] select-none">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={raw}
        placeholder="0"
        onChange={e => setRaw(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
        className={`w-full bg-transparent border border-border rounded-md py-1.5 text-right text-[12px] font-mono text-text-primary
          focus:outline-none focus:border-accent/60 focus:bg-surface transition-colors
          ${prefix ? 'pl-5 pr-2' : suffix ? 'pl-2 pr-5' : 'px-2'}`}
      />
      {suffix && <span className="absolute right-2 text-text-muted text-[12px] select-none">{suffix}</span>}
    </div>
  )
}

// ─── Quarterly breakdown sub-table ────────────────────────────────────────────

function QuarterlyBreakdown({ scenarios, results }) {
  const QUARTER_ROWS = [
    { key: 'revenue',      label: 'Revenue',      type: 'cents' },
    { key: 'gross_profit', label: 'Gross Profit', type: 'cents' },
    { key: 'net_profit',   label: 'Net Profit',   type: 'cents' },
    { key: 'net_cash_flow',label: 'Net Cash Flow',type: 'cents' },
  ]

  return (
    <div className="mt-2 border border-border/50 rounded-xl overflow-hidden">
      <table className="w-full text-[12px]">
        <thead>
          <tr style={{ background: 'rgba(200,169,110,0.06)' }}>
            <th className="text-left px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[180px]">
              Quarter
            </th>
            {scenarios.map((s, i) => (
              ['Q1','Q2','Q3','Q4'].map(q => (
                <th key={`${i}-${q}`} className="text-right px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  {q}
                </th>
              ))
            ))}
          </tr>
        </thead>
        <tbody>
          {QUARTER_ROWS.map(row => (
            <tr key={row.key} className="border-t border-border/30 hover:bg-surface/30">
              <td className="px-4 py-2 text-text-secondary">{row.label}</td>
              {results.map((r, si) =>
                (r.quarters || []).map((q, qi) => (
                  <td key={`${si}-${qi}`} className="text-right px-3 py-2 font-mono text-text-primary">
                    {resultFmt(q[row.key], row.type)}
                  </td>
                ))
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ScenarioSandbox() {
  const { id: clientId } = useParams()

  const [scenarios, setScenarios] = useState([
    DEFAULT_SCENARIO('Base Case'),
    DEFAULT_SCENARIO('Scenario B'),
    DEFAULT_SCENARIO('Scenario C'),
  ])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [clientView, setClientView] = useState(false)
  const [showQuarters, setShowQuarters] = useState(false)
  const debounceRef = useRef(null)

  const runCalc = useCallback(async (currentScenarios) => {
    setLoading(true)
    setError(null)
    try {
      const data = await calculateScenarios(clientId, CURRENT_YEAR, currentScenarios)
      setResults(data.scenarios)
    } catch (e) {
      setError(e.message || 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  // Debounced calculate on any input change
  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => runCalc(scenarios), 500)
    return () => clearTimeout(debounceRef.current)
  }, [scenarios, runCalc])

  const updateScenario = (si, key, value) => {
    setScenarios(prev => prev.map((s, i) => i === si ? { ...s, [key]: value } : s))
  }

  // ── Result value lookup ──────────────────────────────────────────────────────

  const getResult = (si, key) => results[si]?.full_year?.[key] ?? null

  // ── Render ───────────────────────────────────────────────────────────────────

  const colCount = scenarios.length

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg">

      {/* Header bar */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-border flex-shrink-0">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Scenario Sandbox</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            Compare up to 3 scenarios side by side — advisor planning only, not saved
          </p>
        </div>
        <div className="flex items-center gap-3">
          {loading && (
            <span className="text-text-muted text-[11px] font-mono animate-pulse">calculating…</span>
          )}
          <button
            onClick={() => setShowQuarters(q => !q)}
            className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors"
          >
            {showQuarters ? '▴ Hide Quarters' : '▾ Show Quarters'}
          </button>
          <button
            onClick={() => setClientView(v => !v)}
            className={`px-3 py-1.5 rounded-lg border text-[12px] font-medium transition-colors ${
              clientView
                ? 'bg-accent text-bg border-accent'
                : 'border-border text-text-secondary hover:border-accent/40 hover:text-text-primary'
            }`}
          >
            {clientView ? 'Advisor View' : 'Client View'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[#fde8e8] border border-[#f5b8b8] text-[#922b2b] text-[12px]">
            {error}
          </div>
        )}

        <div className="rounded-2xl border border-border overflow-hidden">
          <table className="w-full">

            {/* ── Column headers (scenario names) ── */}
            <thead>
              <tr style={{ background: 'rgba(200,169,110,0.06)' }}>
                <th className="text-left px-6 py-3 font-mono text-[10px] uppercase tracking-widest text-text-muted w-[200px]">
                  Driver
                </th>
                {scenarios.map((s, i) => (
                  <th key={i} className="text-center px-4 py-3 font-mono text-[11px] font-semibold text-text-secondary">
                    {s.name || `Scenario ${String.fromCharCode(65 + i)}`}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ── INPUT ROWS (hidden in client view) ── */}
              {!clientView && DRIVER_ROWS.map(row => {
                if (row.type === 'section') {
                  return (
                    <tr key={row.key} style={{ background: 'rgba(200,169,110,0.04)' }}>
                      <td
                        colSpan={colCount + 1}
                        className="px-6 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted border-t border-border/40"
                      >
                        {row.label}
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={row.key} className="border-t border-border/30 hover:bg-surface/20">
                    <td className="px-6 py-2 text-[12px] text-text-secondary">{row.label}</td>
                    {scenarios.map((s, i) => (
                      <td key={i} className="px-3 py-1.5">
                        {row.type === 'text' ? (
                          <input
                            type="text"
                            value={s.name}
                            onChange={e => updateScenario(i, 'name', e.target.value)}
                            placeholder={`Scenario ${String.fromCharCode(65 + i)}`}
                            className="w-full bg-transparent border border-border rounded-md px-2 py-1.5 text-[12px] text-text-primary
                              focus:outline-none focus:border-accent/60 focus:bg-surface transition-colors"
                          />
                        ) : (
                          <DriverInput
                            value={s[row.key]}
                            type={row.type}
                            onChange={v => updateScenario(i, row.key, v)}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )
              })}

              {/* ── RESULTS DIVIDER ── */}
              <tr style={{ background: 'rgba(200,169,110,0.08)' }}>
                <td
                  colSpan={colCount + 1}
                  className="px-6 py-1.5 font-mono text-[9px] uppercase tracking-[0.15em] text-accent border-t border-border"
                >
                  Computed Results
                </td>
              </tr>

              {/* ── RESULT ROWS ── */}
              {RESULT_ROWS
                .filter(row => !clientView || CLIENT_VIEW_KEYS.has(row.key))
                .map(row => (
                  <tr
                    key={row.key}
                    className="border-t border-border/30"
                    style={row.highlight ? { background: 'rgba(200,169,110,0.05)' } : {}}
                  >
                    <td className={`px-6 py-2.5 text-[12px] ${row.highlight ? 'font-semibold text-text-primary' : 'text-text-secondary'}`}>
                      {row.label}
                    </td>
                    {scenarios.map((_, i) => {
                      const v = getResult(i, row.key)
                      const isNeg = typeof v === 'number' && v < 0
                      return (
                        <td
                          key={i}
                          className={`px-4 py-2.5 text-right font-mono text-[13px] ${
                            row.highlight ? 'font-semibold' : ''
                          } ${
                            isNeg ? 'text-[#d43f3f]' : row.highlight ? 'text-text-primary' : 'text-text-secondary'
                          }`}
                        >
                          {v === null ? (
                            <span className="text-text-muted">—</span>
                          ) : (
                            resultFmt(v, row.type)
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* ── QUARTERLY BREAKDOWN ── */}
        {showQuarters && results.length > 0 && (
          <div className="mt-6">
            <p className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
              Quarterly Breakdown
            </p>
            <QuarterlyBreakdown scenarios={scenarios} results={results} />
          </div>
        )}

        {/* Ephemeral state disclaimer */}
        <p className="text-text-muted text-[11px] font-mono mt-6 text-center">
          Scenario inputs are not saved — refreshing this page will clear all values.
        </p>
      </div>
    </div>
  )
}
