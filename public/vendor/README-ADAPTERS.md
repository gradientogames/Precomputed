Self-hosted C and C# WebAssembly backends (Option A)
====================================================

This app can compile and run user code for C and C# entirely in the browser, as long as you provide the toolchains as static assets under public/vendor/.

What you need to provide
- C backend adapter that sets `self.C_BACKEND = { compileAndRun(code) }`
- C# backend adapter that sets `self.CSHARP_BACKEND = { compileAndRun(source) }`

Once present, the workers will load these files:
- /vendor/c/c-backend.js
- /vendor/csharp/csharp-backend.js

Where to put files
- Place everything under the paths below (served by Vite in dev and by your static host in prod):

  public/
    vendor/
      c/
        c-backend.js            <-- REQUIRED adapter entry (must define self.C_BACKEND)
        <compiler assets...>    <-- e.g., clang.wasm, tcc.wasm, wasi .data files
      csharp/
        csharp-backend.js       <-- REQUIRED adapter entry (must define self.CSHARP_BACKEND)
        dotnet.js
        dotnet.wasm
        icudt.dat
        bcl/...
        roslyn/...
        <any additional assets used by your adapter>

Contract expected by the workers
- C adapter (c-backend.js):
  self.C_BACKEND = {
    // Receives C source code as a string. Must compile to a WASI-compatible Wasm
    // and run it under a WASI shim inside the worker, returning aggregated output.
    compileAndRun: async function (code) {
      // returns { stdout: string, stderr: string }
    }
  }

- C# adapter (csharp-backend.js):
  self.CSHARP_BACKEND = {
    // Receives a full C# program source (with a Main entry point). Must compile with
    // Roslyn, run under the .NET WebAssembly runtime, and return aggregated output.
    compileAndRun: async function (source) {
      // returns { stdout: string, stderr: string }
    }
  }

Suggested sources for adapters
- C: Browser builds of clang.wasm or tcc.wasm targeting WASI, bundled with a WASI runner.
- C#: .NET 8+ browser runtime (dotnet.js + dotnet.wasm) plus Roslyn assemblies; typically shipped with a small managed helper that performs compilation and invocation of Program.Main, exposing a JS-callable method.

Note on TCC builds
- This app expects a TCC-based WebAssembly bundle for C. Common bundles provide tcc.js and tcc.wasm under /public/vendor/c.
- Different TCC distributions may export different factories (default, Module, or TCC). The built-in adapter tries these shapes automatically.
- Ensure your bundle exposes a virtual FS with writeFile available, or adapt the adapter accordingly.

Important constraints enforced by the app
- Strictly client-side execution: All assets are served statically; no server execution.
- Strict timeouts: The host terminates the worker after a budget (default 2000 ms).
- No network access for user code: The workers override network APIs before executing user programs. Adapter network accesses are only allowed during their own initialization, not during user code execution.

Quick checklist
1) Copy your C adapter bundle into public/vendor/c and ensure it defines self.C_BACKEND.
2) Copy your C# adapter bundle into public/vendor/csharp and ensure it defines self.CSHARP_BACKEND.
3) Start the app (npm run dev). Open a C or C# exercise.
4) DevTools Network tab should show the worker loading /vendor/.../c[-sharp]-backend.js and any assets.
5) Click Run; your code should compile and execute client-side. If you see an error about missing toolchains, double check file paths and that your adapter sets the expected globals.

Troubleshooting
- Warmup says ready but Run errors with toolchain missing: Your adapter file was loaded but did not set the expected global. Ensure `self.C_BACKEND` or `self.CSHARP_BACKEND` is assigned.
- No stdout: Verify your WASI runner captures stdout/stderr (FD 1/2) and your adapter collects and returns them.
- Large assets: Enable TTP compression in production hosting; Vite dev server handles gzip automatically.
