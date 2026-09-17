/**
 * How a panel's FIGURES are drawn. One renderer, used by both the builder (where
 * the advisor edits around them) and the presenter view (where the client sees
 * them) — two copies of this would drift, and the client would end up looking at
 * a different chart from the one the advisor edited.
 *
 * Panels carry their own prose; this draws only the numbers underneath it.
 */
export const GRADE_DOT = { green: '#2d9e52', yellow: '#d4a017', red: '#d43f3f' }

export function money(cents) {
  if (cents === null || cents === undefined) return '—'
  const d = cents / 100
  const a = Math.abs(d)
  const sign = d < 0 ? '-' : ''
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(2)}M`
  return `${sign}$${Math.round(a).toLocaleString()}`
}

export function val(v, type) {
  if (v === null || v === undefined) return '—'
  if (type === 'cents') return money(v)
  if (type === 'days') return `${Math.round(v)} days`
  return Math.round(v).toLocaleString()
}

// ─── Panel bodies, one per type ────────────────────────────────────────────

export default function PanelFigures({ panel }) {
  const d = panel.data || {}

  if (panel.type === 'action_review') {
    if (!d.steps?.length) return null
    return (
      <ul className="mt-3 flex flex-col gap-1.5">
        {d.steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2 text-[13px]">
            <span className={s.done ? 'text-[#2d9e52]' : 'text-text-muted'}>
              {s.done ? '✓' : '○'}
            </span>
            <span className={s.done ? 'text-text-secondary' : 'text-text-primary'}>
              {s.text}
              {s.owners?.length > 0 && (
                <span className="ml-2 font-mono text-[10px] text-text-muted">
                  {s.owners.join(', ')}{s.due_date ? ` · ${s.due_date}` : ''}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    )
  }

  if (panel.type === 'highlights') {
    if (!d.items?.length) return null
    return (
      <div className="mt-3 flex flex-wrap gap-6">
        {d.items.map((h, i) => (
          <div key={i}>
            <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">{h.label}</div>
            <div className="font-mono text-[18px] text-text-primary">{h.value}</div>
            <div className="font-mono text-[11px]"
                 style={{ color: h.direction === 'improving' ? '#2d9e52' : '#d43f3f' }}>
              {h.change_pct > 0 ? '+' : ''}{h.change_pct}% · {h.direction}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (panel.type === 'health_bar') {
    const p = d.percent || {}
    if (!d.total) return null
    return (
      <div className="mt-3">
        <div className="flex h-6 rounded overflow-hidden border border-border">
          {['green', 'yellow', 'red'].map(g => p[g] > 0 && (
            <div key={g} style={{ width: `${p[g]}%`, background: GRADE_DOT[g] }}
                 className="flex items-center justify-center font-mono text-[10px] text-white"
                 title={`${d.counts[g]} ${g}`}>
              {p[g] >= 12 ? `${p[g]}%` : ''}
            </div>
          ))}
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-text-muted">
          {d.counts.green} on plan · {d.counts.yellow} watch · {d.counts.red} off plan
        </div>
      </div>
    )
  }

  if (panel.type === 'exception') {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-5 font-mono text-[12px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: GRADE_DOT[d.grade] }} />
          <span className="text-text-secondary uppercase tracking-wide text-[10px]">{d.grade}</span>
        </span>
        <span className="text-text-primary">{val(d.ytd_actual, d.type)}</span>
        <span className="text-text-muted">vs {val(d.prorated_target, d.type)} target</span>
        {d.change_vs_prior_pct !== null && d.change_vs_prior_pct !== undefined && (
          <span style={{ color: d.direction === 'improving' ? '#2d9e52' : '#d43f3f' }}>
            {d.change_vs_prior_pct > 0 ? '+' : ''}{d.change_vs_prior_pct}% vs last year · {d.direction}
          </span>
        )}
      </div>
    )
  }

  if (panel.type === 'three_column') {
    if (!d.rows?.length) return null
    return (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1 font-mono text-[10px] uppercase tracking-widest text-text-muted"> </th>
              {d.columns.map(c => (
                <th key={c} className="text-right py-1 pl-4 font-mono text-[10px] uppercase tracking-widest text-text-muted">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.rows.map(r => (
              <tr key={r.label} className="border-b border-border/50">
                <td className="py-1.5 text-[13px] text-text-primary">{r.label}</td>
                <td className="py-1.5 pl-4 text-right font-mono text-[12px] text-text-primary">{val(r.ytd_actual, r.type)}</td>
                <td className="py-1.5 pl-4 text-right font-mono text-[12px] text-text-secondary">{val(r.full_year_forecast, r.type)}</td>
                <td className="py-1.5 pl-4 text-right font-mono text-[12px] text-text-secondary">{val(r.annual_target, r.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (panel.type === 'objective') {
    if (!d.steps?.length) return null
    return (
      <ul className="mt-3 flex flex-col gap-1.5">
        {d.steps.map((s, i) => (
          <li key={i} className="text-[13px] text-text-primary">
            <span className="text-accent mr-2">–</span>{s.text}
            {(s.owners?.length > 0 || s.due_date) && (
              <span className="ml-2 font-mono text-[10px] text-text-muted">
                {(s.owners || []).join(', ')}{s.due_date ? ` · ${s.due_date}` : ''}
              </span>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return null
}

