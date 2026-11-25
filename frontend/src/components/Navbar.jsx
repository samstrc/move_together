import { Link } from 'react-router-dom'
import { Mark } from './Icons.jsx'

// Top bar for the public pages (home, log in, sign up).
function Navbar() {
  return (
    <header className="navbar glass glass-strong">
      <Link to="/" className="brand">
        <Mark size={32} />
        <span className="brand-text">Move Together</span>
      </Link>

      <nav className="nav-actions">
        <Link to="/login" className="btn btn-ghost">Log in</Link>
        <Link to="/signup" className="btn btn-primary">Sign up</Link>
      </nav>
    </header>
  )
}

export default Navbar
