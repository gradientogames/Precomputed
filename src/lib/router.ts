import { useEffect, useState } from 'react'

export type Route = '' | 'signin' | 'account' | 'languages' | `lesson/${string}` | `lang/${string}`

function normalize(hash: string): Route {
  // Preserve the case of IDs while matching route prefixes case-insensitively
  const raw = hash.replace(/^#\/?/, '').trim()
  const lc = raw.toLowerCase()
  let route: Route = ''
  if (lc === 'signin') route = 'signin'
  else if (lc === 'account') route = 'account'
  else if (lc === 'languages') route = 'languages'
  else if (lc.startsWith('lesson/')) {
    const id = raw.slice('lesson/'.length) // preserve original case for ID
    route = id ? (`lesson/${id}` as Route) : ''
  } else if (lc.startsWith('lang/')) {
    const id = raw.slice('lang/'.length) // preserve original case for ID
    route = id ? (`lang/${id}` as Route) : ''
  } else route = ''
  console.log('[router] normalize:', { input: hash, normalized: route })
  return route
}

export function getCurrentRoute(): Route {
  if (typeof window === 'undefined') return ''
  const r = normalize(window.location.hash || '')
  return r
}

export function navigate(route: Route) {
  if (typeof window === 'undefined') return
  const target = route ? `#/${route}` : '#/'
  console.log('[router] navigate ->', target)
  if (window.location.hash !== target) {
    window.location.hash = target
  } else {
    // force event for same-hash navigation
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(() => getCurrentRoute())
  useEffect(() => {
    console.log('[router] useRoute mounted. initial =', route)
    function onHashChange() {
      const next = getCurrentRoute()
      console.log('[router] hashchange ->', next)
      setRoute(next)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => {
      console.log('[router] useRoute unmounted; removing listener')
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])
  return [route, navigate]
}
