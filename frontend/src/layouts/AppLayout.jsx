import { Outlet } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'

// Wraps the logged-in pages: sidebar on the left, current page on the right.
// TODO: Redirect to /login here if the user isn't logged in.
function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  )
}

export default AppLayout
