import { useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import WorkspaceShell from './components/WorkspaceShell'
import ErrorBoundary from './components/ErrorBoundary'
import ClientRoster from './pages/ClientRoster'
import ClientProfile from './pages/ClientProfile'
import ClientWorkspace from './pages/ClientWorkspace'
import UploadPage from './pages/UploadPage'
import MappingReview from './pages/MappingReview'
import ActualsDetail from './pages/ActualsDetail'
import ForecastDrivers from './pages/ForecastDrivers'
import ForecastReport from './pages/ForecastReport'
import ForecastMonth from './pages/ForecastMonth'
import OverheadSchedule from './pages/OverheadSchedule'
import ForecastOverheadSchedule from './pages/ForecastOverheadSchedule'
import Targets from './pages/Targets'
import Presentation from './pages/Presentation'
import ScenarioSandbox from './pages/ScenarioSandbox'
import ActionPlan from './pages/ActionPlan'
import ReportsActuals from './pages/ReportsActuals'
import { getClients } from './api/clients'

// Redirect helpers — need useParams so they must be components
function ToWorkspace() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/workspace`} replace />
}
// Reports retired into the Workspace (Phase 7.1). Everything under /reports/*
// now redirects to its Workspace home so old links and bookmarks still land.
function ToPresentation() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/workspace/presentation/${new Date().getFullYear()}`} replace />
}
function ToActualsClean() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/workspace/actuals/clean`} replace />
}
function ToForecastClean() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/forecast/${year}/clean`} replace />
}
function ToActionItems() {
  const { id } = useParams()
  return <Navigate to={`/clients/${id}/workspace/action-items`} replace />
}
function OldForecastDrivers() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/forecast/${year}`} replace />
}
function OldForecastReport() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/forecast/${year}/clean`} replace />
}
function OldScoreboard() {
  const { id, year } = useParams()
  return <Navigate to={`/clients/${id}/workspace/presentation/${year}`} replace />
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
      <ErrorBoundary>{children({ onClientUpdated, onClientDeleted })}</ErrorBoundary>
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
              <ErrorBoundary><ClientRoster /></ErrorBoundary>
            </>
          }
        />

        {/* /clients/:id → workspace */}
        <Route path="/clients/:id" element={<CL>{() => <ToWorkspace />}</CL>} />

        {/* ── Workspace — the one space (Phase 7.1) ── */}
        <Route
          path="/clients/:id/workspace"
          element={<CL>{() => <WorkspaceShell><ClientWorkspace /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/actuals/clean"
          element={<CL>{() => <WorkspaceShell><ReportsActuals /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/forecast/:year"
          element={<CL>{() => <WorkspaceShell><ForecastDrivers /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/forecast/:year/clean"
          element={<CL>{() => <WorkspaceShell><ForecastReport /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/targets/:year"
          element={<CL>{() => <WorkspaceShell><Targets /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/action-items"
          element={<CL>{() => <WorkspaceShell><ActionPlan /></WorkspaceShell>}</CL>}
        />
        <Route
          path="/clients/:id/workspace/presentation/:year"
          element={<CL>{() => <WorkspaceShell><Presentation /></WorkspaceShell>}</CL>}
        />

        {/* ── Reports retired into the Workspace — redirects keep old links alive ── */}
        <Route path="/clients/:id/reports"                    element={<CL>{() => <ToPresentation />}</CL>} />
        <Route path="/clients/:id/reports/actuals"            element={<CL>{() => <ToActualsClean />}</CL>} />
        <Route path="/clients/:id/reports/forecast/:year"     element={<CL>{() => <ToForecastClean />}</CL>} />
        <Route path="/clients/:id/reports/scoreboard/:year"   element={<CL>{() => <OldScoreboard />}</CL>} />
        <Route path="/clients/:id/reports/report-card/:year"  element={<CL>{() => <OldScoreboard />}</CL>} />
        <Route path="/clients/:id/reports/action-plan"        element={<CL>{() => <ToActionItems />}</CL>} />

        {/* ── Scenarios — its own full-screen space, no shell ── */}
        <Route path="/clients/:id/scenarios" element={<CL>{() => <ScenarioSandbox />}</CL>} />

        {/* ── Client-level screens ── */}
        <Route
          path="/clients/:id/profile"
          element={
            <>
              <Sidebar clients={clients} activeClientId={null} />
              <ErrorBoundary><ClientProfile /></ErrorBoundary>
            </>
          }
        />
        <Route path="/clients/:id/upload"           element={<CL>{() => <UploadPage />}</CL>} />
        <Route path="/clients/:id/mapping-review"   element={<CL>{() => <MappingReview />}</CL>} />

        {/* ── Drill-downs. Reached by clicking a month header or an Overhead
               figure, so they are not tabs and carry no shell. ── */}
        <Route path="/clients/:id/actuals/history"  element={<CL>{() => <ToWorkspace />}</CL>} />
        <Route path="/clients/:id/actuals/:year/overhead/:month" element={<CL>{() => <OverheadSchedule />}</CL>} />
        <Route path="/clients/:id/actuals/:year/:month" element={<CL>{() => <ActualsDetail />}</CL>} />
        <Route path="/clients/:id/workspace/forecast/:year/overhead/:month" element={<CL>{() => <ForecastOverheadSchedule />}</CL>} />
        <Route path="/clients/:id/forecast/:year/month/:month" element={<CL>{() => <ForecastMonth />}</CL>} />

        {/* ── Old route redirects (bookmarks / cached links) ── */}
        <Route path="/clients/:id/forecast/:year"         element={<CL>{() => <OldForecastDrivers />}</CL>} />
        <Route path="/clients/:id/forecast/:year/report"  element={<CL>{() => <OldForecastReport />}</CL>} />
        <Route path="/clients/:id/scoreboard/:year"       element={<CL>{() => <OldScoreboard />}</CL>} />
        <Route path="/clients/:id/targets/:year"          element={<CL>{() => <OldTargets />}</CL>} />
      </Routes>
    </div>
  )
}
