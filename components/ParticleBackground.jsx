'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const STORAGE_KEY = 'lg-particles-enabled'

/**
 * Canvas particle network rendered behind content.
 * - Desktop only (skipped on hover:none / coarse pointer)
 * - Fixed to viewport, does NOT scroll with content
 * - Respects prefers-reduced-motion
 * - User can toggle via the bottom-left button; preference persists
 *
 * Perf notes:
 * - Lines are batched by alpha bucket (6 buckets) - one stroke() per bucket
 *   instead of one per pair, ~40% draw-call reduction.
 * - All circle fills share one beginPath / arc / fill cycle.
 * - Tab hidden → rAF cancelled.
 * - O(n²) neighbor check is fine below ~150 particles (we cap at 70).
 */
export default function ParticleBackground() {
  const canvasRef = useRef(null)
  const rafRef = useRef(null)
  const particlesRef = useRef([])
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
    // Mouse state - -1 means "off-canvas / not active"
    let mouseX = -1
    let mouseY = -1

    // Poisson-disk-ish sampling: reject points that are within MIN_SPACING of
    // any already-placed particle. Prevents early clumping. ~8 retries before
    // accepting a random spot.
    const MIN_SPACING = 70
    const MIN_SPACING_SQ = MIN_SPACING * MIN_SPACING
    const seed = (count) => {
      const placed = []
      for (let i = 0; i < count; i++) {
        let x = 0
        let y = 0
        for (let attempt = 0; attempt < 8; attempt++) {
          x = Math.random() * width
          y = Math.random() * height
          let ok = true
          for (let j = 0; j < placed.length; j++) {
            const p = placed[j]
            const dx = p.x - x
            const dy = p.y - y
            if (dx * dx + dy * dy < MIN_SPACING_SQ) {
              ok = false
              break
            }
          }
          if (ok) break
        }
        placed.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 0.44,
          vy: (Math.random() - 0.5) * 0.44,
          r: 1.1 + Math.random() * 1.4,
        })
      }
      return placed
    }

    const resize = () => {
      width = window.innerWidth
      height = window.innerHeight
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const count = Math.min(70, Math.floor((width * height) / 22000))
      particlesRef.current = seed(count)
    }

    const LINK_DIST = 130
    const LINK_DIST_SQ = LINK_DIST * LINK_DIST
    const GRAB_DIST = 180
    const GRAB_DIST_SQ = GRAB_DIST * GRAB_DIST
    const REPULSE_DIST = 90
    const REPULSE_DIST_SQ = REPULSE_DIST * REPULSE_DIST
    const REPULSE_STRENGTH = 0.35
    const BUCKETS = 6
    // Pre-allocate bucket arrays once to avoid GC churn
    const bucketPaths = Array.from({ length: BUCKETS }, () => [])

    const draw = () => {
      if (!running) return
      ctx.clearRect(0, 0, width, height)
      const particles = particlesRef.current
      const n = particles.length

      // Update positions + wrap + gentle cursor repulsion
      const mouseActive = mouseX >= 0
      for (let i = 0; i < n; i++) {
        const p = particles[i]
        if (mouseActive) {
          const dx = p.x - mouseX
          const dy = p.y - mouseY
          const d2 = dx * dx + dy * dy
          if (d2 < REPULSE_DIST_SQ && d2 > 0.01) {
            const d = Math.sqrt(d2)
            const force = (1 - d / REPULSE_DIST) * REPULSE_STRENGTH
            p.x += (dx / d) * force
            p.y += (dy / d) * force
          }
        }
        p.x += p.vx
        p.y += p.vy
        if (p.x < -10) p.x = width + 10
        else if (p.x > width + 10) p.x = -10
        if (p.y < -10) p.y = height + 10
        else if (p.y > height + 10) p.y = -10
      }

      // Clear bucket arrays
      for (let b = 0; b < BUCKETS; b++) bucketPaths[b].length = 0

      // Bucket line segments by alpha (quantized) for batched stroking
      for (let i = 0; i < n; i++) {
        const a = particles[i]
        for (let j = i + 1; j < n; j++) {
          const b = particles[j]
          const dx = a.x - b.x
          const dy = a.y - b.y
          const d2 = dx * dx + dy * dy
          if (d2 < LINK_DIST_SQ) {
            const t = 1 - d2 / LINK_DIST_SQ
            const bucket = Math.min(BUCKETS - 1, Math.floor(t * BUCKETS))
            bucketPaths[bucket].push(a.x, a.y, b.x, b.y)
          }
        }
      }

      // Stroke each bucket once
      ctx.lineWidth = 1
      for (let b = 0; b < BUCKETS; b++) {
        const segs = bucketPaths[b]
        if (segs.length === 0) continue
        const bucketT = (b + 0.5) / BUCKETS
        const alpha = bucketT * 0.3
        ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
        ctx.beginPath()
        for (let k = 0; k < segs.length; k += 4) {
          ctx.moveTo(segs[k], segs[k + 1])
          ctx.lineTo(segs[k + 2], segs[k + 3])
        }
        ctx.stroke()
      }

      // Grab lines: connect cursor to nearby particles
      if (mouseActive) {
        ctx.lineWidth = 1
        for (let i = 0; i < n; i++) {
          const p = particles[i]
          const dx = p.x - mouseX
          const dy = p.y - mouseY
          const d2 = dx * dx + dy * dy
          if (d2 < GRAB_DIST_SQ) {
            const t = 1 - d2 / GRAB_DIST_SQ
            const alpha = t * 0.5
            ctx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(mouseX, mouseY)
            ctx.lineTo(p.x, p.y)
            ctx.stroke()
          }
        }
      }

      // All circles in a single path - one fill call
      ctx.fillStyle = 'rgba(255,255,255,0.5)'
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const p = particles[i]
        ctx.moveTo(p.x + p.r, p.y)
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      }
      ctx.fill()
      // Note: drawThrottled reschedules, not this function
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      } else if (!rafRef.current) {
        running = true
        rafRef.current = requestAnimationFrame(drawThrottled)
      }
    }

    // Frame-skip wrapper: redraw only every 2nd frame (≈30fps) to let
    // backdrop-filter cache one frame. Halves the recomputation cost
    // for all glass elements above the canvas - particles still move
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

    resize()
    rafRef.current = requestAnimationFrame(drawThrottled)
    window.addEventListener('resize', resize)
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseout', onMouseLeave)
    window.addEventListener('blur', onMouseLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      window.removeEventListener('resize', resize)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseout', onMouseLeave)
      window.removeEventListener('blur', onMouseLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [mounted, canRun, enabled])

  if (!mounted || !canRun) return null

  return (
    <>
      {enabled && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="lg-particle-canvas"
        />
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={enabled ? 'Disable background particles' : 'Enable background particles'}
        title={enabled ? 'Disable particles' : 'Enable particles'}
        className="lg-particle-toggle"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
