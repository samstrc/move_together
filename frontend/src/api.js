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
  // Some responses have no body (e.g. 204 after a delete), and a server crash
  // sends plain text instead of JSON, so only parse JSON when there is some.
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // Not JSON: leave data as null
  }

  if (!response.ok) {
    // FastAPI sends errors as { detail: "message" } for errors we raise,
    // or { detail: [ {msg: ...}, ... ] } when the input fails validation.
    const detail = data?.detail
    const message = Array.isArray(detail)
      ? detail.map((d) => d.msg).join(', ')
      : detail
    const error = new Error(message || 'Something went wrong')
    error.status = response.status // e.g. 401 = not logged in / token expired
    throw error
  }
  return data
}