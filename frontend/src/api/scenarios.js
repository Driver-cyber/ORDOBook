const BASE = '/api/clients'

export async function calculateScenarios(clientId, fiscalYear, scenarios) {
  const res = await fetch(`${BASE}/${clientId}/scenario/calculate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fiscal_year: fiscalYear, scenarios }),
  })
  if (!res.ok) throw new Error('Failed to calculate scenarios')
  return res.json()
}
