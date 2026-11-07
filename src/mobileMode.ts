/**
 * Mobile & Touch Device Detection Utility
 * Detects when a mobile phone or touch tablet accesses the website
 * via User-Agent, coarse pointer media query, and viewport width,
 * and applies `.is-mobile-device` / `.is-mobile-viewport` classes to `<body>`.
 */

export function detectMobileUser(): {
  isMobileUa: boolean
  isTouchDevice: boolean
  isCompactViewport: boolean
  isMobile: boolean
} {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
  const isMobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua)
  const isTouchDevice =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0)
  const isCompactViewport =
    typeof window !== 'undefined' && (window.innerWidth <= 768 || window.matchMedia?.('(max-width: 768px)').matches)

  const isMobile = isCompactViewport || (isMobileUa && window.innerWidth <= 1024)
  return { isMobileUa, isTouchDevice, isCompactViewport, isMobile }
}

export function getOptimalPixelRatio(maxDesktopDpr = 2, maxMobileDpr = 1.5): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const { isMobile } = detectMobileUser()
  return Math.min(dpr, isMobile ? maxMobileDpr : maxDesktopDpr)
}

export function initMobileAdaptation(): void {
  const syncBodyClasses = () => {
    const { isMobile, isTouchDevice, isCompactViewport } = detectMobileUser()
    document.body.classList.toggle('is-mobile-device', isMobile)
    document.body.classList.toggle('is-touch-device', isTouchDevice)
    document.body.classList.toggle('is-compact-viewport', isCompactViewport)
  }

  syncBodyClasses()
  window.addEventListener('resize', syncBodyClasses, { passive: true })
  window.addEventListener('orientationchange', syncBodyClasses, { passive: true })
}
