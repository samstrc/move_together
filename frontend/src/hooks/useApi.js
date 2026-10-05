import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'

// Loads data from the backend when a page opens, and again whenever `path`
// changes. Pass null as the path to skip loading for now.
//
//   const { data, error, loading, reload } = useApi(`/moves/${moveId}/items`)
//
// Call reload() after changing something so the page shows the new data.
export function useApi(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    if (!path) return
    // If the path changes before this request finishes, ignore its result so
    // an older response can't overwrite a newer one.
    let ignore = false
    api(path)
      .then((result) => {
        if (!ignore) {
          setData(result)
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

  return { data, error, loading: data === null && !error, reload }
}
