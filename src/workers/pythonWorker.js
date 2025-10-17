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
    return '\n'
  }
}

function sanitizePythonError(msg) {
  try {
    let m = String(msg ?? '')
    // Remove Pyodide wrapper prefix
    m = m.replace(/^PythonError:\s*/, '')
    const lines = m.split(/\r?\n/)

    // Extract last seen line number from traceback lines like: File "<exec>", line N
    let lineNo = null
    for (const line of lines) {
      const match = /line\s+(\d+)/i.exec(line)
      if (match) lineNo = match[1]
    }

    // Find the final exception message line, skip traceback and JS frames
    let finalLine = ''
    for (let i = lines.length - 1; i >= 0; i--) {
      const raw = lines[i]
      const l = raw.trim()
      if (!l) continue
      if (/^\s*at\s+/.test(raw)) continue // drop JS frames
      if (/^Traceback\b/.test(l)) continue // drop traceback header
      if (/^File\s+/.test(l)) continue // drop file/line entries
      if (l === '^') continue // caret indicators
      finalLine = l
      break
    }
    if (!finalLine) finalLine = lines[lines.length - 1]?.trim() || 'Error'

    // Extract type and detail from the final line
    let type = null
    let detail = finalLine
    const tmatch = /^([A-Za-z_]*Error):\s*(.*)$/.exec(finalLine)
    if (tmatch) { type = tmatch[1]; detail = tmatch[2] }

    // Map to a beginner-friendly message when possible
    const friendly = toFriendlyMessage(type, detail, lineNo, m)
    if (friendly) return friendly

    if (lineNo && !/\bline\s+\d+\b/i.test(finalLine)) {
      finalLine += ` (line ${lineNo})`
    }

    return finalLine
  } catch (_) {
    return String(msg ?? '')
  }
}

function toFriendlyMessage(type, detail, lineNo, full) {
  const where = lineNo ? ` at line ${lineNo}` : ''
  const lowerDetail = String(detail || '').toLowerCase()
  const lowerFull = String(full || '').toLowerCase()

  function withLine(text) { return lineNo ? `${text} (line ${lineNo})` : text }

  // Strings not closed
  if (/unterminated string literal|eol while scanning string literal/.test(lowerDetail) || /unterminated string literal/.test(lowerFull)) {
    return withLine("A string starts but isn't finished on the same line.")
  }

  // Invalid syntax (generic)
  if (type === 'SyntaxError' && /invalid syntax/.test(lowerDetail)) {
    return withLine("There's a typo, check for missing or additional symbols or syntax.")
  }

  // Missing colon after if/for/while/def/class
  if ((type === 'SyntaxError' && /expected ':'/.test(lowerDetail)) || /expected ':'/.test(lowerFull)) {
    return withLine("You need a colon ':' at the end of the previous line.")
  }

  // Incomplete code / things not closed
  if (type === 'SyntaxError' && (/unexpected eof while parsing/.test(lowerDetail) || /was never closed/.test(lowerDetail) || /was never closed/.test(lowerFull))) {
    return withLine("Your code seems to stop early or something isn't closed. Check brackets (), [], {}, and quotes.")
  }

  // Unmatched brackets/parentheses
  if (type === 'SyntaxError' && (/unmatched|mismatched/.test(lowerDetail) || /parenthes(es|is)|bracket|brace/.test(lowerDetail))) {
    return withLine("Your brackets or parentheses don't match. Make sure every opening symbol has a closing one.")
  }

  // Indentation issues
  if (type === 'IndentationError' && /expected an indented block/.test(lowerDetail)) {
    return withLine("This line should be indented because it belongs to the line above.")
  }
  if (type === 'IndentationError' && /unexpected indent/.test(lowerDetail)) {
    return withLine("This line has extra spaces at the start. Remove the extra indentation.")
  }
  if (type === 'IndentationError' && /unindent does not match any outer indentation level/.test(lowerDetail)) {
    return withLine("The indentation on this line doesn't match the previous lines. Use the same number of spaces for the whole block.")
  }

  // Tabs vs spaces
  if (type === 'TabError') {
    return withLine("You're mixing tabs and spaces. Use spaces only for indentation (e.g., 2 or 4 spaces).")
  }

  // Smart quotes / invalid characters
  if (type === 'SyntaxError' && (/invalid character/.test(lowerDetail) && /(u\+201c|u\+201d|u\+2018|u\+2019|“|”|‘|’)/i.test(full))) {
    return withLine("You used “smart quotes”. Replace them with regular quotes ' or \".")
  }

  // Name used before defined
  if (type === 'NameError') {
    const m = /name\s+'([^']+)'/.exec(detail) || /name\s+'([^']+)'/.exec(full)
    if (m) {
      return withLine(`You used the name '${m[1]}' before creating it.`)
    }
    return withLine("You used a name before creating it.")
  }

  // Adding text and numbers
  if (type === 'TypeError' && (/can only concatenate str/.test(lowerDetail) || /unsupported operand type\(s\) for \+/.test(lowerDetail))) {
    return withLine("You're trying to add text and a number. Convert the number with str() or convert text to a number with int()/float().")
  }

  // Divide by zero
  if (type === 'ZeroDivisionError') {
    return withLine("You're dividing by zero. Change the denominator to a non-zero value.")
  }

  // None has no attribute
  if (type === 'AttributeError' && /'nonetype' object has no attribute/.test(lowerDetail)) {
    return withLine("You're trying to use something that is empty (None). Make sure the value is created before you use it.")
  }

  return null
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
