import { useState } from 'react'
import { Routes, Route, useParams } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import ClientRoster from './pages/ClientRoster'
import ClientProfile from './pages/ClientProfile'

function ClientProfileWrapper({ clients, onClientUpdated, onClientDeleted }) {
  const { id } = useParams()
  return (
    <>
      <Sidebar clients={clients} activeClientId={Number(id)} />
      <ClientProfile onClientUpdated={onClientUpdated} onClientDeleted={onClientDeleted} />
    </>
  )
}

export default function App() {
  const [clients, setClients] = useState([])

  const handleClientsLoaded = (data) => setClients(data)

  const handleClientUpdated = (updated) => {
    setClients(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const handleClientDeleted = (id) => {
    setClients(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Routes>
        <Route
          path="/"
          element={
            <>
              <Sidebar clients={clients} activeClientId={null} />
              <ClientRoster
                onClientsLoaded={handleClientsLoaded}
              />
            </>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <ClientProfileWrapper
              clients={clients}
              onClientUpdated={handleClientUpdated}
              onClientDeleted={handleClientDeleted}
            />
          }
        />
      </Routes>
    </div>
  )
}
