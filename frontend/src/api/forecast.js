const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const base = (clientId, year) => `${BASE}/api/clients/${clientId}/forecast/${year}`

export async function getForecastView(clientId, year) {
  const res = await fetch(`${base(clientId, year)}`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getDrivers(clientId, year) {
  const res = await fetch(`${base(clientId, year)}/drivers`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function createDrivers(clientId, year, payload) {
  const res = await fetch(`${base(clientId, year)}/drivers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fiscal_year: year, ...payload }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateDrivers(clientId, year, payload) {
  const res = await fetch(`${base(clientId, year)}/drivers`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function calculateForecast(clientId, year) {
  const res = await fetch(`${base(clientId, year)}/calculate`, { method: 'POST' })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getMonthTrace(clientId, year, month) {
  const res = await fetch(`${base(clientId, year)}/${month}/trace`)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
