import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClient, updateClient, deleteClient } from '../api/clients'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const INDUSTRIES = ['Plumbing','HVAC','Electrical','Construction','Landscaping','Roofing','Other']

function Field({ label, children }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

export default function ClientProfile({ onClientUpdated, onClientDeleted }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [client, setClient] = useState(null)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setLoading(true)
    getClient(id)
      .then(data => {
        setClient(data)
        setForm({
          name: data.name,
          industry: data.industry || '',
          fiscal_year_start_month: data.fiscal_year_start_month,
          timezone: data.timezone,
          advisor_notes: data.advisor_notes || '',
          terminology_config: data.terminology_config || {},
        })
      })
      .catch(() => setError('Client not found'))
      .finally(() => setLoading(false))
  }, [id])

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setDirty(true)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateClient(id, {
        ...form,
        fiscal_year_start_month: Number(form.fiscal_year_start_month),
        industry: form.industry || null,
        advisor_notes: form.advisor_notes || null,
      })
      setClient(updated)
      setDirty(false)
      onClientUpdated?.(updated)
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteClient(id)
      onClientDeleted?.(Number(id))
      navigate('/')
    } catch {
      setError('Delete failed')
    }
  }

  if (loading) return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">Loading…</div>
  if (error && !form) return <div className="flex-1 flex items-center justify-center text-[#c05a5a] text-sm">{error}</div>

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted mb-1">
            <button onClick={() => navigate('/')} className="hover:text-text-secondary transition-colors">
              Client Roster
            </button>
            <span>/</span>
            <span className="text-text-secondary">{client?.name}</span>
          </div>
          <h1 className="font-display font-bold text-xl text-text-primary">Profile & Settings</h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {error && (
          <div className="bg-[rgba(192,90,90,0.08)] border border-[rgba(192,90,90,0.2)] rounded-xl px-4 py-3 text-[12px] text-[#c05a5a] mb-5 max-w-2xl">
            {error}
          </div>
        )}

        <div className="max-w-2xl space-y-8">
          {/* Business Info */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <h2 className="font-display font-semibold text-base text-text-primary mb-5">
              Business Information
            </h2>
            <div className="space-y-4">
              <Field label="Client Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors"
                />
              </Field>

              <Field label="Industry">
                <select
                  value={form.industry}
                  onChange={e => set('industry', e.target.value)}
                  className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
                >
                  <option value="">Not specified</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Fiscal Year Start">
                  <select
                    value={form.fiscal_year_start_month}
                    onChange={e => set('fiscal_year_start_month', e.target.value)}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                  </select>
                </Field>
                <Field label="Timezone">
                  <select
                    value={form.timezone}
                    onChange={e => set('timezone', e.target.value)}
                    className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
                  >
                    <option value="America/New_York">Eastern (ET)</option>
                    <option value="America/Chicago">Central (CT)</option>
                    <option value="America/Denver">Mountain (MT)</option>
                    <option value="America/Los_Angeles">Pacific (PT)</option>
                  </select>
                </Field>
              </div>
            </div>
          </section>

          {/* Terminology */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <h2 className="font-display font-semibold text-base text-text-primary mb-1">
              Terminology
            </h2>
            <p className="text-text-muted text-[12px] mb-5">
              Customize how work units are labeled for this client (e.g. "Jobs" vs "Projects").
            </p>
            <Field label="Work Unit Label">
              <input
                type="text"
                value={form.terminology_config?.jobs_label || ''}
                onChange={e => set('terminology_config', { ...form.terminology_config, jobs_label: e.target.value })}
                placeholder="Jobs"
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
              />
            </Field>
          </section>

          {/* Advisor Notes — private */}
          <section className="bg-surface border border-border rounded-xl p-6">
            <div className="flex items-start justify-between mb-1">
              <h2 className="font-display font-semibold text-base text-text-primary">
                Advisor Notes
              </h2>
              <span className="font-mono text-[9px] uppercase tracking-widest text-text-muted border border-border rounded px-1.5 py-0.5">
                Private
              </span>
            </div>
            <p className="text-text-muted text-[12px] mb-4">
              Soft context that travels with this client — energy level, personal goals, things to revisit.
              Never exported or visible to clients.
            </p>
            <textarea
              value={form.advisor_notes}
              onChange={e => set('advisor_notes', e.target.value)}
              rows={6}
              placeholder="Add private notes about this client…"
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors resize-none"
            />
          </section>

          {/* Metadata */}
          <section className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-center gap-6 text-[11px] text-text-muted font-mono">
              <span>ID: {client?.id}</span>
              <span>Created: {new Date(client?.created_at).toLocaleDateString()}</span>
              <span>Updated: {new Date(client?.updated_at).toLocaleDateString()}</span>
            </div>
          </section>

          {/* Danger zone */}
          <section className="border border-[rgba(192,90,90,0.2)] rounded-xl p-5">
            <h2 className="font-display font-semibold text-sm text-[#c05a5a] mb-1">Danger Zone</h2>
            <p className="text-text-muted text-[12px] mb-4">
              Permanently delete this client and all associated data. This cannot be undone.
            </p>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="px-3 py-1.5 rounded-lg border border-[rgba(192,90,90,0.3)] text-[#c05a5a] text-sm hover:bg-[rgba(192,90,90,0.08)] transition-colors"
              >
                Delete Client
              </button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-text-secondary">Are you sure?</span>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 rounded-lg bg-[rgba(192,90,90,0.15)] border border-[rgba(192,90,90,0.3)] text-[#c05a5a] text-sm hover:bg-[rgba(192,90,90,0.25)] transition-colors"
                >
                  Yes, delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg text-text-muted text-sm hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
