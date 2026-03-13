/**
 * StudioReportButton — Reusable "Generate Report" button + viewer integration
 * 
 * Drop into any studio page. Handles report generation, loading state,
 * report type selection, and opens the interactive viewer.
 */

import React, { useState, useCallback } from 'react';
import { studioReports } from '../../services/api';
import StudioReportViewer from './StudioReportViewer';

const STUDIO_REPORT_TYPES = {
    seo: [
        { id: 'health-check', label: 'Health Check Report', icon: '🏥' },
        { id: 'competitor-analysis', label: 'Competitor Analysis', icon: '⚔️' },
        { id: 'traffic-report', label: 'Traffic Report', icon: '📈' },
        { id: 'ai-visibility', label: 'AI Visibility Report', icon: '🤖' },
    ],
    pm: [
        { id: 'competitor-research', label: 'Competitor Research', icon: '🔍' },
        { id: 'campaign-performance', label: 'Campaign Performance', icon: '📊' },
        { id: 'strategy-report', label: 'Strategy Report', icon: '📋' },
        { id: 'budget-analysis', label: 'Budget Analysis', icon: '💰' },
    ],
    funnel: [
        { id: 'funnel-health', label: 'Funnel Health Report', icon: '🏥' },
        { id: 'conversion-analysis', label: 'Conversion Analysis', icon: '🎯' },
        { id: 'pipeline-report', label: 'Pipeline Report', icon: '📊' },
    ],
    d2c: [
        { id: 'revenue-report', label: 'Revenue Report', icon: '💰' },
        { id: 'product-performance', label: 'Product Performance', icon: '📦' },
        { id: 'customer-insights', label: 'Customer Insights', icon: '👥' },
    ],
};

export default function StudioReportButton({ studio, brandId, style = {} }) {
    const [showMenu, setShowMenu] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [currentReport, setCurrentReport] = useState(null);
    const [showHistory, setShowHistory] = useState(false);
    const [reportHistory, setReportHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    const reportTypes = STUDIO_REPORT_TYPES[studio] || [];

    const handleGenerate = useCallback(async (reportType) => {
        setShowMenu(false);
        setGenerating(true);
        try {
            const { report } = await studioReports.generate({
                studio,
                reportType,
                brandId,
            });
            setCurrentReport(report);
        } catch (err) {
            console.error('Report generation failed:', err);
            alert('Report generation failed: ' + (err.message || 'Unknown error'));
        } finally {
            setGenerating(false);
        }
    }, [studio, brandId]);

    const loadHistory = useCallback(async () => {
        setLoadingHistory(true);
        try {
            const { reports } = await studioReports.list({ studio, brandId, limit: 10 });
            setReportHistory(reports || []);
        } catch (err) {
            console.error('Failed to load reports:', err);
        } finally {
            setLoadingHistory(false);
        }
    }, [studio, brandId]);

    const openReport = useCallback(async (reportId) => {
        try {
            const { report } = await studioReports.get(reportId);
            setCurrentReport(report);
            setShowHistory(false);
        } catch (err) {
            console.error('Failed to load report:', err);
        }
    }, []);

    const handleShowHistory = useCallback(() => {
        setShowHistory(true);
        loadHistory();
    }, [loadHistory]);

    // Report viewer overlay
    if (currentReport) {
        return (
            <StudioReportViewer
                report={currentReport}
                onClose={() => setCurrentReport(null)}
                onUpdate={() => {
                    // Refresh report after edit
                    studioReports.get(currentReport._id).then(({ report }) => setCurrentReport(report));
                }}
            />
        );
    }

    return (
        <div style={{ position: 'relative', display: 'inline-block', ...style }}>
            {/* Main button group */}
            <div style={{ display: 'flex', gap: 6 }}>
                <button
                    onClick={() => setShowMenu(!showMenu)}
                    disabled={generating}
                    style={{
                        background: generating ? 'rgba(99, 102, 241, 0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                        color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '10px 0 0 10px',
                        cursor: generating ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600,
                        display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.2s',
                        boxShadow: '0 2px 12px rgba(99, 102, 241, 0.3)',
                    }}
                >
                    {generating ? (
                        <>
                            <span className="material-symbols-outlined" style={{ fontSize: 16, animation: 'spin 1s linear infinite' }}>sync</span>
                            Generating...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>summarize</span>
                            Generate Report
                        </>
                    )}
                </button>
                <button
                    onClick={handleShowHistory}
                    style={{
                        background: 'rgba(99, 102, 241, 0.15)', color: '#a5b4fc', border: '1px solid rgba(99, 102, 241, 0.2)',
                        padding: '8px 12px', borderRadius: '0 10px 10px 0', cursor: 'pointer', fontSize: 16,
                        display: 'flex', alignItems: 'center',
                    }}
                    title="View report history"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>history</span>
                </button>
            </div>

            {/* Report type dropdown */}
            {showMenu && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 1000,
                    background: 'rgba(15, 23, 42, 0.98)', borderRadius: 12, minWidth: 260,
                    border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(20px)', overflow: 'hidden',
                }}>
                    <div style={{ padding: '12px 16px 8px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Select Report Type
                    </div>
                    {reportTypes.map(rt => (
                        <button
                            key={rt.id}
                            onClick={() => handleGenerate(rt.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                                padding: '10px 16px', background: 'transparent', border: 'none',
                                color: '#e2e8f0', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => e.target.style.background = 'rgba(99, 102, 241, 0.1)'}
                            onMouseLeave={e => e.target.style.background = 'transparent'}
                        >
                            <span style={{ fontSize: 18 }}>{rt.icon}</span>
                            {rt.label}
                        </button>
                    ))}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 8 }}>
                        <button
                            onClick={() => { setShowMenu(false); handleShowHistory(); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                                padding: '8px', background: 'transparent', border: 'none',
                                color: '#94a3b8', cursor: 'pointer', fontSize: 12, borderRadius: 6,
                            }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>
                            View Past Reports
                        </button>
                    </div>
                </div>
            )}

            {/* Report history overlay */}
            {showHistory && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', backdropFilter: 'blur(4px)',
                }} onClick={() => setShowHistory(false)}>
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#0f172a', borderRadius: 16, width: '100%', maxWidth: 520,
                            maxHeight: '70vh', overflow: 'auto', border: '1px solid rgba(255,255,255,0.08)',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                        }}
                    >
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                                📊 {studio.toUpperCase()} Reports
                            </h3>
                            <button
                                onClick={() => setShowHistory(false)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}
                            >✕</button>
                        </div>

                        {loadingHistory ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading...</div>
                        ) : reportHistory.length === 0 ? (
                            <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                                No reports yet. Generate your first report!
                            </div>
                        ) : (
                            <div style={{ padding: 12 }}>
                                {reportHistory.map(r => (
                                    <button
                                        key={r._id}
                                        onClick={() => openReport(r._id)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                                            padding: '12px 16px', background: 'rgba(255,255,255,0.03)', border: 'none',
                                            borderRadius: 10, color: '#e2e8f0', cursor: 'pointer', marginBottom: 6,
                                            textAlign: 'left', transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={e => e.target.style.background = 'rgba(99, 102, 241, 0.1)'}
                                        onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.03)'}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 500, fontSize: 13 }}>{r.title}</div>
                                            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                                {r.reportType?.replace(/-/g, ' ')} • {new Date(r.createdAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: 10, padding: '2px 8px', borderRadius: 8,
                                            background: r.status === 'complete' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                            color: r.status === 'complete' ? '#34d399' : '#fbbf24',
                                        }}>
                                            {r.status}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Click-away */}
            {showMenu && (
                <div
                    style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }}
                    onClick={() => setShowMenu(false)}
                />
            )}
        </div>
    );
}
