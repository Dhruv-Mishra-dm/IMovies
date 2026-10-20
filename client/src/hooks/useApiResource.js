import { useCallback, useEffect, useState } from 'react'

/**
 * Loads data with an apiRequest()-style fetcher and re-loads whenever `key` changes.
 *
 *   const { loading, result, previous, reload } = useApiResource(
 *     (signal) => listMovies(params, signal), JSON.stringify(params))
 *
 * - `result` is the apiRequest() result for the CURRENT key (null while loading).
 * - `previous` is the last finished result, handy to keep showing old data while new data loads.
 * - Requests for an outdated key are aborted, so a slow old response can never overwrite a newer one.
 * - Pass `key = null` to wait (nothing is fetched and `loading` stays true), e.g. until login status is known.
 */
export function useApiResource(fetcher, key) {
  const [reloadCount, setReloadCount] = useState(0)
  const requestKey = key === null ? null : `${key}#${reloadCount}`
  const [settled, setSettled] = useState({ key: null, value: null })

  useEffect(() => {
    if (requestKey === null) return undefined
    const controller = new AbortController()
    fetcher(controller.signal).then(
      (value) => setSettled({ key: requestKey, value }),
      () => {}, // aborted
    )
    return () => controller.abort()
    // The fetcher is recreated every render; `requestKey` captures everything that should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey])

  const reload = useCallback(() => setReloadCount((n) => n + 1), [])
  const loading = requestKey === null || settled.key !== requestKey
  return { loading, result: loading ? null : settled.value, previous: settled.value, reload }
}
