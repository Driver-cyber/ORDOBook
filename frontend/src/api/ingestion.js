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
