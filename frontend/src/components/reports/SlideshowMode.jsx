/**
 * SlideshowMode — Full-screen presentation overlay for Studio Reports
 * 
 * Renders report sections as slides with keyboard navigation,
 * animated transitions, and brand-themed backgrounds.
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReportChart from './ReportCharts';
import FormattedText from '../FormattedText';

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 99999, display: 'flex', flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
        background: '#0f172a', // Solid base color to prevent ghosting
    },
    slideContainer: {
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '120px 80px 80px', position: 'relative', overflow: 'hidden',
    },
    slideContent: {
        maxWidth: 1100, width: '100%', animation: 'slideIn 0.4s ease-out',
        maxHeight: '100%', overflow: 'auto',
    },
    slideTitle: {
        fontSize: 36, fontWeight: 700, marginBottom: 40, letterSpacing: '-0.02em',
        lineHeight: 1.2, color: '#fff', textAlign: 'center',
    },
    nav: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 40px', borderTop: '1px solid rgba(255,255,255,0.1)',
        background: '#0f172a', // Opaque nav
    },
    navBtn: {
        background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff',
        padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
        fontWeight: 500, transition: 'all 0.2s',
    },
    closeBtn: {
        position: 'absolute', top: 20, right: 24, background: 'rgba(255,255,255,0.1)',
        border: 'none', color: '#fff', width: 40, height: 40, borderRadius: '50%',
        cursor: 'pointer', fontSize: 20, display: 'flex', alignItems: 'center',
        justifyContent: 'center', zIndex: 10,
    },
    progressBar: {
        height: 3, borderRadius: 2, transition: 'width 0.4s ease',
    },
    kpiGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 20, marginTop: 24,
    },
    kpiCard: {
        background: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px 20px',
        textAlign: 'center', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.1)',
    },
    kpiValue: { fontSize: 32, fontWeight: 700, marginBottom: 4 },
    kpiLabel: { fontSize: 13, opacity: 0.7 },
    kpiChange: { fontSize: 12, marginTop: 6, fontWeight: 500 },
    table: {
        width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px',
        fontSize: 14, marginTop: 16,
    },
    th: {
        textAlign: 'left', padding: '10px 14px', fontSize: 11,
        textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.6,
    },
    td: {
        padding: '10px 14px', background: 'rgba(255,255,255,0.05)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
    },
    recoCard: {
        background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '16px 20px',
        marginBottom: 12, borderLeft: '3px solid',
    },
    notes: {
        position: 'absolute', bottom: 80, left: 40, right: 40, padding: '12px 16px',
        background: 'rgba(0,0,0,0.6)', borderRadius: 10, fontSize: 13,
        color: 'rgba(255,255,255,0.7)', fontStyle: 'italic', backdropFilter: 'blur(8px)',
    },
    slideNumber: { fontSize: 13, opacity: 0.5 },
    brandBadge: {
        position: 'absolute', top: 20, left: 24, display: 'flex', alignItems: 'center',
        gap: 10, zIndex: 10,
    },
    logo: { width: 32, height: 32, borderRadius: 8, objectFit: 'cover' },
};

// CSS animation injector
const slideInCSS = `@keyframes slideIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }`;

export default function SlideshowMode({ report, onClose }) {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showNotes, setShowNotes] = useState(false);

    const slides = report?.slides || [];
    const sections = report?.sections || [];
    const branding = report?.branding || {};
    const primaryColor = branding.primaryColor || '#6366f1';
    const secondaryColor = branding.secondaryColor || '#8b5cf6';

    const bgGradient = `linear-gradient(135deg, ${primaryColor}25 0%, #0f172a 40%, #0f172a 60%, ${secondaryColor}25 100%)`;

    const goNext = useCallback(() => {
        if (currentSlide < slides.length - 1) setCurrentSlide(c => c + 1);
    }, [currentSlide, slides.length]);

    const goPrev = useCallback(() => {
        if (currentSlide > 0) setCurrentSlide(c => c - 1);
    }, [currentSlide]);

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'ArrowRight' || e.key === ' ') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') onClose();
            if (e.key === 'n' || e.key === 'N') setShowNotes(v => !v);
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [goNext, goPrev, onClose]);

    if (!slides.length) return null;

    const slide = slides[currentSlide];
    const slideSections = (slide?.sectionIds || [])
        .map(id => sections.find(s => s.id === id))
        .filter(Boolean);
    const progress = ((currentSlide + 1) / slides.length) * 100;

    const renderSection = (section) => {
        const d = section.data || {};
        switch (section.type) {
            case 'kpi-grid':
                return (
                    <div style={styles.kpiGrid}>
                        {(d.metrics || []).slice(0, 8).map((m, i) => (
                            <div key={i} style={styles.kpiCard}>
                                <div style={{ ...styles.kpiValue, color: primaryColor }}>
                                    {m.value}{m.unit ? ` ${m.unit}` : ''}
                                </div>
                                <div style={styles.kpiLabel}>{m.label}</div>
                                {m.change && (
                                    <div style={{
                                        ...styles.kpiChange,
                                        color: m.changeDirection === 'up' ? '#10b981' :
                                               m.changeDirection === 'down' ? '#ef4444' : '#94a3b8',
                                    }}>
                                        {m.changeDirection === 'up' ? '↑' : m.changeDirection === 'down' ? '↓' : '→'} {m.change}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            case 'chart':
                return (
                    <div style={{ marginTop: 16 }}>
                        <ReportChart
                            chartType={d.chartType || 'bar'}
                            data={d}
                            branding={branding}
                            height={320}
                        />
                        {d.description && (
                            <p style={{ fontSize: 13, opacity: 0.6, marginTop: 12, textAlign: 'center' }}>
                                {d.description}
                            </p>
                        )}
                    </div>
                );
            case 'table':
                return (
                    <table style={styles.table}>
                        <thead>
                            <tr>
                                {(d.columns || []).map((col, i) => (
                                    <th key={i} style={styles.th}>{col.label || col.key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(d.rows || []).slice(0, 8).map((row, ri) => (
                                <tr key={ri}>
                                    {(d.columns || []).map((col, ci) => (
                                        <td key={ci} style={{
                                            ...styles.td,
                                            ...(ci === 0 ? { borderRadius: '8px 0 0 8px' } : {}),
                                            ...(ci === (d.columns || []).length - 1 ? { borderRadius: '0 8px 8px 0' } : {}),
                                        }}>
                                            {row[col.key] ?? '—'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            case 'text':
                return (
                    <div style={{ fontSize: 16, lineHeight: 1.8, opacity: 0.85, marginTop: 12 }}>
                        <FormattedText text={d.content || ''} />
                    </div>
                );
            case 'recommendations':
                return (
                    <div style={{ marginTop: 16 }}>
                        {(d.items || []).slice(0, 5).map((r, i) => (
                            <div key={i} style={{
                                ...styles.recoCard,
                                borderLeftColor: r.priority === 'high' ? '#ef4444' :
                                                 r.priority === 'medium' ? '#f59e0b' : '#10b981',
                            }}>
                                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{r.title}</div>
                                <div style={{ fontSize: 13, opacity: 0.7 }}>{r.description}</div>
                                {r.impact && (
                                    <div style={{ fontSize: 11, marginTop: 6, color: primaryColor }}>
                                        Impact: {r.impact}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                );
            default:
                return <div style={{ opacity: 0.5 }}>Section type: {section.type}</div>;
        }
    };

    return (
        <>
            <style>{slideInCSS}</style>
            <div style={{ ...styles.overlay, background: bgGradient, color: '#f1f5f9' }}>
                {/* Progress bar */}
                <div style={{ background: 'rgba(255,255,255,0.05)', height: 3 }}>
                    <div style={{ ...styles.progressBar, width: `${progress}%`, background: primaryColor }} />
                </div>

                {/* Brand badge */}
                <div style={styles.brandBadge}>
                    {branding.logo && <img src={branding.logo} alt="" style={styles.logo} />}
                    {branding.brandName && (
                        <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.7 }}>
                            {branding.brandName}
                        </span>
                    )}
                </div>

                {/* Close button */}
                <button onClick={onClose} style={styles.closeBtn} title="Exit (Esc)">✕</button>

                {/* Slide content */}
                <div style={styles.slideContainer}>
                    <div key={currentSlide} style={styles.slideContent}>
                        <div style={styles.slideTitle}>{slide.title}</div>

                        {/* Title slide (no sections) — show executive summary */}
                        {slideSections.length === 0 && (
                            <div style={{ fontSize: 18, lineHeight: 1.7, opacity: 0.8, maxWidth: 700 }}>
                                <FormattedText text={report.narrative?.executiveSummary || 'Welcome to this report presentation.'} />
                            </div>
                        )}

                        {/* Render sections */}
                        {slideSections.map((sec, i) => (
                            <div key={sec.id || i}>
                                {slideSections.length > 1 && (
                                    <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, marginTop: i > 0 ? 32 : 0 }}>
                                        {sec.title}
                                    </h3>
                                )}
                                {renderSection(sec)}
                            </div>
                        ))}
                    </div>

                    {/* Speaker notes */}
                    {showNotes && slide.notes && (
                        <div style={styles.notes}>{slide.notes}</div>
                    )}
                </div>

                {/* Navigation */}
                <div style={styles.nav}>
                    <button
                        onClick={goPrev}
                        disabled={currentSlide === 0}
                        style={{ ...styles.navBtn, opacity: currentSlide === 0 ? 0.3 : 1 }}
                    >
                        ← Previous
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        <span style={styles.slideNumber}>
                            {currentSlide + 1} / {slides.length}
                        </span>
                        <button
                            onClick={() => setShowNotes(v => !v)}
                            style={{ ...styles.navBtn, fontSize: 12, padding: '6px 14px' }}
                        >
                            {showNotes ? 'Hide Notes' : 'Notes (N)'}
                        </button>
                    </div>
                    <button
                        onClick={currentSlide < slides.length - 1 ? goNext : onClose}
                        style={styles.navBtn}
                    >
                        {currentSlide < slides.length - 1 ? 'Next →' : 'Finish ✓'}
                    </button>
                </div>
            </div>
        </>
    );
}
