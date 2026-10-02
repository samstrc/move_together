import { Link } from 'react-router-dom'

// Top bar for the public pages (home, log in, sign up).
function Navbar() {
  return (
    <header className="navbar">
      <Link to="/" className="brand">
        Move Together
      </Link>

      <nav className="nav-actions">
        <Link to="/login" className="btn btn-ghost">Log in</Link>
        <Link to="/signup" className="btn btn-primary">Sign up</Link>
      </nav>
    </header>
  )
}

export default Navbar
