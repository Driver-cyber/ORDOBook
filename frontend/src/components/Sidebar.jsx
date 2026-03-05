import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.webp'
import { getActuals } from '../api/ingestion'

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function Sidebar({ clients, activeClientId }) {
  const navigate = useNavigate()
  const activeClient = clients?.find(c => c.id === activeClientId)
  const [periods, setPeriods] = useState([])

  useEffect(() => {
    if (!activeClientId) { setPeriods([]); return }
    getActuals(activeClientId).then(setPeriods).catch(() => setPeriods([]))
  }, [activeClientId])

  return (
    <aside className="w-[220px] min-w-[220px] bg-surface border-r border-border flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-border">
        <button onClick={() => navigate('/')} className="block text-left w-full">
          <img src={logo} alt="ORDOBOOK" className="h-7 w-auto object-contain object-left" />
        </button>
      </div>

      {/* Client context */}
      {activeClient && (
        <div className="px-4 py-3 border-b border-border bg-[rgba(200,169,110,0.04)]">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-[11px] text-text-muted mb-2 hover:text-text-secondary transition-colors"
          >
            <span>←</span> All clients
          </button>
          <div className="font-display font-semibold text-sm text-text-primary leading-tight">
            {activeClient.name}
          </div>
          {activeClient.industry && (
            <div className="text-[11px] text-text-muted mt-0.5">{activeClient.industry}</div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {!activeClient ? (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted px-2 mb-1.5">
              Navigation
            </p>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${
                  isActive
                    ? 'bg-[rgba(200,169,110,0.1)] text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface2'
                }`
              }
            >
              <span>⊞</span> Client Roster
            </NavLink>
          </>
        ) : (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted px-2 mb-1.5">
              Client
            </p>
            <NavLink
              to={`/clients/${activeClientId}`}
              end
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  isActive
                    ? 'bg-[rgba(200,169,110,0.1)] text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface2'
                }`
              }
            >
              <span>⊞</span> Workspace
            </NavLink>
            <NavLink
              to={`/clients/${activeClientId}/upload`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  isActive
                    ? 'bg-[rgba(200,169,110,0.1)] text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface2'
                }`
              }
            >
              <span>↑</span> Import Data
            </NavLink>
            <NavLink
              to={`/clients/${activeClientId}/profile`}
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                  isActive
                    ? 'bg-[rgba(200,169,110,0.1)] text-accent'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface2'
                }`
              }
            >
              <span>◎</span> Profile & Settings
            </NavLink>

            {periods.length > 0 && (
              <>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-text-muted px-2 mb-1.5 mt-4">
                  Periods
                </p>
                {periods.map(p => (
                  <NavLink
                    key={p.id}
                    to={`/clients/${activeClientId}/actuals/${p.fiscal_year}/${p.month}`}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] transition-colors ${
                        isActive
                          ? 'bg-[rgba(200,169,110,0.1)] text-accent'
                          : 'text-text-secondary hover:text-text-primary hover:bg-surface2'
                      }`
                    }
                  >
                    <span>{MONTH_ABBR[p.month]} {p.fiscal_year}</span>
                    {p.status === 'draft' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#c8a96e]" />
                    )}
                  </NavLink>
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border">
        <span className="font-mono text-[9px] text-text-muted tracking-[0.1em]">
          ORDOBOOK v0.1
        </span>
      </div>
    </aside>
  )
}
