import axios from 'axios'

const api = axios.create({ baseURL: '/api' })
const BASE = '/clients'

// Every stored presentation for this client, newest first. Versions are kept:
// presenting closes one, a later edit opens the next.
export const listPresentations = (clientId) =>
  api.get(`${BASE}/${clientId}/presentations`).then(r => r.data)

// Build or rebuild the draft for one period. Regenerating keeps prose the advisor
// has written and refreshes the figures underneath it.
export const generatePresentation = (clientId, payload) =>
  api.post(`${BASE}/${clientId}/presentations/generate`, payload).then(r => r.data)

export const getPresentation = (clientId, presentationId) =>
  api.get(`${BASE}/${clientId}/presentations/${presentationId}`).then(r => r.data)

// Edit one panel's words, move it, or drop it. Editing prose flips the panel to
// authored; clearing it back to empty hands control to the generator again.
export const editPanel = (clientId, presentationId, edit) =>
  api.patch(`${BASE}/${clientId}/presentations/${presentationId}/panel`, edit).then(r => r.data)

export const markPresented = (clientId, presentationId) =>
  api.post(`${BASE}/${clientId}/presentations/${presentationId}/present`).then(r => r.data)
