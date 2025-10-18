import React, { useEffect, useMemo, useRef, useState } from 'react'
import ConfirmDialog from './ConfirmDialog'

// Simple interpreter facade; now supports Python, C, and C# via web workers
import { createPythonRunner, createCRunner, createCSharpRunner, type Runner, type RunResult, type RunUpdate } from '../lib/interpreter'

export type CodeInterpreterProps = {
  language?: 'python' | 'c' | 'csharp'
  initialCode?: string
  timeoutMs?: number // strict timeout per run
  storageKey?: string // local autosave key
  onRunComplete?: (result: { output: string; error?: string | null; runCode: string }) => void
  maxLines?: number // -1 for unlimited
  maxStringLength?: number // -1 for unlimited
  rightPanel?: React.ReactNode // optional panel rendered to the right of the console
  prefixCode?: string // uneditable code prepended at run time
  suffixCode?: string // uneditable code appended at run time
}

const DEFAULT_PY_SNIPPET = `# Python 3 (client-side)
# Type your code here and click Run
print('Hello from Python!')
`

const DEFAULT_C_SNIPPET = `// C (via Paiza.io API)
// Type your code here and click Run
#include <stdio.h>
int main() {
  printf("Hello from C!\n");
  return 0;
}
`

const DEFAULT_CS_SNIPPET = `// C# (via Paiza.io API)
// Type your code here and click Run
using System;
public class Program {
  public static void Main() {
    Console.WriteLine("Hello from C#!");
  }
}
`

export default function CodeInterpreter({ language = 'python', initialCode, timeoutMs = 20000, storageKey, onRunComplete, maxLines = -1, maxStringLength = -1, rightPanel, prefixCode, suffixCode }: CodeInterpreterProps) {
  const [code, setCode] = useState(initialCode ?? (language === 'c' ? DEFAULT_C_SNIPPET : language === 'csharp' ? DEFAULT_CS_SNIPPET : DEFAULT_PY_SNIPPET))
  const [output, setOutput] = useState<string>('')
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const runnerRef = useRef<Runner | null>(null)
  const gutterRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const highlightPreRef = useRef<HTMLPreElement | null>(null)
  const [caretPos, setCaretPos] = useState<{ left: number; top: number; height: number; visible: boolean }>({ left: 8, top: 6, height: 0, visible: true })
  const [metrics, setMetrics] = useState<{ charWidth: number; lineHeight: number; paddingTop: number; paddingLeft: number; tabSize: number }>({ charWidth: 8, lineHeight: 21, paddingTop: 6, paddingLeft: 8, tabSize: 4 })
  const [smoothCaret, setSmoothCaret] = useState(false)
  const smoothTimerRef = useRef<number | null>(null)
  function enableSmoothCaretOnce(duration = 160) {
    setSmoothCaret(true)
    if (smoothTimerRef.current) window.clearTimeout(smoothTimerRef.current)
    smoothTimerRef.current = window.setTimeout(() => setSmoothCaret(false), duration)
  }

  const caretRafRef = useRef<number | null>(null)
  function scheduleCaretUpdate() {
    if (caretRafRef.current != null) cancelAnimationFrame(caretRafRef.current)
    caretRafRef.current = requestAnimationFrame(() => {
      updateCaretPosition()
      caretRafRef.current = null
    })
  }

  // rAF-based sync to keep overlay and gutter aligned with the textarea scroll
  const overlayRafRef = useRef<number | null>(null)
  function scheduleOverlaySync() {
    if (overlayRafRef.current != null) cancelAnimationFrame(overlayRafRef.current)
    overlayRafRef.current = requestAnimationFrame(() => {
      const t = editorRef.current
      if (t && highlightPreRef.current) {
        ;(highlightPreRef.current as HTMLElement).style.transform = `translateY(-${t.scrollTop}px)`
      }
      const g = gutterRef.current as unknown as HTMLElement | null
      if (g && t) g.scrollTop = t.scrollTop
      overlayRafRef.current = null
    })
  }

  // Create runner and eagerly warm up interpreter (no lazy load)
  useEffect(() => {
    let cancelled = false
    async function setup() {
      try {
        // Dispose previous runner if language changed
        if (runnerRef.current) { try { runnerRef.current.dispose() } catch {} }
        let runner: Runner
        if (language === 'c') runner = createCRunner()
        else if (language === 'csharp') runner = createCSharpRunner()
        else runner = createPythonRunner()
        runnerRef.current = runner
        // warm up the runtime immediately
        await runner.warmup()
        if (!cancelled) setStatus('ready')
      } catch (e: any) {
        console.error('[CodeInterpreter] failed to initialize interpreter', e)
        if (!cancelled) {
          setStatus('error')
          setError(e?.message ?? 'Failed to initialize interpreter')
        }
      }
    }
    setup()
    return () => {
      cancelled = true
      if (runnerRef.current) {
        runnerRef.current.dispose()
        runnerRef.current = null
      }
    }
  }, [language])

  // Load saved code for this storage key (if provided) or fall back to initialCode/default
  useEffect(() => {
    if (!storageKey) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved != null) {
        setCode(saved)
      } else if (initialCode != null) {
        setCode(initialCode)
      } else {
        setCode(language === 'c' ? DEFAULT_C_SNIPPET : language === 'csharp' ? DEFAULT_CS_SNIPPET : DEFAULT_PY_SNIPPET)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, language])

  // If no explicit initialCode and no storage, update default snippet when language changes
  useEffect(() => {
    if (initialCode != null) return
    if (!storageKey) {
      setCode(language === 'c' ? DEFAULT_C_SNIPPET : language === 'csharp' ? DEFAULT_CS_SNIPPET : DEFAULT_PY_SNIPPET)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, initialCode, storageKey])

  // Debounced autosave
  useEffect(() => {
    if (!storageKey) return
    const t = setTimeout(() => {
      try { localStorage.setItem(storageKey, code) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [code, storageKey])

  // Keep gutter and highlight scroll position in sync on mount and when code changes (ensures alignment after re-render)
  useEffect(() => {
    const g = gutterRef.current as unknown as HTMLElement | null
    const t = editorRef.current as HTMLTextAreaElement | null
    if (g && t) g.scrollTop = t.scrollTop
    if (t && highlightPreRef.current) {
      ;(highlightPreRef.current as HTMLElement).style.transform = `translateY(-${t.scrollTop}px)`
    }
  }, [code])

  const highlighted = useMemo(() => {
    const hi = (txt: string) => {
      if (!txt) return ''
      if (language === 'c') return highlightC(txt)
      if (language === 'csharp') return highlightCSharp(txt)
      return highlightPython(txt)
    }
    return hi(code)
  }, [language, code])

  const prefixText = typeof prefixCode === 'string' ? prefixCode! : ''
  const suffixText = typeof suffixCode === 'string' ? suffixCode! : ''
  const prefixHighlighted = useMemo(() => {
    if (!prefixText) return ''
    if (language === 'c') return highlightC(prefixText)
    if (language === 'csharp') return highlightCSharp(prefixText)
    return highlightPython(prefixText)
  }, [language, prefixText])
  const suffixHighlighted = useMemo(() => {
    if (!suffixText) return ''
    if (language === 'c') return highlightC(suffixText)
    if (language === 'csharp') return highlightCSharp(suffixText)
    return highlightPython(suffixText)
  }, [language, suffixText])

  // Line counts for gutter
  const countLines = (s: string) => s ? ((s.match(/\n/g)?.length ?? 0) + 1) : 0
  const middleLineCount = (code.match(/\n/g)?.length ?? 0) + 1
  const prefixLineCountRaw = countLines(prefixText)
  const prefixLineCount = prefixLineCountRaw > 0 ? prefixLineCountRaw - 1 : 0;

  // Measure character width, line height, and paddings for caret positioning
  useEffect(() => {
    function measure() {
      const pre = highlightPreRef.current as HTMLElement | null
      if (!pre) return
      const preStyle = getComputedStyle(pre)
      const lhPx = (() => {
        const lh = preStyle.lineHeight
        const fs = parseFloat(preStyle.fontSize) || 16
        const num = parseFloat(lh)
        if (isNaN(num)) return 1.5 * fs
        return num
      })()
      const overlay = pre.parentElement as HTMLElement | null
      const padTop = overlay ? parseFloat(getComputedStyle(overlay).paddingTop || '6') || 6 : 6
      const padLeft = overlay ? parseFloat(getComputedStyle(overlay).paddingLeft || '8') || 8 : 8
      // measure average monospace char width using 10 M's
      const span = document.createElement('span')
      span.textContent = 'MMMMMMMMMM'
      span.style.visibility = 'hidden'
      span.style.position = 'absolute'
      pre.appendChild(span)
      const w = span.getBoundingClientRect().width / 10
      pre.removeChild(span)
      // read tab-size from computed style if possible
      let tabSize = 4
      try {
        const ts = getComputedStyle(pre.parentElement as Element).tabSize as any
        if (ts) {
          const n = parseInt(String(ts), 10)
          if (!isNaN(n) && n > 0) tabSize = n
        }
      } catch {}
      setMetrics({ charWidth: w || 8, lineHeight: lhPx, paddingTop: padTop, paddingLeft: padLeft, tabSize })
      setCaretPos((c) => ({ ...c, height: lhPx }))
    }
    measure()
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  function updateCaretPosition() {
    const t = editorRef.current
    if (!t) return
    const pos = (t as any).selectionDirection === 'backward' ? t.selectionStart : t.selectionEnd
    const { start: ls } = getLineRange(code, pos, pos)
    // row = number of newlines before ls
    let row = 0
    for (let i = 0; i < ls; i++) if (code.charCodeAt(i) === 10) row++
    // compute column with tabs expanded
    let col = 0
    const tab = metrics.tabSize || 4
    for (let i = ls; i < pos; i++) {
      const ch = code[i]
      if (ch === '\t') col += tab - (col % tab)
      else col += 1
    }
    const scrollTop = t.scrollTop || 0
    const left = metrics.paddingLeft + col * metrics.charWidth
    const top = metrics.paddingTop + row * metrics.lineHeight - scrollTop
    setCaretPos((c) => ({ ...c, left, top }))
  }

  // Keep caret updated on code/selection/scroll changes
  useEffect(() => { scheduleCaretUpdate() }, [code])

  async function handleRun() {
    const runner = runnerRef.current
    if (!runner) return

    // Build final code with enforced prefix/suffix (uneditable regions)
    const runPrefix = typeof prefixCode === 'string' ? prefixCode! : ''
    const runSuffix = typeof suffixCode === 'string' ? suffixCode! : ''
    let middleForRun = code
    if (runPrefix && middleForRun.startsWith(runPrefix)) middleForRun = middleForRun.slice(runPrefix.length)
    if (runSuffix && middleForRun.endsWith(runSuffix)) middleForRun = middleForRun.slice(0, middleForRun.length - runSuffix.length)
    const runCode = runPrefix + middleForRun + runSuffix

    // Pre-run validation: enforce maxStringLength by scanning string literals (on the user-editable portion)
    if (maxStringLength != null && maxStringLength >= 0) {
      const tooLong = hasStringLiteralExceeding(middleForRun, maxStringLength)
      if (tooLong) {
        const msg = `String literal exceeds max length of ${maxStringLength} characters. Please shorten your strings.`
        setConsoleOpen(true)
        setStatus('ready')
        setOutput('')
        setError(msg)
        try { onRunComplete && onRunComplete({ output: '', error: msg, runCode }) } catch {}
        return
      }
    }

    // Do not open console until we have actual output
    // Ensure previous console is hidden when starting a new run
    setConsoleOpen(false)
    setStatus('running')
    setError(null)
    setOutput('')

    const { promise } = runner.run(runCode, { timeoutMs })

    let aggOutput = ''
    let errMsg: string | null = null
    try {
      for await (const update of toAsyncIterable(promise)) {
        if (update.type === 'stdout') {
          // Always open the console on first actual output; avoid stale state closures
          setConsoleOpen(true)
          aggOutput += update.data
          setOutput((prev) => prev + update.data)
        } else if (update.type === 'stderr') {
          setConsoleOpen(true)
          aggOutput += update.data
          setOutput((prev) => prev + update.data)
        } else if (update.type === 'error') {
          setConsoleOpen(true)
          errMsg = update.message
          setError(update.message)
        }
        // ignore other control messages here; final result handled after loop
      }
      setStatus('ready')
      try { onRunComplete && onRunComplete({ output: aggOutput, error: errMsg, runCode }) } catch {}
    } catch (e: any) {
      const em = e?.message ?? 'Execution failed'
      setStatus('error')
      setError(em)
      setConsoleOpen(true)
      try { onRunComplete && onRunComplete({ output: aggOutput, error: em, runCode }) } catch {}
    }
  }

  function applyEdit(newText: string, selStart: number, selEnd: number) {
    const el = editorRef.current
    if (el && typeof (el as any).setRangeText === 'function') {
      const fullLen = el.value.length
      try {
        el.setRangeText(newText, 0, fullLen, 'preserve')
      } catch {}
      setCode(el.value)
      // restore selection and sync overlay scroll on next frame
      requestAnimationFrame(() => {
        const t = editorRef.current
        if (!t) return
        try { t.focus({ preventScroll: true }) } catch {}
        try { t.setSelectionRange(selStart, selEnd) } catch {}
        if (highlightPreRef.current) {
          ;(highlightPreRef.current as HTMLElement).style.transform = `translateY(-${t.scrollTop}px)`
        }
      })
      return
    }
    // Fallback: update state directly (may not integrate with native undo)
    setCode(newText)
    setTimeout(() => {
      const t = editorRef.current
      if (t) {
        t.focus({ preventScroll: true })
        try { t.setSelectionRange(selStart, selEnd) } catch {}
        if (highlightPreRef.current) {
          ;(highlightPreRef.current as HTMLElement).style.transform = `translateY(-${t.scrollTop}px)`
        }
      }
    }, 0)
  }


  function getLineRange(text: string, a: number, b: number) {
    const startIdx = Math.min(a, b)
    const endIdx = Math.max(a, b)
    let start = text.lastIndexOf('\n', startIdx - 1)
    start = start === -1 ? 0 : start + 1
    let end = text.indexOf('\n', endIdx)
    if (end === -1) end = text.length
    return { start, end }
  }

  async function writeClipboard(text: string) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text)
        return
      }
    } catch {}
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    } catch {}
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget
    const key = e.key
    const isCtrl = e.ctrlKey || e.metaKey
    // default: no smoothing for caret during key-driven edits
    setSmoothCaret(false)

    // Enforce max lines: block Enter when at or over limit (no selection)
    if (key === 'Enter' && maxLines != null && maxLines >= 0) {
      const currentLines = (code.match(/\n/g)?.length ?? 0) + 1
      if (currentLines >= maxLines && el.selectionStart === el.selectionEnd) {
        e.preventDefault()
        return
      }
    }

    // Alt+Left/Right: select to start/end of line (start = first non-space/tab)
    if (e.altKey && !isCtrl && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const pos = (el as any).selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd
      const { start: ls, end: le } = getLineRange(code, pos, pos)
      let target = key === 'ArrowLeft' ? ls : le
      if (key === 'ArrowLeft') {
        let j = ls
        while (j < le && (code[j] === ' ' || code[j] === '\t')) j++
        target = j
      }
      e.preventDefault()
      const hasSel = el.selectionStart !== el.selectionEnd
      if (hasSel) {
        const anchor = key === 'ArrowLeft' ? el.selectionEnd : el.selectionStart
        el.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target))
      } else {
        const anchor = pos
        el.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target))
      }
      enableSmoothCaretOnce()
      return
    }

    // Custom Left/Right: move caret to logical start (first non-space) or end of line
    if (!isCtrl && e.altKey && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const pos = (el as any).selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd
      const { start: ls, end: le } = getLineRange(code, pos, pos)
      let target = pos
      if (key === 'ArrowLeft') {
        let j = ls
        while (j < le && (code[j] === ' ' || code[j] === '\t')) j++
        target = j
      } else {
        target = le
      }
      e.preventDefault()
      if (e.shiftKey) {
        const dir = (el as any).selectionDirection || 'forward'
        if (dir === 'backward') {
          try { el.setSelectionRange(target, el.selectionEnd, 'backward' as any) } catch { el.setSelectionRange(target, el.selectionEnd) }
        } else {
          try { el.setSelectionRange(el.selectionStart, target, 'forward' as any) } catch { el.setSelectionRange(el.selectionStart, target) }
        }
      } else {
        el.setSelectionRange(target, target)
      }
      return
    }

    // Tab inserts a tab character instead of moving focus
    if (key === 'Tab' && !e.shiftKey && !e.altKey && !isCtrl) {
      e.preventDefault()
      const start = el.selectionStart
      const end = el.selectionEnd
      const newText = code.slice(0, start) + '\t' + code.slice(end)
      applyEdit(newText, start + 1, start + 1)
      return
    }

    // Block Ctrl+S (save)
    if (isCtrl && key.toLowerCase() === 's') {
      e.preventDefault()
      return
    }

    // Cut whole line when no selection: Ctrl+X
    if (isCtrl && key.toLowerCase() === 'x' && el.selectionStart === el.selectionEnd) {
      e.preventDefault()
      const pos = el.selectionStart
      const { start: ls, end: le } = getLineRange(code, pos, pos)
      // Include trailing newline if exists, else include preceding newline
      let cutStart = ls
      let cutEnd = le
      const hasNL = le < code.length && code[le] === '\n'
      if (hasNL) cutEnd = le + 1
      else if (ls > 0) cutStart = ls - 1
      const lineText = code.slice(ls, le)
      // Ensure pasted line appears on a new line by including a leading newline
      writeClipboard('\n' + lineText)
      const newText = code.slice(0, cutStart) + code.slice(cutEnd)
      applyEdit(newText, cutStart, cutStart)
      return
    }

    // Copy whole line when no selection: Ctrl+C
    if (isCtrl && key.toLowerCase() === 'c' && el.selectionStart === el.selectionEnd) {
      e.preventDefault()
      const pos = el.selectionStart
      const { start: ls, end: le } = getLineRange(code, pos, pos)
      const lineText = code.slice(ls, le)
      // Ensure paste goes to a new line by copying with leading newline
      writeClipboard('\n' + lineText)
      return
    }

    // Alt+Up/Down: select previous/next scope (indentation or bracket)
    if (e.altKey && !isCtrl && (key === 'ArrowUp' || key === 'ArrowDown')) {
      e.preventDefault()
      const selStart = el.selectionStart
      const selEnd = el.selectionEnd
      const scopes = computeScopes(code)
      const caret = (el as any).selectionDirection === 'backward' ? selStart : selEnd
      const containing = scopes.filter(s => s.start <= caret && caret <= s.end).sort((a, b) => (a.end - a.start) - (b.end - b.start))

      if (containing.length === 0) return

      if (key === 'ArrowDown') {
        // Select innermost containing scope
        const target = containing[0]
        el.setSelectionRange(target.start, target.end)
        enableSmoothCaretOnce()
        return
      } else {
        // Expand to next outer scope
        const match = scopes.find(s => s.start === selStart && s.end === selEnd)
        if (match) {
          const idx = containing.findIndex(s => s.start === match.start && s.end === match.end)
          const target = containing[Math.min(idx + 1, containing.length - 1)]
          if (target && (target.start !== match.start || target.end !== match.end)) {
            el.setSelectionRange(target.start, target.end)
            enableSmoothCaretOnce()
          }
        } else {
          // If not currently matching any scope, select the outermost containing scope
          const target = containing[containing.length - 1]
          el.setSelectionRange(target.start, target.end)
          enableSmoothCaretOnce()
        }
        return
      }
    }

    // Keep overlay/gutter and caret in sync on the next frame after key press
    scheduleOverlaySync()
    scheduleCaretUpdate()
  }

  useEffect(() => {
    return () => {
      if (caretRafRef.current != null) cancelAnimationFrame(caretRafRef.current)
      if (overlayRafRef.current != null) cancelAnimationFrame(overlayRafRef.current)
    }
  }, [])

  return (
    <section className="mt-3 interpreter" aria-label="Code interpreter">
      <div className="interpreter-header">
        <div className="cluster">
          <button className="btn btn-primary" onClick={handleRun} disabled={status !== 'ready'}>Run</button>
          <button className="btn" onClick={() => setResetDialogOpen(true)} disabled={status === 'running'}>Reset</button>
        </div>
        {maxLines != null && maxLines >= 0 && (
          <div className="ml-auto text-muted" aria-live="polite">Lines left: {Math.max(0, maxLines - (code.split('\n').length))}</div>
        )}
      </div>

    {prefixText && (
        <div className="code-readonly" aria-label="Prefix code (read-only)">
          <pre className="code-readonly-pre" dangerouslySetInnerHTML={{ __html: prefixHighlighted }} />
        </div>
      )}

    <div className="code-editor-wrapper">
        <div className="code-gutter" ref={gutterRef as any} aria-hidden="true">
          <pre className="code-gutter-pre">{Array.from({ length: middleLineCount }, (_, i) => i + 1 + prefixLineCount).join('\n')}</pre>
        </div>
        <div className="code-editor-cell">
          <div className="code-highlight" aria-hidden="true">
            <pre
              className="code-highlight-pre"
              ref={highlightPreRef as any}
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          </div>
          <textarea
            className="input code-editor"
            ref={editorRef as any}
            value={code}
            style={{ paddingTop: metrics.paddingTop, paddingBottom: metrics.paddingTop }}
            onChange={(e) => {
              const val = e.target.value
              if (maxLines != null && maxLines >= 0) {
                const parts = val.split('\n')
                if (parts.length > maxLines) {
                  setCode(parts.slice(0, maxLines).join('\n'))
                  return
                }
              }
              setCode(val)
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={() => { scheduleOverlaySync(); scheduleCaretUpdate() }}
            onClick={() => { enableSmoothCaretOnce(); scheduleCaretUpdate() }}
            onInput={() => { setSmoothCaret(false); scheduleOverlaySync(); scheduleCaretUpdate() }}
            onFocus={() => setCaretPos((c) => ({ ...c, visible: true }))}
            onBlur={() => setCaretPos((c) => ({ ...c, visible: false }))}
            onScroll={(e) => { const t = e.target as HTMLTextAreaElement; const g = gutterRef.current as unknown as HTMLElement | null; if (g) g.scrollTop = t.scrollTop; if (highlightPreRef.current) (highlightPreRef.current as HTMLElement).style.transform = `translateY(-${t.scrollTop}px)`; setSmoothCaret(false); scheduleCaretUpdate() }}
            spellCheck={false}
            aria-label="Code editor"
          />
          <div
            className="code-caret"
            style={{ left: caretPos.left, top: caretPos.top, height: caretPos.height, display: caretPos.visible ? 'block' : 'none', transition: smoothCaret ? 'top 90ms ease-out, left 90ms ease-out' : 'none' }}
            aria-hidden="true"
          />
        </div>
      </div>

      {suffixText && (
        <div className="code-readonly" aria-label="Suffix code (read-only)">
          <pre className="code-readonly-pre" dangerouslySetInnerHTML={{ __html: suffixHighlighted }} />
        </div>
      )}

      {status === 'running' && !consoleOpen && !error && (!output || output.length === 0) && (
        <div className="interpreter-footer" aria-live="polite">
          <div className="interpreter-footer-row">
            <div className="loading" aria-label="Running">
              <div className="spinner" role="status" aria-hidden="false"></div>
            </div>
            {rightPanel ? (
              <aside className="interpreter-side-panel" aria-label="Result panel">
                {rightPanel}
              </aside>
            ) : null}
          </div>
        </div>
      )}

      {consoleOpen && (
        <div className="interpreter-footer" aria-live="polite">
          <div className="interpreter-footer-row">
            <div className="console">
              <div className="console-header">
                <strong>Output</strong>
                <button className="btn btn-ghost" onClick={() => setConsoleOpen(false)} aria-label="Close output">Close</button>
              </div>
              <div className="console-body">
                <pre className="console-pre">{error ? error : (output && output.length ? output : '[No output]')}</pre>
              </div>
            </div>
            {rightPanel ? (
              <aside className="interpreter-side-panel" aria-label="Result panel">
                {rightPanel}
              </aside>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={resetDialogOpen}
        title="Reset code?"
        message="This will replace your code with the starter code for this exercise. This action cannot be undone."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onCancel={() => setResetDialogOpen(false)}
        onConfirm={() => {
          const starter = initialCode ?? (language === 'c' ? DEFAULT_C_SNIPPET : language === 'csharp' ? DEFAULT_CS_SNIPPET : DEFAULT_PY_SNIPPET)
          setCode(starter)
          try { if (storageKey) localStorage.removeItem(storageKey) } catch {}
          setOutput('')
          setError(null)
          setConsoleOpen(false)
          setResetDialogOpen(false)
          try { (editorRef.current as any)?.focus?.({ preventScroll: true }) } catch {}
        }}
      />
    </section>
  )
}

// Helper: convert a promise-like that yields updates into async iterable
async function* toAsyncIterable(p: Promise<RunResult>): AsyncGenerator<RunUpdate, void, unknown> {
  const res = await p
  for (const u of res.updates) yield u
}

// Lightweight Python syntax highlighter -> returns HTML with token spans
function highlightPython(text: string): string {
  const keywords = new Set([
    'False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield'
  ])
  const builtins = new Set([
    'abs','all','any','ascii','bin','bool','bytearray','bytes','callable','chr','classmethod','compile','complex','dict','dir','divmod','enumerate','eval','exec','filter','float','format','frozenset','getattr','globals','hasattr','hash','help','hex','id','input','int','isinstance','issubclass','iter','len','list','locals','map','max','min','next','object','oct','open','ord','pow','print','property','range','repr','reversed','round','set','setattr','slice','sorted','staticmethod','str','sum','super','tuple','type','vars','zip'
  ])

  let i = 0
  const out: string[] = []
  function esc(s: string) { return s.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string)) }
  // Re-implement push to avoid formatting issues
  function pushTok(cls: string | null, s: string) { out.push(cls ? `<span class="tok-${cls}">` + esc(s) + '</span>' : esc(s)) }

  const n = text.length
  while (i < n) {
    const ch = text[i]

    // Comment
    if (ch === '#') {
      let j = i
      while (j < n && text[j] !== '\n') j++
      pushTok('comm', text.slice(i, j))
      i = j
      continue
    }

    // Triple-quoted strings
    if ((ch === '"' || ch === "'") && i + 2 < n && text[i+1] === ch && text[i+2] === ch) {
      const quote = ch + ch + ch
      let j = i + 3
      while (j < n && text.slice(j, j+3) !== quote) j++
      j = Math.min(n, j + (j < n ? 3 : 0))
      pushTok('str', text.slice(i, j))
      i = j
      continue
    }

    // Single/double quoted strings
    if (ch === '"' || ch === "'") {
      const q = ch
      let j = i + 1
      while (j < n) {
        const cj = text[j]
        if (cj === '\\') { j += 2; continue }
        if (cj === q) { j++; break }
        j++
      }
      pushTok('str', text.slice(i, j))
      i = j
      continue
    }

    // Number literal
    if (/[0-9]/.test(ch)) {
      let j = i
      while (j < n && /[0-9_]/.test(text[j])) j++
      if (j < n && text[j] === '.') { j++; while (j < n && /[0-9_]/.test(text[j])) j++ }
      pushTok('num', text.slice(i, j))
      i = j
      continue
    }

    // Identifier / keyword / builtin
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++
      const word = text.slice(i, j)
      if (keywords.has(word)) pushTok('kw', word)
      else if (builtins.has(word)) pushTok('builtin', word)
      else out.push(esc(word))
      i = j
      continue
    }

    // Operators and other single chars
    out.push(esc(ch))
    i++
  }

  return out.join('')
}

// Lightweight C-family syntax highlighter (C / C#)
function highlightCLike(text: string, extraKeywords: string[] = []): string {
  const baseKeywords = [
    'int','float','double','char','void','short','long','signed','unsigned','const','volatile','static','extern','struct','union','enum','typedef','sizeof','if','else','for','while','do','switch','case','default','break','continue','return','goto','include','define'
  ]
  const keywords = new Set([...baseKeywords, ...extraKeywords])
  const out: string[] = []
  let i = 0
  function esc(s: string) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string)) }
  function pushTok(cls: string | null, s: string) { out.push(cls ? `<span class="tok-${cls}">` + esc(s) + '</span>' : esc(s)) }
  const n = text.length
  while (i < n) {
    const ch = text[i]

    // Line comment //...
    if (ch === '/' && i + 1 < n && text[i+1] === '/') {
      let j = i
      while (j < n && text[j] !== '\n') j++
      pushTok('comm', text.slice(i, j))
      i = j
      continue
    }
    // Block comment /* ... */
    if (ch === '/' && i + 1 < n && text[i+1] === '*') {
      let j = i + 2
      while (j + 1 < n && !(text[j] === '*' && text[j+1] === '/')) j++
      j = Math.min(n, j + (j + 1 < n ? 2 : 0))
      pushTok('comm', text.slice(i, j))
      i = j
      continue
    }

    // String literal
    if (ch === '"' || ch === '\'') {
      const q = ch
      let j = i + 1
      while (j < n) {
        const cj = text[j]
        if (cj === '\\') { j += 2; continue }
        if (cj === q) { j++; break }
        j++
      }
      pushTok('str', text.slice(i, j))
      i = j
      continue
    }

    // Number
    if (/[0-9]/.test(ch)) {
      let j = i
      while (j < n && /[0-9xXa-fA-F_\.]/.test(text[j])) j++
      pushTok('num', text.slice(i, j))
      i = j
      continue
    }

    // Identifier / keyword
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < n && /[A-Za-z0-9_]/.test(text[j])) j++
      const word = text.slice(i, j)
      if (keywords.has(word)) pushTok('kw', word)
      else pushTok(null, word)
      i = j
      continue
    }

    // Other
    pushTok(null, ch)
    i++
  }
  return out.join('')
}

function highlightC(text: string): string {
  return highlightCLike(text)
}

function highlightCSharp(text: string): string {
  const csKeywords = [
    'using','namespace','class','struct','interface','public','private','protected','internal','static','readonly','sealed','new','override','virtual','abstract','partial','async','await','var','bool','byte','sbyte','short','ushort','int','uint','long','ulong','string','object','decimal','double','float','char','void','null','true','false','try','catch','finally','throw','lock','event','delegate','get','set','add','remove','switch','case','default','break','continue','return','if','else','for','foreach','while','do'
  ]
  return highlightCLike(text, csKeywords)
}

// Scope utilities for Alt+Up/Down selection
type Scope = { start: number; end: number; kind: 'bracket' | 'indent' }

function computeScopes(text: string): Scope[] {
  const scopes: Scope[] = []

  // Bracket scopes: (), [], {}
  const stack: { ch: string; idx: number }[] = []
  const openers = new Set(['(', '[', '{'])
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (openers.has(c)) {
      stack.push({ ch: c, idx: i })
    } else if (c === ')' || c === ']' || c === '}') {
      const want = pairs[c]
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].ch === want) {
          const open = stack[k].idx
          stack.splice(k, 1)
          const start = open + 1
          const end = i
          if (end >= start) scopes.push({ start, end, kind: 'bracket' })
          break
        }
      }
    }
  }

  // Indentation scopes (Python-style): lines ending with ':' whose following lines are indented more
  const lines = text.split('\n')
  let offset = 0
  const lineData: { start: number; end: number; indent: number; trimmed: string }[] = []
  for (const ln of lines) {
    const start = offset
    const end = start + ln.length
    let j = 0
    while (j < ln.length && (ln[j] === ' ' || ln[j] === '\t')) j++
    const indent = j
    const trimmed = ln.trim()
    lineData.push({ start, end, indent, trimmed })
    offset = end + 1 // skip the newline char
  }
  for (let i = 0; i < lineData.length - 1; i++) {
    const cur = lineData[i]
    const next = lineData[i + 1]
    if (!cur.trimmed.endsWith(':')) continue
    if (next.indent <= cur.indent) continue
    // Capture contiguous lines with indent greater than cur.indent
    let j = i + 1
    let last = j
    for (; j < lineData.length; j++) {
      const ld = lineData[j]
      // Stop when indentation goes back to or below the parent level
      if (ld.indent <= cur.indent && ld.trimmed.length > 0) break
      if (ld.indent > cur.indent || ld.trimmed.length === 0) last = j
      if (ld.indent <= cur.indent && ld.trimmed.length === 0) break
    }
    const start = lineData[i + 1].start
    const end = lineData[last].end
    if (end > start) scopes.push({ start, end, kind: 'indent' })
  }

  return scopes
}


// Utility: detect if any Python string literal exceeds a maximum length
function hasStringLiteralExceeding(text: string, limit: number): boolean {
  if (limit < 0) return false
  // Triple-quoted strings: ''' ... ''' or """ ... """
  const triple = /("""[\s\S]*?"""|'''[\s\S]*?''')/g
  let m: RegExpExecArray | null
  while ((m = triple.exec(text)) != null) {
    const raw = m[0]
    const inner = raw.slice(3, Math.max(3, raw.length - 3))
    if (inner.length > limit) return true
  }
  // Single or double-quoted strings with escapes
  const simple = /("(?:[^"\\]|\\[\s\S])*"|'(?:[^'\\]|\\[\s\S])*')/g
  while ((m = simple.exec(text)) != null) {
    const raw = m[0]
    const inner = raw.slice(1, Math.max(1, raw.length - 1))
    if (inner.length > limit) return true
  }
  return false
}
