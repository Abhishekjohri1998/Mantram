import { useState, useEffect } from 'react';
import { useBrand } from '../../context/BrandContext';
import { retentionStudio } from '../../services/api';

const S = {
    card: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px 24px' },
    cardHover: { borderColor: 'rgba(99,102,241,0.3)' },
    btn: { background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13 },
    btnSec: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 },
    label: { color: '#64748b', fontSize: 12, fontWeight: 600 },
    h3: { color: '#fff', fontSize: 18, fontWeight: 700, margin: '0 0 16px' },
    grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 },
    grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 },
    tab: (active) => ({ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: active ? 'rgba(99,102,241,0.15)' : 'transparent', color: active ? '#818cf8' : '#64748b', transition: 'all 0.2s' }),
    segBadge: (color) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${color}20`, color }),
    spinner: { width: 20, height: 20, border: '2px solid rgba(99,102,241,0.2)', borderTop: '2px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' },
};

const SEG_COLORS = { champions: '#10b981', loyalCustomers: '#059669', potentialLoyalists: '#6366f1', recentCustomers: '#3b82f6', promising: '#8b5cf6', needsAttention: '#f59e0b', aboutToSleep: '#f97316', atRisk: '#ef4444', cantLoseThem: '#dc2626', hibernating: '#64748b', lost: '#475569' };

const TABS = [
    { id: 'overview', label: 'Overview', icon: 'dashboard' },
    { id: 'segments', label: 'RFM Segments', icon: 'donut_large' },
    { id: 'templates', label: 'Flow Templates', icon: 'account_tree' },
    { id: 'intelligence', label: 'Intelligence', icon: 'psychology' },
    { id: 'contacts', label: 'Contacts', icon: 'group' },
    { id: 'channels', label: 'Channels', icon: 'cell_tower' },
];

export default function RetentionDashboard() {
    const { activeBrand } = useBrand();
    const brandId = activeBrand?._id;
    const [tab, setTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [rfm, setRfm] = useState(null);
    const [templates, setTemplates] = useState([]);
    const [templateCats, setTemplateCats] = useState(null);
    const [contacts, setContacts] = useState(null);
    const [winback, setWinback] = useState(null);
    const [priceDrops, setPriceDrops] = useState(null);
    const [recentBuyers, setRecentBuyers] = useState(null);
    const [smsStatus, setSmsStatus] = useState(null);
    const [pushStatus, setPushStatus] = useState(null);
    const [embedSnippet, setEmbedSnippet] = useState('');
    const [trackerStats, setTrackerStats] = useState(null);
    const [segDetail, setSegDetail] = useState(null);
    const [segDetailKey, setSegDetailKey] = useState('');

    // Load data on tab change
    useEffect(() => {
        if (!brandId) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true);
            try {
                if (tab === 'overview' || tab === 'segments') {
                    if (!rfm) { const r = await retentionStudio.rfmAnalysis(brandId); if (!cancelled && r.success) setRfm(r); }
                }
                if (tab === 'templates') {
                    if (!templates.length) {
                        try { const t = await retentionStudio.templates(); if (!cancelled && t.success) setTemplates(t.templates || []); }
                        catch (e) { console.warn('[Retention] templates error:', e); }
                    }
                    if (!templateCats) {
                        try { const c = await retentionStudio.templateCategories(); if (!cancelled && c.success) setTemplateCats(c.categories || {}); }
                        catch (e) { console.warn('[Retention] templateCategories error:', e); if (!cancelled) setTemplateCats({}); }
                    }
                }
                if (tab === 'intelligence') {
                    // Individual try-catch so one failure doesn't block others
                    if (!winback) {
                        try { const w = await retentionStudio.winbackCandidates(brandId); if (!cancelled) setWinback(w); }
                        catch (e) { console.warn('[Retention] winback error:', e); if (!cancelled) setWinback({ candidates: [] }); }
                    }
                    if (!priceDrops) {
                        try { const p = await retentionStudio.priceDrops(brandId); if (!cancelled) setPriceDrops(p); }
                        catch (e) { console.warn('[Retention] priceDrops error:', e); if (!cancelled) setPriceDrops({ products: [] }); }
                    }
                    if (!recentBuyers) {
                        try { const b = await retentionStudio.recentBuyers(brandId); if (!cancelled) setRecentBuyers(b); }
                        catch (e) { console.warn('[Retention] recentBuyers error:', e); if (!cancelled) setRecentBuyers({ buyers: [] }); }
                    }
                }
                if (tab === 'contacts') {
                    if (!contacts) { const r = await retentionStudio.unifiedContacts(brandId); if (!cancelled && r.success) setContacts(r); }
                }
                if (tab === 'channels') {
                    const [s, p] = await Promise.allSettled([
                        !smsStatus ? retentionStudio.smsStatus() : Promise.resolve(smsStatus),
                        !pushStatus ? retentionStudio.pushStatus() : Promise.resolve(pushStatus),
                    ]);
                    if (!cancelled) {
                        if (s.status === 'fulfilled' && s.value?.success) setSmsStatus(s.value);
                        if (p.status === 'fulfilled' && p.value?.success) setPushStatus(p.value);
                    }
                    if (!embedSnippet && brandId) {
                        try { const e = await retentionStudio.widgetEmbed(brandId); if (!cancelled && e.success) setEmbedSnippet(e.snippet); } catch {}
                    }
                    if (!trackerStats) {
                        try { const t = await retentionStudio.browseTrackerStats(); if (!cancelled && t.success) setTrackerStats(t.stats); } catch {}
                    }
                }
            } catch (err) { console.error('[Retention]', err); }
            if (!cancelled) setLoading(false);
        };
        load();
        return () => { cancelled = true; };
    }, [tab, brandId]);

    const loadSegDetail = async (key) => {
        setSegDetailKey(key);
        try {
            const r = await retentionStudio.rfmSegment(key, brandId);
            if (r.success) setSegDetail(r.customers || []);
        } catch { setSegDetail([]); }
    };

    if (!brandId) return <div style={{ padding: 60, textAlign: 'center', color: '#64748b' }}>Select a brand to view Retention Intelligence</div>;

    return (
        <div>
            {/* Tab Bar */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 28, overflowX: 'auto', background: 'rgba(255,255,255,0.02)', borderRadius: 14, padding: 4, border: '1px solid rgba(255,255,255,0.06)' }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={S.tab(tab === t.id)}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: -3, marginRight: 6 }}>{t.icon}</span>
                        {t.label}
                    </button>
                ))}
            </div>

            {loading && <div style={{ textAlign: 'center', padding: 40 }}><div style={S.spinner} /></div>}

            {/* ═══ OVERVIEW ═══ */}
            {tab === 'overview' && !loading && (
                <div>
                    <div style={S.grid4}>
                        {[
                            { label: 'Total Segments', value: rfm?.segments ? Object.keys(rfm.segments).length : 0, icon: 'donut_large', color: '#6366f1' },
                            { label: 'Total Customers', value: rfm?.totalCustomers || 0, icon: 'group', color: '#10b981' },
                            { label: 'Total Revenue', value: `₹${((rfm?.totalRevenue || 0) / 1000).toFixed(0)}K`, icon: 'payments', color: '#f59e0b' },
                            { label: 'Marketable', value: rfm?.marketable || 0, icon: 'mark_email_read', color: '#ec4899' },
                        ].map((s, i) => (
                            <div key={i} style={S.card}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                    <div style={{ width: 34, height: 34, borderRadius: 10, background: `${s.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: s.color }}>{s.icon}</span>
                                    </div>
                                    <span style={S.label}>{s.label}</span>
                                </div>
                                <div style={{ color: '#fff', fontSize: 26, fontWeight: 800 }}>{s.value}</div>
                            </div>
                        ))}
                    </div>
                    {/* Quick actions */}
                    <div style={{ marginTop: 28 }}>
                        <h3 style={S.h3}>Quick Actions</h3>
                        <div style={S.grid3}>
                            {[
                                { label: 'Run RFM Analysis', desc: 'Segment customers by Recency, Frequency & Monetary value', icon: 'analytics', action: () => setTab('segments') },
                                { label: 'Browse Templates', desc: '8 pre-built retention flow templates ready to deploy', icon: 'account_tree', action: () => setTab('templates') },
                                { label: 'View Win-Back', desc: 'Find inactive customers to re-engage', icon: 'person_search', action: () => setTab('intelligence') },
                                { label: 'Manage Contacts', desc: 'Unified view across all sources with dedup', icon: 'contacts', action: () => setTab('contacts') },
                                { label: 'Channel Setup', desc: 'Configure SMS, Push, Widget & Tracking', icon: 'cell_tower', action: () => setTab('channels') },
                                { label: 'Price Drop Alerts', desc: 'Products with current discounts to promote', icon: 'trending_down', action: () => setTab('intelligence') },
                            ].map((a, i) => (
                                <div key={i} onClick={a.action} style={{ ...S.card, cursor: 'pointer', transition: 'all 0.2s' }}
                                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
                                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1', marginBottom: 8, display: 'block' }}>{a.icon}</span>
                                    <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: '0 0 4px' }}>{a.label}</h4>
                                    <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>{a.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ RFM SEGMENTS ═══ */}
            {tab === 'segments' && !loading && (
                <div>
                    <h3 style={S.h3}>Customer Lifecycle Segments</h3>
                    {rfm?.segments ? (
                        <>
                            <div style={S.grid3}>
                                {Object.entries(rfm.segments).map(([key, seg]) => (
                                    <div key={key} style={{ ...S.card, cursor: 'pointer', borderLeft: `3px solid ${SEG_COLORS[key] || '#6366f1'}` }}
                                        onClick={() => loadSegDetail(key)}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = SEG_COLORS[key]}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>{seg.label || key}</h4>
                                            <span style={S.segBadge(SEG_COLORS[key] || '#6366f1')}>{seg.count}</span>
                                        </div>
                                        <p style={{ color: '#64748b', fontSize: 11, margin: '0 0 10px' }}>{seg.description || ''}</p>
                                        <div style={{ display: 'flex', gap: 16, fontSize: 11 }}>
                                            <span style={{ color: '#94a3b8' }}>Revenue: <b style={{ color: '#fff' }}>₹{((seg.totalRevenue || 0) / 1000).toFixed(0)}K</b></span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {/* Segment Detail Modal */}
                            {segDetailKey && (
                                <div style={{ marginTop: 24, ...S.card }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <h3 style={{ ...S.h3, margin: 0 }}>Customers in: {segDetailKey}</h3>
                                        <button onClick={() => { setSegDetailKey(''); setSegDetail(null); }} style={S.btnSec}>Close</button>
                                    </div>
                                    {segDetail === null ? <div style={S.spinner} /> : segDetail.length === 0 ? (
                                        <p style={{ color: '#64748b' }}>No customers in this segment</p>
                                    ) : (
                                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead><tr>{['Email', 'Name', 'Orders', 'Total Spent'].map(h => <th key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
                                                <tbody>{segDetail.slice(0, 50).map((c, i) => (
                                                    <tr key={i}>
                                                        <td style={{ color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }}>{c.email}</td>
                                                        <td style={{ color: '#94a3b8', fontSize: 12, padding: '8px 12px' }}>{c.firstName} {c.lastName}</td>
                                                        <td style={{ color: '#fff', fontSize: 12, padding: '8px 12px' }}>{c.ordersCount}</td>
                                                        <td style={{ color: '#10b981', fontSize: 12, padding: '8px 12px', fontWeight: 600 }}>₹{c.totalSpent}</td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    ) : <p style={{ color: '#64748b' }}>No RFM data available. Ensure Shopify customers are synced.</p>}
                </div>
            )}

            {/* ═══ TEMPLATES ═══ */}
            {tab === 'templates' && !loading && (
                <div>
                    <h3 style={S.h3}>Pre-built Flow Templates</h3>
                    {templateCats ? Object.entries(templateCats).map(([cat, catData]) => (
                        <div key={cat} style={{ marginBottom: 28 }}>
                            <h4 style={{ color: '#94a3b8', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{catData.label || cat}</h4>
                            <div style={S.grid3}>
                                {(catData.templates || []).map(t => (
                                    <div key={t.id} style={S.card}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${t.color || '#6366f1'}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span style={{ fontSize: 20 }}>{t.icon || '📋'}</span>
                                            </div>
                                            <h4 style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0 }}>{t.name}</h4>
                                        </div>
                                        <p style={{ color: '#64748b', fontSize: 12, margin: '0 0 12px', lineHeight: 1.5 }}>{t.description}</p>
                                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={S.segBadge(t.color || '#6366f1')}>{t.stepCount || '?'} steps</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )) : <p style={{ color: '#64748b' }}>Loading templates...</p>}
                </div>
            )}

            {/* ═══ INTELLIGENCE ═══ */}
            {tab === 'intelligence' && !loading && (
                <div>
                    <h3 style={S.h3}>Retention Intelligence</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Win-back */}
                        <div style={S.card}>
                            <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#f59e0b' }}>person_search</span>
                                Win-Back Candidates
                                <span style={S.segBadge('#f59e0b')}>{winback?.candidates?.length || 0}</span>
                            </h4>
                            {winback?.candidates?.length > 0 ? (
                                <div style={{ maxHeight: 250, overflowY: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead><tr>{['Email', 'Last Order', 'Days Inactive', 'Lifetime Value'].map(h => <th key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
                                        <tbody>{(winback.candidates || []).slice(0, 20).map((c, i) => (
                                            <tr key={i}>
                                                <td style={{ color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }}>{c.email}</td>
                                                <td style={{ color: '#94a3b8', fontSize: 12, padding: '8px 12px' }}>{c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : '-'}</td>
                                                <td style={{ color: '#f59e0b', fontSize: 12, padding: '8px 12px', fontWeight: 600 }}>{c.daysSinceLastOrder || '-'}</td>
                                                <td style={{ color: '#10b981', fontSize: 12, padding: '8px 12px' }}>₹{c.totalSpent || 0}</td>
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                            ) : <p style={{ color: '#64748b', fontSize: 13 }}>No inactive customers found (60+ days)</p>}
                        </div>
                        {/* Price Drops */}
                        <div style={S.card}>
                            <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#10b981' }}>trending_down</span>
                                Price Drop Products
                                <span style={S.segBadge('#10b981')}>{priceDrops?.products?.length || 0}</span>
                            </h4>
                            {priceDrops?.products?.length > 0 ? (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                                    {priceDrops.products.slice(0, 8).map((p, i) => (
                                        <div key={i} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 14 }}>
                                            <h5 style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: '0 0 6px' }}>{p.title}</h5>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                <span style={{ color: '#ef4444', textDecoration: 'line-through', fontSize: 12 }}>₹{p.compareAtPrice || p.mrp}</span>
                                                <span style={{ color: '#10b981', fontWeight: 700, fontSize: 14 }}>₹{p.price}</span>
                                                {p.savingsPercent && <span style={S.segBadge('#10b981')}>{p.savingsPercent}% off</span>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : <p style={{ color: '#64748b', fontSize: 13 }}>No price drops detected</p>}
                        </div>
                        {/* Recent Buyers */}
                        <div style={S.card}>
                            <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#6366f1' }}>shopping_bag</span>
                                Recent Buyers (7 days)
                                <span style={S.segBadge('#6366f1')}>{recentBuyers?.buyers?.length || 0}</span>
                            </h4>
                            {recentBuyers?.buyers?.length > 0 ? (
                                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                    {recentBuyers.buyers.slice(0, 10).map((b, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{ color: '#e2e8f0', fontSize: 13 }}>{b.email}</span>
                                            <span style={{ color: '#10b981', fontSize: 13, fontWeight: 600 }}>₹{b.totalPrice || b.total_price || 0}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : <p style={{ color: '#64748b', fontSize: 13 }}>No recent purchases</p>}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══ CONTACTS ═══ */}
            {tab === 'contacts' && !loading && (
                <div>
                    <h3 style={S.h3}>Unified Contacts</h3>
                    {contacts ? (
                        <>
                            <div style={{ ...S.grid4, marginBottom: 24 }}>
                                <div style={S.card}><span style={S.label}>Total</span><div style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{contacts.total}</div></div>
                                <div style={S.card}><span style={S.label}>Contact Only</span><div style={{ color: '#6366f1', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{contacts.sourceBreakdown?.contactOnly || 0}</div></div>
                                <div style={S.card}><span style={S.label}>Shopify Only</span><div style={{ color: '#10b981', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{contacts.sourceBreakdown?.shopifyOnly || 0}</div></div>
                                <div style={S.card}><span style={S.label}>Merged</span><div style={{ color: '#f59e0b', fontSize: 24, fontWeight: 800, marginTop: 6 }}>{contacts.sourceBreakdown?.merged || 0}</div></div>
                            </div>
                            <div style={{ ...S.card, maxHeight: 400, overflowY: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead><tr>{['Email', 'Name', 'Phone', 'Sources', 'Orders', 'Spent'].map(h => <th key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0a0a1a' }}>{h}</th>)}</tr></thead>
                                    <tbody>{(contacts.contacts || []).slice(0, 100).map((c, i) => (
                                        <tr key={i}>
                                            <td style={{ color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }}>{c.email}</td>
                                            <td style={{ color: '#94a3b8', fontSize: 12, padding: '8px 12px' }}>{c.name}</td>
                                            <td style={{ color: '#94a3b8', fontSize: 12, padding: '8px 12px' }}>{c.phone || '-'}</td>
                                            <td style={{ fontSize: 12, padding: '8px 12px' }}>{(c.sources || []).map(s => <span key={s} style={{ ...S.segBadge(s === 'shopify' ? '#10b981' : '#6366f1'), marginRight: 4 }}>{s}</span>)}</td>
                                            <td style={{ color: '#fff', fontSize: 12, padding: '8px 12px' }}>{c.shopify?.ordersCount || '-'}</td>
                                            <td style={{ color: '#10b981', fontSize: 12, padding: '8px 12px', fontWeight: 600 }}>{c.shopify?.totalSpent ? `₹${c.shopify.totalSpent}` : '-'}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </>
                    ) : <p style={{ color: '#64748b' }}>No contact data available</p>}
                </div>
            )}

            {/* ═══ CHANNELS ═══ */}
            {tab === 'channels' && !loading && (
                <div>
                    <h3 style={S.h3}>Delivery Channels</h3>
                    <div style={S.grid3}>
                        {/* SMS */}
                        <div style={S.card}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#10b981' }}>sms</span>
                                <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>SMS</h4>
                                <span style={S.segBadge(smsStatus?.sms?.configured ? '#10b981' : '#f59e0b')}>{smsStatus?.sms?.configured ? 'Active' : 'Simulation'}</span>
                            </div>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Provider: <b style={{ color: '#fff' }}>{smsStatus?.sms?.provider || 'none'}</b></p>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Sender ID: <b style={{ color: '#fff' }}>{smsStatus?.sms?.senderId || '-'}</b></p>
                        </div>
                        {/* Push */}
                        <div style={S.card}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1' }}>notifications</span>
                                <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>Push</h4>
                                <span style={S.segBadge(pushStatus?.push?.configured ? '#10b981' : '#f59e0b')}>{pushStatus?.push?.configured ? 'Active' : 'Simulation'}</span>
                            </div>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Provider: <b style={{ color: '#fff' }}>{pushStatus?.push?.provider || 'none'}</b></p>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Topics: <b style={{ color: '#fff' }}>{pushStatus?.push?.supportsTopic ? 'Yes' : 'No'}</b></p>
                        </div>
                        {/* Widget */}
                        <div style={S.card}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#f59e0b' }}>code</span>
                                <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>Lead Form Widget</h4>
                            </div>
                            {embedSnippet ? (
                                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12 }}>
                                    <code style={{ color: '#10b981', fontSize: 11, wordBreak: 'break-all' }}>{embedSnippet}</code>
                                </div>
                            ) : <p style={{ color: '#64748b', fontSize: 12 }}>Widget embed code will appear here</p>}
                        </div>
                        {/* Browse Tracker */}
                        <div style={S.card}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#ec4899' }}>visibility</span>
                                <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>Browse Tracking</h4>
                            </div>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Active Sessions: <b style={{ color: '#fff' }}>{trackerStats?.activeSessions || 0}</b></p>
                            <p style={{ color: '#64748b', fontSize: 12 }}>Total Events: <b style={{ color: '#fff' }}>{trackerStats?.totalEvents || 0}</b></p>
                            <p style={{ color: '#64748b', fontSize: 12 }}>With Email: <b style={{ color: '#10b981' }}>{trackerStats?.sessionsWithEmail || 0}</b></p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
