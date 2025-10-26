// Global button interaction sounds initializer
// Plays sounds for all native <button> elements on hover/press/release/exit.
// This module is side-effectful: importing it once will attach listeners.

import clickSrc from '../audio/button click.mp3'
import hoverSrc from '../audio/button hover.mp3'
import releaseSrc from '../audio/button release.mp3'
import exitSrc from '../audio/button exit.mp3'

let initialized = false

function createAudio(src: string): HTMLAudioElement {
  const a = new Audio(src)
  // Keep volume at a gentle level to avoid being jarring
  a.volume = 0.4
  return a
}

function play(audio: HTMLAudioElement) {
  try {
    // Restart from beginning for rapid replays
    audio.currentTime = 0
    const p = audio.play()
    // Ignore any play rejections (e.g., due to browser policies)
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch {}
}

export function initButtonSounds() {
  if (initialized) return
  initialized = true

  const click = createAudio(clickSrc)
  const hover = createAudio(hoverSrc)
  const release = createAudio(releaseSrc)
  const exit = createAudio(exitSrc)

  // Delegate to the document to catch dynamically added buttons as well
  function getInteractableButton(el: EventTarget | null): HTMLButtonElement | HTMLAnchorElement | null {
    const elem = el as Element | null
    let btn = elem && (elem as Element).closest ? (elem as Element).closest('button') as HTMLButtonElement | HTMLAnchorElement| null : null
    if (!btn) btn = elem && (elem as Element).closest ? (elem as Element).closest('a') as  HTMLAnchorElement | null : null
    if (!btn) return null
    // Treat as non-interactable if natively disabled (including via fieldset) or ARIA-disabled
    try {
      if (typeof (btn as any).matches === 'function') {
        if (btn.matches(':disabled')) return null
      }
    } catch {}
    const aria = btn.getAttribute('aria-disabled')
    if (aria && aria.toLowerCase().trim() === 'true') return null
    return btn
  }

  // Hover: mouseenter on any button, and focus via keyboard/tab
  document.addEventListener('mouseover', (e) => {
    const target = e.target as Element | null
    const btn = getInteractableButton(target)
    if (btn) {
      const relatedTarget = (e as MouseEvent).relatedTarget as Element | null
      // Only play hover sound if we're coming from outside the button
      if (!relatedTarget || !btn.contains(relatedTarget)) {
        play(hover)
      }
    }
  }, true)

  document.addEventListener('focusin', (e) => {
    const btn = getInteractableButton(e.target)
    if (btn) {
      play(hover)
    }
  })

  // Press: mousedown/touchstart
  document.addEventListener('mousedown', (e) => {
    if (getInteractableButton(e.target)) play(click)
  }, true)
  document.addEventListener('touchstart', (e) => {
    if (getInteractableButton(e.target)) play(click)
  }, { passive: true, capture: true })

  // Release: mouseup/touchend
  document.addEventListener('mouseup', (e) => {
    if (getInteractableButton(e.target)) play(release)
  }, true)
  document.addEventListener('touchend', (e) => {
    if (getInteractableButton(e.target)) play(release)
  }, { passive: true, capture: true })

  // Exit: mouseleave (approximated via mouseout from a button) and blur
  document.addEventListener('mouseout', (e) => {
    const target = e.target as Element | null
    if (!target) return
    const fromBtn = getInteractableButton(target)
    if (!fromBtn) return
    const related = (e as MouseEvent).relatedTarget as Element | null
    // Only play exit sound if we're leaving the button entirely (not moving to/from its children)
    if (!related || !fromBtn.contains(related)) {
      play(exit)
    }
  }, true)

  document.addEventListener('focusout', (e) => {
    const target = e.target as Element | null
    if (target && target.closest('button')) {
      play(exit)
    }
  })
}

// Auto-init on import to ensure behavior without extra wiring
initButtonSounds()
