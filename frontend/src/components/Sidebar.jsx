import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useMatch } from 'react-router-dom'
import logo from '../assets/logo.svg'
import { getActuals } from '../api/ingestion'

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const S = {
  bg: '#eae7e2',
  surface2: '#e0ddd8',
  border: '#d4d0ca',
  textPrimary: '#1a1918',
  textSecondary: '#5a5751',
  textMuted: '#9a9590',
}

// Collapsed = icon rail. The choice sticks per browser; the sidebar remounts on
// every route change, so it has to be read back from storage each time.
const COLLAPSE_KEY = 'ordobook.sidebar'
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === 'collapsed' } catch { return false } }
const storeCollapsed = (c) => { try { localStorage.setItem(COLLAPSE_KEY, c ? 'collapsed' : 'open') } catch {} }

export default function Sidebar({ clients, activeClientId }) {
  const navigate = useNavigate()
  const activeClient = clients?.find(c => c.id === activeClientId)
  const inWorkspace  = useMatch(`/clients/${activeClientId}/workspace/*`)
  const inReports    = useMatch(`/clients/${activeClientId}/reports/*`)
  const inScenarios  = useMatch(`/clients/${activeClientId}/scenarios`)
  const inUpload     = useMatch(`/clients/${activeClientId}/upload`)
  const inProfile    = useMatch(`/clients/${activeClientId}/profile`)
  const [periods, setPeriods] = useState([])
  const [collapsedYears, setCollapsedYears] = useState(new Set())
  const [collapsed, setCollapsed] = useState(readCollapsed)

  const toggleCollapsed = () => setCollapsed(c => { storeCollapsed(!c); return !c })

  useEffect(() => {
    if (!activeClientId) { setPeriods([]); return }
    getActuals(activeClientId).then(data => {
      setPeriods(data)
      // Collapse all years except the current year by default
      const currentYear = new Date().getFullYear()
      const allYears = [...new Set(data.map(p => p.fiscal_year))]
      setCollapsedYears(new Set(allYears.filter(y => y !== currentYear)))
    }).catch(() => setPeriods([]))
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

  const clientNav = activeClient ? [
    { icon: '⊞', label: 'Workspace',          to: `/clients/${activeClientId}/workspace`, active: !!inWorkspace },
    { icon: '▤', label: 'Reports',            to: `/clients/${activeClientId}/reports/scoreboard/${new Date().getFullYear()}`, active: !!inReports },
    { icon: '⟁', label: 'Scenarios',          to: `/clients/${activeClientId}/scenarios`, active: !!inScenarios },
    { icon: '↑', label: 'Import Data',        to: `/clients/${activeClientId}/upload`, active: !!inUpload },
    { icon: '◎', label: 'Profile & Settings', to: `/clients/${activeClientId}/profile`, active: !!inProfile },
  ] : []

  const width = collapsed ? 56 : 220

  return (
    <aside
      className="flex flex-col h-full transition-[width] duration-150"
      style={{ width, minWidth: width, background: S.bg, borderRight: `1px solid ${S.border}` }}
    >
      {/* Logo */}
      <div className={`${collapsed ? 'px-2' : 'px-3'} py-5 flex items-center justify-center`} style={{ borderBottom: `1px solid ${S.border}` }}>
        <button onClick={() => navigate('/')} className="block w-full" title="Client Roster">
          <img src={logo} alt="ORDOBOOK" className={`${collapsed ? 'h-6' : 'h-12'} w-auto object-contain mx-auto`} />
        </button>
      </div>

      {/* Client context */}
      {activeClient && !collapsed && (
        <div className="px-4 py-3" style={{ borderBottom: `1px solid ${S.border}`, background: 'rgba(200,169,110,0.04)' }}>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-[11px] mb-2.5 w-full rounded-md px-2 py-1.5 transition-colors"
            style={{
              color: S.textSecondary,
              border: `1px solid ${S.border}`,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = S.textPrimary; e.currentTarget.style.borderColor = S.textMuted }}
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
      {activeClient && collapsed && (
        <div className="py-3 flex justify-center" style={{ borderBottom: `1px solid ${S.border}` }}
             title={activeClient.name}>
          <button
            onClick={() => navigate('/')}
            className="w-8 h-8 rounded-full font-display font-semibold text-[12px] flex items-center justify-center"
            style={{ background: 'rgba(200,169,110,0.15)', color: '#a07a3a' }}
            title={`${activeClient.name} — click for all clients`}
          >
            {activeClient.name.trim().charAt(0).toUpperCase()}
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className={`flex-1 overflow-y-auto ${collapsed ? 'p-2' : 'p-3'}`}>
        {!activeClient ? (
          <>
            {!collapsed && (
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5" style={{ color: S.textMuted }}>
                Navigation
              </p>
            )}
            <NavLink
              to="/"
              title="Client Roster"
              className={`flex items-center gap-2 ${collapsed ? 'justify-center px-0' : 'px-2'} py-1.5 rounded-md text-[13px] transition-colors`}
              style={({ isActive }) => ({
                background: isActive ? 'rgba(200,169,110,0.1)' : 'transparent',
                color: isActive ? '#c8a96e' : S.textSecondary,
              })}
            >
              <span>⊞</span> {!collapsed && 'Client Roster'}
            </NavLink>
          </>
        ) : (
          <>
            {!collapsed && (
              <p className="font-mono text-[9px] uppercase tracking-[0.15em] px-2 mb-1.5" style={{ color: S.textMuted }}>
                Client
              </p>
            )}

            {clientNav.map(({ to, icon, label, active }) => (
              <NavLink
                key={label}
                to={to}
                end={false}
                title={label}
                className={`flex items-center gap-2 ${collapsed ? 'justify-center px-0' : 'px-2'} py-1.5 rounded-md text-[12px] transition-colors`}
                style={() => ({
                  background: active ? 'rgba(200,169,110,0.1)' : 'transparent',
                  color: active ? '#c8a96e' : S.textSecondary,
                })}
              >
                <span className={collapsed ? 'text-[15px]' : ''}>{icon}</span> {!collapsed && label}
              </NavLink>
            ))}

            {years.length > 0 && !collapsed && (
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

      {/* Footer: version + collapse toggle */}
      <div className={`${collapsed ? 'px-2 justify-center' : 'px-4 justify-between'} py-3 flex items-center`} style={{ borderTop: `1px solid ${S.border}` }}>
        {!collapsed && (
          <span className="font-mono text-[9px] tracking-[0.1em]" style={{ color: S.textMuted }}>
            ORDOBOOK v0.1
          </span>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-6 h-6 rounded text-[11px] flex items-center justify-center transition-colors"
          style={{ color: S.textMuted, border: `1px solid ${S.border}` }}
          onMouseEnter={e => { e.currentTarget.style.color = S.textPrimary }}
          onMouseLeave={e => { e.currentTarget.style.color = S.textMuted }}
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>
    </aside>
  )
}
