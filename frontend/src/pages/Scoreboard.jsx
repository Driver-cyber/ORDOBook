import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getScoreboard, recalculateGrades, saveScoreboardHeadline, saveMetricText } from '../api/targets'
import { downloadPdf } from '../api/exports'

// ─── Formatters (mirror design's data.jsx) ─────────────────────────────────

function fmtMoney(value) {
  if (value === null || value === undefined) return '—'
  const abs = Math.abs(value)
  const sign = value < 0 ? '−' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000)     return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}
function fmtVal(value, type) {
  if (value === null || value === undefined) return '—'
  if (type === 'money') return fmtMoney(value)
  if (type === 'days')  return `${Math.round(value)}d`
  return Math.round(value).toLocaleString()
}
function fmtVar(pct) {
  if (pct === null || pct === undefined) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// ─── Auto-generated text — the placeholder until the advisor writes their own ─

const ACTIONS_BY_KEY = {
  dso_days: 'Call top 5 AR accounts',
  dio_days: 'Review inventory turn',
  dpo_days: 'Review supplier payment terms',
  payroll_expenses: 'Review hiring pace',
  marketing_expenses: 'Audit marketing ROI',
  overhead_expenses: 'Audit overhead line items',
  cost_of_sales: 'Review COS drivers + margin',
  owner_total_draws: 'Set draw cap for remaining quarters',
  cf_assets_change: 'Working capital review',
  cf_liabilities_change: 'AP terms review',
  net_cash_flow: 'Cash conversion deep-dive',
  net_profit: 'P&L review vs plan',
  net_operating_profit: 'Operating margin review',
  gross_profit: 'Pricing + COS review',
  revenue: 'Revenue funnel review',
  total_jobs: 'Job pipeline review',
  blended_avg_job_value: 'Pricing review',
}

const HERO_KEYS  = ['revenue', 'net_profit', 'net_cash_flow']
const HERO_ABBR  = { revenue: 'R',  net_profit: 'NP',         net_cash_flow: 'NCF' }
const HERO_LABEL = { revenue: 'Revenue', net_profit: 'Net Profit', net_cash_flow: 'Net Cash Flow' }

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function autoHeadline({ red, yellow, green }) {
  if (red >= 3) return 'Multiple priorities need attention this period.'
  if (red >= 1) return `${red} item${red > 1 ? 's' : ''} in the red — let's talk through the path forward.`
  if (yellow > green) return 'Mixed signals — several items to monitor.'
  if (green > 0) return 'Performance on track — stay the course.'
  return 'Set targets and import actuals to begin grading.'
}

function autoReason(metric) {
  if (metric.notes) return metric.notes
  if (metric.var === null || metric.var === undefined) {
    return `Currently ${fmtVal(metric.ytd, metric.type)} — no target set`
  }
  const direction = metric.var >= 0 ? 'ahead of' : 'behind'
  const targetStr = fmtVal(metric.target, metric.type)
  const ytdStr = fmtVal(metric.ytd, metric.type)
  return `${ytdStr} vs ${targetStr} target — ${fmtVar(metric.var)} ${direction} plan`
}

// ─── Adapter: backend response → Concept 5 SCOREBOARD_DATA shape ───────────

function formatScoreboardData(raw, clientName, year) {
  if (!raw || !raw.sections) return null

  const monthIdx = Math.max(0, Math.min(11, (raw.months_elapsed ?? 1) - 1))
  const monthName = MONTH_NAMES[monthIdx]

  const remap = (m) => {
    const isCents = m.type === 'cents'
    const conv = (v) => v === null || v === undefined ? null : (isCents ? v / 100 : v)
    return {
      key: m.key,
      label: m.label,
      grade: m.grade || 'yellow',
      ytd: conv(m.ytd_actual),
      target: conv(m.annual_target),
      prior: conv(m.prior_year_total),
      var: m.variance_pct,
      type: isCents ? 'money' : m.type,
      note: m.notes || null,
      is_top_priority: m.is_top_priority,
      priority_reason: m.priority_reason || null,
      action_item: m.action_item || null,
    }
  }

  const sections = raw.sections.map(s => ({
    name: s.name,
    metrics: s.metrics.map(remap),
  }))

  const allMetrics = sections.flatMap(s => s.metrics)
  const counts = {
    green:  raw.green_count ?? 0,
    yellow: raw.yellow_count ?? 0,
    red:    raw.red_count ?? 0,
  }

  const priorities = allMetrics
    .filter(m => m.is_top_priority)
    .slice(0, 3)
    .map(m => ({
      key: m.key, label: m.label,
      reason: m.priority_reason || autoReason(m),
      reasonIsCustom: !!m.priority_reason,
      action: m.action_item || ACTIONS_BY_KEY[m.key] || m.label,
      actionIsCustom: !!m.action_item,
    }))

  const today = new Date()
  const preparedDate = `${MONTH_NAMES[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`

  return {
    client: clientName || 'Client',
    period: `YTD through ${monthName} ${year}`,
    months_elapsed: raw.months_elapsed,
    prepared_by: 'ORDOBOOK · Reviewed by advisor',
    prepared_date: preparedDate,
    overall: {
      grade: raw.overall_grade,
      headline: raw.headline || autoHeadline(counts),
      headlineIsCustom: !!raw.headline,
      counts,
    },
    priorities,
    sections,
  }
}

// ─── Click-to-edit text that keeps the sheet's typography ───────────────────
// Shows exactly what prints. Click to edit; blur or Enter saves; Escape cancels.
// Clearing the text (or the ↺) returns to the auto wording.

function EditableText({ value, isCustom, onSave, className = '', title = 'Click to edit' }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next === value.trim()) return
    onSave(next)   // '' → cleared → auto wording returns
  }

  if (editing) {
    return (
      <textarea
        autoFocus
        rows={2}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { setDraft(value); setEditing(false) }
        }}
        className={`${className} sb-edit-input`}
        style={{ width: '100%', resize: 'none', outline: 'none', background: 'rgba(200,169,110,0.10)',
                 border: '1px solid rgba(200,169,110,0.6)', borderRadius: 4, padding: '2px 4px',
                 font: 'inherit', color: 'inherit', lineHeight: 'inherit', display: 'block' }}
      />
    )
  }
  return (
    <span className={`${className} sb-editable${isCustom ? ' sb-editable-custom' : ''}`}
          title={isCustom ? `${title} · advisor-written (↺ resets to auto)` : `${title} · auto-generated`}
          onClick={() => setEditing(true)}>
      {value}
      {isCustom && (
        <button type="button" className="sb-reset" title="Reset to auto wording"
                onClick={e => { e.stopPropagation(); onSave('') }}>↺</button>
      )}
    </span>
  )
}

// ─── Concept 5 layout — presentational, with the three advisor text fields ──

function dotColor(grade) {
  return ({ green: 'var(--green)', yellow: 'var(--yellow)', red: 'var(--red)' })[grade] || 'var(--ink-3)'
}
function gradeShort(grade) {
  return (grade && grade[0]) || 'y'
}

function ScoreboardPage({ data, onSaveHeadline, onSaveMetricText }) {
  const allMetrics = data.sections.flatMap(s => s.metrics)
  const heroes = HERO_KEYS.map(k => allMetrics.find(m => m.key === k)).filter(Boolean)
  const priorityKeys = new Set(data.priorities.map(p => p.key))

  // Strip ordering: green → yellow → red
  const ordered = [
    ...allMetrics.filter(m => m.grade === 'green'),
    ...allMetrics.filter(m => m.grade === 'yellow'),
    ...allMetrics.filter(m => m.grade === 'red'),
  ]
  const total = ordered.length

  const sortByGrade = (metrics) => {
    const rank = { green: 0, yellow: 1, red: 2 }
    return [...metrics].sort((a, b) => rank[a.grade] - rank[b.grade])
  }

  return (
    <div className="page c5-page">
      {/* 1. Title + description */}
      <div className="c5-title">
        <div className="c5-title-mark">ORDOBOOK · SCOREBOARD</div>
        <div className="c5-title-row">
          <h1 className="c5-h1">{data.client}</h1>
          <span className="c5-period">{data.period}</span>
        </div>
        <p className="c5-desc">
          <EditableText value={data.overall.headline} isCustom={data.overall.headlineIsCustom}
                        onSave={onSaveHeadline} title="Headline" />
        </p>
      </div>

      {/* 2. Hero tiles */}
      <div className="c5-heroes">
        {heroes.map(m => (
          <div key={m.key} className="c5-hero">
            <div className="c5-hero-row">
              <span className="c5-hero-abbr">{HERO_ABBR[m.key]}</span>
              <span className="c5-hero-name">{HERO_LABEL[m.key]}</span>
            </div>
            <div className="c5-hero-value num">{fmtMoney(m.ytd)}</div>
            <div className="c5-hero-target">
              <span className="c5-hero-target-label">Target</span>
              <span className="c5-hero-target-val num">{fmtMoney(m.target)}</span>
              <span className="c5-hero-dot" style={{ background: dotColor(m.grade) }} />
              <span className="c5-hero-var num" style={{ color: dotColor(m.grade) }}>
                {fmtVar(m.var)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Priorities + Action Items */}
      {data.priorities.length > 0 && (
        <div className="c5-pri-block">
          <div className="c5-pri-main">
            <div className="c5-pri-head">Top Priorities</div>
            <ol className="c5-pri-list">
              {data.priorities.map((p, i) => (
                <li key={p.key}>
                  <span className="c5-pri-n num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="c5-pri-label">{p.label}</span>
                  <span className="c5-pri-reason">
                    <EditableText value={p.reason} isCustom={p.reasonIsCustom} title="Why it matters"
                                  onSave={v => onSaveMetricText(p.key, { priority_reason: v })} />
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="c5-actions">
            <div className="c5-actions-head">Action Items</div>
            <ul className="c5-actions-list">
              {data.priorities.map(p => (
                <li key={p.key}>
                  <span className="c5-check" />
                  <span>
                    <EditableText value={p.action} isCustom={p.actionIsCustom} title="Action item"
                                  onSave={v => onSaveMetricText(p.key, { action_item: v })} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* 4. More details */}
      <div className="c5-details">
        <div className="c5-details-head">More details</div>
        {data.sections.map(sec => (
          <div key={sec.name} className="c5-cat">
            <div className="c5-cat-name">{sec.name}</div>
            <div className="c5-cat-row">
              {sortByGrade(sec.metrics).map(m => {
                const isPri = priorityKeys.has(m.key)
                return (
                  <div
                    key={m.key}
                    className={`c5-box c5-box-${gradeShort(m.grade)}${isPri ? ' c5-box-pri' : ''}`}
                  >
                    <div className="c5-box-label">{m.label}</div>
                    <div className="c5-box-value num">{fmtVal(m.ytd, m.type)}</div>
                    <div className="c5-box-var num">{fmtVar(m.var)}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 5. Overall Score strip */}
      <div className="c5-overall">
        <div className="c5-overall-head">
          <span>Overall Score</span>
          <span className="c5-overall-legend">
            ordered:&nbsp;<span style={{ color: 'var(--green)' }}>green</span>
            &nbsp;·&nbsp;<span style={{ color: 'var(--yellow)' }}>yellow</span>
            &nbsp;·&nbsp;<span style={{ color: 'var(--red)' }}>red</span>
          </span>
        </div>
        <div className="c5-strip" style={{ gridTemplateColumns: `repeat(${total}, 1fr)` }}>
          {ordered.map((m, i) => (
            <div
              key={m.key}
              className={`c5-strip-cell c5-strip-${gradeShort(m.grade)}`}
              title={`${m.label} · ${m.grade}`}
            >
              <span className="c5-strip-i num">{i + 1}</span>
            </div>
          ))}
        </div>
        <div className="c5-strip-legend">
          <span><span className="num">{data.overall.counts.green}</span> green</span>
          <span><span className="num">{data.overall.counts.yellow}</span> yellow</span>
          <span><span className="num">{data.overall.counts.red}</span> red</span>
          <span className="c5-strip-total">/ {total}</span>
        </div>
      </div>

      <div className="pf">
        <span>{data.prepared_by}</span>
        <span>{data.prepared_date}</span>
      </div>
    </div>
  )
}

// ─── Page wrapper with chrome (top bar, scroll area) ───────────────────────

export default function Scoreboard() {
  const { id, year: yearParam } = useParams()
  const navigate = useNavigate()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(parseInt(yearParam) || currentYear)
  const [client, setClient] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [exporting, setExporting] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [c, s] = await Promise.all([getClient(id), getScoreboard(id, year)])
      setClient(c)
      setData(s)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [id, year])

  useEffect(() => { loadData() }, [loadData])

  const handleRecalculate = async () => {
    setRecalculating(true)
    try { await recalculateGrades(id, year); await loadData() }
    finally { setRecalculating(false) }
  }

  // Text edits update the loaded data in place — no reload flicker on the sheet.
  const handleSaveHeadline = async (text) => {
    try {
      const r = await saveScoreboardHeadline(id, year, text)
      setData(d => d ? { ...d, headline: r.headline } : d)
    } catch (e) { alert(e.message) }
  }
  const handleSaveMetricText = async (metricKey, fields) => {
    try {
      const r = await saveMetricText(id, year, metricKey, fields)
      setData(d => d ? {
        ...d,
        sections: d.sections.map(s => ({
          ...s,
          metrics: s.metrics.map(m => m.key === metricKey
            ? { ...m, priority_reason: r.priority_reason, action_item: r.action_item }
            : m),
        })),
      } : d)
    } catch (e) { alert(e.message) }
  }

  const handleExportPdf = async () => {
    setExporting(true)
    try { await downloadPdf(id, 'scoreboard', year) }
    catch (e) { alert(e.message) }
    finally { setExporting(false) }
  }

  const yearOptions = [currentYear - 1, currentYear, currentYear + 1]
  const formatted = data ? formatScoreboardData(data, client?.name, year) : null

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
            <h1 className="font-display font-bold text-xl text-text-primary">Scoreboard</h1>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">At-a-glance — click the headline, a priority's reason, or an action item to write your own; it prints as shown</p>
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
            onClick={() => navigate(`/clients/${id}/workspace/targets/${year}`)}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors"
          >
            Edit Targets
          </button>
          <button
            onClick={handleRecalculate}
            disabled={recalculating}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {recalculating ? 'Recalculating…' : '↻ Recalculate'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {exporting ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Page content — center the 816×1056 sheet on a soft cream backdrop */}
      <div
        className="flex-1 overflow-y-auto flex flex-col items-center py-8"
        style={{ background: '#d4d0ca' }}
      >
        {loading ? (
          <p className="text-text-muted text-sm mt-12">Loading…</p>
        ) : !formatted ? (
          <div className="max-w-md mt-12 bg-surface border border-border rounded-xl px-6 py-8 text-center">
            <p className="font-display font-semibold text-text-primary mb-1">No data yet</p>
            <p className="text-text-muted text-[12px]">Import actuals and set targets to generate the Scoreboard.</p>
          </div>
        ) : (
          <ScoreboardPage data={formatted} onSaveHeadline={handleSaveHeadline} onSaveMetricText={handleSaveMetricText} />
        )}
      </div>
    </div>
  )
}
