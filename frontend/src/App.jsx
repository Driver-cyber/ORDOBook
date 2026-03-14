import { useState, useEffect } from 'react'
import { Routes, Route, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ClientRoster from './pages/ClientRoster'
import ClientProfile from './pages/ClientProfile'
import ClientWorkspace from './pages/ClientWorkspace'
import UploadPage from './pages/UploadPage'
import MappingReview from './pages/MappingReview'
import ActualsDetail from './pages/ActualsDetail'
import ForecastDrivers from './pages/ForecastDrivers'
import ForecastReport from './pages/ForecastReport'
import { getClients } from './api/clients'

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

  // Load clients on mount so the Sidebar always has data regardless of which
  // page is loaded first (direct URL, refresh, error recovery, etc.)
  useEffect(() => {
    getClients().then(setClients).catch(() => {})
  }, [])

  const handleClientsLoaded = (data) => setClients(data)
  const handleClientUpdated = (updated) => setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  const handleClientDeleted = (id) => setClients(prev => prev.filter(c => c.id !== id))

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Sidebar clients={clients} activeClientId={null} />
              <ClientRoster onClientsLoaded={handleClientsLoaded} />
            </>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <ClientWorkspace />}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/profile"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {({ onClientUpdated, onClientDeleted }) => (
                <ClientProfile onClientUpdated={onClientUpdated} onClientDeleted={onClientDeleted} />
              )}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/upload"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <UploadPage />}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/mapping-review"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <MappingReview />}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/actuals/:year/:month"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <ActualsDetail />}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/forecast/:year"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <ForecastDrivers />}
            </ClientLayout>
          }
        />
        <Route
          path="/clients/:id/forecast/:year/report"
          element={
            <ClientLayout clients={clients} onClientUpdated={handleClientUpdated} onClientDeleted={handleClientDeleted}>
              {() => <ForecastReport />}
            </ClientLayout>
          }
        />
      </Routes>
    </div>
  )
}
