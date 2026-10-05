import { Link, NavLink } from 'react-router-dom'

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
// moves / move: all of your groups, and the one being viewed (or null).
// onSelectMove: called with a move_id when you switch groups.
// onLogOut: called when the Log out button is clicked.
function Sidebar({ user, moves, move, onSelectMove, onLogOut }) {
  return (
    <aside className="sidebar">
      <Link to="/dashboard" className="brand">
        Move Together
      </Link>

      {moves.length > 1 ? (
        <select
          className="sidebar-group-select"
          value={move?.move_id ?? ''}
          onChange={(e) => onSelectMove(Number(e.target.value))}
          aria-label="Switch group"
        >
          {moves.map((m) => (
            <option key={m.move_id} value={m.move_id}>
              {m.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="sidebar-group">{move ? move.name : 'No group yet'}</p>
      )}

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
