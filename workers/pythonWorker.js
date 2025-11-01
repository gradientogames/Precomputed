/*
  Classic Web Worker to run Python via Pyodide with strict constraints:
  - Runs fully client-side
  - Network APIs disabled for executed code (fetch, XHR, WebSocket, EventSource)
  - Execution timeouts handled by host via worker termination
*/

let pyodide = null
let pyodideReady = null
let isNetworkDisabled = false

async function ensurePyodide() {
  if (pyodideReady) return pyodideReady
  pyodideReady = (async () => {
    try {
      // Load Pyodide from CDN
      importScripts('https://cdn.jsdelivr.net/pyodide/v0.25.1/full/pyodide.js')
      // @ts-ignore
      pyodide = await self.loadPyodide({
        indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
      })
      // Route stdout/stderr back to host, ensuring line breaks render in UI
      pyodide.setStdout({ batched: (s) => postMessage({ type: 'stdout', data: ensureTrailingNewline(s) }) })
      pyodide.setStderr({ batched: (s) => postMessage({ type: 'stderr', data: ensureTrailingNewline(s) }) })
      // After load, disable network APIs within the worker to enforce no-network policy
      disableNetwork()
      postMessage({ type: 'ready' })
    } catch (e) {
      postMessage({ type: 'init-error', message: e?.message || String(e) })
      throw e
    }
  })()
  return pyodideReady
}

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
    return String(s) + '\n'
  }
}

// Sanitize Python error messages to be more readable
function sanitizePythonError(raw) {
  if (!raw) return 'Unknown error'
  
  // Remove common traceback prefix
  let message = raw.replace(/^Traceback \(most recent call last\):\n((\s+File ".*", line \d+, in .+\n)+)/, '')
  
  // Remove <exec> references which aren't helpful to users
  message = message.replace(/File "<exec>", line (\d+)/g, 'Line $1')
  
  // Remove module context which isn't helpful to users
  message = message.replace(/File "\/lib\/python\d+\.\d+\/.*?\.py", line \d+, in .+\n/g, '')
  
  // Clean up newlines
  message = message.replace(/\n+/g, '\n').trim()
  
  return message
}

self.onmessage = async (ev) => {
  const msg = ev.data || {}
  if (msg.type === 'warmup') {
    try {
      await ensurePyodide()
      // ensure network is disabled even during warmup
      disableNetwork()
      // ensurePyodide already posts { type: 'ready' }
    } catch (e) {
      postMessage({ type: 'init-error', message: e?.message || String(e) })
    }
  } else if (msg.type === 'run') {
    const code = String(msg.code || '')
    try {
      await ensurePyodide()
      // extra safety: re-assert network disabled
      disableNetwork()
      // Run user code asynchronously
      await pyodide.runPythonAsync(code)
      postMessage({ type: 'done' })
    } catch (e) {
      const raw = e?.message || String(e)
      const message = sanitizePythonError(raw)
      postMessage({ type: 'error', message })
    }
  }
}