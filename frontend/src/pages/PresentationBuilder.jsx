import { useCallback, useEffect, useState } from 'react'
import {
  listPresentations, generatePresentation, getPresentation, editPanel, markPresented,
} from '../api/presentations'
import PanelFigures from '../components/PanelFigures'
import { useNavigate } from 'react-router-dom'

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

// ─── One panel card ────────────────────────────────────────────────────────

function PanelCard({ panel, index, total, locked, onEdit, onMove, onDrop }) {
  const [title, setTitle] = useState(panel.title || '')
  const [body, setBody] = useState(panel.body || '')

  useEffect(() => { setTitle(panel.title || ''); setBody(panel.body || '') },
    [panel.title, panel.body])

  const dirty = title !== (panel.title || '') || body !== (panel.body || '')

  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            {index + 1} · {panel.type.replace('_', ' ')}
          </span>
          {panel.mode === 'authored' && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-accent"
                  title="You edited this. It keeps your words and is never regenerated.">
              your words
            </span>
          )}
          {panel.figures_changed && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#d43f3f]"
                  title="The figures under this panel moved since you wrote it. Your words stand; check they still hold.">
              figures moved
            </span>
          )}
        </div>
        {!locked && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={() => onMove(panel.id, index - 1)} disabled={index === 0}
                    title="Move up"
                    className="px-1.5 text-text-muted hover:text-text-primary disabled:opacity-25">↑</button>
            <button onClick={() => onMove(panel.id, index + 1)} disabled={index === total - 1}
                    title="Move down"
                    className="px-1.5 text-text-muted hover:text-text-primary disabled:opacity-25">↓</button>
            <button onClick={() => onDrop(panel.id)} title="Remove this panel"
                    className="px-1.5 text-text-muted hover:text-[#c05a5a]">✕</button>
          </div>
        )}
      </div>

      {locked ? (
        <>
          <h3 className="font-display font-bold text-[17px] text-text-primary">{panel.title}</h3>
          {panel.body && <p className="mt-1 text-[14px] text-text-secondary">{panel.body}</p>}
        </>
      ) : (
        <>
          <input
            id={`t-${panel.id}`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-transparent font-display font-bold text-[17px] text-text-primary focus:outline-none border-b border-transparent focus:border-accent/40 py-0.5"
          />
          <textarea
            id={`b-${panel.id}`}
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={2}
            placeholder="Generated wording — edit to make it yours"
            className="mt-1 w-full bg-transparent text-[14px] text-text-secondary placeholder:text-text-muted focus:outline-none resize-y border-b border-transparent focus:border-accent/40 py-0.5"
          />
          {dirty && (
            <div className="mt-1 flex items-center gap-3">
              <button onClick={() => onEdit(panel.id, { title, body })}
                      className="px-3 py-1 rounded border border-accent/40 text-accent text-[12px] font-medium hover:bg-accent/10">
                Save wording
              </button>
              <button onClick={() => { setTitle(panel.title || ''); setBody(panel.body || '') }}
                      className="text-text-muted text-[12px] hover:text-text-primary">
                Cancel
              </button>
            </div>
          )}
        </>
      )}

      <PanelFigures panel={panel} />
    </div>
  )
}

// ─── The builder ───────────────────────────────────────────────────────────

export default function PresentationBuilder({ clientId, year, monthsElapsed }) {
  const navigate = useNavigate()
  const [month, setMonth] = useState(Math.max(1, monthsElapsed || 1))
  const [current, setCurrent] = useState(null)
  const [versions, setVersions] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refreshVersions = useCallback(async () => {
    try { setVersions(await listPresentations(clientId)) } catch { /* listing is optional */ }
  }, [clientId])

  useEffect(() => { refreshVersions() }, [refreshVersions])

  // Show the newest stored version for the chosen period, if there is one.
  useEffect(() => {
    const match = versions.find(v => v.fiscal_year === year && v.month === month)
    if (!match) { setCurrent(null); return }
    let live = true
    getPresentation(clientId, match.id)
      .then(p => { if (live) setCurrent(p) })
      .catch(() => {})
    return () => { live = false }
  }, [versions, clientId, year, month])

  async function run(fn) {
    setBusy(true); setError(null)
    try {
      const p = await fn()
      setCurrent(p)
      await refreshVersions()
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Something went wrong')
    }
    setBusy(false)
  }

  const locked = current?.status === 'presented'
  const panels = current?.panels || []

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-8 py-5 flex items-end justify-between gap-6 flex-wrap border-b border-border">
        <div className="flex items-end gap-3 flex-wrap">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">Period</span>
            <select
              id="pres-month"
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              {MONTHS.slice(1).map((m, i) => (
                <option key={m} value={i + 1}>{m} {year}</option>
              ))}
            </select>
          </label>

          <button
            onClick={() => run(() => generatePresentation(clientId, { fiscal_year: year, month }))}
            disabled={busy}
            className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:opacity-90 disabled:opacity-40"
          >
            {busy ? 'Working…' : current ? 'Regenerate' : 'Generate presentation'}
          </button>

          {current && panels.length > 0 && (
            <button
              onClick={() => navigate(`/clients/${clientId}/present/${current.id}`)}
              className="px-4 py-2 rounded-lg border border-accent/50 text-accent text-sm font-medium hover:bg-accent/10"
              title="Full screen, no chrome — this is what you share"
            >
              ▶ Present
            </button>
          )}

          {current && !locked && (
            <button
              onClick={() => {
                if (!window.confirm('Mark this as presented? It becomes the record of what you showed — next month reads its action items from here. You can still edit afterwards; that opens a new version.')) return
                run(() => markPresented(clientId, current.id))
              }}
              disabled={busy}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm font-medium hover:border-accent/40 hover:text-text-primary disabled:opacity-40"
            >
              Mark presented
            </button>
          )}
        </div>

        {current && (
          <div className="font-mono text-[11px] text-text-muted text-right">
            <div>
              v{current.version} · {current.status}
              {locked && current.presented_at
                ? ` · ${new Date(current.presented_at).toLocaleDateString()}`
                : ''}
            </div>
            <div>{panels.length} panels</div>
          </div>
        )}
      </div>

      {error && (
        <div className="mx-8 mt-4 px-4 py-2.5 rounded-lg border border-[rgba(192,90,90,0.3)] text-[#c05a5a] text-sm">
          {error}
        </div>
      )}

      {locked && (
        <div className="mx-8 mt-4 px-4 py-2.5 rounded-lg border border-border bg-surface text-text-secondary text-[13px]">
          This version was presented, so it is the record of what the client saw — next month's
          opening panel reads its action items from here. Regenerate to start a new version.
        </div>
      )}

      {!current ? (
        <div className="px-8 py-16 text-center">
          <div className="text-text-muted text-3xl mb-3">◫</div>
          <p className="font-display font-semibold text-text-primary mb-1">
            No presentation for {MONTHS[month]} {year} yet
          </p>
          <p className="text-text-muted text-[12px] max-w-md mx-auto">
            Generating builds it from the grades, the targets and the action plan —
            then you edit the words.
          </p>
        </div>
      ) : (
        <div className="px-8 py-6 flex flex-col gap-3 max-w-4xl">
          {panels.map((panel, i) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              index={i}
              total={panels.length}
              locked={locked}
              onEdit={(id, fields) => run(() => editPanel(clientId, current.id, { panel_id: id, ...fields }))}
              onMove={(id, to) => run(() => editPanel(clientId, current.id, { panel_id: id, move_to: to }))}
              onDrop={(id) => {
                if (!window.confirm('Remove this panel? Regenerating brings it back.')) return
                run(() => editPanel(clientId, current.id, { panel_id: id, drop: true }))
              }}
            />
          ))}
          <p className="text-[11px] text-text-muted pt-2">
            Panels you edit keep your words and stop regenerating — their figures still refresh,
            and you are told if those figures move away from what you wrote. Clear a panel's text
            to hand it back to the generator.
          </p>
        </div>
      )}
    </div>
  )
}
