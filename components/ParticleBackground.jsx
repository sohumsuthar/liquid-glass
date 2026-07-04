'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const STORAGE_KEY = 'lg-particles-enabled'

/**
 * Canvas particle network rendered behind content.
 * - Desktop only (skipped on hover:none / coarse pointer via canRun gate)
 * - Fixed to viewport, does NOT scroll with content
 * - Respects prefers-reduced-motion (canRun gate + internal restart guard)
 * - User can toggle via the bottom-left button; preference persists
 *
 * Perf notes:
 * - SoA (Structure of Arrays) typed-array layout for particle state (px, py,
 *   pvx, pvy, pr) — sequential memory access, no object dereferences.
 * - Link lines batched into 6 alpha buckets via pre-allocated Float64Arrays —
 *   one stroke() per bucket, zero per-frame allocation or .push() calls.
 * - Grab lines batched into 16 alpha-step buckets (pre-allocated) — replaces
 *   per-line strokeStyle + stroke() with batched draws.
 * - All stroke style strings pre-computed once at init (bucketStyles,
 *   grabAlphaStyles) — no toFixed() or string concat in the hot loop.
 * - Division replaced with multiply-by-inverse for distance comparisons
 *   (INV_LINK_DIST_SQ, INV_GRAB_DIST_SQ, INV_REPULSE_DIST).
 * - Mouse-inactive frames run a tighter update loop (no repulsion branch).
 * - All circle fills share one beginPath / arc / fill cycle.
 * - Resize is rAF-debounced — a drag-resize burst collapses into one reseed.
 * - Tab hidden → rAF cancelled.
 * - O(n²) neighbor check is fine below ~150 particles (we cap at 70).
 */
export default function ParticleBackground() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const [enabled, setEnabled] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [canRun, setCanRun] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (typeof window === 'undefined') return
    const hover = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setCanRun(hover.matches && !reduced.matches)
    update()
    hover.addEventListener('change', update)
    reduced.addEventListener('change', update)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved === 'false') {
        setEnabled(false)
        document.documentElement.classList.add('particles-off')
      }
    } catch {}
    return () => {
      hover.removeEventListener('change', update)
      reduced.removeEventListener('change', update)
    }
  }, [])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      if (next) document.documentElement.classList.remove('particles-off')
      else document.documentElement.classList.add('particles-off')
      return next
    })
  }, [])

  useEffect(() => {
    if (!mounted || !canRun || !enabled) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = 0
    let height = 0
    let running = true
    // Mouse state — -1 means "off-canvas / not active"
    let mouseX = -1
    let mouseY = -1

    // Poisson-disk-ish sampling: reject points that are within MIN_SPACING of
    // any already-placed particle. Prevents early clumping. ~8 retries before
    // accepting a random spot.
    const MIN_SPACING = 70
    const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(70, Math.floor((width * height) / 22000))
      seedSoA(count)
    }

    // SoA (Structure of Arrays) layout — x/y/vx/vy/r as flat typed arrays.
    // One contiguous memory region, sequential access patterns = better cache.
    const MAX_PARTICLES = 70
    const px = new Float64Array(MAX_PARTICLES)
    const py = new Float64Array(MAX_PARTICLES)
    const pvx = new Float64Array(MAX_PARTICLES)
    const pvy = new Float64Array(MAX_PARTICLES)
    const pr = new Float64Array(MAX_PARTICLES)
    let pCount = 0

    const LINK_DIST = 130
    const LINK_DIST_SQ = LINK_DIST * LINK_DIST
    const INV_LINK_DIST_SQ = 1 / LINK_DIST_SQ
    const GRAB_DIST = 180
    const GRAB_DIST_SQ = GRAB_DIST * GRAB_DIST
    const INV_GRAB_DIST_SQ = 1 / GRAB_DIST_SQ
    const REPULSE_DIST = 90
    const REPULSE_DIST_SQ = REPULSE_DIST * REPULSE_DIST
    const INV_REPULSE_DIST = 1 / REPULSE_DIST
    const REPULSE_STRENGTH = 0.35
    const BUCKETS = 6
    const TWO_PI = Math.PI * 2

    // Pre-allocate flat bucket storage — fixed-size Float64Arrays avoid
    // .push() overhead and GC churn entirely. Max pairs for 70 particles
    // is 70*69/2 = 2415; each segment needs 4 floats → 9660 per bucket.
    // Over-allocate slightly so we never need bounds checks.
    const BUCKET_CAP = 2500 * 4
    const bucketData = new Float64Array(BUCKETS * BUCKET_CAP)
    const bucketLen = new Uint32Array(BUCKETS)

    // Pre-compute per-bucket stroke styles (never changes)
    const bucketStyles = new Array(BUCKETS)
    for (let b = 0; b < BUCKETS; b++) {
      const alpha = ((b + 0.5) / BUCKETS) * 0.3
      bucketStyles[b] = `rgba(255,255,255,${alpha.toFixed(3)})`
    }

    // Pre-compute grab-line alpha LUT — 16 steps covers the visual range
    // and avoids per-line string concatenation + toFixed in the hot loop
    const GRAB_ALPHA_STEPS = 16
    const grabAlphaStyles = new Array(GRAB_ALPHA_STEPS)
    for (let i = 0; i < GRAB_ALPHA_STEPS; i++) {
      const alpha = ((i + 0.5) / GRAB_ALPHA_STEPS) * 0.5
      grabAlphaStyles[i] = `rgba(255,255,255,${alpha.toFixed(3)})`
    }

    // Pre-allocate grab-line storage outside draw loop (70 particles max)
    const GRAB_CAP = MAX_PARTICLES * 2 // 2 floats per grab line (target x, y)
    const grabData = new Float64Array(GRAB_ALPHA_STEPS * GRAB_CAP)
    const grabBucketLen = new Uint8Array(GRAB_ALPHA_STEPS)

    // Seed particles into SoA arrays
    const seedSoA = (count) => {
      pCount = count
      for (let i = 0; i < count; i++) {
        let x = 0
        let y = 0
        for (let attempt = 0; attempt < 8; attempt++) {
          x = Math.random() * width
          y = Math.random() * height
          let ok = true
          for (let j = 0; j < i; j++) {
            const dx = px[j] - x
            const dy = py[j] - y
            if (dx * dx + dy * dy < MIN_SPACING_SQ) {
              ok = false
              break
            }
          }
          if (ok) break
        }
        px[i] = x
        py[i] = y
        pvx[i] = (Math.random() - 0.5) * 0.44
        pvy[i] = (Math.random() - 0.5) * 0.44
        pr[i] = 1.1 + Math.random() * 1.4
      }
    }

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, width, height)
      const n = pCount

      // Update positions + wrap + gentle cursor repulsion
      const mouseActive = mouseX >= 0
      if (mouseActive) {
        const mx = mouseX
        const my = mouseY
        for (let i = 0; i < n; i++) {
          const dx = px[i] - mx
          const dy = py[i] - my
          const d2 = dx * dx + dy * dy
          if (d2 < REPULSE_DIST_SQ && d2 > 0.01) {
            // Compute once, reuse: invD avoids separate sqrt + two divisions
            // (dx/d and dy/d). d2*invD = d, so (1 - d*INV_REPULSE_DIST)
            // replaces the original (1 - d/REPULSE_DIST).
            const invD = 1 / Math.sqrt(d2)
            const force = (1 - d2 * invD * INV_REPULSE_DIST) * REPULSE_STRENGTH
            px[i] += dx * invD * force
            py[i] += dy * invD * force
          }
          px[i] += pvx[i]
          py[i] += pvy[i]
          if (px[i] < -10) px[i] = width + 10
          else if (px[i] > width + 10) px[i] = -10
          if (py[i] < -10) py[i] = height + 10
          else if (py[i] > height + 10) py[i] = -10
        }
      } else {
        // No mouse — skip repulsion entirely, tighter loop
        for (let i = 0; i < n; i++) {
          px[i] += pvx[i]
          py[i] += pvy[i]
          if (px[i] < -10) px[i] = width + 10
          else if (px[i] > width + 10) px[i] = -10
          if (py[i] < -10) py[i] = height + 10
          else if (py[i] > height + 10) py[i] = -10
        }
      }

      // Reset bucket lengths (no array clearing needed — we track length)
      for (let b = 0; b < BUCKETS; b++) bucketLen[b] = 0

      // Bucket line segments by alpha (quantized) for batched stroking
      for (let i = 0; i < n; i++) {
        const ax = px[i]
        const ay = py[i]
        for (let j = i + 1; j < n; j++) {
          const dx = ax - px[j]
          const dy = ay - py[j]
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_DIST_SQ) {
            const t = 1 - d2 * INV_LINK_DIST_SQ
            const bucket = (t * BUCKETS) | 0 // bitwise floor, always < BUCKETS since t < 1
            const bIdx = bucket < BUCKETS ? bucket : BUCKETS - 1
            const offset = bIdx * BUCKET_CAP + bucketLen[bIdx]
            bucketData[offset] = ax
            bucketData[offset + 1] = ay
            bucketData[offset + 2] = px[j]
            bucketData[offset + 3] = py[j]
            bucketLen[bIdx] += 4
          }
        }
      }

      // Stroke each bucket once
      ctx.lineWidth = 1
      for (let b = 0; b < BUCKETS; b++) {
        const len = bucketLen[b]
        if (len === 0) continue
        ctx.strokeStyle = bucketStyles[b]
        const base = b * BUCKET_CAP
        ctx.beginPath()
        for (let k = 0; k < len; k += 4) {
          ctx.moveTo(bucketData[base + k], bucketData[base + k + 1])
          ctx.lineTo(bucketData[base + k + 2], bucketData[base + k + 3])
        }
        ctx.stroke()
      }

      // Grab lines: bucket by alpha LUT to batch strokes instead of one per line
      if (mouseActive) {
        const mx = mouseX
        const my = mouseY
        // Reset grab bucket lengths
        for (let b = 0; b < GRAB_ALPHA_STEPS; b++) grabBucketLen[b] = 0

        for (let i = 0; i < n; i++) {
          const dx = px[i] - mx
          const dy = py[i] - my
          const d2 = dx * dx + dy * dy
          if (d2 < GRAB_DIST_SQ) {
            const t = 1 - d2 * INV_GRAB_DIST_SQ
            const bIdx = (t * GRAB_ALPHA_STEPS) | 0
            const idx = bIdx < GRAB_ALPHA_STEPS ? bIdx : GRAB_ALPHA_STEPS - 1
            const offset = idx * GRAB_CAP + grabBucketLen[idx]
            grabData[offset] = px[i]
            grabData[offset + 1] = py[i]
            grabBucketLen[idx] += 2
          }
        }

        for (let b = 0; b < GRAB_ALPHA_STEPS; b++) {
          const len = grabBucketLen[b]
          if (len === 0) continue
          ctx.strokeStyle = grabAlphaStyles[b]
          const base = b * GRAB_CAP
          ctx.beginPath()
          for (let k = 0; k < len; k += 2) {
            ctx.moveTo(mx, my)
            ctx.lineTo(grabData[base + k], grabData[base + k + 1])
          }
          ctx.stroke()
        }
      }

      // All circles in a single path — one fill call
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        ctx.moveTo(px[i] + pr[i], py[i])
        ctx.arc(px[i], py[i], pr[i], 0, TWO_PI)
      }
      ctx.fill()
      // Note: drawThrottled reschedules, not this function
    }

    // Respect prefers-reduced-motion: never run the animation loop (hoisted
    // above onVisibility so the tab-return restart honors it too).
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      } else if (!rafRef.current && !reduceMotion) {
        running = true
        rafRef.current = requestAnimationFrame(drawThrottled)
      }
    }

    // Frame-skip wrapper: redraw only every 2nd frame (≈30fps) to let
    // backdrop-filter cache one frame. Halves the recomputation cost
    // for all glass elements above the canvas — particles still move
    // at the same perceived speed (velocity doubles per update).
    let skipFrame = false
    const drawThrottled = () => {
      if (!running) return
      if (!skipFrame) draw()
      skipFrame = !skipFrame
      rafRef.current = requestAnimationFrame(drawThrottled)
    }

    const onMouseMove = (e) => {
      mouseX = e.clientX
      mouseY = e.clientY
    }
    const onMouseLeave = () => {
      mouseX = -1
      mouseY = -1
    }

    // Coalesce resize events to at most one reseed per frame. Each resize
    // reallocates the canvas backing store (width*height*dpr) AND re-runs the
    // O(n²) Poisson seeding — doing that for every event fired during a drag
    // resize is pure waste. A leading rAF debounce collapses a burst into one.
    let resizeRaf = null
    const onResize = () => {
      if (resizeRaf !== null) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null
        resize()
      })
    }

    resize()
    if (!reduceMotion) {
      rafRef.current = requestAnimationFrame(drawThrottled)
    }
    window.addEventListener('resize', onResize)
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseout', onMouseLeave)
    window.addEventListener('blur', onMouseLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      if (resizeRaf !== null) cancelAnimationFrame(resizeRaf)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseout', onMouseLeave)
      window.removeEventListener('blur', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mounted, canRun, enabled])

  if (!mounted || !canRun) return null

  return (
    <>
      {enabled && <canvas ref={canvasRef} aria-hidden="true" className="lg-particle-canvas" />}
      <button
        type="button"
        onClick={toggle}
        aria-label={enabled ? 'Disable background particles' : 'Enable background particles'}
        title={enabled ? 'Disable particles' : 'Enable particles'}
        className="lg-particle-toggle"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {enabled ? (
            <>
              <circle cx="5" cy="7" r="1.5" fill="currentColor" />
              <circle cx="19" cy="7" r="1.5" fill="currentColor" />
              <circle cx="12" cy="17" r="1.5" fill="currentColor" />
              <line x1="5" y1="7" x2="19" y2="7" />
              <line x1="5" y1="7" x2="12" y2="17" />
              <line x1="19" y1="7" x2="12" y2="17" />
            </>
          ) : (
            <>
              <circle cx="5" cy="7" r="1.5" fill="currentColor" opacity="0.4" />
              <circle cx="19" cy="7" r="1.5" fill="currentColor" opacity="0.4" />
              <circle cx="12" cy="17" r="1.5" fill="currentColor" opacity="0.4" />
              <line x1="4" y1="4" x2="20" y2="20" opacity="0.7" />
            </>
          )}
        </svg>
        <span className="lg-particle-toggle-label">{enabled ? 'particles' : 'particles off'}</span>
      </button>
    </>
  )
}
