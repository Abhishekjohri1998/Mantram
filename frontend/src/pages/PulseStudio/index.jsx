/**
 * Pulse Studio v2 — 4-Phase Sequential Architecture
 *
 * Phase 1 · Intelligence   — Product scan → DNA → palette → mood preview (GPT Image 2)
 * Phase 2 · Mood Board     — Full-width immersive moodboard selector (GPT Image 2)
 * Phase 3 · Creation Hub   — All tools auto-primed with product DNA + locked colors
 *
 * Design system: grey shades only, lucide-react icons, all images S3 (no base64)
 */

import React, { useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { useBrand } from '../../context/BrandContext'
import { CheckCircle2, Lock, Sparkles, Search, Palette, Layers } from 'lucide-react'

import Phase1Intelligence from './phases/Phase1Intelligence'
import Phase2MoodBoard    from './phases/Phase2MoodBoard'
import Phase3Creation     from './phases/Phase3Creation'
import { DEFAULT_CONFIG } from './tools/AvatarConfigPanel'

import './PulseStudio.css'

// ── Phase Progress Bar ───────────────────────────────────────────────────────

const PHASES = [
    { num: 1, label: 'Intelligence',  Icon: Search  },
    { num: 2, label: 'Mood Board',    Icon: Palette },
    { num: 3, label: 'Creation Hub',  Icon: Layers  },
]

function PhaseBar({ phase, completedPhases, onJump }) {
    return (
        <div className="ps-phase-bar">
            {PHASES.map((p, i) => {
                const isDone   = completedPhases.includes(p.num)
                const isActive = phase === p.num
                const isLocked = !isDone && !isActive && p.num > Math.max(...completedPhases, phase)
                const status   = isActive ? 'active' : isDone ? 'done' : 'locked'
                const Icon = p.Icon
                return (
                    <React.Fragment key={p.num}>
                        {i > 0 && <div className="ps-phase-sep" />}
                        <div
                            className={`ps-phase-step ${status}`}
                            onClick={() => (isDone || isActive) && onJump(p.num)}
                        >
                            <div className="ps-phase-num">
                                {isDone ? <CheckCircle2 size={12} /> : p.num}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Icon size={13} style={{ color: isActive ? 'var(--sys-primary)' : 'var(--sys-text-muted)', flexShrink: 0 }} />
                                <span className="ps-phase-label">{p.label}</span>
                            </div>
                            {isActive && (
                                <div style={{ marginLeft: 'auto', width: 5, height: 5, borderRadius: '50%', background: 'var(--sys-primary)', animation: 'ps-fade-in 0.3s ease', flexShrink: 0 }} />
                            )}
                            {isLocked && (
                                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                    <Lock size={10} style={{ color: 'var(--sys-text-muted)', opacity: 0.5 }} />
                                </div>
                            )}
                        </div>
                    </React.Fragment>
                )
            })}
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PulseStudio() {
    const { activeBrand } = useBrand()
    const brandId = activeBrand?._id

    const [phase, setPhase]               = useState(1)
    const [completedPhases, setCompleted] = useState([])
    const [productContext, setProductContext] = useState(null)
    const [selectedMoodId, setSelectedMoodId] = useState(null)
    const [moodImages, setMoodImages] = useState({})
    const [moodLoading, setMoodLoading] = useState(false)
    // LIFTED: mood directions so Phase2 sees updated IDs when async API returns
    const [moodDirections, setMoodDirections] = useState(null)
    // LIFTED: avatar config — session-persistent, inherited by all Phase 3 tools
    const [avatarConfig, setAvatarConfig] = useState(DEFAULT_CONFIG)

    const markDone = (p) => setCompleted(prev => prev.includes(p) ? prev : [...prev, p])

    const handleProductReady = (ctx) => {
        setProductContext(ctx)
        markDone(1)
        setPhase(2)
    }

    const handleMoodSelected = async (moodId) => {
        setSelectedMoodId(moodId)
        markDone(2)
        // Rebuild designContext for the newly selected mood immediately
        // so Phase3 tools always get the correct mood's shoot directive
        if (productContext?.productDNA) {
            try {
                const res = await fetch('/api/brand-studio/design-context', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('mantram_token')}` },
                    body: JSON.stringify({
                        productDNA: productContext.productDNA,
                        selectedMoodId: moodId,
                        customMoodDirections: moodDirections || productContext.productMoodDirections || null,
                    }),
                })
                const dc = await res.json()
                if (dc.success && dc.designContext) {
                    // Patch productContext with fresh designContext for the selected mood
                    setProductContext(prev => prev ? { ...prev, designContext: dc.designContext } : prev)
                }
            } catch (e) {
                // Non-critical: tools still work via selectedMoodId fallback
                console.warn('designContext rebuild failed:', e.message)
            }
        }
        setPhase(3)
    }

    const jumpToPhase = (p) => {
        // Only allow jumping backward or to already-done phases
        if (p < phase || completedPhases.includes(p)) setPhase(p)
    }

    // mergedContext always includes latest moodImages + moodDirections so Phase2 re-renders reactively
    // designContext is rebuilt on mood selection (handleMoodSelected) and patched into productContext
    const mergedContext = productContext
        ? { ...productContext, moodImages, productMoodDirections: moodDirections || productContext.productMoodDirections }
        : null

    return (
        <DashboardLayout title="Pulse Studio">
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
                {/* Phase progress bar */}
                <PhaseBar phase={phase} completedPhases={completedPhases} onJump={jumpToPhase} />

                {/* Phase 1 — Intelligence */}
                {phase === 1 && (
                    <Phase1Intelligence
                        brandId={brandId}
                        onContextReady={handleProductReady}
                        moodImages={moodImages}
                        setMoodImages={setMoodImages}
                        moodLoading={moodLoading}
                        setMoodLoading={setMoodLoading}
                        setMoodDirections={setMoodDirections}
                    />
                )}

                {/* Phase 2 — Mood Board */}
                {phase === 2 && (
                    <Phase2MoodBoard
                        productContext={mergedContext}
                        moodLoading={moodLoading}
                        onMoodSelected={handleMoodSelected}
                        onBack={() => setPhase(1)}
                    />
                )}

                {/* Phase 3 — Creation Hub */}
                {phase === 3 && (
                    <Phase3Creation
                        productContext={mergedContext}
                        selectedMoodId={selectedMoodId}
                        onBack={() => setPhase(2)}
                        brandId={brandId}
                        avatarConfig={avatarConfig}
                        onAvatarConfigChange={setAvatarConfig}
                    />
                )}
            </div>
        </DashboardLayout>
    )
}
