# Precomputed

Precomputed is a lightweight, browser-based learning app for hands-on programming lessons. It blends short explanations with small, runnable code snippets and quick quizzes to help learners build intuition one step at a time.

What it offers
- Lessons as static JSON (no server required)
- Progress persistence via Supabase (optional) or localStorage fallback
- In-browser execution for Python (Pyodide)
- Network-backed execution for C and C# via the Paiza.io API

Note on privacy and external services
- Running C/C# code uses the Paiza.io public API (https://api.paiza.io). Do not send secrets or proprietary data.
- Availability and rate limits of the Paiza.io API are outside this project’s control. Python runs fully client-side and does not require network access.


Getting started
1) Prerequisites
- Node 18+ (20 LTS recommended)
- NPM (use `npm ci` for deterministic installs; package-lock.json is committed)

2) Install
- npm ci

3) Run in development
- npm run dev
- Open the URL printed by Vite (default http://localhost:5173)

4) Build for production
- npm run build
- Output is written to dist/

5) Preview a production build
- npm run preview


How lessons work
- Lessons live under public/lessons.
- public/lessons/manifest.json lists lessons with fields { id, title, file }.
- Each lesson JSON contains at least { "title": string, "content": LessonElement[] }.
- Supported content elements: text blocks, multiple-choice quizzes, and code quizzes.
- Code quiz fields: { language, prompt, starterCode, prefixCode?, suffixCode?, desiredOutput?, maxLines?, maxStringLength? }.
- desiredOutput strategies supported: none, exact, error, pointer, and text+tokens (see .junie/guidelines.md for details and examples).


Where progress is stored
- If configured, Supabase is used to persist progress across devices.
- If not configured, progress falls back to localStorage using keys userId and completedLessons.

Optional Supabase setup (for syncing progress)
- Create a .env or .env.local in the repo root with:
  - VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
  - VITE_SUPABASE_ANON_KEY=ey... (your anon key)
- Data model used by the app (suggested):
  create table if not exists lesson_progress (
    user_id uuid not null,
    lesson_id text not null,
    completed boolean not null default true,
    inserted_at timestamp with time zone default now(),
    primary key (user_id, lesson_id)
  );
  alter table lesson_progress enable row level security;
  create policy "read own" on lesson_progress for select using (auth.uid() = user_id);
  create policy "upsert own" on lesson_progress for insert with check (auth.uid() = user_id);
  create policy "delete own" on lesson_progress for delete using (auth.uid() = user_id);


Execution backends
- Python: runs client-side via Pyodide in a Web Worker.
- C and C#: run via the Paiza.io API. The app creates a runner session (api_key=guest, source_code, language, input), polls get_status until completed, then fetches get_details. Standard output and errors are surfaced in the UI. Timeouts are enforced client-side (default 20s).

CORS and proxying Paiza.io
- The Paiza.io API does not send CORS headers, so direct browser calls from http://localhost:5173 will be blocked by CORS.
- Development: Vite is configured to proxy "/__paiza" to https://api.paiza.io. No extra setup is needed; the app uses this path in dev automatically.
- Production: You must place a reverse proxy in front of the app that forwards "/__paiza" (or any path you choose) to https://api.paiza.io and adds appropriate CORS headers. Then set VITE_PAIZA_BASE_URL to that proxy base URL at build time.
  - Example: VITE_PAIZA_BASE_URL=https://your-proxy.example.com (the proxy should forward /runners/* to https://api.paiza.io/runners/*).

Limitations and cautions
- C/C# require network access and depend on the uptime/rate limits of the Paiza.io API.
- Avoid sending secrets or proprietary content in C/C# code.
- If a lesson requires stdin, the UI does not yet expose it; add an input field to the interpreter component and plumb it through if needed.


Project structure highlights
- Entry: src/main.tsx renders <App /> into #root.
- Interactive interpreter UI: src/components/CodeInterpreter.tsx
- Execution runner factories: src/lib/interpreter.ts
- Supabase client and progress logic: src/lib/supabaseClient.ts and src/lib/progress.ts
- Global styles: src/styles.css


Development notes
- The app uses Vite 5 + React 18 + TypeScript 5.
- HMR is enabled in dev.
- Prefer CSS classes over inline styles. Avoid window.confirm; use the provided ConfirmDialog component.


Testing
- Optional: A minimal PowerShell-based smoke test example for local verification (not required):
  - tests/smoke.ps1 outputs OK
  - scripts/run-tests.ps1 runs it and returns PASS on OK
- For real tests, consider adding Vitest + Testing Library and keeping tests deterministic. Mock fetch for code-execution paths to avoid network coupling.
