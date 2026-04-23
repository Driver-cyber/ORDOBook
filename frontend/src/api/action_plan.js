export async function getActionPlan(clientId, year) {
  const res = await fetch(`/api/clients/${clientId}/action-plan/${year}`)
  if (!res.ok) throw new Error('Failed to load action plan')
  return res.json()
}

export async function createActionPlanItem(clientId, year, data) {
  const res = await fetch(`/api/clients/${clientId}/action-plan/${year}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to create item')
  return res.json()
}

export async function updateActionPlanItem(clientId, year, itemId, data) {
  const res = await fetch(`/api/clients/${clientId}/action-plan/${year}/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) throw new Error('Failed to update item')
  return res.json()
}

export async function deleteActionPlanItem(clientId, year, itemId) {
  const res = await fetch(`/api/clients/${clientId}/action-plan/${year}/${itemId}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Failed to delete item')
  return res.json()
}
