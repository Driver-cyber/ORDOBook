import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { getActionPlan, createActionPlanItem, updateActionPlanItem, deleteActionPlanItem } from '../api/action_plan'
import { downloadPdf, downloadJson } from '../api/exports'

const CURRENT_YEAR = new Date().getFullYear()

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditCell({ value, placeholder, onSave, multiline = false, className = '' }) {
  const [draft, setDraft] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value || '').trim()) onSave(trimmed)
  }

  const props = {
    ref,
    value: draft,
    placeholder,
    onChange: e => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: e => {
      if (!multiline && e.key === 'Enter') { e.preventDefault(); ref.current?.blur() }
      if (e.key === 'Escape') { setDraft(value || ''); ref.current?.blur() }
    },
    className: `w-full bg-transparent resize-none outline-none text-[12px] text-text-primary
      placeholder:text-text-muted leading-relaxed ${className}`,
  }

  return multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />
}

// ─── Notes popover ────────────────────────────────────────────────────────────

function NotesCell({ value, onSave }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const ref = useRef(null)

  useEffect(() => { setDraft(value || '') }, [value])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== (value || '').trim()) onSave(trimmed || null)
    setOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={value ? value : 'Add advisor note'}
        className={`w-6 h-6 flex items-center justify-center rounded transition-colors text-[12px]
          ${value ? 'text-accent' : 'text-text-muted hover:text-text-secondary'}`}
      >
        {value ? '★' : '☆'}
      </button>
      {open && (
        <div className="absolute right-0 z-50 w-64 bg-bg border border-border rounded-xl shadow-lg p-3"
          style={{ top: '28px' }}>
          <p className="font-mono text-[9px] uppercase tracking-widest text-text-muted mb-2">
            Advisor Note (private)
          </p>
          <textarea
            autoFocus
            rows={4}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Private notes — never exported"
            className="w-full bg-surface border border-border rounded-lg px-2.5 py-2 text-[12px]
              text-text-primary placeholder:text-text-muted resize-none outline-none
              focus:border-accent/50 transition-colors leading-relaxed"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => { setDraft(value || ''); setOpen(false) }}
              className="text-[11px] text-text-muted hover:text-text-secondary"
            >
              Cancel
            </button>
            <button
              onClick={commit}
              className="px-3 py-1 rounded-md bg-accent text-bg text-[11px] font-medium hover:bg-[#d4b87a]"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Action plan row ──────────────────────────────────────────────────────────

function ActionPlanRow({ item, onUpdate, onDelete }) {
  const save = (field) => (value) => onUpdate(item.id, { [field]: value || null })

  return (
    <tr className="group border-b border-border/40 hover:bg-surface/40 transition-colors align-top">
      {/* Objective */}
      <td className="px-4 py-3 w-[22%]">
        <EditCell
          value={item.objective}
          placeholder="Objective…"
          onSave={save('objective')}
          multiline
        />
      </td>
      {/* Current Results */}
      <td className="px-4 py-3 w-[20%]">
        <EditCell
          value={item.current_results}
          placeholder="Where we are…"
          onSave={save('current_results')}
          multiline
        />
      </td>
      {/* Next Steps */}
      <td className="px-4 py-3 w-[22%]">
        <EditCell
          value={item.next_steps}
          placeholder="Action items…"
          onSave={save('next_steps')}
          multiline
        />
      </td>
      {/* Owner */}
      <td className="px-3 py-3 w-[10%]">
        <EditCell
          value={item.owner}
          placeholder="Owner"
          onSave={save('owner')}
        />
      </td>
      {/* Due Date */}
      <td className="px-3 py-3 w-[11%]">
        <input
          type="date"
          defaultValue={item.due_date || ''}
          onBlur={e => save('due_date')(e.target.value || null)}
          className="w-full bg-transparent outline-none text-[12px] text-text-primary
            [color-scheme:light] cursor-pointer"
        />
      </td>
      {/* Notes */}
      <td className="px-3 py-3 w-[6%] text-center">
        <NotesCell value={item.notes} onSave={save('notes')} />
      </td>
      {/* Delete */}
      <td className="px-3 py-3 w-[5%] text-center">
        <button
          onClick={() => onDelete(item.id)}
          className="w-6 h-6 flex items-center justify-center rounded text-text-muted
            opacity-0 group-hover:opacity-100 hover:text-[#c05a5a] hover:bg-[#fde8e8] transition-all"
          title="Delete row"
        >
          ×
        </button>
      </td>
    </tr>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ActionPlan() {
  const { id: clientId } = useParams()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [items, setItems] = useState([])
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

  const handleAdd = async () => {
    setSaving(true)
    try {
      const item = await createActionPlanItem(clientId, year, { sort_order: items.length })
      setItems(prev => [...prev, item])
    } finally {
      setSaving(false)
    }
  }

  const handleUpdate = useCallback(async (itemId, patch) => {
    try {
      const updated = await updateActionPlanItem(clientId, year, itemId, patch)
      setItems(prev => prev.map(i => i.id === itemId ? updated : i))
    } catch {
      // silent — field reverts on next load
    }
  }, [clientId, year])

  const handleDelete = async (itemId) => {
    if (!window.confirm('Remove this action item?')) return
    try {
      await deleteActionPlanItem(clientId, year, itemId)
      setItems(prev => prev.filter(i => i.id !== itemId))
    } catch {
      setError('Delete failed')
    }
  }

  const handleExportPdf = async () => {
    setExporting('pdf')
    try {
      await downloadPdf(clientId, 'action-plan', year)
    } catch (e) {
      alert(e.message)
    } finally {
      setExporting(null)
    }
  }

  const handleExportJson = async () => {
    setExporting('json')
    try {
      await downloadJson(clientId, year)
    } catch (e) {
      alert(e.message)
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* Header */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Action Plan</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            Editable in place · saves automatically · advisor notes are private
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Year picker */}
          <div className="flex items-center gap-1 border border-border rounded-lg px-2 py-1">
            <button
              onClick={() => setYear(y => y - 1)}
              className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors text-[11px]"
            >
              ‹
            </button>
            <span className="font-mono text-[12px] text-text-primary px-1 min-w-[36px] text-center">
              {year}
            </span>
            <button
              onClick={() => setYear(y => y + 1)}
              className="w-5 h-5 flex items-center justify-center text-text-muted hover:text-text-primary transition-colors text-[11px]"
            >
              ›
            </button>
          </div>

          <button
            onClick={handleExportJson}
            disabled={exporting !== null}
            className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary
              hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {exporting === 'json' ? 'Exporting…' : 'Export JSON'}
          </button>

          <button
            onClick={handleExportPdf}
            disabled={exporting !== null}
            className="px-3 py-1.5 rounded-lg border border-border text-[12px] text-text-secondary
              hover:border-accent/40 hover:text-text-primary transition-colors disabled:opacity-40"
          >
            {exporting === 'pdf' ? 'Generating…' : 'Export PDF'}
          </button>

          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-accent text-bg
              text-[12px] font-medium hover:bg-[#d4b87a] transition-colors disabled:opacity-40"
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-8 mt-4 px-4 py-2 rounded-lg bg-[#fde8e8] border border-[#f5b8b8] text-[#922b2b] text-[12px]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40 text-text-muted text-sm">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-text-muted text-3xl mb-3">◎</div>
            <p className="font-display font-semibold text-text-primary mb-1">No action items yet</p>
            <p className="text-text-muted text-[12px] mb-5">
              Add items to build the {year} action plan.
            </p>
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
            >
              + Add First Item
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead>
                <tr className="border-b border-border bg-surface/60">
                  <th className="text-left px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[22%]">
                    Objective
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[20%]">
                    Current Results
                  </th>
                  <th className="text-left px-4 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[22%]">
                    Next Steps
                  </th>
                  <th className="text-left px-3 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[10%]">
                    Owner
                  </th>
                  <th className="text-left px-3 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[11%]">
                    Due Date
                  </th>
                  <th className="text-center px-3 py-2.5 font-mono text-[9px] uppercase tracking-widest text-text-muted w-[6%]"
                    title="Advisor Notes (private)">
                    Notes
                  </th>
                  <th className="w-[5%]" />
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <ActionPlanRow
                    key={item.id}
                    item={item}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length > 0 && (
          <div className="px-6 py-4">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="text-[12px] text-text-muted hover:text-accent border border-dashed border-border
                hover:border-accent/40 rounded-lg px-4 py-2 transition-colors disabled:opacity-40 w-full"
            >
              + Add Item
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
