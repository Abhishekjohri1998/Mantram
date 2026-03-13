/**
 * ReportPDFExport — Client-side PDF generation for Studio Reports
 * 
 * Uses html2pdf.js to render a branded report as a downloadable PDF.
 */

import React, { useRef, useCallback } from 'react';
import ReportChart from './ReportCharts';
import FormattedText from '../FormattedText';

export default function ReportPDFExport({ report, onClose }) {
    const contentRef = useRef(null);
    const branding = report?.branding || {};
    const primary = branding.primaryColor || '#6366f1';
    const sections = report?.sections || [];
    const narrative = report?.narrative || {};

    const handleDownload = useCallback(async () => {
        if (!contentRef.current) return;
        try {
            const html2pdf = (await import('html2pdf.js')).default;
            const opt = {
                margin: [12, 12, 12, 12],
                filename: `${(report?.title || 'Report').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`,
                image: { type: 'jpeg', quality: 0.95 },
                html2canvas: { scale: 2, useCORS: true, logging: false },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            };
            await html2pdf().set(opt).from(contentRef.current).save();
        } catch (err) {
            console.error('PDF export failed:', err);
            alert('PDF export failed. Please try again.');
        }
    }, [report]);

    const renderSection = (section) => {
        const d = section.data || {};
        switch (section.type) {
            case 'kpi-grid':
                return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, margin: '12px 0' }}>
                        {(d.metrics || []).map((m, i) => (
                            <div key={i} style={{
                                flex: '1 1 140px', padding: '14px 12px', borderRadius: 8,
                                border: `1px solid ${primary}33`, textAlign: 'center', background: `${primary}08`,
                            }}>
                                <div style={{ fontSize: 22, fontWeight: 700, color: primary }}>{m.value}{m.unit ? ` ${m.unit}` : ''}</div>
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{m.label}</div>
                                {m.change && (
                                    <div style={{
                                        fontSize: 10, marginTop: 4,
                                        color: m.changeDirection === 'up' ? '#16a34a' : m.changeDirection === 'down' ? '#dc2626' : '#64748b',
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
                    <div style={{ margin: '12px 0' }}>
                        <ReportChart chartType={d.chartType || 'bar'} data={d} branding={branding} height={220} />
                    </div>
                );
            case 'table':
                return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, margin: '12px 0' }}>
                        <thead>
                            <tr>
                                {(d.columns || []).map((col, i) => (
                                    <th key={i} style={{
                                        textAlign: 'left', padding: '8px 10px', borderBottom: `2px solid ${primary}`,
                                        fontSize: 9, textTransform: 'uppercase', color: '#64748b',
                                    }}>{col.label || col.key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {(d.rows || []).map((row, ri) => (
                                <tr key={ri}>
                                    {(d.columns || []).map((col, ci) => (
                                        <td key={ci} style={{
                                            padding: '6px 10px',
                                            borderBottom: '1px solid #e2e8f0',
                                        }}>{row[col.key] ?? '—'}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                );
            case 'text':
                return (
                    <div style={{ fontSize: 11, lineHeight: 1.7, color: '#334155', margin: '8px 0' }}>
                        <FormattedText text={d.content || ''} light />
                    </div>
                );
            case 'recommendations':
                return (
                    <div style={{ margin: '12px 0' }}>
                        {(d.items || []).map((r, i) => (
                            <div key={i} style={{
                                padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                                borderLeft: `3px solid ${r.priority === 'high' ? '#dc2626' : r.priority === 'medium' ? '#f59e0b' : '#16a34a'}`,
                                background: '#f8fafc',
                            }}>
                                <div style={{ fontWeight: 600, fontSize: 11 }}>{r.title}</div>
                                <div style={{ fontSize: 10, color: '#64748b' }}>{r.description}</div>
                            </div>
                        ))}
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99999,
            background: 'rgba(0,0,0,0.7)', display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
            {/* Toolbar */}
            <div style={{
                display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center',
            }}>
                <button onClick={handleDownload} style={{
                    background: primary, color: '#fff', border: 'none', padding: '10px 28px',
                    borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 14,
                }}>
                    ⬇ Download PDF
                </button>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
                    padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14,
                }}>
                    Close
                </button>
            </div>

            {/* PDF Preview */}
            <div style={{
                maxHeight: 'calc(100vh - 100px)', overflow: 'auto', background: '#fff',
                borderRadius: 12, width: '100%', maxWidth: 800, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            }}>
                <div ref={contentRef} style={{ padding: '32px 36px', color: '#0f172a', fontFamily: branding.fontFamily || 'Inter, system-ui, sans-serif' }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        borderBottom: `2px solid ${primary}`, paddingBottom: 16, marginBottom: 24,
                    }}>
                        <div>
                            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: primary }}>
                                {report?.title || 'Report'}
                            </h1>
                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                                {report?.studio?.toUpperCase()} Studio • {new Date(report?.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </div>
                        </div>
                        {branding.logo && (
                            <img src={branding.logo} alt={branding.brandName} style={{ height: 40, borderRadius: 6 }} />
                        )}
                    </div>

                    {/* Executive Summary */}
                    {narrative.executiveSummary && (
                        <div style={{
                            background: `${primary}08`, borderRadius: 8, padding: '14px 16px',
                            marginBottom: 24, borderLeft: `3px solid ${primary}`,
                        }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: primary, marginBottom: 4 }}>
                                EXECUTIVE SUMMARY
                            </div>
                            <div style={{ fontSize: 12, lineHeight: 1.6, color: '#334155' }}>
                                <FormattedText text={narrative.executiveSummary} light />
                            </div>
                        </div>
                    )}

                    {/* Key Insights */}
                    {narrative.keyInsights?.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <h3 style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>Key Insights</h3>
                            <ul style={{ paddingLeft: 18, margin: 0 }}>
                                {narrative.keyInsights.map((insight, i) => (
                                    <li key={i} style={{ fontSize: 11, lineHeight: 1.6, color: '#475569', marginBottom: 4 }}>
                                        {insight}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Sections */}
                    {sections.map((section, i) => (
                        <div key={section.id || i} style={{ marginBottom: 24, pageBreakInside: 'avoid' }}>
                            <h3 style={{
                                fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8,
                                paddingBottom: 6, borderBottom: '1px solid #e2e8f0',
                            }}>
                                {section.title}
                            </h3>
                            {renderSection(section)}
                        </div>
                    ))}

                    {/* Footer */}
                    <div style={{
                        marginTop: 32, paddingTop: 12, borderTop: `1px solid ${primary}33`,
                        display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#94a3b8',
                    }}>
                        <span>Generated by Mantram AI • {branding.brandName}</span>
                        <span>Confidential — For internal use only</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
