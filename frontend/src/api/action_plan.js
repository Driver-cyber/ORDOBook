// Action Plan API — objectives with nested action items (steps).

async function request(path, method = 'GET', data, failMsg) {
  const res = await fetch(`/api/clients${path}`, {
    method,
    headers: data !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: data !== undefined ? JSON.stringify(data) : undefined,
  })
  if (!res.ok) throw new Error(failMsg)
  return res.json()
}

// ── Objectives ────────────────────────────────────────────────────────────────
export const getActionPlan = (clientId, year) =>
  request(`/${clientId}/action-plan/${year}`, 'GET', undefined, 'Failed to load action plan')

export const createActionPlanItem = (clientId, year, data) =>
  request(`/${clientId}/action-plan/${year}`, 'POST', data, 'Failed to create objective')

export const updateActionPlanItem = (clientId, year, itemId, data) =>
  request(`/${clientId}/action-plan/${year}/${itemId}`, 'PATCH', data, 'Failed to update objective')

export const deleteActionPlanItem = (clientId, year, itemId) =>
  request(`/${clientId}/action-plan/${year}/${itemId}`, 'DELETE', undefined, 'Failed to delete objective')

export const reorderActionPlan = (clientId, year, itemIds) =>
  request(`/${clientId}/action-plan/${year}/order`, 'PUT', itemIds, 'Failed to reorder objectives')

// ── Steps (action items under an objective) ───────────────────────────────────
export const createStep = (clientId, year, itemId, data) =>
  request(`/${clientId}/action-plan/${year}/${itemId}/steps`, 'POST', data, 'Failed to add action item')

export const updateStep = (clientId, year, itemId, stepId, data) =>
  request(`/${clientId}/action-plan/${year}/${itemId}/steps/${stepId}`, 'PATCH', data, 'Failed to update action item')

export const deleteStep = (clientId, year, itemId, stepId) =>
  request(`/${clientId}/action-plan/${year}/${itemId}/steps/${stepId}`, 'DELETE', undefined, 'Failed to delete action item')

export const reorderSteps = (clientId, year, itemId, stepIds) =>
  request(`/${clientId}/action-plan/${year}/${itemId}/steps/order`, 'PUT', stepIds, 'Failed to reorder action items')
