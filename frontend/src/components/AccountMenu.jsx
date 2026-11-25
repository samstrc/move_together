import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from './Icons.jsx'

// The group + account menu. On phones it slides up from the bottom as a
// sheet (with Group and Profile, which aren't in the tab bar); on bigger
// screens it drops down from whatever button opened it.
//
// anchor: the button that opened it (null when closed).
// moves / move: your groups and the one being viewed.
function AccountMenu({ anchor, onClose, moves, move, onSelectMove, onLogOut }) {
  const open = Boolean(anchor)
  const menuRef = useRef(null)

  // Put the dropdown next to the button that opened it (phones: a sheet at
  // the bottom, positioned by CSS).
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!anchor) return
    const vars = ['--sx', '--sy', '--sheet-origin']
    if (window.innerWidth < 600) {
      vars.forEach((v) => menu.style.removeProperty(v))
      return
    }
    const r = anchor.getBoundingClientRect()
    const pad = 12
    const besideRail = window.innerWidth < 1024 || !anchor.classList.contains('group-btn')
    const x = besideRail ? r.right + pad : r.left
    let y = besideRail ? r.top : r.bottom + 8
    y = Math.max(pad, Math.min(y, window.innerHeight - menu.offsetHeight - pad))
    menu.style.setProperty('--sx', `${x}px`)
    menu.style.setProperty('--sy', `${y}px`)
    menu.style.setProperty('--sheet-origin', besideRail ? `left ${r.top + r.height / 2 - y}px` : 'top left')
  }, [anchor])

  // Escape closes it and puts focus back on the button; focus moves in on open.
  useEffect(() => {
    if (!open) return
    const first = [...menuRef.current.querySelectorAll('a, button')].find((el) => el.offsetParent !== null)
    first?.focus({ preventScroll: true })
    function onKey(e) {
      if (e.key === 'Escape') {
        onClose()
        anchor.focus({ preventScroll: true })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, anchor, onClose])

  function pick(moveId) {
    onSelectMove(moveId)
    onClose()
  }

  let i = 0 // stagger index for the items' entrance
  const next = () => ({ '--i': i++ })

  return (
    <>
      <div className={open ? 'sheet-scrim open' : 'sheet-scrim'} onClick={onClose} aria-hidden="true" />
      <div
        ref={menuRef}
        className={open ? 'sheet open' : 'sheet'}
        role="dialog"
        aria-label="Groups and account"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="sheet-list sheet-nav">
          <Link to="/group" className="sheet-item" style={next()} onClick={onClose}>
            <Icon name="users" />Group
          </Link>
          <Link to="/profile" className="sheet-item" style={next()} onClick={onClose}>
            <Icon name="user" />Profile
          </Link>
        </div>

        <h2 style={next()}>{moves.length > 1 ? 'Switch group' : 'Your group'}</h2>
        <div className="sheet-list">
          {moves.map((m) => {
            const current = m.move_id === move?.move_id
            return (
              <button
                key={m.move_id}
                type="button"
                className={current ? 'sheet-item current' : 'sheet-item'}
                aria-current={current || undefined}
                style={next()}
                onClick={() => pick(m.move_id)}
              >
                <Icon name={current ? 'check' : 'home'} />
                <span className="sheet-item-text">{m.name}</span>
              </button>
            )
          })}
          <Link to="/group" className="sheet-item" style={next()} onClick={onClose}>
            <Icon name="plus" />
            {moves.length === 0 ? 'Create or join a group' : 'New or join another'}
          </Link>
        </div>

        <button type="button" className="btn btn-ghost" style={next()} onClick={() => { onClose(); onLogOut() }}>
          <Icon name="logout" size={18} />Log out
        </button>
      </div>
    </>
  )
}

export default AccountMenu
