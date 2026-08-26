'use client'

import { useRef } from 'react'
import { useLiquidLens } from '../hooks/useLiquidLens.js'

/**
 * LiquidGlass - the 4-layer container.
 *
 *   <LiquidGlass macro>
 *     <h2>Hello</h2>
 *     <p>World</p>
 *   </LiquidGlass>
 *
 * Props:
 *   macro        stronger material treatment for large surfaces ("thicker
 *                glass": deeper shadows, stronger rim, larger lensing).
 *   variant      'clear' (default, matches pre-2.0 look) | 'regular'
 *                (Apple's frosted adaptive variant: heavier blur, more
 *                opaque tint, for text-heavy surfaces).
 *   dimmed       adds the 35%-opacity dimming layer Apple prescribes for
 *                clear glass over bright media.
 *   interactive  Apple's .interactive() gel: press → spring scale + rim
 *                energize + self-illumination glow from the press point.
 *   lens         per-element ray-traced refraction (constant-width bezel in
 *                real px + chromatic dispersion) instead of the shared
 *                stretched #lg-refract map. Options via lensOptions:
 *                { bezel, refraction, dispersion, radius }.
 *   mobileFlat   strips the wrapper on mobile (useful for section-level
 *                macros so only their nested cards show on phones).
 *   className / style            outer container passthrough.
 *   contentClassName / contentStyle   inner content layer.
 */
export default function LiquidGlass({
  macro = false,
  variant = 'clear',
  dimmed = false,
  interactive = false,
  lens = false,
  lensOptions,
  mobileFlat = false,
  className = '',
  style,
  contentClassName = '',
  contentStyle,
  children,
  ...rest
}) {
  const ref = useRef(null)
  // Hooks must run unconditionally; the hook itself no-ops without a ref
  // and returns an empty filter until the first map is generated.
  const lensState = useLiquidLens(lens ? ref : { current: null }, {
    // Thicker glass for macros: wider rim, matching Apple's size-scaled lensing
    bezel: macro ? 20 : 14,
    ...lensOptions,
  })

  const classes = ['liquid-glass']
  if (macro) classes.push('lg-macro')
  if (variant === 'regular') classes.push('lg-regular')
  if (dimmed) classes.push('lg-dimmed')
  if (interactive) classes.push('lg-interactive')
  if (mobileFlat) classes.push('lg-mobile-flat')
  if (className) classes.push(className)

  const mergedStyle =
    lens && lensState.filter
      ? { ...style, '--lg-refract': lensState.filter }
      : style

  return (
    <div ref={ref} className={classes.join(' ')} style={mergedStyle} {...rest}>
      {lens ? lensState.svg : null}
      <div className="liquid-glass-effect" />
      <div className="liquid-glass-tint" />
      <div className="liquid-glass-shine" />
      <div className={`liquid-glass-content ${contentClassName}`} style={contentStyle}>
        {children}
      </div>
    </div>
  )
}
