import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getChartOfAccounts } from '../api/ingestion'
import { CAT_LABEL } from '../lib/categories'

const STATEMENTS = [
  { key: 'profit_and_loss', label: 'Profit & Loss' },
  { key: 'balance_sheet', label: 'Balance Sheet' },
  { key: 'unknown', label: 'Unrecognised section' },
]

const SECTION_LABELS = {
  income: 'Income',
  cogs: 'Cost of Goods Sold',
  expenses: 'Expenses',
  other_income: 'Other Income',
  other_expenses: 'Other Expenses',
  assets: 'Assets',
  liabilities: 'Liabilities',
  liabilities_equity: 'Liabilities & Equity',
  equity: 'Equity',
}

export default function ChartOfAccounts() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [q, setQ] = useState('')

  useEffect(() => {
    let live = true
    getChartOfAccounts(id)
      .then(d => { if (live) setData(d) })
      .catch(e => { if (live) setError(e.message || 'Could not load the chart of accounts') })
    return () => { live = false }
  }, [id])

  // Statement order, grouped by section. Deliberately not alphabetical — sub-accounts
  // belong with their parent, where the statement puts them.
  const groups = useMemo(() => {
    if (!data) return []
    const needle = q.trim().toLowerCase()
    const rows = needle
      ? data.accounts.filter(a =>
          a.account_name.toLowerCase().includes(needle) ||
          (a.account_number || '').includes(needle) ||
          (CAT_LABEL[a.ordobook_category] || '').toLowerCase().includes(needle))
      : data.accounts

    return STATEMENTS.map(st => {
      const mine = rows.filter(a => a.report_type === st.key)
      const sections = []
      for (const a of mine) {
        let sec = sections.find(s => s.key === a.section)
        if (!sec) sections.push(sec = { key: a.section, accounts: [] })
        sec.accounts.push(a)
      }
      return { ...st, sections, count: mine.length }
    }).filter(st => st.count > 0)
  }, [data, q])

  if (error) return (
    <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm px-6 text-center">
      {error}
    </div>
  )
  if (!data) return (
    <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  )

  const { summary } = data
  const shown = groups.reduce((n, g) => n + g.count, 0)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-start justify-between gap-6 flex-wrap flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/clients/${id}/profile`)}
                    className="text-text-muted hover:text-text-primary transition-colors text-sm">
              {data.client_name}
            </button>
            <span className="text-text-muted text-sm">/</span>
            <h1 className="font-display font-bold text-xl text-text-primary">Chart of Accounts</h1>
          </div>
          <p className="text-text-muted text-[12px] mt-0.5">
            Every account ORDOBOOK has imported, and where each one lands
            {data.latest_period ? ` · through ${data.latest_period}` : ''}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            id="coa-search"
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search accounts…"
            className="px-3 py-2 w-56 rounded-lg border border-border bg-surface text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50"
          />
          <button
            onClick={() => navigate(`/clients/${id}/mapping-review`)}
            className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary transition-colors"
            title="Mappings are changed on Review Mapping — this sheet is read-only"
          >
            Change mappings →
          </button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-8 py-2.5 border-b border-border bg-surface flex items-center gap-5 flex-wrap flex-shrink-0 font-mono text-[11px] text-text-muted">
        <span><span className="text-text-primary font-semibold">{summary.total}</span> accounts</span>
        {q && <span>· showing {shown}</span>}
        {summary.inferred > 0 && (
          <span title="Mapped by the auto-mapper from statement context, never confirmed on Review Mapping">
            · <span className="text-text-primary font-semibold">{summary.inferred}</span> inferred
          </span>
        )}
        {summary.retired > 0 && (
          <span title="Still carries a mapping but has stopped appearing in imports">
            · <span className="text-text-primary font-semibold">{summary.retired}</span> not in the latest import
          </span>
        )}
        {data.numbered_chart && <span>· account numbers detected</span>}
      </div>

      {/* The sheet */}
      <div className="flex-1 overflow-auto">
        {shown === 0 ? (
          <div className="px-8 py-12 text-center text-text-muted text-sm">
            {data.accounts.length === 0
              ? 'No accounts yet — import a QuickBooks export to build the chart.'
              : `Nothing matches “${q}”.`}
          </div>
        ) : groups.map(st => (
          <div key={st.key}>
            <div className="px-8 py-2 bg-surface border-y border-border sticky top-0 z-10">
              <span className="font-display font-bold text-[12px] uppercase tracking-widest text-text-primary">
                {st.label}
              </span>
              <span className="ml-2 font-mono text-[10px] text-text-muted">{st.count}</span>
            </div>

            {st.sections.map(sec => (
              <div key={`${st.key}-${sec.key}`}>
                <div className="px-8 pt-3 pb-1 font-mono text-[10px] uppercase tracking-widest text-text-muted">
                  {SECTION_LABELS[sec.key] || sec.key || '—'}
                </div>
                <table className="w-full">
                  <tbody>
                    {sec.accounts.map(a => (
                      <tr key={`${a.section}-${a.raw_account_name}`}
                          className="border-b border-border/50 hover:bg-surface/60">
                        {data.numbered_chart && (
                          <td className="pl-8 pr-3 py-1.5 font-mono text-[11px] text-text-muted w-20 align-top">
                            {a.account_number || '—'}
                          </td>
                        )}
                        <td className={`${data.numbered_chart ? 'pr-3' : 'pl-8 pr-3'} py-1.5 text-[13px] text-text-primary align-top`}>
                          {a.account_name}
                          {!a.in_latest_import && (
                            <span className="ml-2 font-mono text-[9px] uppercase tracking-widest text-text-muted"
                                  title={`Last seen ${a.last_seen}`}>
                              not in latest
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-[12px] text-text-secondary align-top w-64">
                          {CAT_LABEL[a.ordobook_category] || a.ordobook_category || '—'}
                          {a.mapping_source === 'inferred' && (
                            <span className="ml-1.5 text-text-muted" title="Inferred from statement context — not confirmed on Review Mapping">◦</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 pr-8 font-mono text-[10px] text-text-muted text-right align-top w-40 whitespace-nowrap">
                          {a.first_seen === a.last_seen ? a.last_seen : `${a.first_seen} – ${a.last_seen}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        ))}

        <p className="px-8 py-4 text-[11px] text-text-muted">
          ◦ = mapped by the auto-mapper from statement context, never confirmed on Review Mapping.
          Categories here come from the same function that decides what gets stored, so this sheet
          and the figures can never disagree.
        </p>
      </div>
    </div>
  )
}
