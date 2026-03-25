/**
 * SeoAdvancedTools — 9-tab Advanced Tools panel for SEO Studio
 * 
 * Each tab maps to existing backend workflows:
 *   Overview     → health-check + GA/GSC
 *   Site Audit   → health-check (issues focus)
 *   Keywords     → traffic (keyword clusters)
 *   Content Ops  → traffic (content gaps)
 *   GEO          → ai-visibility + llm-probe + prompt-mining
 *   Competitors  → competitors + competitor-warroom
 *   On-Page      → audit-page + auto-fix
 *   Backlinks    → backlinks (new)
 *   Reports      → studio-reports + history
 */

import React, { useState, useCallback, useEffect } from 'react';
import { seoStudio as seoAPI } from '../../services/api';
import StudioReportButton from '../reports/StudioReportButton';
import FormattedText from '../FormattedText';

const TABS = [
    { id: 'overview', icon: 'space_dashboard', label: 'Overview' },
    { id: 'site-audit', icon: 'bug_report', label: 'Site Audit' },
    { id: 'keywords', icon: 'key', label: 'Keywords' },
    { id: 'content-ops', icon: 'article', label: 'Content' },
    { id: 'geo', icon: 'travel_explore', label: 'GEO' },
    { id: 'competitor-detail', icon: 'groups', label: 'Competitors' },
    { id: 'on-page', icon: 'tune', label: 'On-Page' },
    { id: 'backlinks', icon: 'link', label: 'Backlinks' },
    { id: 'reports', icon: 'summarize', label: 'Reports' },
];

const SEVERITY_COLORS = { critical: '#fb7185', high: '#fb923c', medium: '#fbbf24', low: '#94a3b8' };

// Map tab IDs to SeoAudit type values for persistence
const TAB_TO_AUDIT_TYPE = {
    'site-audit': 'health-check',
    'keywords': 'traffic',
    'content-ops': 'traffic',
    'geo': 'ai-visibility',
    'competitor-detail': 'competitors',
    'on-page': 'page-audit',
    'backlinks': 'backlinks',
};

export default function SeoAdvancedTools({ advPage, setAdvPage, onBack, brand, website, competitors, brandPayload, gaConnected, gaReport, gscReport, gaLoading, gaAuthError, reconnectGA, hideNav }) {
    // Per-tab data cache
    const [tabData, setTabData] = useState({});
    const [loadingAction, setLoadingAction] = useState('');
    const [loadingMsg, setLoadingMsg] = useState('');
    const [pageUrl, setPageUrl] = useState('');
    const [issueFilter, setIssueFilter] = useState('all');
    const [reportTimestamps, setReportTimestamps] = useState({});

    // Content fix state (per-item AI generated content)
    const [contentFixes, setContentFixes] = useState({});
    const [fixLoading, setFixLoading] = useState({});

    const brandId = brand?._id;

    // Auto-load saved report when switching tabs
    useEffect(() => {
        const auditType = TAB_TO_AUDIT_TYPE[advPage];
        if (!auditType || !brandId || tabData[advPage]) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await seoAPI.getSavedReport(brandId, auditType);
                if (!cancelled && res.found && res.report) {
                    setTabData(prev => ({ ...prev, [advPage]: { ...res.report, success: true } }));
                    setReportTimestamps(prev => ({ ...prev, [advPage]: res.generatedAt }));
                }
            } catch { /* silent — no cached report */ }
        })();
        return () => { cancelled = true; };
    }, [advPage, brandId]);

    // Generic workflow runner
    const runAnalysis = useCallback(async (tabId, apiFn, payload, msg = 'Analyzing...', actionId = '') => {
        const aid = actionId || tabId;
        setLoadingAction(aid); setLoadingMsg(msg);
        try {
            const data = await apiFn(payload);
            setTabData(prev => ({ ...prev, [tabId]: data }));
            setReportTimestamps(prev => ({ ...prev, [tabId]: new Date().toISOString() }));
        } catch (err) {
            setTabData(prev => ({ ...prev, [tabId]: { error: err.message } }));
        } finally { setLoadingAction(''); setLoadingMsg(''); }
    }, []);

    const buildPayload = (extra = {}) => ({
        url: website, brand: brandPayload, brandId, country: brand?.dna?.country || 'India', industry: brand?.dna?.industry, ...extra,
    });

    // ── Content Fix: one-click AI content generation from SEO suggestions ──
    const generateContentFix = useCallback(async (fixKey, { issueTitle, issueDescription, pageUrl: pUrl, fixType, currentContent, targetKeyword }) => {
        setFixLoading(prev => ({ ...prev, [fixKey]: true }));
        try {
            const res = await seoAPI.contentFix({ brandId, issueTitle, issueDescription, pageUrl: pUrl || website, fixType, currentContent, targetKeyword });
            if (res.success && res.content) {
                setContentFixes(prev => ({ ...prev, [fixKey]: res.content }));
            }
        } catch (err) {
            setContentFixes(prev => ({ ...prev, [fixKey]: `Error: ${err.message}` }));
        } finally {
            setFixLoading(prev => ({ ...prev, [fixKey]: false }));
        }
    }, [brandId, website]);

    // Reusable inline Fix-with-AI button + result display
    const FixWithAI = ({ fixKey, issueTitle, issueDescription, pageUrl: pUrl, fixType, currentContent, targetKeyword, label }) => {
        const isLoading = fixLoading[fixKey];
        const result = contentFixes[fixKey];
        return (
            <div className="mt-2">
                {!result && (
                    <button
                        onClick={() => generateContentFix(fixKey, { issueTitle, issueDescription, pageUrl: pUrl, fixType, currentContent, targetKeyword })}
                        disabled={isLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all border"
                        style={{
                            background: isLoading ? 'rgba(99,102,241,0.1)' : 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))',
                            borderColor: 'rgba(99,102,241,0.3)',
                            color: '#a5b4fc',
                        }}
                    >
                        {isLoading ? (
                            <><span className="material-symbols-outlined text-xs animate-spin">sync</span> Generating...</>
                        ) : (
                            <><span className="material-symbols-outlined text-xs">auto_fix_high</span> {label || 'Fix with AI'}</>
                        )}
                    </button>
                )}
                {result && (
                    <div className="mt-2 rounded-xl p-4 border" style={{ background: 'rgba(99,102,241,0.04)', borderColor: 'rgba(99,102,241,0.15)' }}>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-primary flex items-center gap-1">
                                <span className="material-symbols-outlined text-xs">auto_fix_high</span> AI Generated Content
                            </span>
                            <div className="flex gap-2">
                                <button onClick={() => navigator.clipboard.writeText(result)}
                                    className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] text-slate-300 font-bold cursor-pointer hover:bg-white/[0.1] flex items-center gap-1 border border-white/[0.08]">
                                    <span className="material-symbols-outlined text-[10px]">content_copy</span> Copy
                                </button>
                                <button onClick={() => { setContentFixes(prev => { const n = { ...prev }; delete n[fixKey]; return n; }); generateContentFix(fixKey, { issueTitle, issueDescription, pageUrl: pUrl, fixType, currentContent, targetKeyword }); }}
                                    className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] text-slate-300 font-bold cursor-pointer hover:bg-white/[0.1] flex items-center gap-1 border border-white/[0.08]">
                                    <span className="material-symbols-outlined text-[10px]">refresh</span> Regenerate
                                </button>
                                <button onClick={() => setContentFixes(prev => { const n = { ...prev }; delete n[fixKey]; return n; })}
                                    className="text-[10px] px-2 py-1 rounded-md bg-white/[0.05] text-slate-400 font-bold cursor-pointer hover:bg-white/[0.1] border border-white/[0.08]">
                                    ✕
                                </button>
                            </div>
                        </div>
                        <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">{result}</div>
                    </div>
                )}
            </div>
        );
    };

    const data = tabData[advPage];
    const cachedAt = reportTimestamps[advPage];
    const hasData = data && !data.error;

    // ── Shared components (Premium Styled) ──
    const loading = !!loadingAction;
    const RunButton = ({ onClick, label, icon = 'play_arrow', disabled = false, actionId = '' }) => {
        const isMe = loadingAction && loadingAction === actionId;
        const isBusy = !!loadingAction;
        return (
            <button onClick={onClick} disabled={disabled || isBusy}
                className="group px-6 py-3 rounded-xl text-white text-sm font-bold cursor-pointer transition-all duration-300 flex items-center gap-2.5 disabled:opacity-30 hover:scale-[1.02] active:scale-[0.98]"
                style={{ background: isMe ? 'rgba(99,102,241,0.2)' : isBusy ? 'rgba(99,102,241,0.12)' : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)', boxShadow: isBusy ? 'none' : '0 4px 20px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
                <span className="material-symbols-outlined text-sm" style={isMe ? { animation: 'spin 1s linear infinite' } : {}}>{isMe ? 'sync' : icon}</span>
                {isMe ? loadingMsg : label}
                {!isBusy && <span className="material-symbols-outlined text-sm opacity-0 group-hover:opacity-100 transition-opacity -ml-1">arrow_forward</span>}
            </button>
        );
    };

    const EmptyState = ({ icon, title, desc, children }) => (
        <div className="text-center py-20 animate-fade-in relative">
            {/* Decorative background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                <div className="w-64 h-64 rounded-full" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)' }} />
            </div>
            {/* Icon with gradient circle */}
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-5" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.08) 100%)', border: '1px solid rgba(99,102,241,0.15)' }}>
                <span className="material-symbols-outlined text-4xl" style={{ color: '#a78bfa' }}>{icon}</span>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
            <p className="text-sm text-slate-400 mb-7 max-w-lg mx-auto leading-relaxed">{desc}</p>
            <div className="flex justify-center gap-3 flex-wrap">{children}</div>
        </div>
    );

    const SectionCard = ({ title, icon, children, className = '', accent }) => (
        <div className={`group rounded-2xl p-5 transition-all duration-300 hover:shadow-lg ${className}`}
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
            {title && (
                <div className="flex items-center gap-2 mb-4">
                    {icon && <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: accent || 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))' }}>
                        <span className="material-symbols-outlined text-sm" style={{ color: '#a78bfa' }}>{icon}</span>
                    </div>}
                    <h3 className="text-sm font-bold text-white tracking-wide">{title}</h3>
                </div>
            )}
            {children}
        </div>
    );

    const ScoreRing = ({ score, size = 80, label, color = '#a78bfa' }) => {
        const r = (size - 10) / 2, c = 2 * Math.PI * r, offset = c - ((score || 0) / 100) * c;
        const scoreColor = (score || 0) >= 70 ? '#34d399' : (score || 0) >= 40 ? '#fbbf24' : '#fb7185';
        return (
            <div className="flex flex-col items-center gap-1">
                <svg width={size} height={size} className="-rotate-90">
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="5" />
                    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 4px ${color}40)` }} />
                </svg>
                <span className="text-xl font-black text-white -mt-14">{score || 0}</span>
                {label && <p className="text-[11px] text-slate-500 mt-2 font-bold uppercase tracking-wider">{label}</p>}
            </div>
        );
    };

    const DataTable = ({ columns, rows }) => (
        <div className="overflow-x-auto rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.06)' }}>
            <table className="w-full text-left text-sm">
                <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {columns.map(c => <th key={c.key} className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-wider">{c.label}</th>)}
                </tr></thead>
                <tbody>{(rows || []).map((r, i) => (
                    <tr key={i} className="transition-colors hover:bg-white/[0.02]" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                        {columns.map(c => <td key={c.key} className="px-4 py-3 text-slate-300">{r[c.key]}</td>)}
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );

    // ══════════════════════════════════════════════
    // TAB PANELS
    // ══════════════════════════════════════════════

    const renderTab = () => {
        switch (advPage) {
            // ── OVERVIEW DASHBOARD ──
            case 'overview': {
                const hasAnalytics = gaReport || gscReport;
                const isLoading = gaLoading && !hasAnalytics;

                // Only show empty state if nothing at all — no analytics, no health check
                if (!hasData && !hasAnalytics && !isLoading && !gaConnected) return (
                    <EmptyState icon="space_dashboard" title="Overview Dashboard" desc="Connect Google Analytics & Search Console to see live traffic data, or run a Health Check to analyze your SEO.">
                        <RunButton onClick={() => runAnalysis('overview', seoAPI.healthCheck, buildPayload(), 'Running health check...')} label="Run Health Check" icon="health_and_safety" />
                    </EmptyState>
                );

                const d = data || {};
                return (
                    <div className="space-y-6 animate-fade-in">

                        {/* ═══ LIVE ANALYTICS DASHBOARD (Primary Content) ═══ */}
                        {isLoading && (
                            <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))', border: '1px solid rgba(99,102,241,0.15)' }}>
                                <span className="material-symbols-outlined text-3xl text-primary animate-spin block mb-3">sync</span>
                                <p className="text-sm text-white font-bold">Loading your analytics dashboard...</p>
                                <p className="text-xs text-slate-400 mt-1">Fetching data from Google Analytics & Search Console</p>
                            </div>
                        )}

                        {gaConnected && !hasAnalytics && !isLoading && (
                            <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                                <span className="material-symbols-outlined text-3xl text-amber-400 block mb-3">warning</span>
                                <p className="text-sm text-white font-bold">Google Analytics Connected — No Data Yet</p>
                                <p className="text-xs text-slate-400 mt-1">Make sure a GA4 property and Search Console site are linked to your Google account. The data will load automatically.</p>
                            </div>
                        )}

                        {/* ─── GA4 Section ─── */}
                        {gaReport && (
                            <>
                                {/* GA4 KPI Summary */}
                                <SectionCard title="Google Analytics — Last 30 Days" icon="monitoring">
                                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                        {[
                                            { l: 'Users', v: gaReport.summary?.totalUsers?.toLocaleString(), icon: 'person', color: '#60a5fa' },
                                            { l: 'New Users', v: (gaReport.traffic?.reduce((s, t) => s + (t.newUsers || 0), 0) || 0).toLocaleString(), icon: 'person_add', color: '#34d399' },
                                            { l: 'Sessions', v: gaReport.summary?.totalSessions?.toLocaleString(), icon: 'ads_click', color: '#a78bfa' },
                                            { l: 'Page Views', v: gaReport.summary?.totalPageViews?.toLocaleString(), icon: 'visibility', color: '#fbbf24' },
                                            { l: 'Bounce Rate', v: `${((gaReport.summary?.avgBounceRate || 0) * 100).toFixed(1)}%`, icon: 'exit_to_app', color: '#fb7185' },
                                            { l: 'Avg Duration', v: (() => { const avg = gaReport.traffic?.length ? gaReport.traffic.reduce((s, t) => s + (t.avgDuration || 0), 0) / gaReport.traffic.length : 0; return avg >= 60 ? `${Math.floor(avg / 60)}m ${Math.round(avg % 60)}s` : `${Math.round(avg)}s`; })(), icon: 'timer', color: '#f97316' },
                                        ].map(s => (
                                            <div key={s.l} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center">
                                                <span className="material-symbols-outlined text-sm mb-1 block" style={{ color: s.color }}>{s.icon}</span>
                                                <p className="text-lg font-black text-white">{s.v || '—'}</p>
                                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.l}</p>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>

                                {/* Traffic Trend Sparkline */}
                                {gaReport.traffic?.length > 1 && (
                                    <SectionCard title="Daily Users — 30-Day Trend" icon="show_chart">
                                        <div className="h-32 w-full">
                                            {(() => {
                                                const tData = gaReport.traffic;
                                                const maxV = Math.max(...tData.map(t => t.users), 1);
                                                const minV = Math.min(...tData.map(t => t.users));
                                                const w = 100, h = 100;
                                                const points = tData.map((t, i) => {
                                                    const x = (i / (tData.length - 1)) * w;
                                                    const y = h - ((t.users - minV) / (maxV - minV || 1)) * (h - 10) - 5;
                                                    return `${x},${y}`;
                                                }).join(' ');
                                                const areaPath = `M 0,${h} L ${tData.map((t, i) => { const x = (i / (tData.length - 1)) * w; const y = h - ((t.users - minV) / (maxV - minV || 1)) * (h - 10) - 5; return `${x},${y}`; }).join(' L ')} L ${w},${h} Z`;
                                                return (
                                                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
                                                        <defs>
                                                            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3" />
                                                                <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                                                            </linearGradient>
                                                        </defs>
                                                        <path d={areaPath} fill="url(#sparkGrad)" />
                                                        <polyline points={points} fill="none" stroke="#818cf8" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                                    </svg>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
                                            <span>{gaReport.traffic[0]?.date?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</span>
                                            <span className="text-slate-400 font-bold">{Math.max(...gaReport.traffic.map(t => t.users)).toLocaleString()} peak</span>
                                            <span>{gaReport.traffic[gaReport.traffic.length - 1]?.date?.replace(/(\d{4})(\d{2})(\d{2})/, '$2/$3')}</span>
                                        </div>
                                    </SectionCard>
                                )}

                                {/* Channel Breakdown */}
                                {gaReport.channels?.length > 0 && (
                                    <SectionCard title="Traffic Channels" icon="pie_chart">
                                        <div className="space-y-2">
                                            {(() => {
                                                const totalSessions = gaReport.channels.reduce((s, c) => s + c.sessions, 0) || 1;
                                                const channelColors = {
                                                    'Organic Search': '#34d399', 'Direct': '#60a5fa', 'Social': '#f472b6',
                                                    'Referral': '#a78bfa', 'Paid Search': '#fbbf24', 'Email': '#fb923c',
                                                    'Display': '#2dd4bf', 'Organic Social': '#f472b6',
                                                };
                                                return gaReport.channels.map((ch, i) => {
                                                    const pct = ((ch.sessions / totalSessions) * 100).toFixed(1);
                                                    const color = channelColors[ch.channel] || '#94a3b8';
                                                    return (
                                                        <div key={i} className="flex items-center gap-3">
                                                            <span className="text-xs text-slate-300 font-medium w-28 truncate">{ch.channel}</span>
                                                            <div className="flex-1 h-5 rounded-full bg-white/[0.04] overflow-hidden relative">
                                                                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, minWidth: '4px' }} />
                                                            </div>
                                                            <span className="text-xs text-slate-400 font-bold w-12 text-right">{pct}%</span>
                                                            <span className="text-[10px] text-slate-500 w-16 text-right">{ch.sessions.toLocaleString()}</span>
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>
                                    </SectionCard>
                                )}

                                {/* Device Split & Geo */}
                                {gaReport.deviceSplit?.length > 0 && (
                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                        <SectionCard title="Device Split" icon="devices">
                                            <div className="flex flex-col gap-3 mt-2">
                                                {gaReport.deviceSplit.map((d, i) => {
                                                    const icon = d.device.toLowerCase() === 'mobile' ? 'smartphone' : d.device.toLowerCase() === 'tablet' ? 'tablet_mac' : 'desktop_windows';
                                                    const color = d.device.toLowerCase() === 'mobile' ? '#34d399' : d.device.toLowerCase() === 'tablet' ? '#fbbf24' : '#60a5fa';
                                                    const pct = ((d.sessions / gaReport.summary.totalSessions) * 100).toFixed(1);
                                                    return (
                                                        <div key={i} className="flex items-center gap-3 bg-white/[0.02] p-3 rounded-xl border border-white/[0.05]">
                                                            <span className="material-symbols-outlined text-xl" style={{ color }}>{icon}</span>
                                                            <div className="flex-1">
                                                                <p className="text-xs font-bold text-white uppercase">{d.device}</p>
                                                                <div className="mt-1 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
                                                                    <div className="h-full bg-gradient-to-r transition-all duration-700 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <p className="text-sm font-bold text-white">{pct}%</p>
                                                                <p className="text-[10px] text-slate-500">{d.sessions.toLocaleString()} sessions</p>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </SectionCard>
                                        {gaReport.geoCountry?.length > 0 && (
                                            <SectionCard title="Top Countries" icon="public">
                                                <DataTable columns={[
                                                    { key: 'country', label: 'Country' },
                                                    { key: 'sessions', label: 'Sessions' },
                                                    { key: 'users', label: 'Users' }
                                                ]} rows={gaReport.geoCountry.slice(0, 5).map(c => ({
                                                    country: <span className="text-xs font-semibold">{c.country}</span>,
                                                    sessions: c.sessions?.toLocaleString(),
                                                    users: c.users?.toLocaleString()
                                                }))} />
                                            </SectionCard>
                                        )}
                                    </div>
                                )}

                                {/* Top Pages */}
                                {gaReport.topPages?.length > 0 && (
                                    <SectionCard title={`Top Pages (${gaReport.topPages.length})`} icon="description">
                                        <DataTable columns={[
                                            { key: 'path', label: 'Page' },
                                            { key: 'views', label: 'Views' },
                                            { key: 'users', label: 'Users' },
                                            { key: 'bounce', label: 'Bounce' },
                                            { key: 'duration', label: 'Avg Time' },
                                        ]} rows={gaReport.topPages.slice(0, 15).map(p => ({
                                            path: <span className="text-xs truncate max-w-[250px] block" title={p.path}>{p.title || p.path}</span>,
                                            views: p.views?.toLocaleString(),
                                            users: p.users?.toLocaleString(),
                                            bounce: `${((p.bounceRate || 0) * 100).toFixed(0)}%`,
                                            duration: (() => { const dur = p.avgDuration || 0; return dur >= 60 ? `${Math.floor(dur / 60)}m ${Math.round(dur % 60)}s` : `${Math.round(dur)}s`; })(),
                                        }))} />
                                    </SectionCard>
                                )}
                            </>
                        )}

                        {/* ─── GSC Section ─── */}
                        {gscReport && (
                            <>
                                {/* GSC KPI Summary */}
                                <SectionCard title="Search Console — Last 28 Days" icon="travel_explore">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                        {(() => {
                                            const cCurr = gscReport.summary?.totalClicks || 0;
                                            const cPrev = gscReport.summary?.prevTotalClicks || 0;
                                            const cDelta = cCurr > 0 && cPrev > 0 ? ((cCurr - cPrev) / cPrev) * 100 : 0;
                                            
                                            const iCurr = gscReport.summary?.totalImpressions || 0;
                                            const iPrev = gscReport.summary?.prevTotalImpressions || 0;
                                            const iDelta = iCurr > 0 && iPrev > 0 ? ((iCurr - iPrev) / iPrev) * 100 : 0;

                                            return [
                                                { l: 'Total Clicks', v: cCurr.toLocaleString(), icon: 'ads_click', color: '#34d399', delta: cDelta },
                                                { l: 'Impressions', v: iCurr.toLocaleString(), icon: 'visibility', color: '#60a5fa', delta: iDelta },
                                                { l: 'Avg CTR', v: `${((gscReport.summary?.avgCtr || 0) * 100).toFixed(2)}%`, icon: 'percent', color: '#fbbf24' },
                                                { l: 'Avg Position', v: (gscReport.summary?.avgPosition || 0).toFixed(1), icon: 'format_list_numbered', color: '#a78bfa' },
                                            ].map(s => (
                                                <div key={s.l} className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-center relative group">
                                                    <span className="material-symbols-outlined text-sm mb-1 block" style={{ color: s.color }}>{s.icon}</span>
                                                    <p className="text-lg font-black text-white flex items-center justify-center gap-2">
                                                        {s.v || '—'}
                                                        {s.delta !== undefined && s.delta !== 0 && (
                                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${s.delta > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                                                                {s.delta > 0 ? '▲' : '▼'} {Math.abs(s.delta).toFixed(1)}%
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{s.l}</p>
                                                </div>
                                            ))
                                        })()}
                                    </div>
                                </SectionCard>

                                {/* GSC Trend Sparkline */}
                                {gscReport.daily?.length > 1 && (
                                    <SectionCard title="Daily Search Clicks — 28-Day Trend" icon="show_chart">
                                        <div className="h-32 w-full">
                                            {(() => {
                                                const dData = gscReport.daily;
                                                const maxV = Math.max(...dData.map(d => d.clicks), 1);
                                                const minV = Math.min(...dData.map(d => d.clicks));
                                                const w = 100, h = 100;
                                                const points = dData.map((d, i) => {
                                                    const x = (i / (dData.length - 1)) * w;
                                                    const y = h - ((d.clicks - minV) / (maxV - minV || 1)) * (h - 10) - 5;
                                                    return `${x},${y}`;
                                                }).join(' ');
                                                const areaPath = `M 0,${h} L ${dData.map((d, i) => { const x = (i / (dData.length - 1)) * w; const y = h - ((d.clicks - minV) / (maxV - minV || 1)) * (h - 10) - 5; return `${x},${y}`; }).join(' L ')} L ${w},${h} Z`;
                                                return (
                                                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full" preserveAspectRatio="none">
                                                        <defs>
                                                            <linearGradient id="sparkGradGSC" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#34d399" stopOpacity="0.3" />
                                                                <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                                                            </linearGradient>
                                                        </defs>
                                                        <path d={areaPath} fill="url(#sparkGradGSC)" />
                                                        <polyline points={points} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
                                                    </svg>
                                                );
                                            })()}
                                        </div>
                                        <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
                                            <span>{gscReport.daily[0]?.date?.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3')}</span>
                                            <span className="text-emerald-400 font-bold">{Math.max(...gscReport.daily.map(d => d.clicks)).toLocaleString()} peak</span>
                                            <span>{gscReport.daily[gscReport.daily.length - 1]?.date?.replace(/(\d{4})-(\d{2})-(\d{2})/, '$2/$3')}</span>
                                        </div>
                                    </SectionCard>
                                )}

                                {/* GSC Top Keywords */}
                                {gscReport.keywords?.length > 0 && (
                                    <SectionCard title={`Top Search Keywords (${gscReport.keywords.length})`} icon="key">
                                        <DataTable columns={[
                                            { key: 'keyword', label: 'Keyword' },
                                            { key: 'clicks', label: 'Clicks' },
                                            { key: 'impressions', label: 'Impressions' },
                                            { key: 'ctr', label: 'CTR' },
                                            { key: 'position', label: 'Position' },
                                        ]} rows={gscReport.keywords.slice(0, 20).map(k => ({
                                            keyword: <span className="text-xs font-medium">{k.keyword}</span>,
                                            clicks: k.clicks?.toLocaleString(),
                                            impressions: k.impressions?.toLocaleString(),
                                            ctr: `${((k.ctr || 0) * 100).toFixed(1)}%`,
                                            position: <span className={`font-bold ${k.position <= 3 ? 'text-emerald-400' : k.position <= 10 ? 'text-blue-400' : k.position <= 20 ? 'text-amber-400' : 'text-slate-400'}`}>{k.position?.toFixed(1)}</span>,
                                        }))} />
                                        {/* Striking distance */}
                                        {(() => {
                                            const striking = gscReport.keywords.filter(k => k.position >= 4 && k.position <= 20 && k.impressions > 50);
                                            if (striking.length === 0) return null;
                                            return (
                                                <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/10">
                                                    <p className="text-xs font-bold text-amber-400 mb-2 flex items-center gap-1.5">
                                                        <span className="material-symbols-outlined text-sm">trending_up</span>
                                                        Striking Distance ({striking.length} keywords near page 1)
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {striking.slice(0, 10).map((k, i) => (
                                                            <span key={i} className="text-[11px] px-2 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/15">
                                                                {k.keyword} <span className="text-amber-500">#{k.position?.toFixed(0)}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </SectionCard>
                                )}

                                {/* GSC Top Pages */}
                                {gscReport.pages?.length > 0 && (
                                    <SectionCard title={`Top Pages in Search (${gscReport.pages.length})`} icon="web">
                                        <DataTable columns={[
                                            { key: 'page', label: 'Page URL' },
                                            { key: 'clicks', label: 'Clicks' },
                                            { key: 'impressions', label: 'Impressions' },
                                            { key: 'ctr', label: 'CTR' },
                                            { key: 'position', label: 'Avg Pos' },
                                        ]} rows={gscReport.pages.slice(0, 15).map(p => ({
                                            page: <span className="text-xs truncate max-w-[300px] block text-blue-400" title={p.page}>{p.page?.replace(/https?:\/\/[^/]+/, '') || p.page}</span>,
                                            clicks: p.clicks?.toLocaleString(),
                                            impressions: p.impressions?.toLocaleString(),
                                            ctr: `${((p.ctr || 0) * 100).toFixed(1)}%`,
                                            position: p.position?.toFixed(1),
                                        }))} />
                                    </SectionCard>
                                )}

                                {/* SEO Growth Insights */}
                                <SectionCard title="SEO Growth Insights" icon="lightbulb">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Traffic Decay Alert */}
                                        {(() => {
                                            const cCurr = gscReport.summary?.totalClicks || 0;
                                            const cPrev = gscReport.summary?.prevTotalClicks || 0;
                                            const cDelta = cCurr > 0 && cPrev > 0 ? ((cCurr - cPrev) / cPrev) * 100 : 0;
                                            
                                            const droppingKeywords = gscReport.keywords?.filter(k => k.position > 10 && k.impressions > 100 && k.ctr < 0.02) || [];

                                            return (
                                                <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/10 blur-2xl rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
                                                    <h4 className="text-sm font-bold text-rose-400 flex items-center gap-2 mb-2">
                                                        <span className="material-symbols-outlined text-base">warning</span>
                                                        Traffic Decay Risk
                                                    </h4>
                                                    {cDelta < -5 ? (
                                                        <p className="text-xs text-slate-300 mb-2">Search clicks are down <span className="font-bold text-rose-400">{Math.abs(cDelta).toFixed(1)}%</span> period-over-period. Review top losing pages.</p>
                                                    ) : droppingKeywords.length > 0 ? (
                                                        <p className="text-xs text-slate-300 mb-2">You have <span className="font-bold text-rose-400">{droppingKeywords.length}</span> high-impression keywords with poor CTR (&lt;2%) ranking past page 1.</p>
                                                    ) : (
                                                        <p className="text-xs text-emerald-400 mb-2">Traffic trends are stable or growing. No immediate decay detected.</p>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Audience Gap */}
                                        {(() => {
                                            const mobileSplit = gaReport?.deviceSplit?.find(d => d.device.toLowerCase() === 'mobile');
                                            const desktopSplit = gaReport?.deviceSplit?.find(d => d.device.toLowerCase() === 'desktop');
                                            
                                            return (
                                                <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 blur-2xl rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-150" />
                                                    <h4 className="text-sm font-bold text-amber-400 flex items-center gap-2 mb-2">
                                                        <span className="material-symbols-outlined text-base">devices_other</span>
                                                        Mobile vs Desktop Gap
                                                    </h4>
                                                    {(mobileSplit && desktopSplit && mobileSplit.sessions > desktopSplit.sessions * 1.5) ? (
                                                        <p className="text-xs text-slate-300 mb-2">Mobile traffic is significantly higher than desktop. Ensure your site's mobile experience and Core Web Vitals are fully optimized.</p>
                                                    ) : (
                                                        <p className="text-xs text-slate-300 mb-2">Device distribution is balanced. Continue monitoring mobile usability issues in Search Console.</p>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </SectionCard>
                            </>
                        )}

                        {/* ═══ CONNECT ANALYTICS CTA (when not connected) ═══ */}
                        {!gaConnected && (
                            <>
                                {gaAuthError ? (
                                    <div className="rounded-2xl p-6 text-center bg-rose-500/10 border border-rose-500/20">
                                        <span className="material-symbols-outlined text-4xl mb-3 block text-rose-400">gpp_bad</span>
                                        <h3 className="text-base font-bold text-white mb-1">Connection Expired</h3>
                                        <p className="text-sm text-slate-400 max-w-md mx-auto mb-4">{gaAuthError}</p>
                                        <button onClick={reconnectGA}
                                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-rose-500 hover:bg-rose-600 cursor-pointer transition-all shadow-[0_4px_20px_rgba(244,63,94,0.35)] flex items-center gap-2 mx-auto">
                                            <span className="material-symbols-outlined text-sm">refresh</span> Re-authenticate
                                        </button>
                                    </div>
                                ) : (
                                    <div className="rounded-2xl p-6 text-center" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.03))', border: '1px dashed rgba(99,102,241,0.25)' }}>
                                        <span className="material-symbols-outlined text-4xl mb-3 block" style={{ color: '#818cf8' }}>link</span>
                                        <h3 className="text-base font-bold text-white mb-1">Connect Google Analytics & Search Console</h3>
                                        <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">See live traffic, top pages, search keywords, and performance data. Just like your Google dashboard — right here in SEO Studio.</p>
                                        <button onClick={() => window.location.href = '/integrations'}
                                            className="px-6 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-all hover:shadow-lg flex items-center gap-2 mx-auto"
                                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
                                            <span className="material-symbols-outlined text-sm">link</span> Go to Integrations
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {/* ═══ SEO HEALTH CHECK (Secondary — collapsible) ═══ */}
                        {hasData && (
                            <>
                                <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <span className="material-symbols-outlined text-sm text-primary">health_and_safety</span>
                                    <h3 className="text-sm font-bold text-white">SEO Health Check</h3>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                                    {[{ s: d.seoHealthScore, l: 'SEO Health', c: '#34d399' }, { s: d.aiVisibilityScore, l: 'AI Visibility', c: '#a78bfa' },
                                    { s: d.technicalScore, l: 'Technical', c: '#60a5fa' }, { s: d.contentScore, l: 'Content', c: '#fbbf24' },
                                    { s: d.authorityScore, l: 'Authority', c: '#fb7185' }].map(x => (
                                        <SectionCard key={x.l}><ScoreRing score={x.s} label={x.l} color={x.c} /></SectionCard>
                                    ))}
                                </div>
                                {d.summary && <SectionCard title="Summary" icon="description"><FormattedText text={d.summary} /></SectionCard>}
                                {d.topOpportunity && (
                                    <div className="rounded-xl p-4 border border-emerald-500/20 bg-emerald-500/5">
                                        <span className="text-xs font-bold text-emerald-400 uppercase">Top Opportunity</span>
                                        <p className="text-sm text-white mt-1">{d.topOpportunity}</p>
                                    </div>
                                )}
                                {d.fixNow?.length > 0 && (
                                    <SectionCard title="Fix Now" icon="build">
                                        <div className="space-y-3">{d.fixNow.slice(0, 5).map((f, i) => {
                                            const title = typeof f === 'string' ? f : f.title || f.issue;
                                            const desc = typeof f === 'object' ? (f.description || f.whyFirst || '') : '';
                                            return (
                                                <div key={i}>
                                                    <div className="flex items-start gap-2 text-sm"><span className="text-rose-400 mt-0.5">●</span><span className="text-slate-300">{title}</span></div>
                                                    <FixWithAI fixKey={`fixnow-${i}`} issueTitle={title} issueDescription={desc} fixType="content-rewrite" label="Fix with AI" />
                                                </div>
                                            );
                                        })}</div>
                                    </SectionCard>
                                )}
                            </>
                        )}

                        {/* Action buttons */}
                        <div className="flex gap-3 flex-wrap">
                            <RunButton onClick={() => runAnalysis('overview', seoAPI.healthCheck, buildPayload(), 'Running health check...')} label={hasData ? 'Refresh Health Check' : 'Run SEO Health Check'} icon="health_and_safety" />
                        </div>
                    </div>
                );
            }

            // ── SITE AUDIT ──
            case 'site-audit': {
                if (!hasData) return (
                    <EmptyState icon="bug_report" title="Site Audit" desc="Crawl your website for technical SEO issues, broken links, speed problems, and missing meta tags.">
                        <RunButton onClick={() => runAnalysis('site-audit', seoAPI.healthCheck, buildPayload(), 'Crawling site...')} label="Run Site Audit" icon="bug_report" />
                    </EmptyState>
                );
                const issues = data.issues || [];
                const filtered = issueFilter === 'all' ? issues : issues.filter(i => i.severity === issueFilter);
                const counts = { critical: issues.filter(i => i.severity === 'critical').length, high: issues.filter(i => i.severity === 'high').length, medium: issues.filter(i => i.severity === 'medium').length, low: issues.filter(i => i.severity === 'low').length };

                return (
                    <div className="space-y-5 animate-fade-in">
                        {/* Summary + scores */}
                        {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                            {[{ s: data.seoHealthScore, l: 'Health', c: '#34d399' }, { s: data.technicalScore, l: 'Technical', c: '#60a5fa' },
                            { s: data.contentScore, l: 'Content', c: '#fbbf24' }, { s: data.authorityScore, l: 'Authority', c: '#fb7185' },
                            { s: data.aiVisibilityScore, l: 'AI Visibility', c: '#a78bfa' }].map(x => (
                                <SectionCard key={x.l}><ScoreRing score={x.s} size={70} label={x.l} color={x.c} /></SectionCard>
                            ))}
                        </div>

                        {/* Severity filters */}
                        <div className="flex gap-2 flex-wrap">
                            {['all', 'critical', 'high', 'medium', 'low'].map(s => (
                                <button key={s} onClick={() => setIssueFilter(s)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${issueFilter === s ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-white/[0.03] text-slate-400 border border-white/[0.06]'}`}>
                                    {s === 'all' ? `All (${issues.length})` : `${s} (${counts[s]})`}
                                </button>
                            ))}
                        </div>

                        {/* Issues list */}
                        <div className="space-y-2">{filtered.map((issue, i) => {
                            const isContentIssue = /content|title|meta|heading|h1|thin|description|alt|text/i.test(issue.title || issue.issue || issue.category || '');
                            return (
                                <div key={i} className="glass-panel rounded-xl p-4 flex items-start gap-3">
                                    <span className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: SEVERITY_COLORS[issue.severity] || '#94a3b8' }} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-sm font-bold text-white">{issue.title || issue.issue}</span>
                                            <span className="text-xs px-1.5 py-0.5 rounded-full font-bold uppercase" style={{ background: `${SEVERITY_COLORS[issue.severity]}15`, color: SEVERITY_COLORS[issue.severity] }}>{issue.severity}</span>
                                        </div>
                                        <p className="text-xs text-slate-400">{issue.description || issue.fix}</p>
                                        {issue.affectedPages && <p className="text-xs text-slate-600 mt-1">Affected: {issue.affectedPages}</p>}
                                        {isContentIssue && (
                                            <FixWithAI fixKey={`audit-${i}`} issueTitle={issue.title || issue.issue} issueDescription={issue.description || issue.fix}
                                                fixType={/title/i.test(issue.title || '') ? 'meta-title' : /meta.*desc/i.test(issue.title || '') ? 'meta-description' : /h1/i.test(issue.title || '') ? 'h1' : /thin/i.test(issue.title || '') ? 'content-expand' : 'content-rewrite'}
                                                label="Generate Fix" />
                                        )}
                                    </div>
                                </div>
                            );
                        })}</div>

                        <RunButton onClick={() => runAnalysis('site-audit', seoAPI.healthCheck, buildPayload(), 'Re-scanning...')} label="Re-run Audit" icon="refresh" />
                    </div>
                );
            }

            // ── KEYWORD INTELLIGENCE ──
            case 'keywords': {
                if (!hasData) return (
                    <EmptyState icon="key" title="Keyword Intelligence" desc="Discover keyword opportunities, search volumes, difficulty scores, and content gaps for your brand.">
                        <RunButton onClick={() => runAnalysis('keywords', seoAPI.traffic, buildPayload(), 'Researching keywords...')} label="Run Keyword Research" icon="key" />
                    </EmptyState>
                );
                return (
                    <div className="space-y-5 animate-fade-in">
                        {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}

                        {/* Keyword Clusters */}
                        {data.keywordClusters?.length > 0 && (
                            <SectionCard title="Keyword Clusters" icon="hub">
                                <div className="space-y-3">{data.keywordClusters.map((cluster, i) => (
                                    <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-sm font-bold text-white">{cluster.topic || cluster.cluster}</h4>
                                            {cluster.totalSearchVolume && <span className="text-xs text-primary font-bold">{cluster.totalSearchVolume?.toLocaleString()} vol</span>}
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">{(cluster.keywords || []).map((kw, j) => (
                                            <span key={j} className="text-xs px-2 py-1 rounded-lg bg-white/[0.04] text-slate-300 border border-white/[0.06]">{typeof kw === 'string' ? kw : kw.keyword}</span>
                                        ))}</div>
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}

                        {/* Top keywords table */}
                        {data.keywords?.length > 0 && (
                            <SectionCard title="Top Keywords" icon="trending_up">
                                <DataTable columns={[
                                    { key: 'keyword', label: 'Keyword' }, { key: 'volume', label: 'Volume' },
                                    { key: 'difficulty', label: 'Difficulty' }, { key: 'intent', label: 'Intent' },
                                ]} rows={data.keywords.slice(0, 20)} />
                            </SectionCard>
                        )}

                        {/* Content gaps */}
                        {data.contentGaps?.length > 0 && (
                            <SectionCard title="Content Gaps" icon="lightbulb">
                                <div className="space-y-3">{data.contentGaps.map((gap, i) => {
                                    const gapTitle = gap.topic || gap.title || (typeof gap === 'string' ? gap : '');
                                    return (
                                        <div key={i} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                                            <div className="flex items-start gap-2">
                                                <span className="text-amber-400 text-sm">💡</span>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-white">{gapTitle}</p>
                                                    {gap.reason && <p className="text-xs text-slate-400 mt-0.5">{gap.reason}</p>}
                                                    <FixWithAI fixKey={`kw-gap-${i}`} issueTitle={gapTitle} issueDescription={gap.reason || ''}
                                                        fixType="new-content" targetKeyword={gap.keyword || gapTitle} label="Generate Content" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}</div>
                            </SectionCard>
                        )}

                        {/* Real GSC Ranking Keywords */}
                        {gscReport?.keywords?.length > 0 && (
                            <SectionCard title={`Your Ranking Keywords — Search Console (${gscReport.keywords.length})`} icon="travel_explore">
                                <p className="text-xs text-slate-400 mb-3">Real keyword performance data from Google Search Console. Keywords in <span className="text-amber-400 font-bold">amber</span> are in "striking distance" (positions 4-20) — focus content efforts here for quick wins.</p>
                                <DataTable columns={[
                                    { key: 'keyword', label: 'Keyword' },
                                    { key: 'clicks', label: 'Clicks' },
                                    { key: 'impressions', label: 'Impressions' },
                                    { key: 'ctr', label: 'CTR' },
                                    { key: 'position', label: 'Position' },
                                ]} rows={gscReport.keywords.slice(0, 30).map(k => ({
                                    keyword: <span className={`text-xs font-medium ${k.position >= 4 && k.position <= 20 ? 'text-amber-300' : ''}`}>{k.keyword}</span>,
                                    clicks: k.clicks?.toLocaleString(),
                                    impressions: k.impressions?.toLocaleString(),
                                    ctr: `${((k.ctr || 0) * 100).toFixed(1)}%`,
                                    position: <span className={`font-bold ${k.position <= 3 ? 'text-emerald-400' : k.position <= 10 ? 'text-blue-400' : k.position <= 20 ? 'text-amber-400' : 'text-slate-400'}`}>{k.position?.toFixed(1)}</span>,
                                }))} />
                            </SectionCard>
                        )}

                        <RunButton onClick={() => runAnalysis('keywords', seoAPI.traffic, buildPayload(), 'Refreshing...')} label="Refresh Keywords" icon="refresh" />
                    </div>
                );
            }

            // ── CONTENT OPPORTUNITIES ──
            case 'content-ops': {
                if (!hasData) return (
                    <EmptyState icon="article" title="Content Opportunities" desc="Find content ideas ranked by traffic potential, competitor gaps, and viral topic suggestions.">
                        <RunButton onClick={() => runAnalysis('content-ops', seoAPI.traffic, buildPayload(), 'Finding opportunities...')} label="Find Content Opportunities" icon="article" />
                    </EmptyState>
                );
                return (
                    <div className="space-y-5 animate-fade-in">
                        {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}

                        {/* Topic suggestions */}
                        {data.topicSuggestions?.length > 0 && (
                            <SectionCard title="Topic Suggestions" icon="auto_awesome">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{data.topicSuggestions.map((t, i) => {
                                    const topic = t.title || t.topic || (typeof t === 'string' ? t : '');
                                    return (
                                        <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                            <h4 className="text-sm font-bold text-white mb-1">{topic}</h4>
                                            {t.reason && <p className="text-xs text-slate-400">{t.reason}</p>}
                                            {t.estimatedTraffic && <span className="text-xs text-emerald-400 font-bold mt-1 inline-block">~{t.estimatedTraffic} monthly visits</span>}
                                            <FixWithAI fixKey={`topic-${i}`} issueTitle={topic} issueDescription={t.reason || ''}
                                                fixType="new-content" targetKeyword={t.keyword || topic} label="Generate Content" />
                                        </div>
                                    );
                                })}</div>
                            </SectionCard>
                        )}

                        {/* Content gaps */}
                        {data.contentGaps?.length > 0 && (
                            <SectionCard title="Content Gaps vs Competitors" icon="compare_arrows">
                                <div className="space-y-3">{data.contentGaps.map((gap, i) => {
                                    const gapTitle = gap.topic || gap.title || (typeof gap === 'string' ? gap : '');
                                    return (
                                        <div key={i} className="p-3 rounded-lg bg-violet-500/5 border border-violet-500/10">
                                            <div className="flex items-start gap-2">
                                                <span className="text-violet-400 mt-0.5">◆</span>
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-white">{gapTitle}</p>
                                                    {gap.competitorUrl && <p className="text-xs text-slate-500 mt-0.5">Competitor: {gap.competitorUrl}</p>}
                                                    {gap.reason && <p className="text-xs text-slate-400 mt-0.5">{gap.reason}</p>}
                                                    <FixWithAI fixKey={`content-gap-${i}`} issueTitle={gapTitle} issueDescription={gap.reason || ''}
                                                        fixType="new-content" targetKeyword={gap.keyword || gapTitle} label="Generate Content" />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}</div>
                            </SectionCard>
                        )}

                        {/* Long-tail suggestions */}
                        {data.keywordClusters?.length > 0 && (
                            <SectionCard title="Long-Tail Keyword Clusters" icon="hub">
                                {data.keywordClusters.slice(0, 5).map((c, i) => (
                                    <div key={i} className="mb-3 last:mb-0">
                                        <p className="text-sm font-bold text-white mb-1">{c.topic || c.cluster}</p>
                                        <div className="flex flex-wrap gap-1">{(c.keywords || []).slice(0, 8).map((kw, j) => (
                                            <span key={j} className="text-xs px-2 py-0.5 rounded bg-white/[0.04] text-slate-300">{typeof kw === 'string' ? kw : kw.keyword}</span>
                                        ))}</div>
                                    </div>
                                ))}
                            </SectionCard>
                        )}

                        <RunButton onClick={() => runAnalysis('content-ops', seoAPI.traffic, buildPayload(), 'Refreshing...')} label="Refresh" icon="refresh" />
                    </div>
                );
            }

            // ── GEO — AI SEARCH ──
            case 'geo': {
                if (!hasData) return (
                    <EmptyState icon="travel_explore" title="GEO — Generative Engine Optimization" desc="See how your brand appears in AI-generated answers across ChatGPT, Gemini, Perplexity, and more. Discover prompts where you should be cited.">
                        <div className="flex gap-3 justify-center flex-wrap">
                            <RunButton onClick={() => runAnalysis('geo', seoAPI.aiVisibility, buildPayload(), 'Analyzing AI visibility...', 'geo-visibility')} label="AI Visibility Scan" icon="smart_toy" actionId="geo-visibility" />
                            <RunButton onClick={() => runAnalysis('geo', seoAPI.llmProbe, buildPayload(), 'Probing AI models...', 'geo-probe')} label="LLM Brand Probe" icon="psychology" actionId="geo-probe" />
                        </div>
                    </EmptyState>
                );
                return (
                    <div className="space-y-5 animate-fade-in">
                        {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}

                        {/* AI Visibility Scores */}
                        {data.aiVisibilityScore != null && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <SectionCard><ScoreRing score={data.aiVisibilityScore} label="AI Visibility" color="#a78bfa" /></SectionCard>
                                <SectionCard><ScoreRing score={data.schemaScore || data.technicalScore} label="Schema & Data" color="#60a5fa" /></SectionCard>
                                <SectionCard><ScoreRing score={data.contentScore} label="Content" color="#fbbf24" /></SectionCard>
                                <SectionCard><ScoreRing score={data.authorityScore} label="Authority" color="#34d399" /></SectionCard>
                            </div>
                        )}

                        {/* LLM Probe Results */}
                        {data.probeResults?.length > 0 && (
                            <SectionCard title="LLM Brand Mentions" icon="psychology">
                                <div className="space-y-3">{data.probeResults.map((pr, i) => (
                                    <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-bold text-white">{pr.model || pr.llm}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${pr.mentioned ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                                {pr.mentioned ? '✓ Mentioned' : '✗ Not Found'}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-400">{pr.prompt || pr.query}</p>
                                        {pr.response && <p className="text-xs text-slate-500 mt-1 line-clamp-3">{pr.response}</p>}
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}
                        {/* Prompt Mining Categories */}
                        {data.promptCategories?.length > 0 && (
                            <SectionCard title="AI Citation by Category" icon="category">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                    {data.promptCategories.map((cat, i) => (
                                        <div key={`cat-${i}`} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                            <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">{cat.category}</p>
                                            <p className="text-xl font-bold text-white mb-1">{cat.currentCitationRate}</p>
                                            <p className="text-xs text-slate-400">{cat.totalPrompts} prompts analyzed</p>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Mined Prompts */}
                        {data.minedPrompts?.length > 0 && (
                            <SectionCard title="Mined Prompt Opportunities" icon="troubleshoot">
                                <div className="space-y-3">{data.minedPrompts.map((mp, i) => (
                                    <div key={`mp-${i}`} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                        <div className="flex items-center gap-2 mb-2">
                                            {mp.priority && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${mp.priority === 'critical' ? 'bg-rose-500/15 text-rose-400' : mp.priority === 'high' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{mp.priority}</span>}
                                            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-white/10 text-slate-300">{mp.category}</span>
                                            {mp.currentlyCited && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-500/15 text-emerald-400">Cited</span>}
                                        </div>
                                        <p className="text-sm font-bold text-white mb-2">"{mp.prompt}"</p>
                                        
                                        {!mp.currentlyCited && mp.competitorsCited?.length > 0 && (
                                            <div className="mb-3">
                                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Competitors Cited Instead:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {mp.competitorsCited.map((comp, cIdx) => (
                                                        <span key={`comp-${cIdx}`} className="text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300">{comp}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        
                                        <div className="grid grid-cols-2 gap-2 mb-3">
                                            <div className="rounded-lg p-2 bg-white/[0.02]">
                                                <p className="text-[10px] text-slate-500 uppercase font-bold">Why not cited</p>
                                                <p className="text-xs text-slate-300">{mp.whyNotCited || 'N/A'}</p>
                                            </div>
                                            <div className="rounded-lg p-2 bg-emerald-500/5 border border-emerald-500/10">
                                                <p className="text-[10px] text-emerald-500/70 uppercase font-bold">Content Needed</p>
                                                <p className="text-xs text-emerald-400">{mp.contentNeeded}</p>
                                            </div>
                                        </div>
                                        
                                        <FixWithAI fixKey={`prompt-mining-${i}`} issueTitle={`Missing Citation for: "${mp.prompt}"`} issueDescription={mp.whyNotCited || ''}
                                            fixType={mp.contentFormat || 'new-content'} targetKeyword={mp.prompt} label="Generate Content to Rank" />
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}

                        {/* Optimization tips */}
                        {(data.optimizations || data.recommendations)?.length > 0 && (
                            <SectionCard title="GEO Optimization Actions" icon="tips_and_updates">
                                <div className="space-y-3">{(data.optimizations || data.recommendations || []).map((opt, i) => (
                                    <div key={i} className="rounded-xl p-4 bg-violet-500/5 border border-violet-500/10">
                                        <div className="flex items-center gap-2 mb-2">
                                            {opt.priority && <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${opt.priority === 'critical' ? 'bg-rose-500/15 text-rose-400' : opt.priority === 'high' ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>{opt.priority}</span>}
                                            <p className="text-sm font-bold text-white">{opt.title || opt.action || opt}</p>
                                        </div>
                                        {opt.description && <p className="text-xs text-slate-400 mb-3">{opt.description}</p>}
                                        {(opt.kpi || opt.baseline || opt.target) && (
                                            <div className="grid grid-cols-3 gap-2 mb-2">
                                                {opt.kpi && <div className="rounded-lg p-2 bg-white/[0.02]"><p className="text-[10px] text-slate-500 uppercase font-bold">KPI</p><p className="text-xs text-slate-300">{opt.kpi}</p></div>}
                                                {opt.baseline && <div className="rounded-lg p-2 bg-white/[0.02]"><p className="text-[10px] text-slate-500 uppercase font-bold">Baseline</p><p className="text-xs text-rose-400">{opt.baseline}</p></div>}
                                                {opt.target && <div className="rounded-lg p-2 bg-white/[0.02]"><p className="text-[10px] text-slate-500 uppercase font-bold">Target</p><p className="text-xs text-emerald-400">{opt.target}</p></div>}
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-3 text-[11px]">
                                            {opt.timeline && <span className="text-slate-500">⏱ {opt.timeline}</span>}
                                            {opt.proofMethod && <span className="text-slate-500">✓ {opt.proofMethod}</span>}
                                        </div>
                                        {opt.expectedROI && <p className="text-xs text-emerald-400/80 mt-2 font-medium mb-3">📈 {opt.expectedROI}</p>}
                                        <FixWithAI fixKey={`geo-opt-${i}`} issueTitle={opt.title || opt.action || opt} issueDescription={opt.description || ''}
                                            fixType="geo-optimization" label="Generate SEO Fix" />
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}

                        <div className="flex gap-3 flex-wrap">
                            <RunButton onClick={() => runAnalysis('geo', seoAPI.aiVisibility, buildPayload(), 'AI Visibility...', 'geo-visibility')} label="AI Visibility" icon="smart_toy" actionId="geo-visibility" />
                            <RunButton onClick={() => runAnalysis('geo', seoAPI.llmProbe, buildPayload(), 'Probing LLMs...', 'geo-probe')} label="LLM Probe" icon="psychology" actionId="geo-probe" />
                            <RunButton onClick={() => runAnalysis('geo', seoAPI.promptMining, buildPayload(), 'Mining prompts...', 'geo-mining')} label="Prompt Mining" icon="chat_bubble" actionId="geo-mining" />
                        </div>
                    </div>
                );
            }

            // ── COMPETITORS ──
            case 'competitor-detail': {
                if (!hasData) return (
                    <EmptyState icon="groups" title="Competitor Analysis" desc="Compare your SEO performance against competitors. See keyword gaps, scoring matrix, and battle plans.">
                        <RunButton onClick={() => runAnalysis('competitor-detail', seoAPI.competitors, buildPayload({ competitorUrls: competitors.map(c => c.url).filter(Boolean) }), 'Analyzing competitors...')} label="Run Competitor Analysis" icon="swords" />
                    </EmptyState>
                );
                return (
                    <div className="space-y-5 animate-fade-in">
                        {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}

                        {/* Competitor scores */}
                        {data.competitors?.length > 0 && (
                            <SectionCard title="Competitor Scorecard" icon="leaderboard">
                                <DataTable columns={[
                                    { key: 'name', label: 'Competitor' }, { key: 'overallScore', label: 'Score' },
                                    { key: 'strengths', label: 'Strengths' }, { key: 'weaknesses', label: 'Weaknesses' },
                                ]} rows={data.competitors.map(c => ({
                                    ...c, strengths: (c.strengths || []).slice(0, 2).join(', '), weaknesses: (c.weaknesses || []).slice(0, 2).join(', '),
                                }))} />
                            </SectionCard>
                        )}

                        {/* Keyword gaps */}
                        {data.keywordGaps?.length > 0 && (
                            <SectionCard title="Keyword Gaps (they rank, you don't)" icon="compare_arrows">
                                <div className="flex flex-wrap gap-1.5">{data.keywordGaps.slice(0, 30).map((kw, i) => (
                                    <span key={i} className="text-xs px-2 py-1 rounded-lg bg-rose-500/5 text-rose-300 border border-rose-500/10">{typeof kw === 'string' ? kw : kw.keyword}</span>
                                ))}</div>
                            </SectionCard>
                        )}

                        {/* Outrank plan */}
                        {data.outrankPlan?.length > 0 && (
                            <SectionCard title="Outrank Plan" icon="military_tech">
                                <div className="space-y-2">{data.outrankPlan.map((step, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                                        <span className="text-primary font-bold text-sm mt-0.5">{i + 1}</span>
                                        <div><p className="text-sm text-white font-bold">{step.action || step.title || step}</p>
                                            {step.impact && <p className="text-xs text-emerald-400 mt-0.5">Impact: {step.impact}</p>}
                                        </div>
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}

                        <RunButton onClick={() => runAnalysis('competitor-detail', seoAPI.competitorWarRoom, buildPayload({ competitorUrls: competitors.map(c => c.url).filter(Boolean) }), 'Building war room...')} label="War Room Analysis" icon="shield" />
                    </div>
                );
            }

            // ── ON-PAGE FIXER ──
            case 'on-page': {
                return (
                    <div className="space-y-5 animate-fade-in">
                        {/* URL input */}
                        <SectionCard title="Audit a Page" icon="tune">
                            <div className="flex gap-3">
                                <input type="text" value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="Enter page URL to audit (e.g., /pricing, /about)"
                                    className="flex-1 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white text-sm outline-none focus:border-primary/50" />
                                <RunButton onClick={() => runAnalysis('on-page', seoAPI.auditPage, buildPayload({ pageUrl: pageUrl.startsWith('http') ? pageUrl : `${website}${pageUrl.startsWith('/') ? '' : '/'}${pageUrl}` }), 'Auditing page...')} label="Audit" icon="search" disabled={!pageUrl.trim()} />
                            </div>
                        </SectionCard>

                        {/* Audit results */}
                        {hasData && (
                            <>
                                {data.summary && <SectionCard><FormattedText text={data.summary} /></SectionCard>}

                                {data.issues?.length > 0 && (
                                    <SectionCard title="Issues Found" icon="warning">
                                        <div className="space-y-3">{data.issues.map((issue, i) => (
                                            <div key={i} className="p-3 rounded-lg bg-white/[0.02]">
                                                <div className="flex items-start gap-2">
                                                    <span className="w-2 h-2 rounded-full mt-1.5" style={{ background: SEVERITY_COLORS[issue.severity] || '#94a3b8' }} />
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-white">{issue.title || issue.issue}</p>
                                                        <p className="text-xs text-slate-400">{issue.fix || issue.description}</p>
                                                        <FixWithAI fixKey={`onpage-issue-${i}`} issueTitle={issue.title || issue.issue} issueDescription={issue.fix || issue.description}
                                                            pageUrl={pageUrl} fixType="content-rewrite" label="Rewrite with AI" />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}</div>
                                    </SectionCard>
                                )}

                                {/* Code fixes */}
                                {data.fixes?.length > 0 && (
                                    <SectionCard title="Copy-Paste Fixes" icon="code">
                                        <div className="space-y-3">{data.fixes.map((fix, i) => (
                                            <div key={i} className="rounded-xl p-4 bg-white/[0.02] border border-white/[0.04]">
                                                <p className="text-sm font-bold text-white mb-2">{fix.title || fix.description}</p>
                                                <pre className="text-xs text-emerald-300 bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">{fix.code || fix.snippet}</pre>
                                                <button onClick={() => navigator.clipboard.writeText(fix.code || fix.snippet || '')}
                                                    className="mt-2 text-xs text-primary font-bold cursor-pointer hover:underline flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">content_copy</span> Copy to clipboard
                                                </button>
                                            </div>
                                        ))}</div>
                                    </SectionCard>
                                )}

                                {data.metaTags && (
                                    <SectionCard title="Suggested Meta Tags" icon="sell">
                                        <pre className="text-xs text-cyan-300 bg-black/40 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">{typeof data.metaTags === 'string' ? data.metaTags : JSON.stringify(data.metaTags, null, 2)}</pre>
                                    </SectionCard>
                                )}
                            </>
                        )}
                    </div>
                );
            }

            // ── BACKLINKS & OUTREACH — Agentic Intelligence ──
            case 'backlinks': {
                const backlinkPayload = () => buildPayload({ competitorUrls: competitors.map(c => c.url).filter(Boolean) });
                if (!hasData) return (
                    <EmptyState icon="link" title="Backlink Intelligence" desc="Our agent crawls your site, your competitors, and the web to discover real backlinks, find link gaps, and generate outreach strategies.">
                        <RunButton onClick={() => runAnalysis('backlinks', seoAPI.backlinkIntelligence, backlinkPayload(), 'Agent is crawling the web for backlinks...', 'backlinks-run')} label="Run Backlink Intelligence" icon="link" actionId="backlinks-run" />
                    </EmptyState>
                );
                return (
                    <div className="space-y-5 animate-fade-in">
                        {/* Crawl metadata banner */}
                        {data.crawlMetadata && (
                            <div className="flex flex-wrap gap-4 p-4 rounded-xl" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)' }}>
                                {[
                                    { icon: 'language', label: 'Pages Crawled', value: data.crawlMetadata.pagesCrawled },
                                    { icon: 'groups', label: 'Competitors Analyzed', value: data.crawlMetadata.competitorsAnalyzed },
                                    { icon: 'verified', label: 'Links Verified', value: data.crawlMetadata.backlinksVerified },
                                    { icon: 'public', label: 'Outbound Domains', value: data.crawlMetadata.outboundDomains },
                                ].map((m, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className="material-symbols-outlined text-sm" style={{ color: '#a78bfa' }}>{m.icon}</span>
                                        <span className="text-slate-500">{m.label}:</span>
                                        <span className="text-white font-bold">{m.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Score + Metrics */}
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                            <div className="lg:col-span-1 flex justify-center">
                                <ScoreRing score={data.backlinkHealthScore || 0} label="Backlink Health" size={130} />
                            </div>
                            <div className="lg:col-span-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {[
                                    { label: 'Referring Domains', value: data.estimatedReferringDomains || '—', icon: 'dns' },
                                    { label: 'Total Backlinks', value: data.estimatedTotalBacklinks || '—', icon: 'link' },
                                    { label: 'Dofollow Ratio', value: data.dofollowRatio || '—', icon: 'check_circle' },
                                    { label: 'Anchor Health', value: data.anchorTextHealth || '—', icon: 'text_fields' },
                                ].map((m, i) => (
                                    <div key={i} className="rounded-xl p-4 text-center" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <span className="material-symbols-outlined text-lg mb-1 block" style={{ color: '#a78bfa' }}>{m.icon}</span>
                                        <p className="text-lg font-bold text-white">{m.value}</p>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">{m.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Strategic brief */}
                        {data.strategicBrief && (
                            <SectionCard title="Strategic Analysis" icon="psychology">
                                <FormattedText text={data.strategicBrief} />
                            </SectionCard>
                        )}

                        {/* Discovered Backlinks */}
                        {data.discoveredBacklinks?.length > 0 && (
                            <SectionCard title={`Discovered Backlinks (${data.discoveredBacklinks.length})`} icon="travel_explore">
                                <div className="space-y-2">
                                    {data.discoveredBacklinks.map((bl, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-white/[0.02]" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                                style={{ background: bl.status === 'verified-live' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.04)' }}>
                                                <span className="material-symbols-outlined text-sm" style={{ color: bl.status === 'verified-live' ? '#22c55e' : '#64748b' }}>
                                                    {bl.status === 'verified-live' ? 'verified' : 'link'}
                                                </span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <a href={bl.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300 truncate max-w-[400px]">{bl.sourceDomain || bl.sourceUrl}</a>
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${bl.linkType === 'dofollow' ? 'text-emerald-400 bg-emerald-400/10' : bl.linkType === 'nofollow' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 bg-slate-400/10'}`}>
                                                        {bl.linkType || 'link'}
                                                    </span>
                                                    {bl.status === 'verified-live' && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold text-emerald-400 bg-emerald-400/10">VERIFIED</span>}
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${bl.estimatedAuthority === 'high' ? 'text-violet-400 bg-violet-400/10' : bl.estimatedAuthority === 'medium' ? 'text-sky-400 bg-sky-400/10' : 'text-slate-400 bg-slate-400/10'}`}>
                                                        {bl.estimatedAuthority || 'unknown'} authority
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1">{bl.context}</p>
                                                {bl.anchorText && <p className="text-[11px] text-slate-500 mt-0.5">Anchor: <span className="text-slate-300">{bl.verifiedAnchorText || bl.anchorText}</span></p>}
                                            </div>
                                            <span className="text-[10px] px-2 py-1 rounded-lg bg-white/[0.03] text-slate-500 flex-shrink-0">{bl.category}</span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Competitor Link Gap */}
                        {data.competitorLinkGap?.length > 0 && (
                            <SectionCard title={`Competitor Link Gap (${data.competitorLinkGap.length})`} icon="compare_arrows">
                                <p className="text-xs text-slate-400 mb-3">Sites that link to your competitors but not to you — your biggest opportunities.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {data.competitorLinkGap.map((gap, i) => (
                                        <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-sm font-medium text-white">{gap.domain}</span>
                                                <div className="flex items-center gap-1">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${gap.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-400/10' : gap.difficulty === 'medium' ? 'text-amber-400 bg-amber-400/10' : 'text-rose-400 bg-rose-400/10'}`}>{gap.difficulty}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded text-violet-400 bg-violet-400/10 font-bold">{gap.impactScore}/10</span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 mb-1">Competitor: <span className="text-slate-400">{gap.competitorLinkedFrom}</span></p>
                                            <p className="text-xs text-slate-400">{gap.howToGetLink}</p>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Link Opportunities */}
                        {data.linkOpportunities?.length > 0 && (
                            <SectionCard title={`Link-Building Opportunities (${data.linkOpportunities.length})`} icon="rocket_launch">
                                <div className="space-y-3">
                                    {data.linkOpportunities.map((opp, i) => (
                                        <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <span className="text-sm font-medium text-white">{opp.title}</span>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-400/10 text-indigo-400 font-bold uppercase">{opp.type?.replace(/-/g, ' ')}</span>
                                                    </div>
                                                    <p className="text-xs text-slate-400 mb-2">{opp.description}</p>
                                                    {opp.strategy && <p className="text-xs text-slate-500 italic">{opp.strategy}</p>}
                                                    {opp.targetUrl && <a href={opp.targetUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 mt-1 inline-block">{opp.targetUrl}</a>}
                                                </div>
                                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${opp.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-400/10' : opp.difficulty === 'medium' ? 'text-amber-400 bg-amber-400/10' : 'text-rose-400 bg-rose-400/10'}`}>{opp.difficulty}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded text-violet-400 bg-violet-400/10 font-bold">Impact: {opp.impactScore}/10</span>
                                                    {opp.estimatedTimeline && <span className="text-[10px] text-slate-500">{opp.estimatedTimeline}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Toxic Risks */}
                        {data.toxicRisks?.length > 0 && (
                            <SectionCard title="Toxic Link Risks" icon="warning">
                                <div className="space-y-2">
                                    {data.toxicRisks.map((t, i) => (
                                        <div key={i} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: t.severity === 'high' ? 'rgba(244,63,94,0.06)' : 'rgba(255,255,255,0.02)', border: `1px solid ${t.severity === 'high' ? 'rgba(244,63,94,0.15)' : 'rgba(255,255,255,0.06)'}` }}>
                                            <span className="material-symbols-outlined text-sm mt-0.5" style={{ color: t.severity === 'high' ? '#fb7185' : t.severity === 'medium' ? '#fbbf24' : '#94a3b8' }}>warning</span>
                                            <div>
                                                <p className="text-sm text-white">{t.concern}</p>
                                                <p className="text-xs text-slate-400 mt-0.5">{t.action}</p>
                                            </div>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ml-auto flex-shrink-0 ${t.severity === 'high' ? 'text-rose-400 bg-rose-400/10' : t.severity === 'medium' ? 'text-amber-400 bg-amber-400/10' : 'text-slate-400 bg-slate-400/10'}`}>{t.severity}</span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Outreach Templates */}
                        {data.outreachTemplates?.length > 0 && (
                            <SectionCard title="Outreach Email Templates" icon="mail">
                                <div className="space-y-3">
                                    {data.outreachTemplates.map((tmpl, i) => (
                                        <details key={i} className="group rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <summary className="flex items-center gap-3 p-4 cursor-pointer hover:bg-white/[0.02] transition-colors">
                                                <span className="material-symbols-outlined text-sm" style={{ color: '#a78bfa' }}>drafts</span>
                                                <div className="flex-1">
                                                    <p className="text-sm font-medium text-white">{tmpl.subject}</p>
                                                    <p className="text-[11px] text-slate-500">{tmpl.type?.replace(/-/g, ' ')} — {tmpl.whenToUse}</p>
                                                </div>
                                                {tmpl.successRate && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded font-bold">{tmpl.successRate}</span>}
                                                <span className="material-symbols-outlined text-sm text-slate-500 group-open:rotate-180 transition-transform">expand_more</span>
                                            </summary>
                                            <div className="px-4 pb-4 pt-0">
                                                <pre className="text-xs text-slate-300 whitespace-pre-wrap p-3 rounded-lg mt-2" style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.04)' }}>{tmpl.body}</pre>
                                            </div>
                                        </details>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* 30-Day Plan */}
                        {data.thirtyDayPlan?.length > 0 && (
                            <SectionCard title="30-Day Link-Building Plan" icon="calendar_month">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {data.thirtyDayPlan.map((w, i) => (
                                        <div key={i} className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>{w.week}</span>
                                                <span className="text-sm font-medium text-white">{w.focus}</span>
                                            </div>
                                            <div className="space-y-1">
                                                {w.actions?.map((a, j) => (
                                                    <p key={j} className="text-xs text-slate-400 flex items-start gap-1.5">
                                                        <span className="text-slate-600 mt-0.5">•</span> {a}
                                                    </p>
                                                ))}
                                            </div>
                                            {w.expectedLinks && <p className="text-[10px] text-violet-400 mt-2 font-medium">Target: {w.expectedLinks}</p>}
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        )}

                        {/* Quick Wins */}
                        {data.quickWins?.length > 0 && (
                            <SectionCard title="Quick Wins" icon="bolt">
                                <div className="space-y-2">{data.quickWins.map((q, i) => (
                                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.02]">
                                        <span className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: 'rgba(34,197,94,0.12)' }}>
                                            <span className="material-symbols-outlined text-sm text-emerald-400">bolt</span>
                                        </span>
                                        <div className="flex-1">
                                            <p className="text-sm text-white">{q.action}</p>
                                            {q.whyQuick && <p className="text-xs text-slate-400 mt-0.5">{q.whyQuick}</p>}
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            {q.estimatedTime && <span className="text-[10px] text-slate-500">{q.estimatedTime}</span>}
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${q.expectedImpact === 'high' ? 'text-emerald-400 bg-emerald-400/10' : 'text-amber-400 bg-amber-400/10'}`}>{q.expectedImpact} impact</span>
                                        </div>
                                    </div>
                                ))}</div>
                            </SectionCard>
                        )}

                        <RunButton onClick={() => runAnalysis('backlinks', seoAPI.backlinkIntelligence, backlinkPayload(), 'Re-crawling the web for backlinks...', 'backlinks-run')} label="Re-Run Intelligence" icon="refresh" actionId="backlinks-run" />
                    </div>
                );
            }

            // ── REPORTS & PLANS ──
            case 'reports': {
                return (
                    <div className="space-y-5 animate-fade-in">
                        <SectionCard title="Generate SEO Reports" icon="summarize">
                            <p className="text-sm text-slate-400 mb-4">Generate branded interactive reports with charts, KPIs, and recommendations. Download as PDF or present as a slideshow.</p>
                            <StudioReportButton studio="seo" brandId={brandId} />
                        </SectionCard>

                        <SectionCard title="Available Report Types" icon="list">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[{ icon: '🏥', title: 'Health Check Report', desc: 'Technical SEO health scores, issue breakdown, and fix roadmap' },
                                { icon: '⚔️', title: 'Competitor Analysis', desc: 'Side-by-side comparison, keyword gaps, and outrank strategies' },
                                { icon: '📈', title: 'Traffic Report', desc: 'Organic traffic trends, keyword rankings, and device breakdown' },
                                { icon: '🤖', title: 'AI Visibility Report', desc: 'AI/LLM citation tracking, sentiment analysis, and GEO optimization' },
                                ].map((r, i) => (
                                    <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                        <span className="text-2xl">{r.icon}</span>
                                        <div><p className="text-sm font-bold text-white">{r.title}</p><p className="text-xs text-slate-400">{r.desc}</p></div>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>

                        {/* Quick action plan */}
                        <SectionCard title="Quick Action Plan" icon="task_alt">
                            <p className="text-sm text-slate-400 mb-3">Run these analyses to build your SEO strategy:</p>
                            <div className="space-y-2">
                                {[{ step: 'Run Site Audit to identify technical issues', done: !!tabData['site-audit'] },
                                { step: 'Run Keyword Research to find opportunities', done: !!tabData['keywords'] },
                                { step: 'Analyze Competitors to find gaps', done: !!tabData['competitor-detail'] },
                                { step: 'Check AI Visibility (GEO) for LLM presence', done: !!tabData['geo'] },
                                { step: 'Run Backlink Analysis for link opportunities', done: !!tabData['backlinks'] },
                                ].map((a, i) => (
                                    <div key={i} className="flex items-center gap-2">
                                        <span className={`material-symbols-outlined text-sm ${a.done ? 'text-emerald-400' : 'text-slate-600'}`}>{a.done ? 'check_circle' : 'radio_button_unchecked'}</span>
                                        <span className={`text-sm ${a.done ? 'text-emerald-400' : 'text-slate-400'}`}>{a.step}</span>
                                    </div>
                                ))}
                            </div>
                        </SectionCard>
                    </div>
                );
            }

            default:
                return <EmptyState icon="construction" title="Coming Soon" desc="This tab is under development." />;
        }
    };

    // Tab descriptions for the content header
    const TAB_DESCS = {
        'overview': 'Your SEO health at a glance — scores, traffic, and top opportunities',
        'site-audit': 'Crawl your site for technical issues, broken links, and speed problems',
        'keywords': 'Discover keyword opportunities, volumes, difficulty, and content gaps',
        'content-ops': 'Find content ideas ranked by traffic potential and competitor gaps',
        'geo': 'See how your brand appears in AI-generated answers across LLMs',
        'competitor-detail': 'Compare SEO performance, find keyword gaps, and outrank plans',
        'on-page': 'Audit individual pages and get copy-paste code fixes',
        'backlinks': 'Analyze your backlink profile and discover link-building opportunities',
        'reports': 'Generate branded reports with charts, KPIs, and recommendations',
    };

    const currentTab = TABS.find(t => t.id === advPage);

    return (
        <div className="animate-fade-in">
            {/* Back nav — hidden when parent provides sidebar */}
            {!hideNav && (
            <button onClick={onBack} className="group flex items-center gap-2 text-slate-400 hover:text-white text-sm font-bold mb-6 cursor-pointer transition-all">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center transition-all group-hover:bg-white/[0.05]"
                    style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    <span className="material-symbols-outlined text-sm group-hover:-translate-x-0.5 transition-transform">arrow_back</span>
                </div>
                <span>Back to SEO Studio</span>
            </button>
            )}

            <div className="flex gap-0">
                {/* ── Tab sidebar (desktop) — hidden when parent provides sidebar ── */}
                {!hideNav && (
                <div className="flex-shrink-0 w-56 hidden lg:block pr-5">
                    <div className="rounded-2xl sticky top-24 overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div className="h-1" style={{ background: 'linear-gradient(90deg, #6366f1, #8b5cf6, #a855f7, #ec4899)' }} />
                        <div className="p-3">
                            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.15em] px-2.5 mb-2 mt-1">Navigation</p>
                            {TABS.map((t, idx) => (
                                <button key={t.id} onClick={() => setAdvPage(t.id)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-[13px] font-medium flex items-center gap-2.5 cursor-pointer transition-all duration-200 mb-0.5
                                        ${advPage === t.id ? 'text-white' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.03]'}`}
                                    style={advPage === t.id ? { background: 'linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.08))', border: '1px solid rgba(99,102,241,0.25)', boxShadow: '0 2px 8px rgba(99,102,241,0.12)' } : { border: '1px solid transparent' }}>
                                    <span className={`material-symbols-outlined text-[16px] transition-colors ${advPage === t.id ? '' : ''}`} style={advPage === t.id ? { color: '#a78bfa' } : {}}>{t.icon}</span>
                                    <span className="flex-1">{t.label}</span>
                                    {advPage === t.id && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.5)' }} />}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                )}

                {/* ── Mobile tab bar — hidden when parent provides sidebar ── */}
                {!hideNav && (
                <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl flex overflow-x-auto p-1.5 gap-0.5"
                    style={{ background: 'rgba(10,12,22,0.95)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {TABS.map(t => (
                        <button key={t.id} onClick={() => setAdvPage(t.id)}
                            className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap cursor-pointer transition-all flex-shrink-0
                                ${advPage === t.id ? 'text-primary' : 'text-slate-500'}`}
                            style={advPage === t.id ? { background: 'rgba(99,102,241,0.12)' } : {}}>
                            <span className="material-symbols-outlined text-sm">{t.icon}</span>
                            {t.label}
                        </button>
                    ))}
                </div>
                )}

                {/* ── Content area ── */}
                <div className="flex-1 min-w-0">
                    {/* Hero-style page header */}
                    <div className="relative rounded-2xl p-6 mb-6 overflow-hidden"
                        style={{ background: 'linear-gradient(135deg, rgba(15,17,30,0.95) 0%, rgba(20,22,40,0.9) 100%)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {/* Background glow */}
                        <div className="absolute top-0 right-0 w-48 h-48 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)' }} />
                        <div className="relative flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                                style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 4px 20px rgba(99,102,241,0.4)' }}>
                                <span className="material-symbols-outlined text-white text-xl">{currentTab?.icon}</span>
                            </div>
                            <div className="flex-1">
                                <h2 className="text-xl font-bold text-white">{currentTab?.label || 'Advanced Tools'}</h2>
                                <p className="text-xs text-slate-400 mt-0.5">{TAB_DESCS[advPage] || ''}</p>
                            </div>
                            <div className="text-right hidden sm:block">
                                <p className="text-[11px] text-slate-500 font-bold">{brand?.name}</p>
                                <p className="text-[10px] text-slate-600">{website}</p>
                                {cachedAt && hasData && (
                                    <p className="text-[9px] mt-1 px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: 'rgba(99,102,241,0.1)', color: '#a78bfa' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: '10px' }}>schedule</span>
                                        {(() => { const d = Math.round((Date.now() - new Date(cachedAt)) / 60000); return d < 1 ? 'Just now' : d < 60 ? `${d}m ago` : d < 1440 ? `${Math.round(d/60)}h ago` : `${Math.round(d/1440)}d ago`; })()}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {data?.error && (
                        <div className="rounded-xl p-4 mb-5 text-sm text-rose-400 flex items-center gap-3"
                            style={{ background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.12)' }}>
                            <span className="material-symbols-outlined text-lg">error</span>
                            {data.error}
                        </div>
                    )}
                    {renderTab()}
                </div>
            </div>
        </div>
    );
}
