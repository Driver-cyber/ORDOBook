import { useParams, useMatch, useNavigate } from 'react-router-dom'

/**
 * The one shell (Phase 7.1). Reports used to be a second tabbed space beside the
 * Workspace; it is now folded in, because the Workspace/Reports split was always
 * "analyst density vs. client-ready" — a MODE, not a PLACE.
 *
 * Tabs run in the order the advisor's month runs:
 *
 *     Actuals · Forecast · Targets · Action Items  │  Presentation
 *
 * The rule stays visible as a divider: everything left of it is work, the one
 * thing right of it is what the client sees.
 *
 * Actuals and Forecast each have two lenses on the same data, so they carry a
 * working/clean toggle rather than a tab of their own — that is the same
 * mode-not-place idea, expressed where it belongs.
 */
export default function WorkspaceShell({ children }) {
  const { id, year } = useParams()
  const navigate = useNavigate()
  const activeYear = year ? Number(year) : new Date().getFullYear()

  const isActuals       = useMatch('/clients/:id/workspace')
  const isActualsClean  = useMatch('/clients/:id/workspace/actuals/clean')
  const isForecast      = useMatch('/clients/:id/workspace/forecast/:year')
  const isForecastClean = useMatch('/clients/:id/workspace/forecast/:year/clean')
  const isTargets       = useMatch('/clients/:id/workspace/targets/:year')
  const isActionItems   = useMatch('/clients/:id/workspace/action-items')
  const isPresentation  = useMatch('/clients/:id/workspace/presentation/:year')

  const tabs = [
    { label: 'Actuals',      to: `/clients/${id}/workspace`,                            active: !!(isActuals || isActualsClean) },
    { label: 'Forecast',     to: `/clients/${id}/workspace/forecast/${activeYear}`,      active: !!(isForecast || isForecastClean) },
    { label: 'Targets',      to: `/clients/${id}/workspace/targets/${activeYear}`,       active: !!isTargets },
    { label: 'Action Items', to: `/clients/${id}/workspace/action-items`,                active: !!isActionItems },
    { divider: true },
    { label: 'Presentation', to: `/clients/${id}/workspace/presentation/${activeYear}`,  active: !!isPresentation },
  ]

  // Only Actuals and Forecast have a second lens.
  const lens = (isActuals || isActualsClean)
    ? { working: `/clients/${id}/workspace`,
        clean:   `/clients/${id}/workspace/actuals/clean`,
        isClean: !!isActualsClean }
    : (isForecast || isForecastClean)
    ? { working: `/clients/${id}/workspace/forecast/${activeYear}`,
        clean:   `/clients/${id}/workspace/forecast/${activeYear}/clean`,
        isClean: !!isForecastClean }
    : null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-end justify-between border-b border-border bg-bg px-6 gap-4">
        <div className="flex items-end gap-1">
          {tabs.map((tab, i) => tab.divider ? (
            <span key={`d${i}`} aria-hidden="true"
                  className="self-center mx-2 h-4 w-px bg-border" />
          ) : (
            <button
              key={tab.label}
              onClick={() => navigate(tab.to)}
              aria-current={tab.active ? 'page' : undefined}
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

        {lens && (
          <div className="flex items-center gap-0 mb-1.5 rounded border border-border overflow-hidden">
            {[
              { label: 'Working', to: lens.working, active: !lens.isClean,
                title: 'Analyst view — drivers, deltas and detail' },
              { label: 'Clean',   to: lens.clean,   active: lens.isClean,
                title: 'Client-ready view — the statements, stripped down' },
            ].map(v => (
              <button
                key={v.label}
                onClick={() => navigate(v.to)}
                title={v.title}
                aria-pressed={v.active}
                className="px-2.5 py-1 text-[11px] font-medium transition-colors"
                style={{
                  background: v.active ? '#c8a96e' : 'transparent',
                  color: v.active ? '#1a1918' : '#5a5751',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {children}
    </div>
  )
}
