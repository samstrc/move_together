import { useEffect, useState } from 'react'

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Counts a number up from 0 to `target` (ease-out, ~0.9s), for the big
// numbers on the dashboard. Returns the value to show. Jumps straight to the
// target when the user has asked for less motion.
export function useCountUp(target, { duration = 900, delay = 250 } = {}) {
  const [value, setValue] = useState(0)

  useEffect(() => {
    if (!Number.isFinite(target)) return
    if (reduceMotion()) {
      const id = requestAnimationFrame(() => setValue(target))
      return () => cancelAnimationFrame(id)
    }
    let frame
    const start = performance.now() + delay
    function tick(now) {
      const progress = Math.min(1, Math.max(0, (now - start) / duration))
      setValue(target * (1 - Math.pow(1 - progress, 4)))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, duration, delay])

  return value
}
