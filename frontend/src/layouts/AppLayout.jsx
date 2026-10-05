import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import { api, clearToken, getToken } from '../api.js'
import { useApi } from '../hooks/useApi.js'

// Remembers which group you were looking at between visits.
function loadSavedMoveId() {
  try {
    return Number(localStorage.getItem('moveId')) || null
  } catch {
    return null
  }
}

// Wraps the logged-in pages: sidebar on the left, current page on the right.
// Sends you to /login if you aren't logged in or your session has expired.
//
// It also loads your groups ("moves") and keeps track of which one is
// selected. Pages get all of this with:
//   const { user, move, moves, selectMove, reloadMoves } = useOutletContext()
// `move` is the selected group, or null if you aren't in any group yet.
function AppLayout() {
  const navigate = useNavigate()
  const loggedIn = Boolean(getToken())
  const [user, setUser] = useState(null)
  const [selectedMoveId, setSelectedMoveId] = useState(loadSavedMoveId)
  const { data: moves, error: movesError, reload: reloadMoves } = useApi(loggedIn ? '/moves' : null)

  // Ask the backend who the saved token belongs to. A 401 means the token
  // expired or is invalid, so log out. Other errors (e.g. the backend is
  // down) don't log you out.
  useEffect(() => {
    if (!loggedIn) return
    api('/auth/me')
      .then(setUser)
      .catch((err) => {
        if (err.status === 401) {
          clearToken()
          navigate('/login', { replace: true })
        }
      })
  }, [loggedIn, navigate])

  // No token at all: go straight to the login page.
  if (!loggedIn) {
    return <Navigate to="/login" replace />
  }

  // The saved group if you're still in it, otherwise your first group.
  const move = moves?.find((m) => m.move_id === selectedMoveId) ?? moves?.[0] ?? null

  function selectMove(moveId) {
    setSelectedMoveId(moveId)
    try {
      localStorage.setItem('moveId', String(moveId))
    } catch {
      // Not being able to remember the choice is fine.
    }
  }

  function logOut() {
    clearToken()
    navigate('/login')
  }

  let content
  if (movesError) {
    content = <p className="form-error">Couldn't load your groups: {movesError}</p>
  } else if (!moves) {
    content = <p className="muted">Loading…</p>
  } else {
    content = <Outlet context={{ user, setUser, moves, move, selectMove, reloadMoves, logOut }} />
  }

  return (
    <div className="app-shell">
      <Sidebar user={user} moves={moves ?? []} move={move} onSelectMove={selectMove} onLogOut={logOut} />
      <main className="app-content">{content}</main>
    </div>
  )
}

export default AppLayout
