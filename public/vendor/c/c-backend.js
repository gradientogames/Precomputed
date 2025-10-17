// public/vendor/c/c-backend.js
(function () {
  // path to the worker shipped from wasm-clang
  const WORKER_PATH = '/vendor/c/worker.js';

  // single worker instance (lazy)
  let compileWorker = null;
  let pendingId = 0;

  // map id => {resolve, reject, timeout}
  const inflight = new Map();

  function ensureWorker() {
    if (compileWorker) return compileWorker;

    compileWorker = new Worker(WORKER_PATH);

    // handle responses from worker
    compileWorker.onmessage = (ev) => {
      const msg = ev.data || {};
      // common patterns: { id, stdout, stderr, success } or { type: 'result', id, ... }
      const id = msg.id ?? msg.requestId ?? msg.reqId ?? null;

      // if worker sends an unwrapped stdout/stderr (no id), try generic mapping
      if (!id) {
        // some workers post string messages or objects w/o id; forward to first inflight
        const first = inflight.keys().next().value;
        if (first) {
          const { resolve } = inflight.get(first);
          inflight.get(first).resolve({ stdout: msg.stdout ?? msg, stderr: msg.stderr ?? '', success: !!msg.success });
          inflight.delete(first);
        }
        return;
      }

      const entry = inflight.get(id);
      if (!entry) return;
      clearTimeout(entry._timeout);
      entry.resolve({
        stdout: msg.stdout ?? '',
        stderr: msg.stderr ?? msg.error ?? '',
        success: msg.success === undefined ? true : !!msg.success,
        raw: msg
      });
      inflight.delete(id);
    };

    compileWorker.onerror = (err) => {
      // reject all pending on fatal worker error
      inflight.forEach(({ reject }) => reject(err));
      inflight.clear();
    };

    return compileWorker;
  }

  async function sendCompileRequest(source, opts = {}) {
    const worker = ensureWorker();
    const id = String(++pendingId);
    const message = {
      // typical wasm-clang worker expects: {cmd: 'compile', id, files: [{name, data}], args: [...]}
      // We'll try to support that shape, but you may need to inspect worker.js in your copy.
      cmd: 'compile',   // common
      id,
      files: [{ name: opts.filename || 'main.c', data: source }],
      args: opts.args || ['-O0', '-g', '-std=c11']
    };

    return new Promise((resolve, reject) => {
      //const timeoutMs = opts.timeout ?? 10000;
      const timeoutMs = 99999999;
      const timeout = setTimeout(() => {
        inflight.delete(id);
        reject(new Error('compile timeout'));
      }, timeoutMs);

      inflight.set(id, { resolve, reject, _timeout: timeout });
      try {
        worker.postMessage(message);
      } catch (err) {
        clearTimeout(timeout);
        inflight.delete(id);
        reject(err);
      }
    });
  }

  // The public API your site expects
  self.C_BACKEND = {
    compileAndRun: async function (code, options = {}) {
      // options: { filename, args, timeout }
      try {
        const res = await sendCompileRequest(code, options);
        // result expected to contain stdout/stderr; adapt if worker returns different shape
        return {
          stdout: res.stdout ?? '',
          stderr: res.stderr ?? '',
          success: res.success ?? (res.stderr ? false : true),
          raw: res.raw ?? null
        };
      } catch (err) {
        return { stdout: '', stderr: 'Backend error: ' + (err.message || err), success: false };
      }
    }
  };
})();
