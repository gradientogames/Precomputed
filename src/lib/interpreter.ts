// Client-side runner facade using a classic Web Worker
// Enforces strict timeout by terminating the worker if it exceeds the budget.

export type RunUpdate =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'error'; message: string }
  | { type: 'done' }
  | { type: 'ready' }

export type RunResult = { updates: RunUpdate[] }

export type RunOptions = { timeoutMs?: number }

export type RunHandle = {
  promise: Promise<RunResult>
  cancel: () => void
}

export type Runner = {
  run: (code: string, opts?: RunOptions) => RunHandle
  warmup: () => Promise<void>
  dispose: () => void
}

export type PythonRunner = Runner
export type CRunner = Runner
export type CSharpRunner = Runner

function createWorkerRunner(workerPath: string, workerType: WorkerOptions['type'] = 'classic'): Runner {
  let worker: Worker | null = null

  // Create worker immediately (no lazy creation)
  function ensureWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL(workerPath, import.meta.url), { type: workerType })
    return worker
  }
  // create on runner construction
  ensureWorker()

  function warmup(): Promise<void> {
    const w = ensureWorker()
    return new Promise((resolve, reject) => {
      const onMessage = (ev: MessageEvent) => {
        const msg = ev.data || {}
        if (!msg || !msg.type) return
        if (msg.type === 'ready') {
          w.removeEventListener('message', onMessage as any)
          resolve()
        } else if (msg.type === 'init-error') {
          w.removeEventListener('message', onMessage as any)
          reject(new Error(String(msg.message || 'Interpreter init failed')))
        }
      }
      w.addEventListener('message', onMessage as any)
      try { w.postMessage({ type: 'warmup' }) } catch (e) {
        w.removeEventListener('message', onMessage as any)
        reject(e as any)
      }
    })
  }

  function run(code: string, opts?: RunOptions): RunHandle {
    const w = ensureWorker()
    const updates: RunUpdate[] = []
    let timer: any = null

    const promise = new Promise<RunResult>((resolve) => {
      function cleanup() {
        if (timer) { clearTimeout(timer); timer = null }
        if (!w) return
        w.removeEventListener('message', onMessage as any)
      }
      function resolveAndCleanup() {
        cleanup()
        resolve({ updates })
      }
      const onMessage = (ev: MessageEvent) => {
        const msg = ev.data || {}
        if (!msg || !msg.type) return
        if (msg.type === 'stdout' || msg.type === 'stderr') {
          updates.push(msg)
        } else if (msg.type === 'error') {
          updates.push({ type: 'error', message: String(msg.message || 'Execution error') })
          resolveAndCleanup()
        } else if (msg.type === 'done') {
          updates.push({ type: 'done' })
          resolveAndCleanup()
        } else if (msg.type === 'ready') {
          updates.push({ type: 'ready' })
        }
      }
      w.addEventListener('message', onMessage as any)

      console.log('[Interpreter] run:', code)
      console.log(opts?.timeoutMs ?? 2000, 'ms')
      // Start timeout clock
      //const timeoutMs = Math.max(1, opts?.timeoutMs ?? 2000)
      //timer = setTimeout(() => {
        // Kill the worker to terminate any running code
      //  try { w.terminate() } catch {}
      //  worker = null
       // updates.push({ type: 'error', message: `Execution timed out after ${timeoutMs} ms` })
       // resolveAndCleanup()
      //}, timeoutMs)

      // Send run message
      try {
        w.postMessage({ type: 'run', code })
      } catch (e: any) {
        updates.push({ type: 'error', message: e?.message ?? 'Failed to start execution' })
        resolveAndCleanup()
      }
    })

    function cancel() {
      try { w.terminate() } catch {}
      worker = null
    }

    return { promise, cancel }
  }

  function dispose() {
    if (worker) {
      try { worker.terminate() } catch {}
      worker = null
    }
  }

  return { run, warmup, dispose }
}

export function createPythonRunner(): PythonRunner {
  return createWorkerRunner('../workers/pythonWorker.js')
}

function createPaizaRunner(language: 'c' | 'csharp'): Runner {
  // Network-backed runner using Paiza.io API (https://api.paiza.io)
  // The Runner interface is preserved to minimize changes elsewhere.
  const env: any = (import.meta as any).env || {}
  // Prefer an explicit proxy/base URL if provided; otherwise use Vite dev proxy in dev and direct API in prod
  const PAIZA_BASE = env.VITE_PAIZA_BASE_URL || (env.DEV ? '/__paiza' : 'https://api.paiza.io')

  function warmup(): Promise<void> {
    // No-op warmup; immediately resolve to keep UI consistent
    return Promise.resolve()
  }

  // Strip common compiler warning lines from stderr while preserving errors
  function stripCompilerWarnings(text: string): string {
    if (!text) return ''
    const lines = text.split(/\r?\n/)
    const filtered = lines.filter((line) => {
      const l = line.trim()
      if (l.length === 0) return false
      // GCC/Clang style: warning: or warning[-Wxxx]:
      if (/\bwarning(\s*\[[^\]]+\])?:/i.test(l)) return false
      // C# CSC style: warning CS0168:
      if (/\bwarning\s+CS\d{4}\b/i.test(l)) return false
      // Generic shorthand
      if (/^\s*W:\s/.test(l)) return false
      return true
    })
    return filtered.join('\n')
  }

  function run(code: string, opts?: RunOptions): RunHandle {
    const updates: RunUpdate[] = []
    const controller = new AbortController()
    const signal = controller.signal

    const promise = (async () => {
      const timeoutMs = Math.max(1, opts?.timeoutMs ?? 20000)
      const deadline = Date.now() + timeoutMs

      function timeRemaining() { return Math.max(0, deadline - Date.now()) }
      function isTimedOut() { return Date.now() >= deadline }

      try {
        // 1) Create runner session
        const form = new URLSearchParams()
        form.set('api_key', 'guest')
        form.set('source_code', code)
        form.set('language', language)
        form.set('input', '') // UI does not yet support stdin

        const createTimeoutId = setTimeout(() => controller.abort('timeout'), timeRemaining())
        let createRes: Response
        try {
          createRes = await fetch(`${PAIZA_BASE}/runners/create.json`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
            signal,
          })
        } finally {
          clearTimeout(createTimeoutId)
        }
        if (!createRes.ok) {
          const text = await createRes.text().catch(() => '')
          updates.push({ type: 'error', message: `Paiza API error (create): HTTP ${createRes.status} ${createRes.statusText}${text ? ` - ${text}` : ''}` })
          updates.push({ type: 'done' })
          return { updates }
        }
        const createData: any = await createRes.json().catch(() => ({}))
        const id = createData?.id
        if (!id) {
          updates.push({ type: 'error', message: 'Paiza API error: missing session id from create response' })
          updates.push({ type: 'done' })
          return { updates }
        }

        // 2) Poll status until completed or timeout
        const pollIntervalMs = 800
        let status = createData?.status || 'running'
        while (status !== 'completed') {
          if (isTimedOut()) {
            updates.push({ type: 'error', message: `Execution timed out after ${timeoutMs} ms` })
            updates.push({ type: 'done' })
            return { updates }
          }
          // wait before polling again
          await new Promise<void>(resolve => setTimeout(resolve, Math.min(pollIntervalMs, timeRemaining())))
          if (signal.aborted) throw new DOMException('aborted', 'AbortError')

          const statusUrl = `${PAIZA_BASE}/runners/get_status.json?api_key=guest&id=${encodeURIComponent(id)}`
          const statusTimeoutId = setTimeout(() => controller.abort('timeout'), timeRemaining())
          let statusRes: Response
          try {
            statusRes = await fetch(statusUrl, { method: 'GET', signal })
          } finally {
            clearTimeout(statusTimeoutId)
          }
          if (!statusRes.ok) {
            const text = await statusRes.text().catch(() => '')
            updates.push({ type: 'error', message: `Paiza API error (status): HTTP ${statusRes.status} ${statusRes.statusText}${text ? ` - ${text}` : ''}` })
            updates.push({ type: 'done' })
            return { updates }
          }
          const statusData: any = await statusRes.json().catch(() => ({}))
          status = statusData?.status || 'running'
        }

        // Ensure we still have time budget before fetching details
        if (isTimedOut()) {
          updates.push({ type: 'error', message: `Execution timed out after ${timeoutMs} ms` })
          updates.push({ type: 'done' })
          return { updates }
        }

        // 3) Fetch details
        const detailsUrl = `${PAIZA_BASE}/runners/get_details.json?api_key=guest&id=${encodeURIComponent(id)}`
        const detailsTimeoutId = setTimeout(() => controller.abort('timeout'), timeRemaining())
        let detailsRes: Response
        try {
          detailsRes = await fetch(detailsUrl, { method: 'GET', signal })
        } finally {
          clearTimeout(detailsTimeoutId)
        }
        if (!detailsRes.ok) {
          const text = await detailsRes.text().catch(() => '')
          updates.push({ type: 'error', message: `Paiza API error (details): HTTP ${detailsRes.status} ${detailsRes.statusText}${text ? ` - ${text}` : ''}` })
          updates.push({ type: 'done' })
          return { updates }
        }
        const details: any = await detailsRes.json().catch(() => ({}))

        const buildStdout = (details?.build_stdout ?? '').toString()
        const buildStderrRaw = (details?.build_stderr ?? '').toString()
        const buildStderr = stripCompilerWarnings(buildStderrRaw)
        const runStdout = (details?.stdout ?? '').toString()
        const runStderr = (details?.stderr ?? '').toString()

        if (buildStdout) updates.push({ type: 'stdout', data: buildStdout })
        if (buildStderr) updates.push({ type: 'stderr', data: buildStderr })
        if (runStdout) updates.push({ type: 'stdout', data: runStdout })
        if (runStderr) updates.push({ type: 'stderr', data: runStderr })
        if (!buildStdout && !buildStderr && !runStdout && !runStderr) {
          updates.push({ type: 'stdout', data: '' })
        }
        updates.push({ type: 'done' })
        return { updates }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          updates.push({ type: 'error', message: `Execution aborted or timed out after ${opts?.timeoutMs ?? 20000} ms` })
        } else {
          updates.push({ type: 'error', message: e?.message ?? 'Unexpected error' })
        }
        updates.push({ type: 'done' })
        return { updates }
      }
    })()

    function cancel() {
      try { controller.abort('cancelled') } catch {}
    }

    return { promise, cancel }
  }

  function dispose() {
    // Nothing to dispose for network runner
  }

  return { run, warmup, dispose }
}

export function createCRunner(): CRunner {
  return createPaizaRunner('c')
}

export function createCSharpRunner(): CSharpRunner {
  return createPaizaRunner('csharp')
}
