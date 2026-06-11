/**
 * GlowThread — Animated flowing orange glow line component.
 *
 * Renders an inline SVG with:
 *   1. Base layer — solid stroke, low opacity with CSS drop-shadow glow (steady line)
 *   2. Flow layer — dashed stroke animated along the path (traveling light pulse)
 *   3. Optional pulsing node circles sitting on the line
 *
 * Props:
 *   d         {string}   SVG path data (cubic bezier). Defaults to a wide diagonal arc.
 *   nodes     {Array}    [{x, y, delay?}] — optional pulsing dots on the line.
 *   speed     {number}   Animation duration in seconds. Default 2.4.
 *   dashLen   {number}   Dash length — bigger = longer light streak. Default 5.
 *   gap       {number}   Gap between dashes. Default 32.
 *   height    {number}   SVG viewBox height. Default 200.
 *   color     {string}   Base glow color. Default '#FF4D00'.
 *   glow      {string}   Flow highlight color. Default '#FF7A3A'.
 *   opacity   {number}   Base stroke opacity. Default 0.45.
 *   strokeW   {number}   Stroke width. Default 2.5.
 *   style     {object}   Extra style for the SVG wrapper element.
 *   reverse   {boolean}  Reverse the flow direction.
 *   className {string}
 */

export default function GlowThread({
    d,
    nodes = [],
    speed = 2.4,
    dashLen = 5,
    gap = 32,
    height = 200,
    color = '#FF4D00',
    glow = '#FF7A3A',
    opacity = 0.45,
    strokeW = 2.5,
    style = {},
    reverse = false,
    className = '',
}) {
    // Unique animation id so multiple instances don't share keyframes
    const uid = Math.random().toString(36).slice(2, 7);
    const flowId  = `thread-flow-${uid}`;
    const pulseId = `thread-pulse-${uid}`;

    // stroke-dashoffset travel distance: covers the full dash cycle
    const totalOffset = (dashLen + gap) * 8; // ~8 cycles across the path
    const from = reverse ? `-${totalOffset}` : '0';
    const to   = reverse ? '0' : `-${totalOffset}`;

    // Default path: sweeping diagonal arc, slightly off-screen on both sides
    const path = d || `M -100 ${height * 0.5} C 480 ${height * 0.2}, 1440 ${height * 0.8}, 2100 ${height * 0.3}`;

    return (
        <>
            <style>{`
                @keyframes ${flowId}  { from { stroke-dashoffset: ${from}; } to { stroke-dashoffset: ${to}; } }
                @keyframes ${pulseId} { 0%,100%{opacity:.35} 50%{opacity:1} }

                @media (prefers-reduced-motion: reduce) {
                    .glow-thread-${uid} path.flow-layer  { animation: none !important; }
                    .glow-thread-${uid} circle           { animation: none !important; opacity: 0.6 !important; }
                }
            `}</style>

            <svg
                className={`glow-thread-${uid} ${className}`}
                viewBox={`0 0 1920 ${height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
                style={{
                    width: '100%',
                    height: `${height}px`,
                    display: 'block',
                    pointerEvents: 'none',
                    ...style,
                }}
            >
                {/* ── 1. Base glow line (steady) ── */}
                <path
                    d={path}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeOpacity={opacity}
                    style={{
                        filter: `drop-shadow(0 0 18px rgba(255,77,0,.55)) drop-shadow(0 0 6px rgba(255,77,0,.3))`,
                    }}
                />

                {/* ── 2. Flowing light (traveling pulse) ── */}
                <path
                    className="flow-layer"
                    d={path}
                    fill="none"
                    stroke={glow}
                    strokeWidth={strokeW + 0.5}
                    strokeLinecap="round"
                    strokeDasharray={`${dashLen} ${gap}`}
                    style={{
                        filter: `drop-shadow(0 0 8px rgba(255,140,70,.95)) drop-shadow(0 0 3px rgba(255,100,30,1))`,
                        animation: `${flowId} ${speed}s linear infinite`,
                    }}
                />

                {/* ── 3. Pulsing node dots ── */}
                {nodes.map((node, i) => (
                    <circle
                        key={i}
                        cx={node.x}
                        cy={node.y}
                        r={node.r || 4.5}
                        fill={glow}
                        style={{
                            filter: `drop-shadow(0 0 14px rgba(255,77,0,.95)) drop-shadow(0 0 5px rgba(255,140,70,.8))`,
                            animation: `${pulseId} ${node.delay ? speed + node.delay : speed + 0.8}s ease-in-out infinite`,
                            animationDelay: node.delay ? `${node.delay}s` : '0s',
                        }}
                    />
                ))}
            </svg>
        </>
    );
}
