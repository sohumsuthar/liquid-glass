'use client'

import { useEffect } from 'react'

/**
 * useLiquidGlassEffects - mounts 4 global effects for the Liquid Glass
 * system. Call once at your app root.
 *
 *   useLiquidGlassEffects()
 *
 * Or opt into individual effects:
 *   useLiquidGlassEffects({ cursor: true, spotlight: true, reveal: true, scroll: true })
 *
 * Effects:
 *  - cursor: writes --mx/--my CSS vars to closest .liquid-glass / .lg-nav-btn
 *            on mousemove. Toggles html.over-glass when over glass.
 *  - spotlight: updates --cx/--cy on :root for the sitewide spotlight.
 *  - reveal: IntersectionObserver adds data-reveal='in' to .liquid-glass
 *            elements as they scroll into view. Includes a rescue net that
 *            force-reveals anything left stuck when the observer is starved
 *            (throttled/backgrounded tabs, bfcache restores, headless renderers).
 *  - scroll: writes html.scrolled + --sv/--svmag for the macro squash effect.
 *            Pass scroll:false to stop the --sv/--svmag writes (the squash then
 *            collapses to identity — no visual squash, one fewer per-frame cost).
 *
 * All effects are desktop-only (hover: hover + pointer: fine).
 * Returns nothing.
 */
export function useLiquidGlassEffects(opts = {}) {
  const {
    cursor = true,
    spotlight = true,
    reveal = true,
    scroll = true,
    routeKey, // pass router.asPath to re-scan reveals on route change
  } = opts

  // Cursor + spotlight (share one mousemove listener)
  useEffect(() => {
    if (!cursor && !spotlight) return
    if (typeof window === 'undefined') return
    if (window.matchMedia('(hover: none)').matches) return

    const SELECTOR = '.liquid-glass, .lg-nav-btn, .lg-nav-link'
    const root = document.documentElement
    let rafId = null
    let lastEvent = null
    let wasOverGlass = false

    const flush = () => {
      rafId = null
      if (!lastEvent) return
      const e = lastEvent

      if (spotlight) {
        root.style.setProperty('--cx', `${e.clientX}px`)
        root.style.setProperty('--cy', `${e.clientY}px`)
      }

      if (cursor) {
        const closest = e.target.closest && e.target.closest(SELECTOR)
        if (closest) {
          const rect = closest.getBoundingClientRect()
          closest.style.setProperty('--mx', `${e.clientX - rect.left}px`)
          closest.style.setProperty('--my', `${e.clientY - rect.top}px`)
        }
        const overGlass = !!closest
        if (overGlass !== wasOverGlass) {
          root.classList.toggle('over-glass', overGlass)
          wasOverGlass = overGlass
        }
      }
    }

    const handler = (e) => {
      lastEvent = e
      if (rafId === null) rafId = requestAnimationFrame(flush)
    }

    document.addEventListener('mousemove', handler, { passive: true })
    return () => {
      document.removeEventListener('mousemove', handler)
      root.classList.remove('over-glass')
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [cursor, spotlight])

  // Scroll reveal (+ rescue net so a starved IntersectionObserver never
  // leaves content stuck invisible)
  useEffect(() => {
    if (!reveal) return
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(hover: none)').matches) {
      document
        .querySelectorAll('.liquid-glass')
        .forEach((el) => el.setAttribute('data-reveal', 'in'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-reveal', 'in')
            observer.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.08, rootMargin: '0px 0px -5% 0px' }
    )

    // --- Rescue net: reveal is an enhancement, never a gate. ---
    // data-reveal="" holds content at opacity 0 until an IO callback that can
    // be starved indefinitely (throttled/backgrounded tabs, bfcache restores,
    // headless/CDP renderers, buggy embedded webviews) — leaving the page
    // invisible. If anything well inside the viewport is still hidden after a
    // bounded window, reveal everything and stop gating for this page-view.
    // In a healthy browser IO fires within a frame, this finds nothing, and
    // below-fold scroll-reveal is untouched.
    const rescue = () => {
      const stuck = document.querySelectorAll('.liquid-glass[data-reveal=""]')
      if (!stuck.length) return
      const vh = window.innerHeight
      let rescued = 0
      stuck.forEach((el) => {
        const r = el.getBoundingClientRect()
        // "Well inside the viewport" — excludes elements only just entering at
        // the edges, so a normal IO callback racing this check is never misread
        // as a dead observer.
        if (r.top < vh * 0.85 && r.bottom > vh * 0.1) {
          el.setAttribute('data-reveal', 'in')
          rescued++
        }
      })
      if (rescued) {
        document
          .querySelectorAll('.liquid-glass[data-reveal=""]')
          .forEach((el) => el.setAttribute('data-reveal', 'in'))
        observer.disconnect()
      }
    }

    let rescueTimer = null
    let rafId = requestAnimationFrame(() => {
      document.querySelectorAll('.liquid-glass:not([data-reveal])').forEach((el) => {
        el.setAttribute('data-reveal', '')
        observer.observe(el)
      })
      rafId = null
      // Schedule the rescue only AFTER the elements are actually hidden — in a
      // throttled tab this rAF can run seconds late, and a timer started
      // alongside it would fire before anything is hidden, no-op, and leave the
      // page unguarded.
      rescueTimer = setTimeout(rescue, 1400)
    })

    // Tab restored from background/bfcache: IO may have been throttled the
    // whole time — re-check as soon as the user can actually see the page.
    const onVisible = () => {
      if (!document.hidden) rescue()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      clearTimeout(rescueTimer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
      observer.disconnect()
    }
  }, [reveal, routeKey])

  // Sticky nav + scroll velocity (macro squash)
  useEffect(() => {
    if (!scroll) return
    if (typeof window === 'undefined') return
    const root = document.documentElement
    const isTouch = window.matchMedia('(hover: none)').matches
    let ticking = false
    let lastY = window.scrollY
    let lastT = performance.now()
    let smoothedVel = 0
    let decayId = null

    const update = () => {
      ticking = false
      const y = window.scrollY

      if (y > 16) root.classList.add('scrolled')
      else root.classList.remove('scrolled')

      if (isTouch) return

      const t = performance.now()
      const dt = Math.max(t - lastT, 1)
      const raw = (y - lastY) / dt
      lastY = y
      lastT = t

      const target = Math.max(-1, Math.min(1, raw / 2))
      smoothedVel = smoothedVel * 0.75 + target * 0.25
      root.style.setProperty('--sv', smoothedVel.toFixed(3))
      root.style.setProperty('--svmag', Math.abs(smoothedVel).toFixed(3))

      if (decayId !== null) cancelAnimationFrame(decayId)
      const decay = () => {
        smoothedVel *= 0.85
        root.style.setProperty('--sv', smoothedVel.toFixed(3))
        root.style.setProperty('--svmag', Math.abs(smoothedVel).toFixed(3))
        if (Math.abs(smoothedVel) > 0.005) {
          decayId = requestAnimationFrame(decay)
        } else {
          root.style.setProperty('--sv', '0')
          root.style.setProperty('--svmag', '0')
          decayId = null
        }
      }
      decayId = requestAnimationFrame(decay)
    }

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update)
        ticking = true
      }
    }

    if (window.scrollY > 16) root.classList.add('scrolled')
    root.style.setProperty('--sv', '0')
    root.style.setProperty('--svmag', '0')

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      root.classList.remove('scrolled')
      if (decayId !== null) cancelAnimationFrame(decayId)
    }
  }, [scroll])
}

/**
 * Sitewide cursor spotlight - the fixed-position glow layer.
 * Render once near the root of your app.
 */
export function Spotlight() {
  return <div className="lg-spotlight" aria-hidden="true" />
}
