'use client'

import { useEffect, useState } from 'react'

/**
 * Classic terminal convention: press `?` to open a man-page styled
 * keyboard shortcuts overlay. Esc closes.
 */
export default function KeyboardHelpOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e) => {
      // Ignore while typing in inputs
      const tag = (e.target && e.target.tagName) || ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto p-4 pt-[12vh] sm:pt-[18vh]"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className="lg-spotlight-dropdown lg-mono relative mx-auto w-full max-w-xl rounded-2xl p-6 text-[12px] leading-[1.65]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-baseline justify-between">
          <span className="font-semibold text-gray-900 dark:text-white">
            PORTFOLIO(1)
          </span>
          <span className="text-gray-400 dark:text-gray-500">
            sohumsuthar.com manual
          </span>
          <span className="font-semibold text-gray-900 dark:text-white">
            PORTFOLIO(1)
          </span>
        </div>

        <section className="mb-4">
          <h3 className="mb-1 font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
            NAME
          </h3>
          <p className="pl-4 text-gray-600 dark:text-gray-400">
            sohumsuthar.com - portfolio &amp; blog of Sohum Suthar
          </p>
        </section>

        <section className="mb-4">
          <h3 className="mb-1 font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
            SYNOPSIS
          </h3>
          <p className="pl-4 text-gray-600 dark:text-gray-400">
            <span className="text-gray-900 dark:text-gray-200">sohumsuthar.com</span>{' '}
            [options] [route]
          </p>
        </section>

        <section className="mb-4">
          <h3 className="mb-2 font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
            KEYBOARD SHORTCUTS
          </h3>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 pl-4 text-gray-600 dark:text-gray-400">
            {[
              ['⌘K / Ctrl K', 'open command palette'],
              ['?', 'toggle this help'],
              ['Esc', 'close overlays'],
              ['g h', 'go home'],
              ['g p', 'go to posts'],
              ['g r', 'go to resume'],
              ['g t', 'go to timeline'],
              ['j / k', 'next / previous result in search'],
              ['↵', 'open selected result'],
            ].map(([key, desc]) => (
              <div key={key} className="contents">
                <dt className="text-gray-900 dark:text-gray-200 font-semibold">
                  {key}
                </dt>
                <dd>{desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h3 className="mb-1 font-semibold uppercase tracking-wide text-gray-900 dark:text-white">
            EXIT
          </h3>
          <p className="pl-4 text-gray-600 dark:text-gray-400">
            Press <span className="text-gray-900 dark:text-gray-200">Esc</span>{' '}
            or click outside to close.
          </p>
        </section>
      </div>
    </div>
  )
}
