import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import WorkspaceShell from './components/WorkspaceShell'
import ReportsShell from './components/ReportsShell'
import ClientRoster from './pages/ClientRoster'
import ClientProfile from './pages/ClientProfile'
import ClientWorkspace from './pages/ClientWorkspace'
import UploadPage from './pages/UploadPage'
import MappingReview from './pages/MappingReview'
import ActualsDetail from './pages/ActualsDetail'
import ActualsHistory from './pages/ActualsHistory'
import ForecastDrivers from './pages/ForecastDrivers'
import ForecastReport from './pages/ForecastReport'
import Targets from './pages/Targets'
import Scoreboard from './pages/Scoreboard'
import ScenarioSandbox from './pages/ScenarioSandbox'
import { getClients } from './api/clients'

// Redirect helpers — need useParams so they must be components
function ToWorkspace() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/workspace`} replace />
}
function ToReports() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/reports/scoreboard/${new Date().getFullYear()}`} replace />
}
function OldForecastDrivers() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/forecast/${year}`} replace />
}
function OldForecastReport() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/reports/forecast/${year}`} replace />
}
function OldScoreboard() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/reports/scoreboard/${year}`} replace />
}
function OldTargets() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/targets/${year}`} replace />
}

// Placeholder for reports not yet built
function ComingSoon({ title, phase }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-text-muted text-3xl mb-3">◎</div>
        <p className="font-display font-semibold text-text-primary mb-1">{title}</p>
        <p className="text-text-muted text-[12px]">Coming in {phase}</p>
      </div>
    </div>
  )
}

function ClientLayout({ clients, onClientUpdated, onClientDeleted, children }) {
  const { id } = useParams()
  return (
    <>
      <Sidebar clients={clients} activeClientId={Number(id)} />
      {children({ onClientUpdated, onClientDeleted })}
    </>
  )
}

export default function App() {
  const [clients, setClients] = useState([])

  useEffect(() => {
    getClients().then(setClients).catch(() => {})
  }, [])

  const handleClientUpdated = (updated) => setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  const handleClientDeleted = (id) => setClients(prev => prev.filter(c => c.id !== id))

  // Shorthand to reduce repetition in route definitions
  const CL = ({ children }) => (
    <ClientLayout
      clients={clients}
      onClientUpdated={handleClientUpdated}
      onClientDeleted={handleClientDeleted}
    >
      {children}
    </ClientLayout>
  )

  return (
    <div className="flex h-screen bg-bg">
      <Routes>
        {/* Home */}
        <Route
          path="/"
          element={
            <>
              <Sidebar clients={clients} activeClientId={null} />
              <ClientRoster />
            </>
          }
        />

        {/* /clients/:id → workspace */}
        <Route path="/clients/:id" element={<CL>{() => <ToWorkspace />}</CL>} />

        {/* ── Workspace ── */}
        <Route
          path="/clients/:id/workspace"
          element={<CL>{() => <WorkspaceShell><ClientWorkspace /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/forecast/:year"
          element={<CL>{() => <WorkspaceShell><ForecastDrivers /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/targets/:year"
          element={<CL>{() => <WorkspaceShell><Targets /></WorkspaceShell>}</CL>}
        />

        {/* ── Reports ── */}
        <Route path="/clients/:id/reports" element={<CL>{() => <ToReports />}</CL>} />
        <Route
          path="/clients/:id/reports/actuals"
          element={<CL>{() => <ReportsShell><ComingSoon title="Actuals Report" phase="Phase 5" /></ReportsShell>}</CL>}
        />
        <Route
          path="/clients/:id/reports/forecast/:year"
          element={<CL>{() => <ReportsShell><ForecastReport /></ReportsShell>}</CL>}
        />
        <Route
          path="/clients/:id/reports/scoreboard/:year"
          element={<CL>{() => <ReportsShell><Scoreboard /></ReportsShell>}</CL>}
        />
        <Route
          path="/clients/:id/reports/action-plan"
          element={<CL>{() => <ReportsShell><ComingSoon title="Action Plan" phase="Phase 5" /></ReportsShell>}</CL>}
        />

        {/* ── Scenario Sandbox (no shell — full screen) ── */}
        <Route path="/clients/:id/scenarios" element={<CL>{() => <ScenarioSandbox />}</CL>} />

        {/* ── Support screens (no shell) ── */}
        <Route
          path="/clients/:id/profile"
          element={
            <CL>
              {({ onClientUpdated, onClientDeleted }) => (
                <ClientProfile onClientUpdated={onClientUpdated} onClientDeleted={onClientDeleted} />
              )}
            </CL>
          }
        />
        <Route path="/clients/:id/upload"           element={<CL>{() => <UploadPage />}</CL>} />
        <Route path="/clients/:id/mapping-review"   element={<CL>{() => <MappingReview />}</CL>} />
        <Route path="/clients/:id/actuals/history"  element={<CL>{() => <ActualsHistory />}</CL>} />
        <Route path="/clients/:id/actuals/:year/:month" element={<CL>{() => <ActualsDetail />}</CL>} />

        {/* ── Old route redirects (bookmarks / cached links) ── */}
        <Route path="/clients/:id/forecast/:year"         element={<CL>{() => <OldForecastDrivers />}</CL>} />
        <Route path="/clients/:id/forecast/:year/report"  element={<CL>{() => <OldForecastReport />}</CL>} />
        <Route path="/clients/:id/scoreboard/:year"       element={<CL>{() => <OldScoreboard />}</CL>} />
        <Route path="/clients/:id/targets/:year"          element={<CL>{() => <OldTargets />}</CL>} />
      </Routes>
    </div>
  )
}
