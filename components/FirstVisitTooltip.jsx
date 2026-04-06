'use client'

import { useEffect, useState } from 'react'

const STORAGE_KEY = 'lg-tooltip-seen'

/**
 * One-time tooltip shown in the bottom-left on a user's first desktop
 * visit, pointing out the UI-adjustment controls. Auto-dismisses on
 * click, scroll, or after 8 seconds. Persisted in localStorage.
 */
export default function FirstVisitTooltip() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Skip on touch devices — no controls to point to
    if (window.matchMedia('(hover: none)').matches) return
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'seen') return
    } catch {}

    // Show after a brief delay so user sees the page first
    const showTimer = setTimeout(() => setVisible(true), 1200)
    const hideTimer = setTimeout(() => dismiss(), 9200)

    const dismiss = () => {
      setVisible(false)
      try {
        localStorage.setItem(STORAGE_KEY, 'seen')
      } catch {}
    }

    const onInteract = () => dismiss()
    window.addEventListener('scroll', onInteract, { once: true, passive: true })
    window.addEventListener('keydown', onInteract, { once: true })

    return () => {
      clearTimeout(showTimer)
      clearTimeout(hideTimer)
      window.removeEventListener('scroll', onInteract)
      window.removeEventListener('keydown', onInteract)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="lg-first-visit-tooltip"
      role="status"
      aria-live="polite"
      onClick={() => {
        setVisible(false)
        try { localStorage.setItem(STORAGE_KEY, 'seen') } catch {}
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <span>adjust UI to your preference here</span>
      <svg className="lg-first-visit-tooltip-arrow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
    </div>
  )
}
