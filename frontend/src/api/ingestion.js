import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const uploadFiles = (clientId, files) => {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  return api.post(`/clients/${clientId}/upload`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data)
}

export const confirmImport = (clientId, payload) =>
  api.post(`/clients/${clientId}/actuals/confirm`, payload).then(r => r.data)

export const getActuals = (clientId) =>
  api.get(`/clients/${clientId}/actuals`).then(r => r.data)

export const getActualsDetail = (clientId, year, month) =>
  api.get(`/clients/${clientId}/actuals/${year}/${month}`).then(r => r.data)

export const updateActuals = (clientId, year, month, data) =>
  api.put(`/clients/${clientId}/actuals/${year}/${month}`, data).then(r => r.data)

export const getMappingReviewData = (clientId) =>
  api.get(`/clients/${clientId}/actuals/mapping-review-data`).then(r => r.data)

// Recompute every stored month's category totals from its own raw rows and the
// client's current mapping. Totals are a snapshot taken at import time, so this
// is how a mapping correction reaches months that are already imported.
export const reapplyMapping = (clientId) =>
  api.post(`/clients/${clientId}/actuals/reapply-mapping`).then(r => r.data)

// The accounts behind the Overhead line for a fiscal year, with each account's
// month history so a screen can show this month, last month and a YTD average.
export const getOverheadSchedule = (clientId, year) =>
  api.get(`/clients/${clientId}/actuals/${year}/overhead`).then(r => r.data)

// Every account ever imported for this client and where it maps — the reference
// sheet behind Review Mapping. Read-only; mappings are changed on Review Mapping.
export const getChartOfAccounts = (clientId) =>
  api.get(`/clients/${clientId}/chart-of-accounts`).then(r => r.data)
