export default {
  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    // Expecting a route like https://your.domain/__paiza/* mapped to this Worker
    const upstream = `https://api.paiza.io${url.pathname.replace(/^\/__paiza/, '')}${url.search}`

    // Build a proxied request to Paiza API
    const init: RequestInit = {
      method: req.method,
      headers: { 'Content-Type': req.headers.get('content-type') || 'application/json' },
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    }

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      const headers = new Headers()
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      return new Response(null, { status: 204, headers })
    }

    try {
      const res = await fetch(upstream, init)
      const headers = new Headers(res.headers)
      // Add permissive CORS headers. Tighten to your origin if desired.
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
    } catch (e: any) {
      const headers = new Headers()
      headers.set('Access-Control-Allow-Origin', '*')
      headers.set('Content-Type', 'application/json')
      return new Response(JSON.stringify({ error: e?.message || 'Proxy error' }), { status: 502, headers })
    }
  }
}
