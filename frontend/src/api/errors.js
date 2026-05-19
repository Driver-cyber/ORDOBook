/**
 * Normalize an axios/fetch error into a string safe to render in JSX.
 *
 * FastAPI returns Pydantic v2 validation errors as `detail: [{type, loc, msg, input}, ...]`.
 * If you setError(err.response?.data?.detail) and render {error}, React tries to render the
 * array of objects and crashes the whole tree. Always pipe errors through this helper.
 */
export function formatApiError(err, fallback = 'Request failed') {
  const detail = err?.response?.data?.detail

  if (Array.isArray(detail)) {
    const parts = detail
      .map(e => {
        if (!e || typeof e !== 'object') return String(e)
        const loc = Array.isArray(e.loc) ? e.loc.filter(p => p !== 'body').join('.') : null
        const msg = e.msg || JSON.stringify(e)
        return loc ? `${loc}: ${msg}` : msg
      })
      .filter(Boolean)
    if (parts.length) return parts.join('; ')
  }

  if (typeof detail === 'string' && detail.trim()) return detail

  if (err?.message) return err.message
  return fallback
}
