import { useMemo } from 'react'

/**
 * Particles3D — Ambient floating depth particles for the landing page.
 *
 * Renders 18 small glowing orbs at random positions with varying translateZ
 * values (-300px to 300px). They float with CSS keyframe animations at
 * different speeds, creating a sense of volumetric 3D space.
 *
 * Respects prefers-reduced-motion — particles are hidden entirely.
 * Pure CSS, no JS animation loop, GPU-accelerated via will-change.
 */

const PARTICLE_COLORS = [
    'rgba(255, 77, 0, 0.35)',    // brand orange
    'rgba(255, 77, 0, 0.2)',     // subtle orange
    'rgba(6, 182, 212, 0.25)',   // brand cyan
    'rgba(6, 182, 212, 0.15)',   // subtle cyan
    'rgba(255, 255, 255, 0.08)', // white whisper
    'rgba(99, 102, 241, 0.2)',   // indigo accent
]

function generateParticles(count) {
    const particles = []
    for (let i = 0; i < count; i++) {
        particles.push({
            id: i,
            x: Math.random() * 100,              // % horizontal
            y: Math.random() * 100,              // % vertical
            z: (Math.random() - 0.5) * 600,     // -300 to 300 px
            size: 2 + Math.random() * 6,         // 2-8 px
            color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
            duration: 12 + Math.random() * 18,   // 12-30s float cycle
            delay: Math.random() * -20,           // staggered start
            blur: 0.5 + Math.random() * 2,       // 0.5-2.5px glow
        })
    }
    return particles
}

export default function Particles3D({ count = 18 }) {
    const particles = useMemo(() => generateParticles(count), [count])

    return (
        <div
            className="particles-3d-container"
            aria-hidden="true"
        >
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="particle-3d"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: `${p.size}px`,
                        height: `${p.size}px`,
                        background: p.color,
                        filter: `blur(${p.blur}px)`,
                        transform: `translateZ(${p.z}px)`,
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                    }}
                />
            ))}
        </div>
    )
}
