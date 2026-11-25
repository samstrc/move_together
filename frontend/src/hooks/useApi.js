import { useCallback, useEffect, useState } from 'react'
import { api, responseCache } from '../api.js'

// Loads data from the backend when a page opens, and again whenever `path`
// changes. Pass null as the path to skip loading for now.
//
//   const { data, error, loading, reload } = useApi(`/moves/${moveId}/items`)
//
// Call reload() after changing something so the page shows the new data.
//
// If this path was loaded before (another visit, or prefetched by AppLayout),
// that copy shows immediately and is refreshed in the background, so moving
// between pages doesn't flash a loading state.
export function useApi(path) {
  const [current, setCurrent] = useState({ path, data: path ? responseCache.get(path) ?? null : null })
  const [error, setError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  // A new path starts from its cached copy (if any) instead of the old data.
  let data = current.data
  if (current.path !== path) {
    data = path ? responseCache.get(path) ?? null : null
    setCurrent({ path, data })
    setError('')
  }

  useEffect(() => {
    if (!path) return
    // If the path changes before this request finishes, ignore its result so
    // an older response can't overwrite a newer one.
    let ignore = false
    api(path)
      .then((result) => {
        responseCache.set(path, result)
        if (!ignore) {
          setCurrent({ path, data: result })
          setError('')
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message)
      })
    return () => {
      ignore = true
    }
  }, [path, reloadCount])

  const reload = useCallback(() => setReloadCount((count) => count + 1), [])

  // For updating the page right away from a response (e.g. Group's make-owner).
  const setData = useCallback(
    (update) =>
      setCurrent((prev) => {
        const next = typeof update === 'function' ? update(prev.data) : update
        if (prev.path) responseCache.set(prev.path, next)
        return { path: prev.path, data: next }
      }),
    [],
  )

  return { data, setData, error, loading: data === null && !error, reload }
}
