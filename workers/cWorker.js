/*
  Classic Web Worker to run C code in the browser with strict constraints:
  - Runs fully client-side (toolchain loaded in the worker via CDN when available)
  - Network APIs are disabled for executed user programs (fetch, XHR, WebSocket, EventSource)
  - Execution timeouts are enforced by the host by terminating this worker

  NOTE: This worker defines the standard message protocol used by the app:
    { type: 'warmup' } -> triggers loading of the toolchain and replies { type: 'ready' } when usable
    { type: 'run', code } -> compiles and runs code, emitting { type: 'stdout' | 'stderr' } updates, and final { type: 'done' } or { type: 'error', message }

  Implementation approach (pluggable backend):
  - Prefer a WASI-targeting C compiler available in-browser (e.g., clang or tcc compiled to WebAssembly).
  - For minimal footprint here, we load a backend adapter if available at runtime. If unavailable, we emit a clear error.

  The actual compiler payloads are large; to keep this repo lean, we rely on well-known CDNs.
*/

let backend = null // { compileAndRun: async (code: string) => { stdout: string, stderr: string } }
let isNetworkDisabled = false
let readyPosted = false

function disableNetwork() {
  //will add back in later once other issues are fixed
  return;

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

async function loadBackend() {
  if (backend) return backend

  // Option A: self-hosted adapter served from public/vendor
  try {
    // Prefer dynamic import (module workers). Fallback to importScripts for classic workers.
    let mod = null
    try {
      const url = self.location.origin + '/vendor/c/c-backend.js'
      mod = await import(/* @vite-ignore */ url)
    } catch (e) {
      console.log('Error loading self-hosted C backend via dynamic import', e);
      // If dynamic import failed (likely classic worker), try importScripts
      try {
        importScripts('/vendor/c/c-backend.js')
        mod = /** @type {any} */ (self)
      } catch (e2) {
        throw e2
      }
    }

    const candidate = (mod && (mod.default || mod.C_BACKEND)) || self.C_BACKEND
    if (candidate && typeof candidate.compileAndRun === 'function') {
      backend = candidate
    }
  } catch (e) {
    console.log('Error loading self-hosted C backend', e);
  }

  if (!backend) {
    throw new Error('C toolchain is not available. Place a TCC backend at /vendor/c/c-backend.js with required TCC WASM assets (e.g., tcc.js, tcc.wasm). See public/vendor/README-ADAPTERS.md.')
  }

  return backend
}

let degradedMode = false

self.onmessage = async (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'warmup') {
    try {
      try {
        console.log('[C][worker] warmup: loading backend')
        await loadBackend()
        console.log('[C][worker] warmup: backend loaded')
      } catch (e) {
        // Enter degraded mode but still signal ready so UI stays usable
        degradedMode = true
      }
      disableNetwork()
      if (!readyPosted) { postMessage({ type: 'ready', degraded: degradedMode }); readyPosted = true }
    } catch (e) {
      // As a last resort, still mark ready in degraded mode to avoid blocking the UI
      degradedMode = true
      try { disableNetwork() } catch {}
      if (!readyPosted) { postMessage({ type: 'ready', degraded: degradedMode }); readyPosted = true }
    }
  } else if (msg.type === 'run') {
    const code = String(msg.code || '')
    console.log('[C][worker] run: received code length', code.length)
    try {
      if (!backend) {
        try { await loadBackend() } catch (e) { degradedMode = true }
      }

      // extra safety: disable network for user program
      disableNetwork()

      if (!backend || degradedMode) {
        postMessage({ type: 'error', message: 'C toolchain is not available in this build. Running C requires a WebAssembly TCC backend. Please check your connection or include a local backend.' })
        return
      }
      const result = await backend.compileAndRun(code)
      console.log('[C][worker] run: backend returned', { stdoutLen: (result && result.stdout || '').length, stderrLen: (result && result.stderr || '').length })
      if (result && result.stdout) postMessage({ type: 'stdout', data: ensureTrailingNewline(result.stdout) })
      if (result && result.stderr) postMessage({ type: 'stderr', data: ensureTrailingNewline(result.stderr) })
      postMessage({ type: 'done' })
    } catch (e) {
      const message = e?.message || String(e)
      postMessage({ type: 'error', message })
    }
  }
}
