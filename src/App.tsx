import { useEffect, useMemo, useRef, useState } from 'react'
import { backendLabel, loadCompleted as loadProgress, setLessonCompleted } from './lib/progress'
import { hasSupabase } from './lib/supabaseClient'
import { type AuthUser, onAuthChange } from './lib/auth'
import { useRoute, navigate } from './lib/router'
import SignInPage from './pages/SignIn'
import AccountPage from './pages/Account'
import CodeInterpreter from './components/CodeInterpreter'

type LessonText = { type: 'text'; text: string }
type LessonMCOption = { id: string; text: string; correct?: boolean }
type LessonMCQ = { type: 'multiple-choice-quiz'; question: string; options: LessonMCOption[]; explanation?: string }
type LessonCodeQuiz = { type: 'code-quiz'; language?: 'python' | 'c' | 'csharp'; prompt: string; starterCode?: string; desiredOutput?: string; maxLines?: number; maxStringLength?: number }
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

function CodeQuizElement({ idx, element, lessonId, onSolved }: { idx: number; element: LessonCodeQuiz; lessonId: string | null; onSolved?: () => void }) {
  const [attempted, setAttempted] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const desired = element.desiredOutput

  return (
    <section className="quiz code-quiz mt-2">
      <p><strong>Code challenge:</strong> {element.prompt}</p>
      <CodeInterpreter
        language={element.language ?? 'python'}
        initialCode={element.starterCode}
        storageKey={`code-quiz:${lessonId ?? 'unknown'}:${idx}:${element.language ?? 'python'}`}
        maxLines={element.maxLines ?? -1}
        maxStringLength={element.maxStringLength ?? -1}
        onRunComplete={({ output, error }) => {
          setAttempted(true)
          if (desired != null) {
            const norm = (s: string) => (s ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()
            const ok = !error && norm(output) === norm(desired)
            setIsCorrect(ok)
            if (ok) { try { onSolved && onSolved() } catch {} }
          }
        }}
        rightPanel={
          attempted && desired != null ? (
            isCorrect ? (
              <p className="text-success mt-1">Correct</p>
            ) : (
              <p className="text-danger mt-1">Incorrect. Expected output: <code>{desired}</code></p>
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
  const itemRefs = useRef<(HTMLDivElement | null)[]>([])
  const prevVisibleRef = useRef(0)
  const [finishSaving, setFinishSaving] = useState(false)

  const [completed, setCompleted] = useState<Set<string>>(new Set())

  // Auth state (Supabase)
  const [user, setUser] = useState<AuthUser>(null)
  const [route] = useRoute()
  const isLessonRoute = route.startsWith('lesson/')
  const routeLessonId = isLessonRoute ? route.slice('lesson/'.length) : null

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

  // Load manifest on mount
  useEffect(() => {
    let cancelled = false
    async function loadManifest() {
      console.log('[App] fetching lessons manifest')
      setManifestLoading(true)
      setManifestError(null)
      try {
        const res = await fetch('/lessons/manifest.json', { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as LessonMeta[]
        if (!cancelled) {
          console.log('[App] manifest loaded with', data.length, 'items')
          setManifest(data)
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

  // Load selected lesson when currentId or manifest changes
  useEffect(() => {
    if (!currentId) return
    const meta = manifest.find((m) => m.id === currentId)
    if (!meta) return

    let cancelled = false
    async function loadLesson() {
      console.log('[App] loading lesson', { id: currentId, file: meta?.file })
      setLessonLoading(true)
      setLessonError(null)
      try {
        const res = await fetch(`/lessons/${meta?.file}`, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const raw = (await res.json()) as any
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
  }, [currentId, manifest])

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
    navigate('')
  }

  return (
    <div className="container">
      <main className="content">
        <header>
          <div className="header-bar">
            <h1 className="mb-2">Coding Lessons</h1>
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

        {route === 'signin' && <SignInPage />}
        {route === 'account' && <AccountPage />}
        {route === '' && (
          <section>
            <h2 className="mt-3">Lessons</h2>
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
                      canFinish = cq.desiredOutput ? codeSolved.has(finalIdx) : true
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
                      allow = cq.desiredOutput ? codeSolved.has(lastIdx) : true
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
