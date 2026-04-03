const BASE = '/api/clients'

export async function getTargets(clientId, year) {
  const res = await fetch(`${BASE}/${clientId}/targets/${year}`)
  if (!res.ok) throw new Error('Failed to load targets')
  return res.json()
}

export async function saveTargets(clientId, year, targets) {
  const res = await fetch(`${BASE}/${clientId}/targets/${year}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ targets }),
  })
  if (!res.ok) throw new Error('Failed to save targets')
  return res.json()
}

export async function getScoreboard(clientId, year) {
  const res = await fetch(`${BASE}/${clientId}/scoreboard/${year}`)
  if (!res.ok) throw new Error('Failed to load scoreboard')
  return res.json()
}

export async function setGradeOverride(clientId, year, payload) {
  const res = await fetch(`${BASE}/${clientId}/scoreboard/${year}/grade`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error('Failed to save grade')
  return res.json()
}

export async function recalculateGrades(clientId, year) {
  const res = await fetch(`${BASE}/${clientId}/scoreboard/${year}/recalculate`, {
    method: 'POST',
  })
  if (!res.ok) throw new Error('Failed to recalculate grades')
  return res.json()
}
