/*
  Classic Web Worker to run C# code in the browser with strict constraints:
  - Runs fully client-side (loads .NET WebAssembly runtime and Roslyn in the worker via CDN when available)
  - Network APIs are disabled for executed user programs (fetch, XHR, WebSocket, EventSource)
  - Execution timeouts are enforced by the host by terminating this worker

  Protocol:
    warmup -> { type: 'ready' } on success or { type: 'init-error', message }
    run { code } -> emits { stdout|stderr } and final { done } or { error, message }

  Note: Shipping the full .NET and Roslyn toolchains in-repo is heavy. This worker loads them at runtime from CDNs.
  If not reachable, the worker will respond with a clear error message.
*/

let runtime = null // { compileAndRun: async (source: string) => { stdout: string, stderr: string } }
let readyPosted = false
let isNetworkDisabled = false

function disableNetwork() {
  if (isNetworkDisabled) return
  const blocker = function () { throw new Error('Network access is disabled in the code interpreter') }
  try { self.fetch = blocker } catch {}
  try { self.XMLHttpRequest = function () { throw new Error('Network access disabled') } } catch {}
  try { self.WebSocket = function () { throw new Error('Network access disabled') } } catch {}
  try { self.EventSource = function () { throw new Error('Network access disabled') } } catch {}
  isNetworkDisabled = true
}

function ensureTrailingNewline(s) {
  try {
    const str = String(s ?? '')
    return str.endsWith('\n') ? str : str + '\n'
  } catch (_) {
    return '\n'
  }
}

async function loadRuntime() {
  if (runtime) return runtime

  // Option A: self-hosted adapter served from public/vendor
  try {
    // Expected to define self.CSHARP_BACKEND with compileAndRun(source)
    importScripts('/vendor/csharp/csharp-backend.js')
    if (self.CSHARP_BACKEND && typeof self.CSHARP_BACKEND.compileAndRun === 'function') {
      runtime = self.CSHARP_BACKEND
    }
  } catch (_) {}

  if (!runtime) {
    throw new Error('.NET C# toolchain is not available. Place a self-hosted adapter at /public/vendor/csharp/csharp-backend.js with WASM assets (see public/vendor/README-ADAPTERS.md).')
  }

  return runtime
}

let degradedMode = false

self.onmessage = async (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'warmup') {
    try {
      try {
        await loadRuntime()
      } catch (e) {
        degradedMode = true
      }
      disableNetwork()
      if (!readyPosted) { postMessage({ type: 'ready', degraded: degradedMode }); readyPosted = true }
    } catch (e) {
      degradedMode = true
      try { disableNetwork() } catch {}
      if (!readyPosted) { postMessage({ type: 'ready', degraded: degradedMode }); readyPosted = true }
    }
  } else if (msg.type === 'run') {
    const code = String(msg.code || '')
    try {
      if (!runtime) {
        try { await loadRuntime() } catch (e) { degradedMode = true }
      }
      disableNetwork()
      if (!runtime || degradedMode) {
        postMessage({ type: 'error', message: 'C# toolchain is not available in this build. Running C# requires a WebAssembly .NET backend. Please check your connection or include a local backend.' })
        return
      }
      const res = await runtime.compileAndRun(code)
      if (res && res.stdout) postMessage({ type: 'stdout', data: ensureTrailingNewline(res.stdout) })
      if (res && res.stderr) postMessage({ type: 'stderr', data: ensureTrailingNewline(res.stderr) })
      postMessage({ type: 'done' })
    } catch (e) {
      const message = e?.message || String(e)
      postMessage({ type: 'error', message })
    }
  }
}
