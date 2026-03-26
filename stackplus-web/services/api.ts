import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('stackplus-auth')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        const token = parsed?.state?.token
        if (token) config.headers.Authorization = `Bearer ${token}`
      } catch {}
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('stackplus-auth')
      window.location.href = '/'
    }
    return Promise.reject(error.response?.data?.error || 'Erro desconhecido')
  }
)

export default api
