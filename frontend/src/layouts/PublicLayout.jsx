import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar.jsx'

// Wraps the public pages. <Outlet /> is where the current page gets drawn.
function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <footer className="footer">
        The Relational Rebels: Sam, Caius, Qiaozhi
      </footer>
    </>
  )
}

export default PublicLayout
