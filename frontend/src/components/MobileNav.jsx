import { Link, NavLink, useLocation } from 'react-router-dom'
import { Icon, Mark } from './Icons.jsx'
import { navLinks } from '../utils/nav.js'

// Phone navigation (under 600px wide): a glass header with the group switcher,
// and a glass tab bar at the bottom. Group and Profile live in the "More" menu.
function MobileNav({ move, openMenu: openId, onOpenMenu }) {
  const { pathname } = useLocation()
  const inMore = pathname.startsWith('/group') || pathname.startsWith('/profile')

  return (
    <>
      <header className="m-header glass glass-strong">
        <Link to="/dashboard" className="brand" aria-label="Move Together, go to dashboard">
          <Mark size={30} />
          <span className="brand-text">Move Together</span>
        </Link>
        <button
          type="button"
          className="group-btn"
          data-menu="header-group"
          aria-haspopup="dialog"
          aria-expanded={openId === 'header-group'}
          onClick={(e) => onOpenMenu(e.currentTarget)}
        >
          <span className="group-btn-text">{move ? move.name : 'No group yet'}</span>
          <Icon name="chevronDown" size={16} />
        </button>
      </header>

      <nav className="tabbar glass" aria-label="Main">
        {navLinks.slice(0, 4).map((link) => (
          <NavLink key={link.to} to={link.to} className="tab">
            <Icon name={link.icon} size={21} />
            {link.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={inMore ? 'tab active' : 'tab'}
          data-menu="tab-more"
          aria-haspopup="dialog"
          aria-expanded={openId === 'tab-more'}
          onClick={(e) => onOpenMenu(e.currentTarget)}
        >
          <Icon name="more" size={21} />
          More
        </button>
      </nav>
    </>
  )
}

export default MobileNav
