import { useEffect, useState } from 'react'

export type Route = '' | 'signin' | 'account' | `lesson/${string}`

function normalize(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '').trim().toLowerCase()
  let route: Route = ''
  if (raw === 'signin') route = 'signin'
  else if (raw === 'account') route = 'account'
  else if (raw.startsWith('lesson/')) {
    const id = raw.slice('lesson/'.length)
    route = id ? (`lesson/${id}` as Route) : ''
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
