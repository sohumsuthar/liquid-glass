'use client'

import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'lg-glass-enabled'

/**
 * Toggles the liquid glass effects (backdrop-filter, tint, shine, grain)
 * across the site. When disabled, glass elements fall back to solid
 * dark cards with the same shape + shadow — much cheaper to render.
 * Desktop-only (mobile has its own perf optimizations already).
 */
export default function GlassToggle() {
  const [enabled, setEnabled] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const isEnabled = saved !== 'false'
      setEnabled(isEnabled)
      if (!isEnabled) document.documentElement.classList.add('glass-off')
    } catch {}
  }, [])

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev
      try {
        localStorage.setItem(STORAGE_KEY, String(next))
      } catch {}
      if (next) document.documentElement.classList.remove('glass-off')
      else document.documentElement.classList.add('glass-off')
      return next
    })
  }, [])

  if (!mounted) return null

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? 'Disable liquid glass' : 'Enable liquid glass'}
      title={enabled ? 'Disable glass' : 'Enable glass'}
      className="lg-glass-toggle"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {enabled ? (
          <>
            <rect x="4" y="5" width="16" height="14" rx="3" />
            <line x1="4" y1="10" x2="20" y2="10" opacity="0.5" />
          </>
        ) : (
          <>
            <rect x="4" y="5" width="16" height="14" rx="3" opacity="0.4" />
            <line x1="4" y1="4" x2="20" y2="20" opacity="0.7" />
          </>
        )}
      </svg>
      <span className="lg-glass-toggle-label">{enabled ? 'glass' : 'glass off'}</span>
    </button>
  )
}
