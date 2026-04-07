import { useParams, useMatch, useNavigate } from 'react-router-dom'

export default function ReportsShell({ children }) {
  const { id, year } = useParams()
  const navigate = useNavigate()
  const activeYear = year ? Number(year) : new Date().getFullYear()

  const isActuals    = useMatch('/clients/:id/reports/actuals')
  const isForecast   = useMatch('/clients/:id/reports/forecast/:year')
  const isScoreboard = useMatch('/clients/:id/reports/scoreboard/:year')
  const isActionPlan = useMatch('/clients/:id/reports/action-plan')

  const tabs = [
    { label: 'Actuals',     to: `/clients/${id}/reports/actuals`,                      active: !!isActuals    },
    { label: 'Forecast',    to: `/clients/${id}/reports/forecast/${activeYear}`,        active: !!isForecast   },
    { label: 'Scoreboard',  to: `/clients/${id}/reports/scoreboard/${activeYear}`,      active: !!isScoreboard },
    { label: 'Action Plan', to: `/clients/${id}/reports/action-plan`,                   active: !!isActionPlan },
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
