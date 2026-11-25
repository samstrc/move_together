// A soft ripple that spreads from where you press a button, tab or chip.
// One listener for the whole app, so components don't each need code for it.
// Skipped when the user has asked for less motion.
const SELECTOR = '.btn, .chip, .tab, .rail-btn, .sheet-item'

export function installPressRipple() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest(SELECTOR)
    if (!target || target.disabled || reduceMotion.matches) return
    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height) * 2.2
    const ripple = document.createElement('span')
    ripple.className = 'ripple'
    ripple.style.width = ripple.style.height = `${size}px`
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`
    target.append(ripple)
    ripple.addEventListener('animationend', () => ripple.remove())
  })
}
