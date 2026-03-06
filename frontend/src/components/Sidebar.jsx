import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { getActuals } from '../api/ingestion'

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Sidebar stays dark regardless of the main app theme
const S = {
  bg: '#16181c',
  surface2: '#1e2025',
  border: '#2a2d35',
  textPrimary: '#f0f0ee',
  textSecondary: '#8a8f9e',
  textMuted: '#4a4f5e',
}

export default function Sidebar({ clients, activeClientId }) {
  const navigate = useNavigate()
  const activeClient = clients?.find(c => c.id === activeClientId)
  const [periods, setPeriods] = useState([])
  const [collapsedYears, setCollapsedYears] = useState(new Set())

  useEffect(() => {
    if (!activeClientId) { setPeriods([]); return }
    getActuals(activeClientId).then(setPeriods).catch(() => setPeriods([]))
  }, [activeClientId])

  // Group periods by fiscal year
  const periodsByYear = periods.reduce((acc, p) => {
    if (!acc[p.fiscal_year]) acc[p.fiscal_year] = []
    acc[p.fiscal_year].push(p)
    return acc
  }, {})
  const years = Object.keys(periodsByYear).map(Number).sort((a, b) => b - a)

  const toggleYear = (year) => {
    setCollapsedYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
  }

  return (
    <aside
      className="w-[220px] min-w-[220px] flex flex-col h-full"
      style={{ background: S.bg, borderRight: `1px solid ${S.border}` }}
    >
      {/* Logo */}
      <div className="px-3 py-5 flex items-center justify-center" style={{ borderBottom: `1px solid ${S.border}` }}>
        <button onClick={() => navigate('/')} className="block w-full">
          <img src={logo} alt="ORDOBOOK" className="h-12 w-auto object-contain mx-auto" />
        </button>
      </div>

      {/* Client context */}
      {activeClient && (
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${S.border}`, background: 'rgba(200,169,110,0.04)' }}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[11px] mb-2.5 w-full rounded-md px-2 py-1.5 transition-colors"
            style={{
              color: S.textSecondary,
              border: `1px solid ${S.border}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = S.textPrimary; e.currentTarget.style.borderColor = '#4a4f5e' }}
            onMouseLeave={e => { e.currentTarget.style.color = S.textSecondary; e.currentTarget.style.borderColor = S.border }}
          >
            ← All clients
          </button>
          <div className="font-display font-semibold text-sm leading-tight" style={{ color: S.textPrimary }}>
            {activeClient.name}
          </div>
          {activeClient.industry && (
            <div className="text-[11px] mt-0.5" style={{ color: S.textMuted }}>{activeClient.industry}</div>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {!activeClient ? (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5" style={{ color: S.textMuted }}>
              Navigation
            </p>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] transition-colors ${isActive ? '' : ''}`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(200,169,110,0.1)' : 'transparent',
                color: isActive ? '#c8a96e' : S.textSecondary,
              })}
              onMouseEnter={e => { if (!e.currentTarget.dataset.active) e.currentTarget.style.color = S.textPrimary }}
              onMouseLeave={e => { if (!e.currentTarget.dataset.active) e.currentTarget.style.color = S.textSecondary }}
            >
              <span>⊞</span> Client Roster
            </NavLink>
          </>
        ) : (
          <>
            <p className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5" style={{ color: S.textMuted }}>
              Client
            </p>

            {[
              { to: `/clients/${activeClientId}`, end: true, icon: '⊞', label: 'Workspace' },
              { to: `/clients/${activeClientId}/upload`, end: false, icon: '↑', label: 'Import Data' },
              { to: `/clients/${activeClientId}/profile`, end: false, icon: '◎', label: 'Profile & Settings' },
            ].map(({ to, end, icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[12px] transition-colors"
                style={({ isActive }) => ({
                  background: isActive ? 'rgba(200,169,110,0.1)' : 'transparent',
                  color: isActive ? '#c8a96e' : S.textSecondary,
                })}
              >
                <span>{icon}</span> {label}
              </NavLink>
            ))}

            {years.length > 0 && (
              <>
                <p className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5 mt-4" style={{ color: S.textMuted }}>
                  Periods
                </p>
                {years.map(year => (
                  <div key={year}>
                    <button
                      onClick={() => toggleYear(year)}
                      className="flex items-center justify-between w-full px-2 py-1.5 rounded-md text-[12px] transition-colors"
                      style={{ color: S.textMuted }}
                      onMouseEnter={e => e.currentTarget.style.color = S.textSecondary}
                      onMouseLeave={e => e.currentTarget.style.color = S.textMuted}
                    >
                      <span className="font-mono">{year}</span>
                      <span className="text-[9px]">{collapsedYears.has(year) ? '▸' : '▾'}</span>
                    </button>
                    {!collapsedYears.has(year) && periodsByYear[year].map(p => (
                      <NavLink
                        key={p.id}
                        to={`/clients/${activeClientId}/actuals/${p.fiscal_year}/${p.month}`}
                        className="flex items-center justify-between pl-4 pr-2 py-1.5 rounded-md text-[12px] transition-colors"
                        style={({ isActive }) => ({
                          background: isActive ? 'rgba(200,169,110,0.1)' : 'transparent',
                          color: isActive ? '#c8a96e' : S.textSecondary,
                        })}
                      >
                        <span>{MONTH_ABBR[p.month]}</span>
                        {p.status === 'draft' && (
                          <span className="w-1.5 h-1.5 rounded-full bg-[#c8a96e]" />
                        )}
                      </NavLink>
                    ))}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: `1px solid ${S.border}` }}>
        <span className="font-mono text-[9px] tracking-[0.1em]" style={{ color: S.textMuted }}>
          ORDOBOOK v0.1
        </span>
      </div>
    </aside>
  )
}
