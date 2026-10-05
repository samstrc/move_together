// Helper file to reuse on API requests
const API_URL = 'http://localhost:8000'

export function getToken() {
  return localStorage.getItem('token')
}

export function setToken(token) {
  localStorage.setItem('token', token)
}

export function clearToken() {
  localStorage.removeItem('token')
}

// Calls the backend and returns the JSON response.
// Throws an Error with a readable message if the request fails.
export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(API_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()

  if (!response.ok) {
    // FastAPI sends errors as { detail: "message" } for errors we raise,
    // or { detail: [ {msg: ...}, ... ] } when the input fails validation.
    const message = Array.isArray(data.detail)
      ? data.detail.map((d) => d.msg).join(', ')
      : data.detail
    const error = new Error(message || 'Something went wrong')
    error.status = response.status // e.g. 401 = not logged in / token expired
    throw error
  }
  return data
}