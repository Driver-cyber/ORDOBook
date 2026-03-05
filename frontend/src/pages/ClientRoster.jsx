import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getClients, createClient } from '../api/clients'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const INDUSTRIES = ['Plumbing','HVAC','Electrical','Construction','Landscaping','Roofing','Other']

function NewClientModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    industry: '',
    fiscal_year_start_month: 1,
    timezone: 'America/Chicago',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const client = await createClient({
        ...form,
        fiscal_year_start_month: Number(form.fiscal_year_start_month),
        terminology_config: {},
      })
      onCreated(client)
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create client')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-md mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-display font-bold text-lg text-text-primary">New Client</h2>
          <p className="text-text-muted text-[12px] mt-0.5">Create a new client profile</p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-[rgba(192,90,90,0.1)] border border-[rgba(192,90,90,0.3)] rounded-lg px-3 py-2 text-[12px] text-[#c05a5a]">
              {error}
            </div>
          )}

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
              Client Name *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="Vetter Plumbing"
              autoFocus
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent transition-colors"
            />
          </div>

          <div>
            <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
              Industry
            </label>
            <select
              value={form.industry}
              onChange={e => set('industry', e.target.value)}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
            >
              <option value="">Select industry…</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
                Fiscal Year Start
              </label>
              <select
                value={form.fiscal_year_start_month}
                onChange={e => set('fiscal_year_start_month', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
              >
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-text-muted mb-1.5">
                Timezone
              </label>
              <select
                value={form.timezone}
                onChange={e => set('timezone', e.target.value)}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent transition-colors appearance-none"
              >
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </select>
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !form.name.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-bg hover:bg-[#d4b87a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Creating…' : 'Create Client'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ClientRoster({ onClientsLoaded }) {
  const navigate = useNavigate()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showModal, setShowModal] = useState(false)

  const load = async () => {
    try {
      const data = await getClients()
      setClients(data)
      onClientsLoaded?.(data)
    } catch {
      setError('Could not connect to the ORDOBOOK backend. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreated = (client) => {
    setShowModal(false)
    navigate(`/clients/${client.id}`)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="px-8 py-5 border-b border-border bg-bg flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-xl text-text-primary">Client Roster</h1>
          <p className="text-text-muted text-[12px] mt-0.5">
            {clients.length} {clients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
        >
          <span className="text-base leading-none">+</span> New Client
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {loading && (
          <div className="text-text-muted text-sm">Loading…</div>
        )}

        {error && (
          <div className="bg-[rgba(192,90,90,0.08)] border border-[rgba(192,90,90,0.2)] rounded-xl px-5 py-4 text-[13px] text-[#c05a5a] max-w-lg">
            {error}
          </div>
        )}

        {!loading && !error && clients.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-text-muted text-4xl mb-4">◎</div>
            <h3 className="font-display font-semibold text-text-primary mb-1">No clients yet</h3>
            <p className="text-text-muted text-sm mb-5">
              Add your first client to get started.
            </p>
            <button
              onClick={() => setShowModal(true)}
              className="px-4 py-2 rounded-lg bg-accent text-bg text-sm font-medium hover:bg-[#d4b87a] transition-colors"
            >
              + New Client
            </button>
          </div>
        )}

        {!loading && !error && clients.length > 0 && (
          <div className="grid gap-2 max-w-3xl">
            {clients.map(client => (
              <button
                key={client.id}
                onClick={() => navigate(`/clients/${client.id}`)}
                className="w-full text-left bg-surface border border-border rounded-xl px-5 py-4 hover:border-accent/40 hover:bg-surface2 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-display font-semibold text-text-primary group-hover:text-accent transition-colors">
                      {client.name}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {client.industry && (
                        <span className="font-mono text-[10px] text-text-muted uppercase tracking-wider">
                          {client.industry}
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-text-muted">
                        FY starts {MONTHS[(client.fiscal_year_start_month || 1) - 1]}
                      </span>
                    </div>
                  </div>
                  <span className="text-text-muted group-hover:text-accent transition-colors">→</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <NewClientModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
