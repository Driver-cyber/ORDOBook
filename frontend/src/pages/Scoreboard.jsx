import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient } from '../api/clients'
import { getScoreboard, setGradeOverride, recalculateGrades } from '../api/targets'
import { downloadPdf, downloadJson } from '../api/exports'

// ─── Formatting helpers ────────────────────────────────────────────────────

function fmt(value, type) {
  if (value === null || value === undefined) return '—'
  if (type === 'cents') {
    const dollars = value / 100
    const abs = Math.abs(dollars)
    const sign = dollars < 0 ? '-' : ''
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
    if (abs >= 1_000)     return `${sign}$${Math.round(abs).toLocaleString()}`
    return `${sign}$${Math.round(abs)}`
  }
  if (type === 'days') return `${Math.round(value)}d`
  return Math.round(value).toLocaleString()
}

function fmtVariance(pct) {
  if (pct === null || pct === undefined) return '—'
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(1)}%`
}

// ─── Grade components ──────────────────────────────────────────────────────

const GRADE_STYLES = {
  green:  { pill: 'bg-[#d1edda] text-[#1a6632] border-[#a8d9b8]', dot: 'bg-[#2d9e52]', label: 'On Target' },
  yellow: { pill: 'bg-[#fff3cd] text-[#856404] border-[#ffe08a]', dot: 'bg-[#d4a017]', label: 'Monitor' },
  red:    { pill: 'bg-[#fde8e8] text-[#922b2b] border-[#f5b8b8]', dot: 'bg-[#d43f3f]', label: 'Needs Attention' },
}

function GradePill({ grade, isOverride, onClick }) {
  if (!grade) return (
    <span className="text-text-muted text-[11px] font-mono">—</span>
  )
  const s = GRADE_STYLES[grade]
  return (
    <button
      onClick={onClick}
      title={isOverride ? 'Manual override — click to edit' : 'Auto-graded — click to override'}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold uppercase tracking-wide transition-opacity hover:opacity-80 ${s.pill}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {grade}
      {isOverride && <span className="opacity-60 text-[9px]">★</span>}
    </button>
  )
}

// ─── Grade override modal ──────────────────────────────────────────────────

function GradeModal({ metric, onSave, onClose }) {
  const [grade, setGrade] = useState(metric.grade || '')
  const [isPriority, setIsPriority] = useState(metric.is_top_priority)
  const [notes, setNotes] = useState(metric.notes || '')
  const [isOverride, setIsOverride] = useState(metric.grade_is_override)

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-bg border border-border rounded-2xl p-6 w-96 shadow-xl">
        <h3 className="font-display font-bold text-text-primary mb-1">{metric.label}</h3>
        <p className="text-text-muted text-[12px] mb-5">Grade & priority settings</p>

        <div className="space-y-4">
          {/* Auto vs Override toggle */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-text-muted block mb-2">
              Grade Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setIsOverride(false)}
                className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  !isOverride ? 'bg-accent text-bg border-accent' : 'border-border text-text-secondary hover:border-accent/40'
                }`}
              >
                Auto
              </button>
              <button
                onClick={() => setIsOverride(true)}
                className={`flex-1 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                  isOverride ? 'bg-accent text-bg border-accent' : 'border-border text-text-secondary hover:border-accent/40'
                }`}
              >
                Override
              </button>
            </div>
          </div>

          {/* Grade picker (only when override) */}
          {isOverride && (
            <div>
              <label className="font-mono text-[10px] uppercase tracking-widest text-text-muted block mb-2">
                Grade
              </label>
              <div className="flex gap-2">
                {['green', 'yellow', 'red'].map(g => {
                  const s = GRADE_STYLES[g]
                  return (
                    <button
                      key={g}
                      onClick={() => setGrade(g)}
                      className={`flex-1 py-1.5 rounded-lg border text-sm font-semibold uppercase tracking-wide transition-colors ${
                        grade === g
                          ? `${s.pill} border-current`
                          : 'border-border text-text-secondary hover:border-accent/40'
                      }`}
                    >
                      {g}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top priority toggle (only for red) */}
          {(grade === 'red' || metric.grade === 'red') && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-primary font-medium">Top Priority</p>
                <p className="text-[11px] text-text-muted">Max 3 per scoreboard period</p>
              </div>
              <button
                onClick={() => setIsPriority(p => !p)}
                className={`w-10 h-5 rounded-full transition-colors ${isPriority ? 'bg-[#d43f3f]' : 'bg-border'}`}
              >
                <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5 ${isPriority ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="font-mono text-[10px] uppercase tracking-widest text-text-muted block mb-2">
              Advisor Notes (private)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Context for next meeting…"
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave({
              metric_key: metric.key,
              grade: isOverride ? (grade || metric.grade) : null,
              is_top_priority: isPriority,
              notes: notes || null,
            })}
            className="flex-1 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Summary banner ────────────────────────────────────────────────────────

function SummaryBanner({ data }) {
  const { overall_grade, red_count, yellow_count, green_count, months_elapsed } = data
  const s = overall_grade ? GRADE_STYLES[overall_grade] : null

  // Top priorities and yellow items for the focus list
  const allMetrics = data.sections.flatMap(s => s.metrics)
  const topPriorities = allMetrics.filter(m => m.is_top_priority)
  const otherRed = allMetrics.filter(m => m.grade === 'red' && !m.is_top_priority)
  const yellowItems = allMetrics.filter(m => m.grade === 'yellow')

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6">
      <div className="flex items-start gap-6">
        {/* Overall grade */}
        <div className="flex-shrink-0 text-center">
          <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">Overall</p>
          {s ? (
            <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center ${s.pill}`}>
              <span className="font-display font-bold text-lg uppercase">{overall_grade?.charAt(0)}</span>
            </div>
          ) : (
            <div className="w-16 h-16 rounded-xl border border-border flex items-center justify-center text-text-muted text-lg">—</div>
          )}
        </div>

        {/* Counts */}
        <div className="flex-shrink-0 space-y-1 pt-1">
          <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">YTD Status ({months_elapsed}mo)</p>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-[#2d9e52]" />
            <span className="text-text-primary font-medium">{green_count}</span>
            <span className="text-text-muted">on target</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-[#d4a017]" />
            <span className="text-text-primary font-medium">{yellow_count}</span>
            <span className="text-text-muted">monitor</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-[#d43f3f]" />
            <span className="text-text-primary font-medium">{red_count}</span>
            <span className="text-text-muted">need attention</span>
          </div>
        </div>

        {/* Divider */}
        <div className="w-px self-stretch bg-border mx-2" />

        {/* Focus list */}
        <div className="flex-1 space-y-3">
          {topPriorities.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[#922b2b] mb-1.5">
                Top Priorities This Period ({topPriorities.length}/3)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {topPriorities.map(m => (
                  <span key={m.key} className="px-2.5 py-0.5 bg-[#fde8e8] border border-[#f5b8b8] rounded-full text-[11px] font-semibold text-[#922b2b]">
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {otherRed.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
                Also Needs Attention
              </p>
              <div className="flex flex-wrap gap-1.5">
                {otherRed.map(m => (
                  <span key={m.key} className="px-2.5 py-0.5 bg-surface2 border border-border rounded-full text-[11px] text-text-secondary">
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {yellowItems.length > 0 && (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1.5">
                Monitor / Discuss
              </p>
              <div className="flex flex-wrap gap-1.5">
                {yellowItems.map(m => (
                  <span key={m.key} className="px-2.5 py-0.5 bg-[#fff3cd] border border-[#ffe08a] rounded-full text-[11px] text-[#856404]">
                    {m.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {topPriorities.length === 0 && otherRed.length === 0 && yellowItems.length === 0 && (
            <p className="text-text-muted text-sm pt-2">
              {green_count > 0 ? 'All graded metrics on target.' : 'Set targets to begin grading.'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────

export default function Scoreboard() {
  const { id, year: yearParam } = useParams()
  const navigate = useNavigate()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(parseInt(yearParam) || currentYear)
  const [client, setClient] = useState(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [recalculating, setRecalculating] = useState(false)
  const [editingMetric, setEditingMetric] = useState(null)
  const [exporting, setExporting] = useState(null)

  const handleExportPdf = async () => {
    setExporting('pdf')
    try { await downloadPdf(id, 'scoreboard', year) }
    catch (e) { alert(e.message) }
    finally { setExporting(null) }
  }

  const handleExportJson = async () => {
    setExporting('json')
    try { await downloadJson(id, year) }
    catch (e) { alert(e.message) }
    finally { setExporting(null) }
  }

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

  async function handleRecalculate() {
    setRecalculating(true)
    try {
      await recalculateGrades(id, year)
      await loadData()
    } finally {
      setRecalculating(false)
    }
  }

  async function handleSaveGrade(payload) {
    setEditingMetric(null)
    try {
      await setGradeOverride(id, year, payload)
      await loadData()
    } catch {
      alert('Failed to save grade. Please try again.')
    }
  }

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
            <h1 className="font-display font-bold text-xl text-text-primary">Scoreboard</h1>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">YTD performance vs targets and prior year</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Year selector */}
          <div className="flex items-center gap-1 bg-surface border border-border rounded-lg p-1">
            {yearOptions.map(y => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                  y === year
                    ? 'bg-accent text-bg'
                    : 'text-text-secondary hover:text-text-primary'
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
            onClick={handleExportJson}
            disabled={exporting !== null}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exporting !== null}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {exporting === 'pdf' ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {!data ? (
          <div className="max-w-3xl bg-surface border border-border rounded-xl px-6 py-10 flex flex-col items-center text-center">
            <p className="font-display font-semibold text-text-primary mb-1">No data yet</p>
            <p className="text-text-muted text-[12px]">Import actuals and set targets to generate the Scoreboard.</p>
          </div>
        ) : (
          <div className="max-w-5xl">
            <SummaryBanner data={data} />

            {data.sections.map(section => (
              <div key={section.name} className="mb-6">
                <h2 className="font-mono text-[10px] uppercase tracking-widest text-text-muted mb-3">
                  {section.name}
                </h2>
                <div className="bg-surface border border-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-5 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted w-44">Metric</th>
                        <th className="text-right px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted">Prior Year</th>
                        <th className="text-right px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted">YTD Actual</th>
                        <th className="text-right px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted">Full Yr Forecast</th>
                        <th className="text-right px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted">Annual Target</th>
                        <th className="text-right px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted">vs Target</th>
                        <th className="text-center px-4 py-3 font-mono text-[9px] uppercase tracking-widest text-text-muted w-28">Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {section.metrics.map((metric, i) => {
                        const isLast = i === section.metrics.length - 1
                        const varColor = metric.variance_pct === null
                          ? 'text-text-muted'
                          : metric.variance_pct >= 0
                            ? 'text-[#1a6632]'
                            : 'text-[#922b2b]'

                        // Prior year label: avg for days/count-avg, total for everything else
                        const priorLabel = metric.prior_year_total !== null
                          ? fmt(metric.prior_year_total, metric.type)
                          : '—'

                        return (
                          <tr
                            key={metric.key}
                            className={`${!isLast ? 'border-b border-border' : ''} hover:bg-surface2 transition-colors`}
                          >
                            <td className="px-5 py-3 font-medium text-text-primary">
                              {metric.label}
                              {metric.is_top_priority && (
                                <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-[#d43f3f]">★ Priority</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] text-text-secondary">
                              {priorLabel}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] text-text-primary font-semibold">
                              {fmt(metric.ytd_actual, metric.type)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] text-text-secondary">
                              {fmt(metric.full_year_forecast, metric.type)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-[12px] text-text-secondary">
                              {metric.has_target ? fmt(metric.annual_target, metric.type) : <span className="text-text-muted">—</span>}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-[12px] ${varColor}`}>
                              {metric.has_target ? fmtVariance(metric.variance_pct) : <span className="text-text-muted">—</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <GradePill
                                grade={metric.grade}
                                isOverride={metric.grade_is_override}
                                onClick={() => setEditingMetric(metric)}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}

            <p className="text-text-muted text-[11px] mt-2">
              ★ = manual grade override &nbsp;·&nbsp; Click any grade pill to override or set priority &nbsp;·&nbsp; Targets prorated by months elapsed ({data.months_elapsed} of 12)
            </p>
          </div>
        )}
      </div>

      {/* Grade override modal */}
      {editingMetric && (
        <GradeModal
          metric={editingMetric}
          onSave={handleSaveGrade}
          onClose={() => setEditingMetric(null)}
        />
      )}
    </div>
  )
}
