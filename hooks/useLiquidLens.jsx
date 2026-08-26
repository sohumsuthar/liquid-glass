'use client'

import { useEffect, useId, useState } from 'react'
import {
  buildDisplacementLUT,
  renderDisplacementMap,
  dispersionScales,
} from '../lib/glass-optics.mjs'

/**
 * useLiquidLens — per-element physically-traced refraction.
 *
 * The static #lg-refract filter stretches one 512×512 map over every element
 * (objectBoundingBox), so the bezel width scales with element size and turns
 * elliptical on wide cards. This hook instead generates a displacement map at
 * the element's real CSS-pixel size with a CONSTANT bezel width — like the
 * real material, where the rim is a fixed physical width — and applies it via
 * a per-element SVG filter in userSpaceOnUse units, with per-channel
 * chromatic dispersion (Cauchy/BK7 ratios, see lib/glass-optics.mjs).
 *
 * Returns { filter, svg }:
 *   filter — CSS <filter-value>, e.g. 'url(#lg-lens-r1)' (empty until ready)
 *   svg    — JSX to render once inside the element (0-size, aria-hidden)
 *
 * The container CSS picks the filter up through the --lg-refract custom
 * property, so usage from <LiquidGlass lens> is just:
 *
 *   const lens = useLiquidLens(ref, { bezel: 14 })
 *   <div ref={ref} class="liquid-glass" style={{ '--lg-refract': lens.filter }}>
 *     {lens.svg}
 *
 * Options:
 *   bezel      rim width in CSS px (default 14 — measured-scale rim)
 *   refraction multiplier on the physical displacement magnitude (default 1)
 *   dispersion chromatic-aberration strength; 1 = physically exact BK7,
 *              0 = off, larger = exaggerated (default 8 ≈ 2px fringe).
 *              The CA graph is 3 displacement passes over the backdrop —
 *              keep lens elements to 1-3 heroes per page (a fleet of CA
 *              surfaces can stall Chrome's compositor).
 *   radius     corner radius px; by default read from computed border-radius
 *   maxTexture cap on generated map dimension (default 1024; larger elements
 *              render proportionally smaller and stretch back — lossless for
 *              this smooth field)
 *
 * Chrome-only (like the static filter): Safari and Firefox ignore url() in
 * backdrop-filter and keep the blur-only fallback — Safari through the
 * -webkit-backdrop-filter alias, Firefox through the
 * @supports (-moz-appearance: none) block in liquid-glass-core.css, since
 * Gecko never implemented that alias.
 */

// One LUT shared by every instance (profile is size-independent).
let sharedLUT = null
function getLUT() {
  if (!sharedLUT) sharedLUT = buildDisplacementLUT(255)
  return sharedLUT
}

function generateMapDataURL(w, h, radius, bezel, maxTexture) {
  const k = Math.max(1, Math.max(w, h) / maxTexture)
  const mw = Math.max(2, Math.round(w / k))
  const mh = Math.max(2, Math.round(h / k))
  const canvas = document.createElement('canvas')
  canvas.width = mw
  canvas.height = mh
  const ctx = canvas.getContext('2d')
  const img = ctx.createImageData(mw, mh)
  renderDisplacementMap(img.data, {
    width: mw,
    height: mh,
    radius: radius / k,
    bezel: bezel / k,
    lut: getLUT().lut,
  })
  ctx.putImageData(img, 0, 0)
  return canvas.toDataURL('image/png')
}

export function useLiquidLens(ref, {
  bezel = 14,
  refraction = 1,
  dispersion = 8,
  radius,
  maxTexture = 1024,
} = {}) {
  const reactId = useId()
  const id = `lg-lens-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [state, setState] = useState(null) // { href, w, h }

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    // Match the CSS touch gate: those devices run blur-only.
    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) return

    let raf = null
    let last = { w: 0, h: 0 }

    const regenerate = () => {
      raf = null
      const rect = el.getBoundingClientRect()
      const w = Math.round(rect.width)
      const h = Math.round(rect.height)
      if (!w || !h || (w === last.w && h === last.h)) return
      last = { w, h }
      const r =
        radius ?? (parseFloat(getComputedStyle(el).borderRadius) || 22)
      const clampedR = Math.min(r, w / 2, h / 2)
      const clampedBezel = Math.min(bezel, w / 2, h / 2)
      const href = generateMapDataURL(w, h, clampedR, clampedBezel, maxTexture)
      setState({ href, w, h })
    }

    const schedule = () => {
      if (raf === null) raf = requestAnimationFrame(regenerate)
    }

    const ro = new ResizeObserver(schedule)
    ro.observe(el)
    schedule()
    return () => {
      ro.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [ref, bezel, radius, maxTexture])

  if (!state) return { filter: '', svg: null }

  const { href, w, h } = state
  const { peak } = getLUT()
  // feDisplacementMap offset = scale × (channel/255 − 0.5); LUT peak encodes
  // to channel 255 (offset scale×0.498), so scale ≈ 2.008 × peak px.
  const clampedBezel = Math.min(bezel, w / 2, h / 2)
  const scale = 2.008 * peak * clampedBezel * refraction
  const ca = dispersionScales(dispersion)

  const svg = (
    <svg
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <filter
        id={id}
        x="0"
        y="0"
        width={w}
        height={h}
        filterUnits="userSpaceOnUse"
        primitiveUnits="userSpaceOnUse"
        colorInterpolationFilters="sRGB"
      >
        <feImage
          href={href}
          x="0"
          y="0"
          width={w}
          height={h}
          preserveAspectRatio="none"
          result="map"
        />
        {dispersion > 0 ? (
          <>
            {/* Per-channel Snell displacement: n_blue > n_green > n_red, so
                blue bends most. Channels are disjoint after isolation, so
                screen-blending recombines them additively. */}
            <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * ca.red} xChannelSelector="R" yChannelSelector="G" result="dispR" />
            <feColorMatrix in="dispR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chR" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" result="dispG" />
            <feColorMatrix in="dispG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="chG" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={scale * ca.blue} xChannelSelector="R" yChannelSelector="G" result="dispB" />
            <feColorMatrix in="dispB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="chB" />
            <feBlend in="chR" in2="chG" mode="screen" result="rg" />
            <feBlend in="rg" in2="chB" mode="screen" />
          </>
        ) : (
          <feDisplacementMap in="SourceGraphic" in2="map" scale={scale} xChannelSelector="R" yChannelSelector="G" />
        )}
      </filter>
    </svg>
  )

  return { filter: `url(#${id})`, svg }
}

export default useLiquidLens
