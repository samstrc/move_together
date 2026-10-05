import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { api, clearToken, getToken } from '../api.js'

// Wraps the logged-in pages: sidebar on the left, current page on the right.
// Sends you to /login if you aren't logged in or your session has expired.
function AppLayout() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  // Ask the backend who the saved token belongs to. A 401 means the token
  // expired or is invalid, so log out. Other errors (e.g. the backend is
  // down) don't log you out.
  useEffect(() => {
    if (!getToken()) return
    api('/auth/me')
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) {
          clearToken()
          navigate('/login', { replace: true })
        }
      })
  }, [navigate])

  // No token at all: go straight to the login page.
  if (!getToken()) {
    return <Navigate to="/login" replace />
  }

  function logOut() {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} onLogOut={logOut} />
      <main className="app-content">
        {/* Pages can read the user with useOutletContext() */}
        <Outlet context={{ user }} />
      </main>
    </div>
  )
}

export default AppLayout
