'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'lg-fps-guard-disabled'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Adaptive performance guard. One requestAnimationFrame samples frame cadence
 * over a fixed ring buffer (O(1) push + O(1) window read, zero per-frame
 * allocation); if a rolling 20-frame average stays below 24fps for ~4s
 * sustained, it gracefully strips liquid glass + particles and shows a
 * notification.
 *
 * - 6s warmup (ignores load/hydration thrash); bounded to a 12s settle window
 * - Recovers from transient GC dips (lowCount decays on good frames)
 * - Persists its own 7-day-expiry key so repeat visits don't re-lag, but NEVER
 *   writes the user-preference keys (lg-glass-enabled / lg-particles-enabled) —
 *   one janky session must not permanently strip glass or mask the retest.
 * - Skips entirely if the user disabled glass manually
 */
export default function FPSGuard() {
  const [notification, setNotification] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // If user already toggled glass off, or FPS guard already ran → skip.
    // Check the stored preference too (not just the class) — GlassToggle
    // mounts async, so the class may not be applied yet when we run.
    const root = document.documentElement
    if (root.classList.contains('glass-off')) return
    try {
      if (localStorage.getItem('lg-glass-enabled') === 'false') return
    } catch {}
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'true') {
        // Previously flagged as low-perf — re-test every 7 days
        const flaggedAt = localStorage.getItem(STORAGE_KEY + '-time')
        if (flaggedAt && Date.now() - Number(flaggedAt) < WEEK_MS) {
          root.classList.add('glass-off')
          root.classList.add('particles-off')
          return
        }
        localStorage.removeItem(STORAGE_KEY) // expired — re-measure
      }
    } catch {}

    const SAMPLE_SIZE = 20
    const THRESHOLD = 24 // fps cutoff (only truly struggling devices)
    const WARMUP_MS = 6000
    const SUSTAINED = 80 // ~4s sustained sub-24 → strip glass
    const MAX_MEASURE_MS = 12000

    const ring = new Float64Array(SAMPLE_SIZE) // fixed ring buffer of frame timestamps
    let head = 0
    let count = 0
    let lowCount = 0
    let startTime = null
    let settled = false
    let rafId = null

    const measure = (timestamp) => {
      if (startTime === null) startTime = timestamp
      if (!settled && timestamp - startTime < WARMUP_MS) {
        rafId = requestAnimationFrame(measure)
        return
      }
      settled = true
      // Bounded: once healthy perf is observed through the settle window, stop
      // the rAF for good rather than keep the main thread awake all session.
      if (timestamp - startTime > WARMUP_MS + MAX_MEASURE_MS) return

      if (count >= SAMPLE_SIZE) {
        const windowStart = ring[head] // oldest sample = SAMPLE_SIZE frames ago
        const avgFps = (SAMPLE_SIZE * 1000) / (timestamp - windowStart)

        if (avgFps < THRESHOLD) lowCount++
        else lowCount = Math.max(0, lowCount - 3) // recover fast from transient dips

        if (lowCount >= SUSTAINED) {
          root.classList.add('glass-off')
          root.classList.add('particles-off')
          try {
            // Guard's own expiring key only — never the user-preference keys.
            localStorage.setItem(STORAGE_KEY, 'true')
            localStorage.setItem(STORAGE_KEY + '-time', String(Date.now()))
          } catch {}
          setNotification(true)
          return // stop measuring
        }
      }

      ring[head] = timestamp
      head = (head + 1) % SAMPLE_SIZE
      if (count < SAMPLE_SIZE) count++
      rafId = requestAnimationFrame(measure)
    }

    rafId = requestAnimationFrame(measure)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])

  if (!notification) return null

  return (
    <div
      className="lg-fps-notification"
      role="alert"
      onClick={() => setNotification(false)}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <span>glass effects removed to prevent lag on your device</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setNotification(false)
        }}
        aria-label="Dismiss"
        className="lg-fps-notification-close"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
