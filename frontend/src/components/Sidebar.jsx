import { Link, NavLink } from 'react-router-dom'
import { group } from '../data/sampleData.js'

// Left-hand menu for the pages you see after logging in.
// NavLink adds the "active" class to the link for the page you're on.
const links = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/items', label: 'Shared list' },
  { to: '/budget', label: 'Budget' },
  { to: '/assistant', label: 'Dolly' },
  { to: '/group', label: 'Group' },
  { to: '/profile', label: 'Profile' },
]

// user: the logged-in user ({ name, email, ... }), or null while loading.
// onLogOut: called when the Log out button is clicked.
function Sidebar({ user, onLogOut }) {
  return (
    <aside className="sidebar">
      <Link to="/dashboard" className="brand">
        Move Together
      </Link>
      <p className="sidebar-group">{group.name}</p>

      <nav className="sidebar-links">
        {links.map((link) => (
          <NavLink key={link.to} to={link.to} className="sidebar-link">
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        {user && <p className="sidebar-user">{user.name}</p>}
        <button type="button" className="btn btn-ghost btn-small" onClick={onLogOut}>
          Log out
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
