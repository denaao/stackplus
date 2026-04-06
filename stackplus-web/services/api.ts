import axios from 'axios'

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const path = window.location.pathname || ''
      const authStored = localStorage.getItem('stackplus-auth')
      const sangeurStored = localStorage.getItem('stackplus-sangeur-auth')
      const authToken = authStored ? JSON.parse(authStored)?.state?.token : null
      const sangeurToken = sangeurStored ? JSON.parse(sangeurStored)?.state?.token : null

      const token = path.startsWith('/sangeur')
        ? (sangeurToken || authToken)
        : (authToken || sangeurToken)

      if (token) config.headers.Authorization = `Bearer ${token}`
    } catch {}
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname || ''
      if (path.startsWith('/sangeur')) {
        localStorage.removeItem('stackplus-sangeur-auth')
        window.location.href = '/sangeur/login'
      } else {
        localStorage.removeItem('stackplus-auth')
        window.location.href = '/'
      }
    }

    const data = error.response?.data
    const details = Array.isArray(data?.details)
      ? data.details
          .map((item: any) => {
            if (!item) return null
            if (typeof item === 'string') return item
            const path = typeof item.path === 'string' ? item.path : null
            const message = typeof item.message === 'string' ? item.message : null
            if (path && message) return `${path}: ${message}`
            return message
          })
          .filter(Boolean)
      : []

    const baseMessage =
      data?.error ||
      data?.message ||
      (typeof data === 'string' ? data : null) ||
      error.message ||
      'Erro desconhecido'

    const message =
      details.length > 0
        ? `${baseMessage} | ${details.join(' | ')}`
        : baseMessage

    return Promise.reject(message)
  }
)

export default api
