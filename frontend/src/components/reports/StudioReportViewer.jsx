/**
 * StudioReportViewer — Interactive branded report viewer
 * 
 * Full-screen overlay that displays AI-generated reports with:
 * - KPI grids, charts, tables, text sections, recommendations
 * - Brand theming (colors, logo, fonts)
 * - Inline editing mode
 * - Slideshow, PDF export, and share actions
 */

import React, { useState, useCallback } from 'react';
import ReportChart from './ReportCharts';
import SlideshowMode from './SlideshowMode';
import ReportPDFExport from './ReportPDFExport';
import FormattedText from '../FormattedText';
import { studioReports } from '../../services/api';

// ── CSS-in-JS styles ──
const s = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: '#0b0f1a', display: 'flex', fontFamily: 'Inter, system-ui, sans-serif',
        color: '#e2e8f0',
    },
    sidebar: {
        width: 260, borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.8)',
        backdropFilter: 'blur(20px)',
    },
    sidebarHeader: {
        padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
    },
    navItem: (active) => ({
        padding: '10px 20px', cursor: 'pointer', fontSize: 13,
        display: 'flex', alignItems: 'center', gap: 10,
        background: active ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
        borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
        color: active ? '#a5b4fc' : '#94a3b8',
        transition: 'all 0.2s',
    }),
    main: {
        flex: 1, overflow: 'auto', position: 'relative',
    },
    toolbar: {
        sticky: 'top', padding: '12px 32px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(11, 15, 26, 0.95)', backdropFilter: 'blur(12px)', zIndex: 10,
        position: 'sticky', top: 0,
    },
    toolBtn: (primary) => ({
        background: primary ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255,255,255,0.06)',
        border: '1px solid ' + (primary ? 'rgba(99, 102, 241, 0.3)' : 'rgba(255,255,255,0.08)'),
        color: primary ? '#a5b4fc' : '#cbd5e1',
        padding: '7px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
        fontWeight: 500, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6,
    }),
    content: { padding: '24px 32px 60px', maxWidth: 1000, margin: '0 auto' },
    sectionCard: {
        background: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: '24px 28px',
        marginBottom: 24, border: '1px solid rgba(255,255,255,0.06)',
        transition: 'all 0.3s',
    },
    sectionTitle: {
        fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
    },
    kpiGrid: {
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16,
    },
    kpiCard: (primary) => ({
        background: `linear-gradient(135deg, ${primary}12, ${primary}06)`,
        borderRadius: 12, padding: '20px 16px', textAlign: 'center',
        border: `1px solid ${primary}20`, transition: 'transform 0.2s',
    }),
    kpiValue: (color) => ({ fontSize: 28, fontWeight: 700, color, letterSpacing: '-0.02em' }),
    kpiLabel: { fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 },
    kpiChange: (dir) => ({
        fontSize: 11, marginTop: 8, fontWeight: 500,
        color: dir === 'up' ? '#34d399' : dir === 'down' ? '#f87171' : '#94a3b8',
    }),
    table: { width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: 13 },
    th: {
        textAlign: 'left', padding: '8px 12px', fontSize: 10, textTransform: 'uppercase',
        letterSpacing: '0.08em', color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.08)',
    },
    td: {
        padding: '10px 12px', background: 'rgba(255,255,255,0.02)',
    },
    recoCard: (borderColor) => ({
        background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '14px 18px',
        marginBottom: 10, borderLeft: `3px solid ${borderColor}`,
        transition: 'all 0.2s',
    }),
    badge: (color) => ({
        fontSize: 9, fontWeight: 600, padding: '2px 8px', borderRadius: 10,
        background: `${color}20`, color, textTransform: 'uppercase', letterSpacing: '0.05em',
    }),
    editTextarea: {
        width: '100%', minHeight: 120, background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 8,
        color: '#e2e8f0', padding: 12, fontSize: 13, lineHeight: 1.7,
        fontFamily: 'inherit', resize: 'vertical',
    },
    closeBtn: {
        position: 'absolute', top: 12, right: 16, background: 'rgba(255,255,255,0.08)',
        border: 'none', color: '#94a3b8', width: 36, height: 36, borderRadius: '50%',
        cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center',
        justifyContent: 'center',
    },
    summaryBox: (primary) => ({
        background: `linear-gradient(135deg, ${primary}10, transparent)`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
        borderLeft: `3px solid ${primary}`,
    }),
    insightChip: {
        display: 'inline-block', background: 'rgba(255,255,255,0.05)', borderRadius: 20,
        padding: '6px 14px', fontSize: 12, margin: '4px 6px 4px 0', color: '#cbd5e1',
    },
    emptyState: {
        textAlign: 'center', padding: '60px 20px', color: '#64748b',
    },
};

const SECTION_ICONS = {
    'kpi-grid': '📊', chart: '📈', table: '📋', text: '📝',
    recommendations: '🎯', timeline: '📅', comparison: '⚡',
};

const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };

export default function StudioReportViewer({ report: initialReport, onClose, onUpdate }) {
    const [report, setReport] = useState(initialReport);
    const [activeSection, setActiveSection] = useState(null);
    const [editMode, setEditMode] = useState(false);
    const [showSlideshow, setShowSlideshow] = useState(false);
    const [showPDF, setShowPDF] = useState(false);
    const [editedSections, setEditedSections] = useState({});
    const [saving, setSaving] = useState(false);

    // ── Polling logic for background generation ──
    React.useEffect(() => {
        setReport(initialReport);
    }, [initialReport]);

    React.useEffect(() => {
        if (!report || report.status !== 'generating') return;

        console.log(`⏳ Report ${report._id} is generating, starting poll...`);
        const pollInterval = setInterval(async () => {
            try {
                const { report: updatedReport } = await studioReports.get(report._id);
                if (updatedReport.status !== 'generating') {
                    console.log(`✅ Report ${report._id} generation finished with status: ${updatedReport.status}`);
                    setReport(updatedReport);
                    onUpdate?.(); // Notify parent
                    clearInterval(pollInterval);
                }
            } catch (err) {
                console.error('Report poll failed:', err);
            }
        }, 3000);

        return () => clearInterval(pollInterval);
    }, [report?._id, report?.status, onUpdate]);

    if (!report) return null;

    const branding = report.branding || {};
    const primary = branding.primaryColor || '#6366f1';
    const sections = report.sections || [];
    const narrative = report.narrative || {};

    const handleEditSection = (sectionId, field, value) => {
        setEditedSections(prev => ({
            ...prev,
            [sectionId]: { ...(prev[sectionId] || {}), [field]: value },
        }));
    };

    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const updatedSections = sections.map(sec => {
                const edits = editedSections[sec.id];
                if (!edits) return sec;
                return {
                    ...sec,
                    data: { ...sec.data, ...edits },
                };
            });
            await studioReports.update(report._id, { sections: updatedSections });
            onUpdate?.();
            setEditMode(false);
            setEditedSections({});
        } catch (err) {
            console.error('Save failed:', err);
        } finally {
            setSaving(false);
        }
    }, [editedSections, sections, report._id, onUpdate]);

    const scrollToSection = (sectionId) => {
        setActiveSection(sectionId);
        document.getElementById(`report-section-${sectionId}`)?.scrollIntoView({
            behavior: 'smooth', block: 'start',
        });
    };

    // ── Section Renderers ──
    const renderKPIGrid = (data) => (
        <div style={s.kpiGrid}>
            {(data.metrics || []).map((m, i) => (
                <div key={i} style={s.kpiCard(primary)}>
                    <div style={s.kpiValue(primary)}>{m.value}{m.unit ? ` ${m.unit}` : ''}</div>
                    <div style={s.kpiLabel}>{m.label}</div>
                    {m.change && (
                        <div style={s.kpiChange(m.changeDirection)}>
                            {m.changeDirection === 'up' ? '▲' : m.changeDirection === 'down' ? '▼' : '●'} {m.change}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderChart = (data) => (
        <div>
            <ReportChart chartType={data.chartType || 'bar'} data={data} branding={branding} height={300} />
            {data.description && (
                <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 10, textAlign: 'center', fontStyle: 'italic' }}>
                    {data.description}
                </p>
            )}
        </div>
    );

    const renderTable = (data) => (
        <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
                <thead>
                    <tr>
                        {(data.columns || []).map((col, i) => (
                            <th key={i} style={s.th}>{col.label || col.key}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map((row, ri) => (
                        <tr key={ri}>
                            {(data.columns || []).map((col, ci) => (
                                <td key={ci} style={{
                                    ...s.td,
                                    ...(ci === 0 ? { borderRadius: '6px 0 0 6px', fontWeight: 500 } : {}),
                                    ...(ci === (data.columns || []).length - 1 ? { borderRadius: '0 6px 6px 0' } : {}),
                                }}>{row[col.key] ?? '—'}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const renderText = (data, sectionId) => {
        if (editMode) {
            const editedContent = editedSections[sectionId]?.content ?? data.content ?? '';
            return (
                <textarea
                    style={s.editTextarea}
                    value={editedContent}
                    onChange={e => handleEditSection(sectionId, 'content', e.target.value)}
                    placeholder="Edit this section..."
                />
            );
        }
        return (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: '#cbd5e1' }}>
                <FormattedText text={data.content || ''} />
            </div>
        );
    };

    const renderRecommendations = (data) => (
        <div>
            {(data.items || []).map((r, i) => (
                <div key={i} style={s.recoCard(PRIORITY_COLORS[r.priority] || '#64748b')}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{r.title}</span>
                        <span style={s.badge(PRIORITY_COLORS[r.priority] || '#64748b')}>{r.priority}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.6 }}>
                        <FormattedText text={r.description} />
                    </div>
                    {r.impact && (
                        <div style={{ fontSize: 11, color: primary, marginTop: 6, fontWeight: 500 }}>
                            💡 Impact: {r.impact}
                        </div>
                    )}
                    {r.action && (
                        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                            → {r.action}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderTimeline = (data) => (
        <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{
                position: 'absolute', left: 7, top: 0, bottom: 0, width: 2,
                background: `linear-gradient(to bottom, ${primary}, ${primary}20)`,
            }} />
            {(data.events || []).map((evt, i) => (
                <div key={i} style={{ marginBottom: 20, position: 'relative' }}>
                    <div style={{
                        position: 'absolute', left: -21, top: 4, width: 12, height: 12,
                        borderRadius: '50%', border: `2px solid ${primary}`,
                        background: evt.status === 'completed' ? primary :
                                   evt.status === 'in-progress' ? '#f59e0b' : '#1e293b',
                    }} />
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>{evt.date}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{evt.title}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{evt.description}</div>
                </div>
            ))}
        </div>
    );

    const renderSection = (section) => {
        const data = section.data || {};
        switch (section.type) {
            case 'kpi-grid': return renderKPIGrid(data);
            case 'chart': return renderChart(data);
            case 'table': return renderTable(data);
            case 'text': return renderText(data, section.id);
            case 'recommendations': return renderRecommendations(data);
            case 'timeline': return renderTimeline(data);
            default: return <div style={{ color: '#64748b' }}>Unknown section type: {section.type}</div>;
        }
    };

    if (showSlideshow) {
        return <SlideshowMode report={report} onClose={() => setShowSlideshow(false)} />;
    }
    if (showPDF) {
        return <ReportPDFExport report={report} onClose={() => setShowPDF(false)} />;
    }

    return (
        <div style={s.overlay}>
            {/* Sidebar */}
            <div style={s.sidebar}>
                <div style={s.sidebarHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        {branding.logo && (
                            <img src={branding.logo} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
                        )}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>
                            {branding.brandName || 'Report'}
                        </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>
                        {report.studio?.toUpperCase()} • {report.reportType?.replace(/-/g, ' ')}
                    </div>
                </div>

                {/* Section navigation */}
                <div style={{ flex: 1, overflow: 'auto', paddingTop: 8 }}>
                    <div
                        style={s.navItem(activeSection === 'summary')}
                        onClick={() => scrollToSection('summary')}
                    >
                        📋 Executive Summary
                    </div>
                    {sections.map(sec => (
                        <div
                            key={sec.id}
                            style={s.navItem(activeSection === sec.id)}
                            onClick={() => scrollToSection(sec.id)}
                        >
                            {SECTION_ICONS[sec.type] || '📄'} {sec.title || sec.id}
                        </div>
                    ))}
                </div>

                {/* Sidebar actions */}
                <div style={{ padding: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 10, color: '#64748b', marginBottom: 4 }}>
                        Generated {new Date(report.createdAt).toLocaleDateString()}
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div style={s.main}>
                {/* Toolbar */}
                <div style={s.toolbar}>
                    <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0, flex: 1 }}>
                        {report.title}
                    </h2>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={() => setEditMode(!editMode)}
                            style={s.toolBtn(editMode)}
                        >
                            {editMode ? '✏️ Editing' : '✏️ Edit'}
                        </button>
                        {editMode && (
                            <button onClick={handleSave} disabled={saving} style={s.toolBtn(true)}>
                                {saving ? '💾 Saving...' : '💾 Save'}
                            </button>
                        )}
                        <button onClick={() => setShowSlideshow(true)} style={s.toolBtn(false)}>
                            🎬 Slideshow
                        </button>
                        <button onClick={() => setShowPDF(true)} style={s.toolBtn(false)}>
                            📥 PDF
                        </button>
                        <button onClick={onClose} style={s.toolBtn(false)}>
                            ✕ Close
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={s.content}>
                    {/* Executive Summary */}
                    <div id="report-section-summary">
                        {narrative.executiveSummary && (
                            <div style={s.summaryBox(primary)}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: primary, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Executive Summary
                                </div>
                                <div style={{ fontSize: 15, lineHeight: 1.7 }}>
                                    <FormattedText text={narrative.executiveSummary} />
                                </div>
                            </div>
                        )}

                        {narrative.keyInsights?.length > 0 && (
                            <div style={{ marginBottom: 24 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>
                                    KEY INSIGHTS
                                </div>
                                <div>
                                    {narrative.keyInsights.map((insight, i) => (
                                        <span key={i} style={s.insightChip}>💡 {insight}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Report Sections */}
                    {sections.length === 0 && (
                        <div style={s.emptyState}>
                            {report.status === 'generating' ? (
                                <>
                                    <div style={{ fontSize: 48, marginBottom: 20, animation: 'pulse 1.5s infinite ease-in-out' }}>🧠</div>
                                    <div style={{ fontSize: 20, fontWeight: 600, color: '#f1f5f9' }}>AI is Crafting Your Report...</div>
                                    <div style={{ fontSize: 13, marginTop: 8, maxWidth: 400, margin: '8px auto 0', lineHeight: 1.6 }}>
                                        Analyzing SEO audits, performance data, and competitor insights to build a full branded strategy. This usually takes 30-60 seconds.
                                    </div>
                                    <div style={{ marginTop: 24, display: 'flex', justifyContent: 'center', gap: 4 }}>
                                        {[0, 1, 2].map(i => (
                                            <div key={i} style={{
                                                width: 8, height: 8, borderRadius: '50%', background: primary,
                                                animation: `bounce 1s infinite ${i * 0.2}s`
                                            }} />
                                        ))}
                                    </div>
                                    <style>{`
                                        @keyframes pulse {
                                            0% { transform: scale(1); opacity: 0.8; }
                                            50% { transform: scale(1.1); opacity: 1; }
                                            100% { transform: scale(1); opacity: 0.8; }
                                        }
                                        @keyframes bounce {
                                            0%, 100% { transform: translateY(0); }
                                            50% { transform: translateY(-10px); }
                                        }
                                    `}</style>
                                </>
                            ) : report.status === 'failed' ? (
                                <>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
                                    <div style={{ fontSize: 16, fontWeight: 600, color: '#ef4444' }}>Generation Failed</div>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>{report.error || 'An unexpected error occurred during report generation.'}</div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                                    <div style={{ fontSize: 16, fontWeight: 500 }}>No sections in this report</div>
                                    <div style={{ fontSize: 13, marginTop: 4 }}>Add some contents via the edit mode.</div>
                                </>
                            )}
                        </div>
                    )}

                    {sections.map((section, i) => (
                        <div
                            key={section.id || i}
                            id={`report-section-${section.id}`}
                            style={s.sectionCard}
                        >
                            <div style={s.sectionTitle}>
                                <span>
                                    {SECTION_ICONS[section.type] || '📄'}{' '}
                                    {section.title}
                                </span>
                                {editMode && section.type === 'text' && (
                                    <span style={s.badge(primary)}>editable</span>
                                )}
                            </div>
                            {renderSection(section)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
