import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import {
  getActionPlan, createActionPlanItem, updateActionPlanItem, deleteActionPlanItem, reorderActionPlan,
  createStep, updateStep, deleteStep, reorderSteps,
} from '../api/action_plan'
import { getClient, updateClient } from '../api/clients'
import { downloadPdf, downloadJson } from '../api/exports'

const CURRENT_YEAR = new Date().getFullYear()

// Advisor-guided limits, not enforced by the API — like the Scoreboard's three
// red priorities. A client can act on three things at once; a fourth dilutes.
const MAX_OBJECTIVES = 3
const MAX_STEPS = 3

// ─── Popover anchored to a button, rendered fixed so nothing clips it ────────

function useAnchoredPopover() {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, right: 0 })
  const btnRef = useRef(null)
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
    }
    setOpen(o => !o)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return { open, setOpen, toggle, btnRef, pos }
}

function Popover({ open, pos, onClose, width = 288, children }) {
  if (!open) return null
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 bg-surface border border-border rounded-xl shadow-xl p-3"
        style={{ top: pos.top, right: pos.right, width }}
      >
        {children}
      </div>
    </>
  )
}

// ─── Auto-growing text that saves on blur ────────────────────────────────────

function AutoText({ value, placeholder, onSave, className = '', minRows = 1 }) {
  const [draft, setDraft] = useState(value || '')
  const ref = useRef(null)
  useEffect(() => { setDraft(value || '') }, [value])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [draft])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value || '').trim()) onSave(trimmed)
  }
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={draft}
      placeholder={placeholder}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ref.current?.blur() }
        if (e.key === 'Escape') { setDraft(value || ''); ref.current?.blur() }
      }}
      className={`w-full bg-transparent resize-none outline-none overflow-hidden text-text-primary
        placeholder:text-text-muted leading-relaxed rounded px-1 -mx-1 focus:bg-surface2/60 transition-colors ${className}`}
    />
  )
}

// ─── Private advisor note ────────────────────────────────────────────────────

function NotesButton({ value, onSave }) {
  const pop = useAnchoredPopover()
  const [draft, setDraft] = useState(value || '')
  useEffect(() => { setDraft(value || '') }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value || '').trim()) onSave(trimmed || null)
    pop.setOpen(false)
  }
  return (
    <>
      <button
        ref={pop.btnRef}
        onClick={pop.toggle}
        title={value ? value : 'Add advisor note (private)'}
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors text-[13px]
          ${value ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
      >
        {value ? '★' : '☆'}
      </button>
      <Popover open={pop.open} pos={pop.pos} onClose={() => { setDraft(value || ''); pop.setOpen(false) }}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
          Advisor Note (private)
        </p>
        <textarea
          autoFocus
          rows={4}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Private notes — never exported"
          className="w-full bg-surface2 border border-border rounded-lg px-2.5 py-2 text-[12px]
            text-text-primary placeholder:text-text-muted resize-none outline-none
            focus:border-accent/50 transition-colors leading-relaxed"
        />
        <div className="flex justify-end gap-2 mt-2">
          <button onClick={() => { setDraft(value || ''); pop.setOpen(false) }}
                  className="text-[11px] text-text-muted hover:text-text-secondary">Cancel</button>
          <button onClick={commit}
                  className="px-3 py-1 rounded-md bg-accent text-bg text-[11px] font-medium hover:bg-[#d4b87a]">Save</button>
        </div>
      </Popover>
    </>
  )
}

// ─── Owner chips ─────────────────────────────────────────────────────────────

function OwnerChips({ owners, roster, onChange, onRosterAdd }) {
  const pop = useAnchoredPopover()
  const [newName, setNewName] = useState('')
  const has = (n) => owners.some(o => o.toLowerCase() === n.toLowerCase())
  const toggleName = (n) => onChange(has(n) ? owners.filter(o => o.toLowerCase() !== n.toLowerCase()) : [...owners, n])
  const addNew = () => {
    const n = newName.trim()
    if (!n) return
    if (!roster.some(r => r.toLowerCase() === n.toLowerCase())) onRosterAdd(n)
    if (!has(n)) onChange([...owners, n])
    setNewName('')
  }
  // Names on this step that are no longer on the roster still show, so nothing vanishes.
  const choices = [...roster, ...owners.filter(o => !roster.some(r => r.toLowerCase() === o.toLowerCase()))]

  return (
    <div className="flex flex-wrap items-center gap-1">
      {owners.map(o => (
        <span key={o} className="group/chip inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px]
                                 bg-surface2 border border-border text-text-primary">
          {o}
          <button onClick={() => toggleName(o)} title={`Remove ${o}`}
                  className="w-3.5 h-3.5 rounded-full text-[10px] leading-none text-text-muted hover:text-[#c05a5a]">×</button>
        </span>
      ))}
      <button
        ref={pop.btnRef}
        onClick={pop.toggle}
        title="Assign owners"
        className={`h-5 px-1.5 rounded-full border border-dashed text-[11px] transition-colors
          ${owners.length ? 'border-border text-text-muted hover:text-text-secondary' : 'border-border text-text-muted hover:border-accent/50 hover:text-accent'}`}
      >
        {owners.length ? '+' : '+ owner'}
      </button>
      <Popover open={pop.open} pos={pop.pos} onClose={() => pop.setOpen(false)} width={220}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">Owners</p>
        {choices.length === 0 && (
          <p className="text-[11px] text-text-muted mb-2">No one on the roster yet — add a name below.</p>
        )}
        <div className="max-h-48 overflow-y-auto -mx-1">
          {choices.map(n => (
            <button key={n} onClick={() => toggleName(n)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] text-left hover:bg-surface2 transition-colors">
              <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px]
                ${has(n) ? 'bg-accent border-accent text-bg' : 'border-border text-transparent'}`}>✓</span>
              <span className="text-text-primary">{n}</span>
            </button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); addNew() }} className="flex gap-1 mt-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Add a name…"
            className="flex-1 min-w-0 bg-surface2 border border-border rounded-md px-2 py-1 text-[12px] text-text-primary
              placeholder:text-text-muted outline-none focus:border-accent/50"
          />
          <button type="submit" className="px-2 py-1 rounded-md bg-accent text-bg text-[11px] font-medium hover:bg-[#d4b87a]">Add</button>
        </form>
      </Popover>
    </div>
  )
}

// ─── Roster editor (header) ──────────────────────────────────────────────────

function RosterButton({ roster, onSave }) {
  const pop = useAnchoredPopover()
  const [newName, setNewName] = useState('')
  const add = () => {
    const n = newName.trim()
    if (!n || roster.some(r => r.toLowerCase() === n.toLowerCase())) { setNewName(''); return }
    onSave([...roster, n]); setNewName('')
  }
  return (
    <>
      <button ref={pop.btnRef} onClick={pop.toggle}
              className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary
                hover:border-accent/40 hover:text-text-primary transition-colors">
        Owners{roster.length ? ` (${roster.length})` : ''}
      </button>
      <Popover open={pop.open} pos={pop.pos} onClose={() => pop.setOpen(false)} width={240}>
        <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">Owner roster</p>
        {roster.length === 0 && <p className="text-[11px] text-text-muted mb-2">Who can own an action item for this client?</p>}
        <ul className="-mx-1">
          {roster.map(n => (
            <li key={n} className="flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] hover:bg-surface2">
              <span className="text-text-primary">{n}</span>
              <button onClick={() => onSave(roster.filter(r => r !== n))} title={`Remove ${n} from roster`}
                      className="text-text-muted hover:text-[#c05a5a] text-[12px]">×</button>
            </li>
          ))}
        </ul>
        <form onSubmit={e => { e.preventDefault(); add() }} className="flex gap-1 mt-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Add a name…"
                 className="flex-1 min-w-0 bg-surface2 border border-border rounded-md px-2 py-1 text-[12px] text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50" />
          <button type="submit" className="px-2 py-1 rounded-md bg-accent text-bg text-[11px] font-medium hover:bg-[#d4b87a]">Add</button>
        </form>
        <p className="text-[10px] text-text-muted mt-2">Also editable under Profile &amp; Settings.</p>
      </Popover>
    </>
  )
}

// ─── Reorder / delete controls ───────────────────────────────────────────────

function RowControls({ index, count, onMove, onDelete, deleteTitle }) {
  const btn = 'w-6 h-6 flex items-center justify-center rounded text-[11px] text-text-muted transition-colors disabled:opacity-20'
  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button onClick={() => onMove(-1)} disabled={index === 0} title="Move up" className={`${btn} hover:text-text-primary`}>▲</button>
      <button onClick={() => onMove(1)} disabled={index === count - 1} title="Move down" className={`${btn} hover:text-text-primary`}>▼</button>
      <button onClick={onDelete} title={deleteTitle} className={`${btn} hover:text-[#c05a5a] hover:bg-[#fde8e8]`}>×</button>
    </div>
  )
}

// ─── One action item ─────────────────────────────────────────────────────────

function StepRow({ step, number, index, count, roster, onUpdate, onDelete, onMove, onRosterAdd }) {
  return (
    <div className="group grid items-start gap-3 px-5 py-2.5 border-t border-border/50"
         style={{ gridTemplateColumns: '40px minmax(0,1fr) 200px 130px 76px' }}>
      <span className="font-mono text-[11px] text-text-muted pt-1">{number}</span>
      <AutoText value={step.text} placeholder="What needs to happen…" onSave={v => onUpdate({ text: v })} className="text-[12px]" />
      <OwnerChips owners={step.owners || []} roster={roster} onChange={owners => onUpdate({ owners })} onRosterAdd={onRosterAdd} />
      <input
        type="date"
        defaultValue={step.due_date || ''}
        onBlur={e => { if ((e.target.value || null) !== (step.due_date || null)) onUpdate({ due_date: e.target.value || null }) }}
        className="w-full bg-transparent outline-none text-[12px] text-text-primary [color-scheme:light] cursor-pointer rounded px-1 -mx-1 focus:bg-surface2/60"
      />
      <RowControls index={index} count={count} onMove={onMove} onDelete={onDelete} deleteTitle="Remove action item" />
    </div>
  )
}

// ─── One objective ───────────────────────────────────────────────────────────

function ObjectiveCard({ item, index, count, roster, onUpdate, onDelete, onMove, onAddStep, onUpdateStep, onDeleteStep, onMoveStep, onRosterAdd }) {
  const steps = item.steps || []
  const full = steps.length >= MAX_STEPS
  return (
    <div className="group bg-surface border border-border rounded-xl">
      {/* Objective */}
      <div className="flex items-start gap-3 px-5 pt-4 pb-3">
        <span className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center font-mono text-[12px] font-semibold"
              style={{ background: 'rgba(200,169,110,0.15)', color: '#a07a3a' }}>{index + 1}</span>
        <div className="flex-1 min-w-0">
          <AutoText value={item.objective} placeholder="Objective — what are we trying to achieve?"
                    onSave={v => onUpdate({ objective: v })} className="font-display font-semibold text-[15px]" />
        </div>
        <NotesButton value={item.notes} onSave={v => onUpdate({ notes: v })} />
        <RowControls index={index} count={count} onMove={onMove} onDelete={onDelete} deleteTitle="Remove objective and its action items" />
      </div>

      {/* Current results */}
      <div className="px-5 pb-4 pl-[60px]">
        <div className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Current results</div>
        <AutoText value={item.current_results} placeholder="Where we are today…" onSave={v => onUpdate({ current_results: v })} className="text-[12px]" />
      </div>

      {/* Action items */}
      <div className="grid gap-3 px-5 py-1.5 bg-surface2/50 border-t border-border/50 font-mono text-[9px] uppercase tracking-widest text-text-muted"
           style={{ gridTemplateColumns: '40px minmax(0,1fr) 200px 130px 76px' }}>
        <span>#</span><span>Action item</span><span>Owner</span><span>Due</span><span />
      </div>
      {steps.length === 0 && (
        <div className="px-5 py-3 border-t border-border/50 text-[12px] text-text-muted">No action items yet.</div>
      )}
      {steps.map((s, i) => (
        <StepRow key={s.id} step={s} number={`${index + 1}.${i + 1}`} index={i} count={steps.length} roster={roster}
                 onUpdate={patch => onUpdateStep(s.id, patch)} onDelete={() => onDeleteStep(s)}
                 onMove={dir => onMoveStep(s.id, dir)} onRosterAdd={onRosterAdd} />
      ))}
      <div className="px-5 py-2.5 border-t border-border/50 flex items-center gap-3">
        <button onClick={onAddStep} disabled={full}
                className="text-[12px] text-text-muted hover:text-accent transition-colors disabled:opacity-40 disabled:hover:text-text-muted">
          + Action item
        </button>
        {full && <span className="text-[10px] text-text-muted">Three per objective keeps it doable.</span>}
      </div>
    </div>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function ActionPlan() {
  const { id } = useParams()
  const clientId = Number(id)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [items, setItems] = useState([])
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async (y) => {
    setLoading(true)
    try {
      const data = await getActionPlan(clientId, y)
      setItems(data.items)
    } catch {
      setError('Could not load action plan')
    } finally {
      setLoading(false)
    }
  }, [clientId])

  useEffect(() => { load(year) }, [year, load])
  useEffect(() => {
    getClient(clientId).then(c => setRoster(c.action_plan_owners || [])).catch(() => {})
  }, [clientId])

  const fail = (msg) => (e) => setError(e?.message || msg)
  const patchItem = (itemId, fn) => setItems(prev => prev.map(i => i.id === itemId ? fn(i) : i))

  // Objectives
  const handleAdd = async () => {
    setSaving(true)
    try {
      const item = await createActionPlanItem(clientId, year, { sort_order: items.length })
      setItems(prev => [...prev, { ...item, steps: item.steps || [] }])
    } catch (e) { fail('Could not add objective')(e) } finally { setSaving(false) }
  }
  const handleUpdate = (itemId, patch) =>
    updateActionPlanItem(clientId, year, itemId, patch)
      .then(updated => patchItem(itemId, () => updated))
      .catch(fail('Save failed'))
  const handleDelete = async (item) => {
    const n = (item.steps || []).length
    if (!window.confirm(`Remove this objective${n ? ` and its ${n} action item${n > 1 ? 's' : ''}` : ''}?`)) return
    try {
      await deleteActionPlanItem(clientId, year, item.id)
      setItems(prev => prev.filter(i => i.id !== item.id))
    } catch (e) { fail('Delete failed')(e) }
  }
  const handleMove = async (itemId, dir) => {
    const idx = items.findIndex(i => i.id === itemId)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= items.length) return
    const next = [...items]; [next[idx], next[to]] = [next[to], next[idx]]
    setItems(next)
    try { await reorderActionPlan(clientId, year, next.map(i => i.id)) } catch (e) { fail('Reorder failed')(e); load(year) }
  }

  // Steps
  const handleAddStep = (itemId) =>
    createStep(clientId, year, itemId, {})
      .then(step => patchItem(itemId, i => ({ ...i, steps: [...(i.steps || []), step] })))
      .catch(fail('Could not add action item'))
  const handleUpdateStep = (itemId, stepId, patch) =>
    updateStep(clientId, year, itemId, stepId, patch)
      .then(updated => patchItem(itemId, i => ({ ...i, steps: i.steps.map(s => s.id === stepId ? updated : s) })))
      .catch(fail('Save failed'))
  const handleDeleteStep = async (itemId, step) => {
    if (step.text && !window.confirm('Remove this action item?')) return
    try {
      await deleteStep(clientId, year, itemId, step.id)
      patchItem(itemId, i => ({ ...i, steps: i.steps.filter(s => s.id !== step.id) }))
    } catch (e) { fail('Delete failed')(e) }
  }
  const handleMoveStep = async (itemId, stepId, dir) => {
    const item = items.find(i => i.id === itemId)
    if (!item) return
    const idx = item.steps.findIndex(s => s.id === stepId)
    const to = idx + dir
    if (idx < 0 || to < 0 || to >= item.steps.length) return
    const next = [...item.steps]; [next[idx], next[to]] = [next[to], next[idx]]
    patchItem(itemId, i => ({ ...i, steps: next }))
    try { await reorderSteps(clientId, year, itemId, next.map(s => s.id)) } catch (e) { fail('Reorder failed')(e); load(year) }
  }

  // Roster
  const saveRoster = (list) => {
    setRoster(list)
    updateClient(clientId, { action_plan_owners: list }).catch(fail('Could not save owners'))
  }
  const rosterAdd = (name) => saveRoster([...roster, name])

  const handleExport = async (kind) => {
    setExporting(kind)
    try {
      if (kind === 'pdf') await downloadPdf(clientId, 'action-plan', year)
      else await downloadJson(clientId, year)
    } catch (e) {
      alert(e.message)
    } finally {
      setExporting(null)
    }
  }

  const full = items.length >= MAX_OBJECTIVES
  const secondary = 'px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40'

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Action Plan</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            Up to {MAX_OBJECTIVES} objectives, {MAX_STEPS} action items each · edits save when you click away · ★ notes are private
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1">
            <button onClick={() => setYear(y => y - 1)} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors text-[11px]">‹</button>
            <span className="font-mono text-[12px] text-text-primary px-1 min-w-[36px] text-center">{year}</span>
            <button onClick={() => setYear(y => y + 1)} className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors text-[11px]">›</button>
          </div>
          <RosterButton roster={roster} onSave={saveRoster} />
          <button onClick={() => handleExport('json')} disabled={exporting !== null} className={secondary}>
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>
          <button onClick={() => handleExport('pdf')} disabled={exporting !== null} className={secondary}>
            {exporting === 'pdf' ? 'Generating…' : 'Export PDF'}
          </button>
          <button
            onClick={handleAdd}
            disabled={saving || full}
            title={full ? `${MAX_OBJECTIVES} objectives is the limit — finish one before adding another` : 'Add an objective'}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-bg text-[12px] font-medium hover:bg-[#d4b87a] transition-colors disabled:opacity-40"
          >
            + Objective
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-8 mt-4 px-4 py-2 rounded-lg bg-[#fde8e8] border border-[#f5b8b8] text-[#922b2b] text-[12px] flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-[11px] underline">dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-text-muted text-3xl mb-3">◎</div>
            <p className="font-display font-semibold text-text-primary mb-1">No objectives yet</p>
            <p className="text-text-muted text-[12px] mb-5">
              Set up to three objectives for {year}, each with the action items that get it done.
            </p>
            <button onClick={handleAdd} className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors">
              + First Objective
            </button>
          </div>
        ) : (
          <div className="px-8 py-6 max-w-[1100px] space-y-4">
            {items.map((item, i) => (
              <ObjectiveCard
                key={item.id} item={item} index={i} count={items.length} roster={roster}
                onUpdate={patch => handleUpdate(item.id, patch)}
                onDelete={() => handleDelete(item)}
                onMove={dir => handleMove(item.id, dir)}
                onAddStep={() => handleAddStep(item.id)}
                onUpdateStep={(stepId, patch) => handleUpdateStep(item.id, stepId, patch)}
                onDeleteStep={step => handleDeleteStep(item.id, step)}
                onMoveStep={(stepId, dir) => handleMoveStep(item.id, stepId, dir)}
                onRosterAdd={rosterAdd}
              />
            ))}
            {!full && (
              <button onClick={handleAdd} disabled={saving}
                      className="text-[12px] text-text-muted hover:text-accent border border-dashed border-border hover:border-accent/40 rounded-lg px-4 py-2.5 transition-colors disabled:opacity-40 w-full">
                + Objective
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
