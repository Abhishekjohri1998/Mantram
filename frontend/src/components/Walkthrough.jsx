import { useState, useEffect, useRef, useCallback } from 'react'
import useWalkthrough from '../hooks/useWalkthrough'
import WALKTHROUGH_STEPS from '../config/walkthroughSteps'

/**
 * Walkthrough — First-visit guided tour component.
 *
 * Renders a full-screen overlay with a spotlight cutout on the target element
 * and a glassmorphism tooltip with step info + navigation.
 *
 * Usage: <Walkthrough studioId="contentStudio" />
 */
export default function Walkthrough({ studioId, dependsOn }) {
  const { active, complete } = useWalkthrough(studioId, { dependsOn })
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [tooltipStyle, setTooltipStyle] = useState({})
  const [animating, setAnimating] = useState(false)
  const overlayRef = useRef(null)
  const tooltipRef = useRef(null)

  const steps = WALKTHROUGH_STEPS[studioId] || []
  const current = steps[step]
  const isLast = step === steps.length - 1
  const isFirst = step === 0

  // ── Find & measure target element ───────────────────────────
  const measureTarget = useCallback(() => {
    if (!current?.target) return null
    const el = document.querySelector(current.target)
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return rect
  }, [current])

  // ── Position tooltip relative to spotlight ──────────────────
  const positionTooltip = useCallback((rect) => {
    if (!rect) return {}
    const pad = 16
    const tooltipW = 340
    const tooltipH = 200 // estimated
    const pos = current?.position || 'bottom'
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top, left

    switch (pos) {
      case 'top':
        top = rect.top - tooltipH - pad
        left = rect.left + rect.width / 2 - tooltipW / 2
        break
      case 'left':
        top = rect.top + rect.height / 2 - tooltipH / 2
        left = rect.left - tooltipW - pad
        break
      case 'right':
        top = rect.top + rect.height / 2 - tooltipH / 2
        left = rect.right + pad
        break
      case 'bottom':
      default:
        top = rect.bottom + pad
        left = rect.left + rect.width / 2 - tooltipW / 2
        break
    }

    // Clamp to viewport
    if (left < pad) left = pad
    if (left + tooltipW > vw - pad) left = vw - tooltipW - pad
    if (top < pad) top = pad
    if (top + tooltipH > vh - pad) top = vh - tooltipH - pad

    return { top, left, width: tooltipW }
  }, [current])

  // ── Update positions on step change & resize ────────────────
  useEffect(() => {
    if (!active || !current) return

    const update = () => {
      const rect = measureTarget()
      if (rect && rect.width > 0) {
        setTargetRect(rect)
        setTooltipStyle(positionTooltip(rect))
        // Scroll element into view
        const el = document.querySelector(current.target)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
        }
      }
    }

    // Small delay to let page settle
    const timer = setTimeout(update, 100)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [active, step, current, measureTarget, positionTooltip])

  // ── Step transitions ────────────────────────────────────────
  const goNext = () => {
    if (isLast) {
      complete()
      return
    }
    setAnimating(true)
    setTimeout(() => {
      setStep(s => s + 1)
      setAnimating(false)
    }, 200)
  }

  const goPrev = () => {
    if (isFirst) return
    setAnimating(true)
    setTimeout(() => {
      setStep(s => s - 1)
      setAnimating(false)
    }, 200)
  }

  const skip = () => {
    complete()
  }

  // ── Don't render if not active ──────────────────────────────
  if (!active || steps.length === 0) return null

  // ── Spotlight cutout dimensions ─────────────────────────────
  const padding = 8
  const radius = 12
  const cutout = targetRect ? {
    x: targetRect.left - padding,
    y: targetRect.top - padding,
    w: targetRect.width + padding * 2,
    h: targetRect.height + padding * 2,
  } : null

  return (
    <div ref={overlayRef} style={S.overlay}>
      {/* ── SVG Overlay with spotlight cutout ── */}
      <svg style={S.svg} onClick={skip}>
        <defs>
          <mask id="wt-spotlight-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {cutout && (
              <rect
                x={cutout.x} y={cutout.y}
                width={cutout.w} height={cutout.h}
                rx={radius} ry={radius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%"
          fill="rgba(0,0,0,0.78)"
          mask="url(#wt-spotlight-mask)"
        />
      </svg>

      {/* ── Spotlight pulse ring ── */}
      {cutout && (
        <div style={{
          ...S.pulseRing,
          top: cutout.y - 4,
          left: cutout.x - 4,
          width: cutout.w + 8,
          height: cutout.h + 8,
          borderRadius: radius + 4,
        }} />
      )}

      {/* ── Tooltip Card ── */}
      <div
        ref={tooltipRef}
        style={{
          ...S.tooltip,
          ...tooltipStyle,
          opacity: animating ? 0 : 1,
          transform: animating ? 'translateY(8px) scale(0.97)' : 'translateY(0) scale(1)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Step counter */}
        <div style={S.stepCounter}>
          <span style={S.stepIcon}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#FF4D00' }}>
              {current?.icon || 'info'}
            </span>
          </span>
          <span style={S.stepLabel}>Step {step + 1} of {steps.length}</span>
          <button onClick={skip} style={S.skipBtn} title="Skip walkthrough">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>

        {/* Content */}
        <h3 style={S.title}>{current?.title}</h3>
        <p style={S.desc}>{current?.description}</p>

        {/* Progress dots */}
        <div style={S.dots}>
          {steps.map((_, i) => (
            <div 
              key={i} 
              style={{
                ...S.dot,
                ...(i === step ? S.dotActive : {}),
                ...(i < step ? S.dotDone : {}),
              }} 
            />
          ))}
        </div>

        {/* Navigation */}
        <div style={S.nav}>
          <button onClick={skip} style={S.ghostBtn}>
            Skip Tour
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button onClick={goPrev} style={S.secondaryBtn}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
                Back
              </button>
            )}
            <button onClick={goNext} style={S.primaryBtn}>
              {isLast ? 'Got it!' : 'Next'}
              {!isLast && <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Inline styles (no CSS file needed) ────────────────────────
const S = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    pointerEvents: 'auto',
  },
  svg: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    cursor: 'pointer',
  },
  pulseRing: {
    position: 'absolute',
    border: '2px solid rgba(255, 77, 0, 0.5)',
    pointerEvents: 'none',
    animation: 'wt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },
  tooltip: {
    position: 'fixed',
    zIndex: 100000,
    background: '#1a1a1e',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: '20px 22px 18px',
    maxWidth: 340,
    backdropFilter: 'blur(20px)',
    transition: 'opacity 0.2s ease, transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 40px rgba(255, 77, 0, 0.08)',
  },
  stepCounter: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  stepIcon: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
    height: 30,
    borderRadius: 8,
    background: 'rgba(255, 77, 0, 0.12)',
    flexShrink: 0,
  },
  stepLabel: {
    fontSize: 12,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.45)',
    flex: 1,
    fontFamily: "'Inter', sans-serif",
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
  },
  skipBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    cursor: 'pointer',
    padding: 4,
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    transition: 'color 0.15s',
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: 'rgba(255,255,255,0.92)',
    marginBottom: 6,
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
  },
  desc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: 16,
    fontFamily: "'Inter', sans-serif",
  },
  dots: {
    display: 'flex',
    gap: 6,
    marginBottom: 16,
    justifyContent: 'center',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    transition: 'all 0.3s ease',
  },
  dotActive: {
    background: '#FF4D00',
    width: 22,
    borderRadius: 4,
  },
  dotDone: {
    background: 'rgba(255, 77, 0, 0.35)',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ghostBtn: {
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.35)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    padding: '6px 10px',
    borderRadius: 8,
    transition: 'color 0.15s, background 0.15s',
    fontFamily: "'Inter', sans-serif",
  },
  secondaryBtn: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '7px 14px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'background 0.15s',
    fontFamily: "'Inter', sans-serif",
  },
  primaryBtn: {
    background: '#FF4D00',
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    padding: '7px 18px',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    transition: 'opacity 0.15s',
    fontFamily: "'Space Grotesk', 'Inter', sans-serif",
  },
}

// ── Inject keyframe animation for pulse ring ──────────────────
if (typeof document !== 'undefined' && !document.getElementById('wt-pulse-style')) {
  const style = document.createElement('style')
  style.id = 'wt-pulse-style'
  style.textContent = `
    @keyframes wt-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.03); }
    }
  `
  document.head.appendChild(style)
}
