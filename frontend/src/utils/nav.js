// The main pages, shared by the sidebar and the phone tab bar.
export const navLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: 'home' },
  { to: '/items', label: 'Shared List', icon: 'list' },
  { to: '/budget', label: 'Budget', icon: 'wallet' },
  { to: '/assistant', label: 'Dolly', icon: 'dolly' },
  { to: '/group', label: 'Group', icon: 'users' },
  { to: '/profile', label: 'Profile', icon: 'user' },
]

// "Alex Rivera" -> "AR"
export function initials(name) {
  return (name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')
}
