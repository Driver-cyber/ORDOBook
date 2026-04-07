import { useParams, useMatch, useNavigate } from 'react-router-dom'

export default function WorkspaceShell({ children }) {
  const { id, year } = useParams()
  const navigate = useNavigate()
  const activeYear = year ? Number(year) : new Date().getFullYear()

  const isActuals  = useMatch('/clients/:id/workspace')
  const isForecast = useMatch('/clients/:id/workspace/forecast/:year')
  const isTargets  = useMatch('/clients/:id/workspace/targets/:year')

  const tabs = [
    { label: 'Actuals',  to: `/clients/${id}/workspace`,                        active: !!isActuals  },
    { label: 'Forecast', to: `/clients/${id}/workspace/forecast/${activeYear}`,  active: !!isForecast },
    { label: 'Targets',  to: `/clients/${id}/workspace/targets/${activeYear}`,   active: !!isTargets  },
  ]

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-end border-b border-border bg-bg px-6 gap-1">
        {tabs.map(tab => (
          <button
            key={tab.label}
            onClick={() => navigate(tab.to)}
            className="px-3 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors"
            style={{
              borderBottomColor: tab.active ? '#c8a96e' : 'transparent',
              color: tab.active ? '#c8a96e' : '#5a5751',
            }}
            onMouseEnter={e => { if (!tab.active) e.currentTarget.style.color = '#1a1918' }}
            onMouseLeave={e => { if (!tab.active) e.currentTarget.style.color = '#5a5751' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      {children}
    </div>
  )
}
