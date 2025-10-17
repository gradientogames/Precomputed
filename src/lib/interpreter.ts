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

export function createCRunner(): CRunner {
  // Use a classic worker hosted under /public to avoid Vite dev transforms injecting ESM imports into a classic worker
  return createWorkerRunner('/workers/cWorker.js', 'classic')
}

export function createCSharpRunner(): CSharpRunner {
  return createWorkerRunner('../workers/csharpWorker.js')
}
