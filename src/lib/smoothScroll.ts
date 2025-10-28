import Lenis from 'lenis'

let lenis: Lenis | null = null

export function initSmoothScroll() {
  if (typeof window === 'undefined') return
  if (lenis) return

  lenis = new Lenis({
    autoResize: true,
    autoRaf: true,
    lerp: 0.1,
    duration: 1.2,
    smoothWheel: true,
    syncTouch: true,
  })
}

export function destroySmoothScroll() {
  if (!lenis) return
  try { lenis.destroy() } catch {}
  lenis = null
}
