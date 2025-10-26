import Lenis from 'lenis'

let lenis: Lenis | null = null

export function initSmoothScroll() {
  if (typeof window === 'undefined') return
  if (lenis) return

  lenis = new Lenis({
    // Lower lerp = more smoothing; higher = snappier
    lerp: 0.1,
    duration: 1.2,
    smoothWheel: true,
    syncTouch: true,
  })

  function raf(time: number) {
    lenis?.raf(time)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
}

export function destroySmoothScroll() {
  if (!lenis) return
  try { lenis.destroy() } catch {}
  lenis = null
}

export function resizeSmoothScroll() {
  if (!lenis) return
  lenis.resize()
}