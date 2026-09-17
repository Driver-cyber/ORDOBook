import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getPresentation } from '../api/presentations'
import PanelFigures from '../components/PanelFigures'

/**
 * Presenter view — the same panel list, without the chrome, for screen share.
 *
 * Motion is HORIZONTAL, not a scroll. The left third is pinned and cross-fades
 * between panels; the right two thirds carries the figures in from the side. One
 * idea on screen at a time, because the client is listening to a person, not
 * reading a page — the whole reason the deliverable is panels rather than a
 * document.
 *
 * Nothing here is editable. The advisor drives with the arrow keys or space, and
 * Escape goes back to the builder.
 */

const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function PresenterView() {
  const { id, presentationId } = useParams()
  const navigate = useNavigate()

  const [pres, setPres] = useState(null)
  const [error, setError] = useState(null)
  const [i, setI] = useState(0)
  const [showHelp, setShowHelp] = useState(true)

  const reduced = useMemo(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, [])

  useEffect(() => {
    let live = true
    getPresentation(id, presentationId)
      .then(p => { if (live) setPres(p) })
      .catch(e => { if (live) setError(e?.response?.data?.detail || e.message) })
    return () => { live = false }
  }, [id, presentationId])

  const panels = pres?.panels || []
  const last = Math.max(0, panels.length - 1)

  const go = useCallback((delta) => {
    setShowHelp(false)
    setI(n => Math.min(last, Math.max(0, n + delta)))
  }, [last])

  const exit = useCallback(() => {
    navigate(`/clients/${id}/workspace/presentation/${pres?.fiscal_year || new Date().getFullYear()}`)
  }, [navigate, id, pres])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
      else if (e.key === 'Home') { e.preventDefault(); setI(0) }
      else if (e.key === 'End') { e.preventDefault(); setI(last) }
      else if (e.key === 'Escape') { e.preventDefault(); exit() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, exit, last])

  // Hide the hint once the advisor is moving.
  useEffect(() => {
    const t = setTimeout(() => setShowHelp(false), 6000)
    return () => clearTimeout(t)
  }, [])

  if (error) return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center text-[#c05a5a] text-sm px-8 text-center">
      {error}
    </div>
  )
  if (!pres) return (
    <div className="fixed inset-0 bg-bg flex items-center justify-center text-text-muted text-sm">
      Loading…
    </div>
  )
  if (!panels.length) return (
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center gap-4">
      <p className="text-text-muted text-sm">This presentation has no panels yet.</p>
      <button onClick={exit}
              className="px-4 py-2 rounded-lg border border-border text-text-secondary text-sm hover:text-text-primary">
        Back to the builder
      </button>
    </div>
  )

  const panel = panels[i]
  const ease = reduced ? 'none' : 'transform 620ms cubic-bezier(.22,.61,.36,1)'

  return (
    <div className="fixed inset-0 bg-bg flex flex-col overflow-hidden select-none">
      {/* Progress — the client can see how long this will take */}
      <div className="h-[3px] bg-border flex-shrink-0">
        <div className="h-full bg-accent"
             style={{ width: `${((i + 1) / panels.length) * 100}%`,
                      transition: reduced ? 'none' : 'width 420ms ease' }} />
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ── Pinned third: the words. Cross-fades, never slides. ── */}
        <div className="w-1/3 min-w-[260px] flex-shrink-0 border-r border-border flex flex-col justify-center px-10 py-12">
          <div key={panel.id}
               className="flex flex-col gap-4"
               style={{ animation: reduced ? 'none' : 'presenterFade 460ms ease both' }}>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">
              {MONTHS[pres.month]} {pres.fiscal_year}
            </span>
            <h2 className="font-display font-bold text-text-primary leading-[1.1]"
                style={{ fontSize: 'clamp(24px, 2.6vw, 40px)' }}>
              {panel.title}
            </h2>
            {panel.body && (
              <p className="text-text-secondary leading-relaxed"
                 style={{ fontSize: 'clamp(14px, 1.15vw, 18px)', maxWidth: '34ch' }}>
                {panel.body}
              </p>
            )}
          </div>
        </div>

        {/* ── The other two thirds: figures slide in from the side. ── */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="h-full flex"
               style={{ width: `${panels.length * 100}%`,
                        transform: `translateX(-${i * (100 / panels.length)}%)`,
                        transition: ease }}>
            {panels.map((p, n) => (
              <div key={p.id}
                   className="h-full flex items-center px-10 py-12"
                   style={{ width: `${100 / panels.length}%` }}
                   aria-hidden={n !== i}>
                <div className="w-full max-w-3xl"
                     style={{ opacity: n === i ? 1 : 0.15,
                              transition: reduced ? 'none' : 'opacity 420ms ease' }}>
                  <PanelFigures panel={p} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Controls. Quiet, because the client can see them too. ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-t border-border">
        <button onClick={exit}
                className="font-mono text-[11px] text-text-muted hover:text-text-primary transition-colors">
          ✕ Exit
        </button>

        <div className="flex items-center gap-1.5">
          {panels.map((p, n) => (
            <button key={p.id}
                    onClick={() => { setShowHelp(false); setI(n) }}
                    title={p.title}
                    aria-label={`Go to ${p.title}`}
                    className="rounded-full transition-all"
                    style={{
                      width: n === i ? 18 : 6, height: 6,
                      background: n === i ? '#c8a96e' : 'var(--ink-3, #5a5751)',
                      opacity: n === i ? 1 : 0.4,
                    }} />
          ))}
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-text-muted mr-1">
            {i + 1} / {panels.length}
          </span>
          <button onClick={() => go(-1)} disabled={i === 0} aria-label="Previous panel"
                  className="px-2.5 py-1 rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-25">←</button>
          <button onClick={() => go(1)} disabled={i === last} aria-label="Next panel"
                  className="px-2.5 py-1 rounded border border-border text-text-secondary hover:text-text-primary disabled:opacity-25">→</button>
        </div>
      </div>

      {showHelp && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full border border-border bg-surface font-mono text-[10px] text-text-muted">
          ← → or space to move · Esc to exit
        </div>
      )}

      <style>{`
        @keyframes presenterFade {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}
