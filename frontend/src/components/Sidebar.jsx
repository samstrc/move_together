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

function Sidebar() {
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
    </aside>
  )
}

export default Sidebar
