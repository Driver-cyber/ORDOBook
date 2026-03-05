import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const getClients = () => api.get('/clients').then(r => r.data)
export const getClient = (id) => api.get(`/clients/${id}`).then(r => r.data)
export const createClient = (data) => api.post('/clients', data).then(r => r.data)
export const updateClient = (id, data) => api.put(`/clients/${id}`, data).then(r => r.data)
export const deleteClient = (id) => api.delete(`/clients/${id}`)
