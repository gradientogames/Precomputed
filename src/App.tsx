import { useEffect, useMemo, useRef, useState } from 'react'
import { backendLabel, loadCompleted as loadProgress, setLessonCompleted } from './lib/progress'
import { hasSupabase } from './lib/supabaseClient'
import { type AuthUser, onAuthChange } from './lib/auth'
import { useRoute, navigate } from './lib/router'
import SignInPage from './pages/SignIn'
import AccountPage from './pages/Account'
import CodeInterpreter from './components/CodeInterpreter'
import PythonImg from './graphics/Python.png'
import CImg from './graphics/C.png'
import CSharpImg from './graphics/CSharp.png'

type LessonText = { type: 'text'; text: string }
type LessonMCOption = { id: string; text: string; correct?: boolean }
type LessonMCQ = { type: 'multiple-choice-quiz'; question: string; options: LessonMCOption[]; explanation?: string }

type DesiredOutput =
  | { type: 'none'; skippable?: boolean }
  | { type: 'exact'; value: string; skippable?: boolean }
  | { type: 'text'; value: string; skippable?: boolean }
  | { type: 'error'; skippable?: boolean }
  | { type: 'pointer'; skippable?: boolean } // detects a pointer-like hex address in output (e.g., 0x7ffe...)
  | { type: 'text+tokens'; text: string; sourceIncludes?: string[]; skippable?: boolean }

type LessonCodeQuiz = {
  type: 'code-quiz'
  language?: 'python' | 'c' | 'csharp'
  prompt: string
  starterCode?: string
  prefixCode?: string
  suffixCode?: string
  desiredOutput?: DesiredOutput
  maxLines?: number
  maxStringLength?: number
}

type LessonElement = LessonText | LessonMCQ | LessonCodeQuiz

type Lesson = {
  title: string
  content: LessonElement[]
}

function normalizeLesson(raw: any): Lesson {
  const title: string = (raw && typeof raw.title === 'string') ? raw.title : 'Untitled Lesson'
  const contentRaw = raw?.content
  let content: LessonElement[] = []
  if (Array.isArray(contentRaw)) {
    content = contentRaw as LessonElement[]
  } else if (typeof contentRaw === 'string') {
    content = [{ type: 'text', text: contentRaw }]
  } else if (contentRaw == null) {
    content = []
  }
  return { title, content }
}

function MCQElement({ element, onAnswered }: { element: LessonMCQ; onAnswered?: (correct: boolean) => void }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const correctId = useMemo(() => element.options.find(o => o.correct)?.id ?? null, [element])
  const isAnswered = selected != null

  function handleSelect(id: string) {
    if (locked) return
    setSelected(id)
    setLocked(true)
    try { onAnswered && onAnswered(id === correctId) } catch {}
  }

  return (
    <section className="quiz mcq mt-2">
      <p><strong>Quiz:</strong> {element.question}</p>
      <div className="choice-list" role="group" aria-label="Multiple choice options">
        {element.options.map(opt => {
          const isSelected = selected === opt.id
          const cls = 'btn choice-button' + (locked && isSelected ? (opt.id === correctId ? ' is-correct' : ' is-incorrect') : '')
          return (
            <button
              key={opt.id}
              type="button"
              className={cls}
              onClick={() => handleSelect(opt.id)}
              disabled={locked}
              aria-pressed={isSelected}
            >
              {opt.text}
            </button>
          )
        })}
      </div>
      {isAnswered && element.explanation && (
        <p className="mt-1">{element.explanation}</p>
      )}
    </section>
  )
}

function CodeQuizElement({ idx, element, lessonId, onSolved, onAttempted }: { idx: number; element: LessonCodeQuiz; lessonId: string | null; onSolved?: () => void; onAttempted?: () => void }) {
  const [attempted, setAttempted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const desired = element.desiredOutput
  const [expectedMsg, setExpectedMsg] = useState<string>('')

  function evalResult(rule: DesiredOutput, output: string, error: string | null | undefined, runCode: string): boolean {
    const norm = (s: string) => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
    switch (rule.type) {
      case 'none':
        return true
      case 'exact':
        return !error && norm(output) === norm(rule.value)
      case 'text': {
        const out = norm(output).trim()
        const val = norm(rule.value).trim()
        return !error && out === val
      }
      case 'error':
        return !!error
      case 'pointer':
        // detect 0x... hex pointer-like substring in output (stdout or stderr combined already)
        return /\b0x[0-9a-fA-F]+\b/.test(output)
      case 'text+tokens': {
        const textOk = norm(output).includes(norm(rule.text))
        const toks = rule.sourceIncludes ?? []
        const toksOk = toks.every(t => runCode.includes(t))
        return textOk && toksOk
      }
      default:
        return false
    }
  }

  function describeRule(rule: DesiredOutput): string {
    switch (rule.type) {
      case 'none': return 'No specific output required'
      case 'exact': return `${rule.value}`
      case 'text': return `${rule.value}`
      case 'error': return 'Program should produce an error'
      case 'pointer': return 'Output should include a pointer-like address (e.g., 0x... )'
      case 'text+tokens': return `Output should include "${rule.text}"` + (rule.sourceIncludes?.length ? ` and source must include: ${rule.sourceIncludes.join(', ')}` : '')
      default: return ''
    }
  }

  return (
    <section className="quiz code-quiz mt-2">
      <p>{element.prompt}</p>
      <CodeInterpreter
        language={element.language ?? 'python'}
        initialCode={element.starterCode}
        prefixCode={element.prefixCode}
        suffixCode={element.suffixCode}
        storageKey={`code-quiz:${lessonId ?? 'unknown'}:${idx}:${element.language ?? 'python'}`}
        maxLines={element.maxLines ?? -1}
        maxStringLength={element.maxStringLength ?? -1}
        onRunComplete={({ output, error, runCode }) => {
          setAttempted(true)
          try { onAttempted && onAttempted() } catch {}
          if (desired != null) {
            const ok = evalResult(desired as DesiredOutput, output, error ?? null, runCode)
            setIsCorrect(ok)
            setExpectedMsg(describeRule(desired as DesiredOutput))
            if (ok) { try { onSolved && onSolved() } catch {} }
          }
        }}
        rightPanel={
          (attempted && desired != null && (desired as DesiredOutput).type !== 'none') ? (
            isCorrect ? (
              <p className="text-success mt-1">Correct</p>
            ) : (
              <p className="text-danger mt-1">Incorrect. Expected: <code>{expectedMsg}</code></p>
            )
          ) : null
        }
      />
    </section>
  )
}

type LessonMeta = {
  id: string
  title: string
  file: string
}

type LanguageGroup = {
  id: string
  title: string
  lessons: LessonMeta[]
}

export default function App() {
  const [manifest, setManifest] = useState<LessonMeta[]>([])
  const [manifestLoading, setManifestLoading] = useState(true)
  const [manifestError, setManifestError] = useState<string | null>(null)

  const [currentId, setCurrentId] = useState<string | null>(null)

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [lessonError, setLessonError] = useState<string | null>(null)

  // Sequential element display state within a lesson
  const [visibleCount, setVisibleCount] = useState(0)
  const [mcqAnswered, setMcqAnswered] = useState<Set<number>>(new Set())
  const [codeSolved, setCodeSolved] = useState<Set<number>>(new Set())
  const [codeAttempted, setCodeAttempted] = useState<Set<number>>(new Set())
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const prevVisibleRef = useRef(0)
  const [finishSaving, setFinishSaving] = useState(false)

  const [completed, setCompleted] = useState<Set<string>>(new Set())

  // Auth state (Supabase)
  const [user, setUser] = useState<AuthUser>(null)
  const [route] = useRoute()
  const isLessonRoute = route.startsWith('lesson/')
  const routeLessonId = isLessonRoute ? route.slice('lesson/'.length) : null
  const isLangRoute = route.startsWith('lang/')
  const routeLangId = isLangRoute ? route.slice('lang/'.length) : null

  const [groups, setGroups] = useState<LanguageGroup[]>([])

  // Header visibility on scroll
  const headerRef = useRef<HTMLElement | null>(null)
  const [isHeaderFloating, setIsHeaderFloating] = useState(true)
  const [isHeaderVisible, setIsHeaderVisible] = useState(true)
  const [headerHeight, setHeaderHeight] = useState(0)

  // Sync selected lesson id from route
  useEffect(() => {
    setCurrentId(routeLessonId)
  }, [routeLessonId])

  // Whether lessons can be done (require sign-in when Supabase is enabled)
  const canDoLessons = !hasSupabase || !!user

  useEffect(() => {
    console.log('[App] route changed:', route)
  }, [route])

  useEffect(() => {
    console.log('[App] progress backend:', backendLabel())
  }, [])

  // Measure header height
  useEffect(() => {
    function measure() {
      const h = headerRef.current
      if (h) setHeaderHeight(h.getBoundingClientRect().height)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Show header at top and when scrolling up; hide on scroll down
  useEffect(() => {
    let lastY = window.scrollY || 0
    function onScroll() {
      const y = window.scrollY || 0
      const atTop = y <= 0
      const delta = y - lastY
      if (atTop) {
        // Always keep header floating; just ensure it is visible at top
        setIsHeaderFloating(true)
        setIsHeaderVisible(true)
      } else {
        setIsHeaderFloating(true)
        if (delta > 0 && y > 20) {
          setIsHeaderVisible(false)
        } else if (delta < 0) {
          setIsHeaderVisible(true)
        }
      }
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true } as any)
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Load completed set from backend (Supabase if configured) on mount
  useEffect(() => {
    let cancelled = false
    async function load() {
      console.log('[App] loading initial completed progress')
      try {
        const ids = await loadProgress()
        if (!cancelled) {
          console.log('[App] initial progress loaded:', ids.length, 'items')
          setCompleted(new Set(ids))
        }
      } catch (e) {
        console.warn('[App] failed to load initial progress:', e)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  // Refresh progress on global reset event
  useEffect(() => {
    function handleReset() {
      console.log('[App] progress-reset event received; reloading progress')
      ;(async () => {
        try {
          const ids = await loadProgress()
          setCompleted(new Set(ids))
        } catch (e) {
          console.warn('[App] failed to reload progress after reset:', e)
        }
      })()
    }
    window.addEventListener('progress-reset', handleReset as EventListener)
    return () => {
      window.removeEventListener('progress-reset', handleReset as EventListener)
    }
  }, [])

  // Subscribe to Supabase auth changes and refresh progress on user change
  useEffect(() => {
    if (!hasSupabase) return
    console.log('[App] subscribing to auth changes')
    const unsub = onAuthChange((u) => {
      console.log('[App] auth changed:', u ? { id: u.id, email: u.email } : null)
      setUser(u)
      // refresh progress when auth state changes
      ;(async () => {
        try {
          console.log('[App] reloading progress after auth change')
          const ids = await loadProgress()
          console.log('[App] progress reloaded:', ids.length)
          setCompleted(new Set(ids))
        } catch (e) {
          console.warn('[App] failed to reload progress after auth change:', e)
        }
      })()
    })
    return () => {
      console.log('[App] unsubscribing from auth changes')
      try { unsub && (unsub as any)() } catch {}
    }
  }, [])

  async function fetchJsonWithDetails(url: string): Promise<any> {
    const res = await fetch(url, { cache: 'no-store' })
    const ct = res.headers?.get('content-type') || ''
    const text = await res.text().catch(() => '')
    if (!res.ok) {
      const snippet = text ? text.slice(0, 200).replace(/\s+/g, ' ').trim() : ''
      const hint = ct.includes('html') || (snippet && snippet.startsWith('<')) ? 'Hint: Received HTML instead of JSON (possibly a 404 or dev server fallback).' : ''
      throw new Error(`Failed to fetch ${url}: HTTP ${res.status} ${res.statusText}. ${hint} Content-Type: ${ct || 'unknown'}. ${snippet ? `Body: ${snippet}` : ''}`)
    }
    try {
      return text ? JSON.parse(text) : {}
    } catch (err: any) {
      const snippet = text ? text.slice(0, 200).replace(/\s+/g, ' ').trim() : ''
      throw new Error(`Invalid JSON from ${url}: ${err?.message || String(err)}. Content-Type: ${ct || 'unknown'}. ${snippet ? `Body: ${snippet}` : ''}`)
    }
  }

  // Load manifest on mount (supports grouped-by-language schema and legacy flat array)
  useEffect(() => {
    let cancelled = false
    async function loadManifest() {
      console.log('[App] fetching lessons manifest')
      setManifestLoading(true)
      setManifestError(null)
      try {
        const base = (import.meta as any)?.env?.BASE_URL ?? '/'
        const raw = await fetchJsonWithDetails(`${base}lessons/manifest.json`)
        if (!cancelled) {
          let parsedGroups: LanguageGroup[] = []
          if (Array.isArray(raw)) {
            // Legacy format: flat array of lessons; default them to Python
            parsedGroups = [{ id: 'python', title: 'Python', lessons: raw as LessonMeta[] }]
          } else if (raw && Array.isArray((raw as any).languages)) {
            parsedGroups = (raw as any).languages as LanguageGroup[]
          } else if (raw && Array.isArray((raw as any).groups)) {
            parsedGroups = (raw as any).groups as LanguageGroup[]
          } else {
            parsedGroups = []
          }
          console.log('[App] manifest (groups) loaded with', parsedGroups.length, 'languages')
          setGroups(parsedGroups)
          // set active manifest based on current language route
          const active = routeLangId ? (parsedGroups.find(g => g.id === routeLangId)?.lessons ?? []) : []
          setManifest(active)
        }
      } catch (e: any) {
        console.error('[App] manifest load error:', e?.message || e)
        if (!cancelled) setManifestError(e?.message ?? 'Failed to load lessons')
      } finally {
        if (!cancelled) setManifestLoading(false)
        console.log('[App] manifest load finished')
      }
    }
    loadManifest()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update active manifest when language changes or groups are loaded
  useEffect(() => {
    if (!routeLangId) { setManifest([]); return }
    const g = groups.find(gr => gr.id === routeLangId)
    setManifest(g ? g.lessons : [])
  }, [groups, routeLangId])

  // Load selected lesson when currentId or manifest changes
  useEffect(() => {
    if (!currentId) return
    let meta = manifest.find((m) => m.id === currentId)
    if (!meta) {
      for (const g of groups) {
        const found = g.lessons.find(l => l.id === currentId)
        if (found) { meta = found; break }
      }
    }
    if (!meta) return

    let cancelled = false
    async function loadLesson() {
      console.log('[App] loading lesson', { id: currentId, file: meta?.file })
      setLessonLoading(true)
      setLessonError(null)
      try {
        const base = (import.meta as any)?.env?.BASE_URL ?? '/'
        const raw = await fetchJsonWithDetails(`${base}lessons/${meta?.file}`) as any
        const data = normalizeLesson(raw)
        if (!cancelled) {
          console.log('[App] lesson loaded:', { id: currentId, title: data.title })
          setLesson(data)
        }
      } catch (e: any) {
        console.error('[App] lesson load error:', e?.message || e)
        if (!cancelled) setLessonError(e?.message ?? 'Failed to load lesson')
      } finally {
        if (!cancelled) setLessonLoading(false)
        console.log('[App] lesson load finished', { id: currentId })
      }
    }
    loadLesson()
    return () => {
      cancelled = true
    }
  }, [currentId, manifest, groups])

  // Reset sequential view and gating states when a new lesson is loaded
  useEffect(() => {
    if (!lesson) {
      setVisibleCount(0)
      setMcqAnswered(new Set())
      setCodeSolved(new Set())
      itemRefs.current = []
      prevVisibleRef.current = 0
      return
    }
    const first = lesson.content && lesson.content.length > 0 ? 1 : 0
    setVisibleCount(first)
    setMcqAnswered(new Set())
    setCodeSolved(new Set())
    itemRefs.current = []
    prevVisibleRef.current = first
  }, [lesson])

  // Auto-scroll to newly revealed element
  useEffect(() => {
    if (!lesson) return
    if (visibleCount > prevVisibleRef.current) {
      const idx = visibleCount - 1
      const el = itemRefs.current[idx]
      if (el && typeof (el as any).scrollIntoView === 'function') {
        try { (el as any).scrollIntoView({ behavior: 'smooth', block: 'start' } as any) } catch { try { (el as any).scrollIntoView(true) } catch {} }
      }
    }
    prevVisibleRef.current = visibleCount
  }, [visibleCount, lesson])

  const total = manifest.length
  const completedCount = useMemo(() => {
    if (manifest.length === 0) return 0
    let c = 0
    for (const m of manifest) if (completed.has(m.id)) c++
    return c
  }, [manifest, completed])


  // Sequential progression helpers
  const indexMap = useMemo(() => {
    const map = new Map<string, number>()
    manifest.forEach((m, i) => map.set(m.id, i))
    return map
  }, [manifest])

  const nextAllowedIndex = useMemo(() => {
    let i = 0
    for (; i < manifest.length; i++) {
      if (!completed.has(manifest[i].id)) break
    }
    return i
  }, [manifest, completed])

  const currentIndex = currentId ? (indexMap.get(currentId) ?? -1) : -1
  const currentLocked = currentIndex > nextAllowedIndex

  // No auto-redirect when a locked lesson is selected; home shows locks and lesson page will just disallow completion.
  useEffect(() => {
    // Intentionally noop
  }, [currentLocked, nextAllowedIndex, manifest, currentIndex, currentId])

  async function finishLesson() {
    if (!currentId) return
    if (!canDoLessons) {
      if (hasSupabase) { navigate('signin'); return } else { navigate(''); return }
    }
    setFinishSaving(true)
    // optimistic update
    setCompleted((prev) => {
      const next = new Set(prev)
      next.add(currentId)
      return next
    })
    try {
      await setLessonCompleted(currentId, true)
    } catch (e) {
      // revert on failure
      setCompleted((prev) => {
        const next = new Set(prev)
        next.delete(currentId)
        return next
      })
      console.error('[App] Failed to persist progress on finish', e)
      setFinishSaving(false)
      return
    }
    setFinishSaving(false)
    const grp = groups.find(g => g.lessons.some(l => l.id === currentId))
    navigate(grp ? (`lang/${grp.id}` as any) : '')
  }

  return (
    <div className="container">
      <main className="content">
        <header
          ref={el => { headerRef.current = el as any }}
          className={'site-header' + (isHeaderFloating ? ' is-floating' : '') + (isHeaderFloating && !isHeaderVisible ? ' is-hidden' : '')}
        >
          <div className="header-bar">
            <button className="brand-button brand-title mb-2" onClick={() => navigate('' as any)} aria-label="Go to language selection">PRECOMPUTED</button>
            <div className="ml-auto cluster">
              <button className="btn" onClick={() => navigate('')}>Lessons</button>
              {!hasSupabase && (
                <small className="text-danger">Supabase not configured. Progress will be stored locally.</small>
              )}
              {/* Auth status is logged to console; avoid redundant UI text per guidelines */}
              {hasSupabase && (
                user ? (
                  <button className="btn btn-secondary" onClick={() => navigate('account')}>Account</button>
                ) : (
                  <button className="btn btn-primary" onClick={() => navigate('signin')}>Sign in</button>
                )
              )}
            </div>
          </div>
        </header>
        <div className="header-spacer" style={{ height: headerHeight }} />

        {route === 'signin' && <SignInPage />}
        {route === 'account' && <AccountPage />}
        {route === '' && (
          <section className="language-menu">
            {hasSupabase && !canDoLessons && (
              <p className="text-muted mt-2">Sign in to choose a language and start lessons.</p>
            )}
            <div className="language-grid">
              <button
                className="btn lang-card"
                onClick={() => navigate('lang/python' as any)}
                disabled={!canDoLessons}
                aria-disabled={!canDoLessons}
                title={!canDoLessons ? 'Sign in to select a language' : undefined}
              >
                <img src={PythonImg} alt="Python" className="lang-icon" />
                <div className="lang-title">Python</div>
                <div className="lang-difficulty diff-baby">Little Baby</div>
                <div className="lang-subtitle">Don't even bother unless learning this is mandatory.</div>
              </button>
              <button
                className="btn lang-card"
                onClick={() => navigate('lang/csharp' as any)}
                disabled={!canDoLessons}
                aria-disabled={!canDoLessons}
                title={!canDoLessons ? 'Sign in to select a language' : undefined}
              >
                <img src={CSharpImg} alt="C#" className="lang-icon" />
                <div className="lang-title">C#</div>
                <div className="lang-difficulty diff-easy">Easy</div>
                <div className="lang-subtitle">Learn programming for any software, like games!</div>
              </button>
              <button
                className="btn lang-card"
                onClick={() => navigate('lang/c' as any)}
                disabled={!canDoLessons}
                aria-disabled={!canDoLessons}
                title={!canDoLessons ? 'Sign in to select a language' : undefined}
              >
                <img src={CImg} alt="C" className="lang-icon" />
                <div className="lang-title">C</div>
                <div className="lang-difficulty diff-moderate">Moderate</div>
                <div className="lang-subtitle">Designed to teach computer science and programming.</div>
              </button>
            </div>
          </section>
        )}

        {isLangRoute && (
          <section>
            <h2 className="mt-3">{(groups.find(g => g.id === routeLangId)?.title) ?? 'Lessons'}</h2>
            <p className="text-muted">Progress: {completedCount}/{total}</p>
            {manifestLoading && <p>Loading lessons…</p>}
            {manifestError && <p className="error">Error: {manifestError}</p>}
            {!manifestLoading && !manifestError && (
              <ul className="nav-list">
                {manifest.map((m, i) => {
                  const locked = i > nextAllowedIndex || !canDoLessons
                  return (
                    <li key={m.id} className="nav-item">
                      <button
                        onClick={() => { console.log('[App] open lesson', m.id); navigate(`lesson/${m.id}` as any) }}
                        className="nav-button"
                        disabled={locked}
                        aria-disabled={locked}
                        title={locked ? (!canDoLessons ? 'Sign in to access lessons' : 'Complete previous lessons to unlock') : undefined}
                      >
                        <strong>{m.title}</strong> {locked && <span className="text-muted">- Locked</span>}
                        {!locked && completed.has(m.id) && <span className="text-muted"> - Completed</span>}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {hasSupabase && !canDoLessons && (
              <p className="text-muted mt-2">Sign in to access and complete lessons.</p>
            )}
          </section>
        )}

        {isLessonRoute && (
          <>
            {(lessonLoading && !lesson) && <p>Loading lesson…</p>}
            {lessonError && <p className="error">Error: {lessonError}</p>}
            {!lessonLoading && !lessonError && lesson && (
              <article className="lesson">
                <h2>{lesson.title}</h2>
                <section className="lesson-content">
                  {(lesson.content.slice(0, visibleCount)).map((el, idx) => {
                    let child: JSX.Element | null = null
                    if (el.type === 'text') {
                      child = <p dangerouslySetInnerHTML={{ __html: renderLessonMarkdown((el as LessonText).text) }} />
                    } else if (el.type === 'multiple-choice-quiz') {
                      child = <MCQElement element={el as LessonMCQ} onAnswered={() => setMcqAnswered(prev => { const s = new Set(prev); s.add(idx); return s })} />
                    } else if (el.type === 'code-quiz') {
                      const cq = el as LessonCodeQuiz
                      child = (
                        <CodeQuizElement
                          idx={idx}
                          element={cq}
                          lessonId={currentId}
                          onSolved={() => setCodeSolved(prev => { const s = new Set(prev); s.add(idx); return s })}
                          onAttempted={() => setCodeAttempted(prev => { const s = new Set(prev); s.add(idx); return s })}
                        />
                      )
                    }
                    return (
                      <div key={idx} ref={el2 => { itemRefs.current[idx] = el2 }} className="lesson-el fade-in">
                        {child}
                      </div>
                    )
                  })}
                </section>
                {(() => {
                  const lastIdx = visibleCount - 1
                  const len = lesson.content.length
                  if (visibleCount >= len) {
                    // Gate Finish when the final element is a code quiz that requires a specific output
                    const finalIdx = len - 1
                    const finalEl = lesson.content[finalIdx] as LessonElement | undefined
                    let canFinish = true
                    if (finalEl && finalEl.type === 'code-quiz') {
                      const cq = finalEl as LessonCodeQuiz
                      const d = cq.desiredOutput as any
                      if (d && d.type !== 'none') {
                        canFinish = d.skippable ? codeAttempted.has(finalIdx) : codeSolved.has(finalIdx)
                      } else {
                        canFinish = true
                      }
                    }
                    return canFinish ? (
                      <div className="mt-2">
                        <button className="btn btn-primary" onClick={finishLesson} disabled={finishSaving}>{finishSaving ? 'Finishing…' : 'Finish'}</button>
                      </div>
                    ) : null
                  }
                  const lastEl = lesson.content[lastIdx] as LessonElement | undefined
                  let allow = true
                  if (lastEl) {
                    if (lastEl.type === 'multiple-choice-quiz') {
                      allow = mcqAnswered.has(lastIdx)
                    } else if (lastEl.type === 'code-quiz') {
                      const cq = lastEl as LessonCodeQuiz
                      const d = cq.desiredOutput as any
                      if (d && d.type !== 'none') {
                        allow = d.skippable ? codeAttempted.has(lastIdx) : codeSolved.has(lastIdx)
                      } else {
                        allow = true
                      }
                    }
                  }
                  return allow ? (
                    <div className="mt-2">
                      <button className="btn btn-primary" onClick={() => setVisibleCount(c => Math.min(len, c + 1))}>Continue</button>
                    </div>
                  ) : null
                })()}

              </article>
            )}
          </>
        )}

        <footer className="mt-4"></footer>
      </main>
    </div>
  )
}


// Minimal markdown renderer for lesson text: supports inline code (`code`) and italics (*text*), with HTML escaping
function renderLessonMarkdown(input: string): string {
  if (typeof input !== 'string' || input.length === 0) return ''
  const escape = (s: string) => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Split into segments preserving inline code spans delimited by backticks
  const segments = input.split(/(`[^`]*`)/g)
  const out = segments.map(seg => {
    if (seg.startsWith('`') && seg.endsWith('`')) {
      const inner = seg.slice(1, -1)
      return '<code>' + escape(inner) + '</code>'
    } else {
      // Escape then convert italics outside code spans
      let s = escape(seg)
      // Convert *text* to <em>text</em>; avoid crossing newlines
      s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      return s
    }
  })
  return out.join('')
}
