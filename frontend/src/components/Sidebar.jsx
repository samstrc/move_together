import { Link, NavLink } from 'react-router-dom'
import { Icon, Mark } from './Icons.jsx'
import { initials, navLinks } from '../utils/nav.js'

// Left-hand menu for the pages you see after logging in. On wide screens it's
// a floating glass panel; on tablets (600-1023px) it shrinks to an icon rail.
// Phones use MobileNav instead (see AppLayout).
//
// user: the logged-in user ({ name, email, ... }), or null while loading.
// move: the group being viewed (or null).
// openMenu / onOpenMenu: which button opened the group + account menu, if
// any, and how to open it (see AccountMenu).
// onLogOut: called when the Log out button is clicked.
function Sidebar({ user, move, openMenu: openId, onOpenMenu, onLogOut }) {
  return (
    <aside className="sidebar glass" aria-label="Sidebar">
      <Link to="/dashboard" className="brand" aria-label="Move Together, go to dashboard">
        <Mark size={34} />
        <span className="brand-text">Move Together</span>
      </Link>

      <button
        type="button"
        className="group-btn"
        data-menu="sidebar-group"
        aria-haspopup="dialog"
        aria-expanded={openId === 'sidebar-group'}
        onClick={(e) => onOpenMenu(e.currentTarget)}
      >
        <span className="group-btn-text">
          {move ? move.name : 'No group yet'}
          <small>{move ? 'Switch group' : 'Create or join one'}</small>
        </span>
        <Icon name="chevronDown" size={16} />
      </button>

      {/* Tablet rail: the group button as an icon */}
      <button
        type="button"
        className="rail-btn rail-group"
        data-menu="rail-group"
        aria-haspopup="dialog"
        aria-expanded={openId === 'rail-group'}
        aria-label={move ? `Switch group (${move.name})` : 'Choose a group'}
        onClick={(e) => onOpenMenu(e.currentTarget)}
      >
        <Icon name="home" size={20} />
        <span>{move ? move.name : 'Group'}</span>
      </button>

      <nav className="sidebar-links" aria-label="Main">
        {navLinks.map((link) => (
          <NavLink key={link.to} to={link.to} className="sidebar-link">
            <Icon name={link.icon} size={19} />
            <span>{link.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <span className="avatar" aria-hidden="true">{initials(user?.name)}</span>
        <p className="sidebar-user">
          {user?.name ?? ''}
          <small>{user?.email ?? ''}</small>
        </p>
        <button type="button" className="btn btn-ghost btn-small" onClick={onLogOut}>
          Log out
        </button>
        <button
          type="button"
          className="rail-btn rail-account"
          data-menu="rail-account"
          aria-haspopup="dialog"
          aria-expanded={openId === 'rail-account'}
          aria-label={user ? `Account: ${user.name}` : 'Account'}
          onClick={(e) => onOpenMenu(e.currentTarget)}
        >
          <span className="avatar">{initials(user?.name)}</span>
          <span>Account</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
