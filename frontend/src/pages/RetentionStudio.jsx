/**
 * RetentionStudio.jsx — Amazon→D2C Re-Engagement Studio
 * 
 * The 11th Studio in Mantram AI.
 * Pipeline: Data Ingest → Match & Enrich → Creative Design → Mailer Compose → Send & Track
 */

import { useState, useEffect, useCallback } from 'react';
import { useBrand } from '../context/BrandContext';
import DashboardLayout from '../components/DashboardLayout';
import { retentionStudio } from '../services/api';
import RetentionDashboard from '../components/retention/RetentionDashboard';

// ── Pipeline Steps ──
const PIPELINE_STEPS = [
    { id: 'ingest', label: 'Import Data', icon: 'upload_file', desc: 'Upload Amazon customer CSV' },
    { id: 'match', label: 'Match Products', icon: 'compare_arrows', desc: 'Match to Shopify catalog' },
    { id: 'creative', label: 'Design Creative', icon: 'palette', desc: 'AI-generate comparison card' },
    { id: 'compose', label: 'Compose Mailer', icon: 'mail', desc: 'Generate email template' },
    { id: 'send', label: 'Send & Track', icon: 'send', desc: 'Dispatch & monitor results' },
];

const STATUS_TO_STEP = {
    draft: 0, ingesting: 0, matching: 1, designing: 2, composing: 3, reviewing: 3, sending: 4, sent: 4, completed: 4,
};

// ── Creative Templates ──
const CREATIVE_TEMPLATES = [
    { id: 'price-showdown', label: 'Price Showdown', icon: '⚔️', desc: 'Side-by-side Amazon vs Website pricing' },
    { id: 'savings-spotlight', label: 'Savings Spotlight', icon: '💰', desc: 'Large product + savings callout badge' },
    { id: 'loyalty-unlock', label: 'Loyalty Unlock', icon: '🎁', desc: 'Price comparison + rewards messaging' },
    { id: 'bundle-builder', label: 'Bundle Builder', icon: '📦', desc: 'Cross-sell — complete the set on our store' },
    { id: 'vip-welcome', label: 'VIP Welcome', icon: '👑', desc: 'Premium exclusive offer design' },
];

const MAILER_TEMPLATES = [
    { id: 'clean-minimal', label: 'Clean Minimal', icon: '✨', desc: 'White bg, brand header, single card CTA' },
    { id: 'dark-premium', label: 'Dark Premium', icon: '🌙', desc: 'Dark gradient, premium feel, multi-product' },
    { id: 'social-proof', label: 'Social Proof', icon: '⭐', desc: 'Product card + reviews + testimonial' },
    { id: 'urgency-drive', label: 'Urgency Drive', icon: '⏰', desc: 'Countdown timer + limited-time offer' },
];

const SAMPLE_CSV = `Name,Email,Product Name,ASIN,Price,Order Date
Priya Sharma,priya@example.com,Organic Green Tea 100g,B09XYZ1234,₹599,2024-03-15
Rahul Verma,rahul@example.com,Cold-Pressed Coconut Oil,B08ABC5678,₹449,2024-03-14
Ananya Patel,ananya@example.com,Organic Green Tea 100g,B09XYZ1234,₹599,2024-03-13`;

const MODES = [
    { id: 'intel', label: 'Retention Intelligence', icon: 'psychology', desc: 'RFM · Templates · Contacts · Channels' },
    { id: 'pipeline', label: 'Amazon → D2C Pipeline', icon: 'campaign', desc: 'Import · Match · Design · Send' },
];

export default function RetentionStudio() {
    const { activeBrand } = useBrand();
    const brandId = activeBrand?._id;

    // Top-level mode
    const [mode, setMode] = useState('intel'); // 'intel' or 'pipeline'

    // Pipeline state
    const [view, setView] = useState('dashboard'); // dashboard, campaign
    const [campaigns, setCampaigns] = useState([]);
    const [activeCampaign, setActiveCampaign] = useState(null);
    const [loading, setLoading] = useState(false);
    const [nodeLoading, setNodeLoading] = useState('');
    const [error, setError] = useState('');

    // Pipeline state
    const [csvText, setCsvText] = useState('');
    const [creativeTemplate, setCreativeTemplate] = useState('price-showdown');
    const [mailerTemplate, setMailerTemplate] = useState('clean-minimal');
    const [analytics, setAnalytics] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [testEmail, setTestEmail] = useState('');
    const [testEmailSent, setTestEmailSent] = useState('');
    const [imageLoading, setImageLoading] = useState(false);
    const [generatedImageUrl, setGeneratedImageUrl] = useState('');

    // ── Load campaigns ──
    const loadCampaigns = useCallback(async () => {
        if (!brandId) return;
        try {
            setLoading(true);
            const res = await retentionStudio.list({ brandId });
            if (res.success) setCampaigns(res.campaigns || []);
        } catch (err) {
            console.error('Load campaigns error:', err);
        } finally {
            setLoading(false);
        }
    }, [brandId]);

    useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

    // ── Load full campaign ──
    const loadCampaign = async (id) => {
        try {
            setLoading(true);
            const res = await retentionStudio.get(id);
            if (res.success) {
                setActiveCampaign(res.campaign);
                setView('campaign');
                // Load analytics too
                try {
                    const aRes = await retentionStudio.analytics(id);
                    if (aRes.success) setAnalytics(aRes.analytics);
                } catch {}
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Create new campaign ──
    const createCampaign = async () => {
        if (!brandId) return setError('Select a brand first');
        try {
            setLoading(true);
            const res = await retentionStudio.create({ brandId });
            if (res.success) {
                setActiveCampaign(res.campaign);
                setView('campaign');
                loadCampaigns();
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    // ── Pipeline Node Runners ──
    const runIngest = async () => {
        if (!csvText.trim()) return setError('Paste your Amazon customer CSV data');
        try {
            setNodeLoading('ingest');
            setError('');
            const res = await retentionStudio.ingest(activeCampaign._id, { rawData: csvText, source: 'csv' });
            if (res.success) {
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Ingest failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const runMatch = async () => {
        try {
            setNodeLoading('match');
            setError('');
            const res = await retentionStudio.match(activeCampaign._id);
            if (res.success) {
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Match failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const runCreative = async () => {
        try {
            setNodeLoading('creative');
            setError('');
            const res = await retentionStudio.creative(activeCampaign._id, { creativeTemplate });
            if (res.success) {
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Creative generation failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const runCompose = async () => {
        try {
            setNodeLoading('compose');
            setError('');
            const res = await retentionStudio.compose(activeCampaign._id, { mailerTemplate });
            if (res.success) {
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Mailer composition failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const approveItem = async (type) => {
        try {
            setNodeLoading('approve');
            const res = await retentionStudio.approve(activeCampaign._id, { approveType: type });
            if (res.success) loadCampaign(activeCampaign._id);
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const runSend = async () => {
        if (!confirm(`This will send REAL emails to ${activeCampaign.contacts?.filter(c => c.matched).length || 0} customers. Continue?`)) return;
        try {
            setNodeLoading('send');
            setError('');
            const res = await retentionStudio.send(activeCampaign._id);
            if (res.success) {
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Send failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const loadPreview = async () => {
        if (!activeCampaign?._id) return;
        try {
            const res = await retentionStudio.preview(activeCampaign._id);
            if (res.success) setPreviewData(res.preview);
        } catch (err) {
            console.error('Preview load error:', err);
        }
    };

    const sendTestEmail = async () => {
        if (!testEmail.trim()) return setError('Enter a test email address');
        try {
            setNodeLoading('test');
            setTestEmailSent('');
            const res = await retentionStudio.testEmail(activeCampaign._id, testEmail.trim());
            if (res.success) {
                setTestEmailSent(`✅ Test email sent to ${testEmail}`);
            } else {
                setError(res.error || 'Test email failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setNodeLoading('');
        }
    };

    const generateProductImage = async () => {
        if (!activeCampaign?._id) return;
        try {
            setImageLoading(true);
            setError('');
            const res = await retentionStudio.generateImage(activeCampaign._id);
            if (res.success) {
                setGeneratedImageUrl(res.imageUrl);
                loadCampaign(activeCampaign._id);
            } else {
                setError(res.error || 'Image generation failed');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setImageLoading(false);
        }
    };

    const deleteCampaign = async (id) => {
        if (!confirm('Delete this campaign?')) return;
        try {
            await retentionStudio.delete(id);
            if (activeCampaign?._id === id) {
                setActiveCampaign(null);
                setView('dashboard');
            }
            loadCampaigns();
        } catch (err) {
            setError(err.message);
        }
    };

    const currentStep = activeCampaign ? (STATUS_TO_STEP[activeCampaign.status] || 0) : 0;

    return (
        <DashboardLayout>
            <div style={{ minHeight: '100vh', background: '#050510', padding: '24px 32px' }}>
                {/* ── Header ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                        {(mode === 'pipeline' && view === 'campaign') && (
                            <button onClick={() => { setView('dashboard'); setActiveCampaign(null); }}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '8px 12px', color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Back
                            </button>
                        )}
                        <div>
                            <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#818cf8' }}>loyalty</span> Retention Studio
                            </h1>
                            <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                                {mode === 'intel' ? 'Customer Intelligence • Segmentation • Multichannel Retention' : 'Amazon → D2C Re-Engagement Pipeline'}
                            </p>
                        </div>
                    </div>
                    {mode === 'pipeline' && view === 'dashboard' && (
                        <button onClick={createCampaign} disabled={loading}
                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 12, padding: '12px 24px', color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, boxShadow: '0 4px 20px rgba(99,102,241,0.3)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
                            New Campaign
                        </button>
                    )}
                </div>

                {/* ── Mode Toggle ── */}
                {!(mode === 'pipeline' && view === 'campaign') && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
                        {MODES.map(m => (
                            <button key={m.id} onClick={() => { setMode(m.id); setView('dashboard'); }}
                                style={{
                                    flex: 1, padding: '16px 20px', borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14,
                                    background: mode === m.id ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.02)',
                                    border: mode === m.id ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                }}>
                                <span className="material-symbols-outlined" style={{ fontSize: 28, color: mode === m.id ? '#818cf8' : '#475569' }}>{m.icon}</span>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ color: mode === m.id ? '#fff' : '#94a3b8', fontSize: 14, fontWeight: 700 }}>{m.label}</div>
                                    <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>{m.desc}</div>
                                </div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#f87171', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
                        {error}
                        <button onClick={() => setError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}>✕</button>
                    </div>
                )}

                {/* ═══ RETENTION INTELLIGENCE MODE ═══ */}
                {mode === 'intel' && <RetentionDashboard />}

                {/* ═══ AMAZON PIPELINE MODE ═══ */}
                {/* ── Dashboard View ── */}
                {mode === 'pipeline' && view === 'dashboard' && (
                    <div>
                        {/* Stats Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
                            {[
                                { label: 'Total Campaigns', value: campaigns.length, icon: 'campaign', color: '#6366f1' },
                                { label: 'Active', value: campaigns.filter(c => !['completed', 'failed', 'draft'].includes(c.status)).length, icon: 'play_circle', color: '#10b981' },
                                { label: 'Completed', value: campaigns.filter(c => c.status === 'completed' || c.status === 'sent').length, icon: 'check_circle', color: '#f59e0b' },
                                { label: 'Total Contacts', value: campaigns.reduce((sum, c) => sum + (c.ingestData?.totalImported || 0), 0), icon: 'group', color: '#ec4899' },
                            ].map((stat, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px 24px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${stat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: stat.color }}>{stat.icon}</span>
                                        </div>
                                        <span style={{ color: '#64748b', fontSize: 12, fontWeight: 600 }}>{stat.label}</span>
                                    </div>
                                    <div style={{ color: '#fff', fontSize: 28, fontWeight: 800 }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Campaign List */}
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                                <div style={{ width: 32, height: 32, border: '3px solid rgba(99,102,241,0.2)', borderTop: '3px solid #6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                                Loading campaigns...
                            </div>
                        ) : campaigns.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '80px 40px', background: 'rgba(255,255,255,0.02)', borderRadius: 20, border: '1px dashed rgba(255,255,255,0.1)' }}>
                                <div style={{ fontSize: 56, marginBottom: 16 }}>📧</div>
                                <h3 style={{ color: '#fff', fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No campaigns yet</h3>
                                <p style={{ color: '#64748b', fontSize: 14, maxWidth: 400, margin: '0 auto 24px' }}>
                                    Create your first Amazon→D2C re-engagement campaign to start converting marketplace customers into loyal website buyers.
                                </p>
                                <button onClick={createCampaign}
                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 12, padding: '12px 28px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                                    Create First Campaign
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {campaigns.map(c => (
                                    <div key={c._id} onClick={() => loadCampaign(c._id)}
                                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 16, padding: '20px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s' }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                            <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#a78bfa' }}>campaign</span>
                                            </div>
                                            <div>
                                                <h4 style={{ color: '#fff', fontSize: 15, fontWeight: 700, margin: 0 }}>{c.title}</h4>
                                                <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>{new Date(c.createdAt).toLocaleDateString()} • {c.ingestData?.totalImported || 0} contacts</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                            <span style={{
                                                background: c.status === 'sent' || c.status === 'completed' ? 'rgba(16,185,129,0.15)' : c.status === 'failed' ? 'rgba(239,68,68,0.15)' : c.status === 'draft' ? 'rgba(100,116,139,0.15)' : 'rgba(99,102,241,0.15)',
                                                color: c.status === 'sent' || c.status === 'completed' ? '#10b981' : c.status === 'failed' ? '#ef4444' : c.status === 'draft' ? '#94a3b8' : '#818cf8',
                                                padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                                            }}>{c.status}</span>
                                            <button onClick={e => { e.stopPropagation(); deleteCampaign(c._id); }}
                                                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Campaign View (Pipeline) ── */}
                {mode === 'pipeline' && view === 'campaign' && activeCampaign && (
                    <div>
                        {/* Pipeline Progress Stepper */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 32, background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: '16px 24px', border: '1px solid rgba(255,255,255,0.06)' }}>
                            {PIPELINE_STEPS.map((step, i) => (
                                <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
                                        <div style={{
                                            width: 40, height: 40, borderRadius: '50%',
                                            background: i < currentStep ? 'linear-gradient(135deg, #10b981, #059669)' : i === currentStep ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'rgba(255,255,255,0.05)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: i === currentStep ? '2px solid rgba(99,102,241,0.5)' : '2px solid transparent',
                                            boxShadow: i === currentStep ? '0 0 20px rgba(99,102,241,0.3)' : 'none',
                                            transition: 'all 0.3s',
                                        }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 20, color: i <= currentStep ? '#fff' : '#475569' }}>
                                                {i < currentStep ? 'check' : step.icon}
                                            </span>
                                        </div>
                                        <span style={{ color: i <= currentStep ? '#e2e8f0' : '#475569', fontSize: 11, fontWeight: 600, textAlign: 'center' }}>{step.label}</span>
                                    </div>
                                    {i < PIPELINE_STEPS.length - 1 && (
                                        <div style={{ height: 2, flex: '0 0 40px', background: i < currentStep ? '#10b981' : 'rgba(255,255,255,0.08)', borderRadius: 1, transition: 'background 0.3s' }} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Analytics Bar (if available) */}
                        {analytics && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
                                {[
                                    { label: 'Contacts', value: analytics.totalContacts, icon: 'group' },
                                    { label: 'Matched', value: `${analytics.matchRate}%`, icon: 'link' },
                                    { label: 'Avg Savings', value: `₹${analytics.avgSavings}`, icon: 'savings' },
                                    { label: 'Sent', value: analytics.totalSent, icon: 'send' },
                                    { label: 'Open Rate', value: `${analytics.openRate}%`, icon: 'visibility' },
                                    { label: 'Click Rate', value: `${analytics.clickRate}%`, icon: 'touch_app' },
                                ].map((m, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#6366f1' }}>{m.icon}</span>
                                            <span style={{ color: '#64748b', fontSize: 10, fontWeight: 600 }}>{m.label}</span>
                                        </div>
                                        <div style={{ color: '#fff', fontSize: 20, fontWeight: 800 }}>{m.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* ── Node Content Panels ── */}
                        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 20, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                            
                            {/* NODE 1: Data Ingest */}
                            {currentStep === 0 && (
                                <div style={{ padding: 32 }}>
                                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#6366f1' }}>upload_file</span>
                                        Import Amazon Customer Data
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                                        Paste your Amazon order export CSV below. Include columns: Name, Email, Product Name, ASIN, Price, Order Date.
                                    </p>

                                    <textarea
                                        value={csvText}
                                        onChange={e => setCsvText(e.target.value)}
                                        placeholder={SAMPLE_CSV}
                                        rows={10}
                                        style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 16, color: '#e2e8f0', fontSize: 13, fontFamily: 'monospace', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
                                    />

                                    <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                        <button onClick={() => setCsvText(SAMPLE_CSV)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                                            Load Sample Data
                                        </button>
                                        <button onClick={runIngest} disabled={nodeLoading === 'ingest'}
                                            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: nodeLoading === 'ingest' ? 0.6 : 1 }}>
                                            {nodeLoading === 'ingest' ? (
                                                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Parsing...</>
                                            ) : (
                                                <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>upload</span> Import & Parse</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* NODE 2: Match & Enrich */}
                            {currentStep === 1 && (
                                <div style={{ padding: 32 }}>
                                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#10b981' }}>compare_arrows</span>
                                        Match Products to Shopify Catalog
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                                        We'll match {activeCampaign.contacts?.length || 0} Amazon products against your Shopify catalog and calculate price savings.
                                    </p>

                                    {/* Contacts preview */}
                                    <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16, marginBottom: 20, maxHeight: 300, overflowY: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    {['Name', 'Email', 'Product', 'Amazon Price'].map(h => (
                                                        <th key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 600, padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(activeCampaign.contacts || []).slice(0, 20).map((c, i) => (
                                                    <tr key={i}>
                                                        <td style={{ color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }}>{c.name}</td>
                                                        <td style={{ color: '#94a3b8', fontSize: 12, padding: '8px 12px' }}>{c.email}</td>
                                                        <td style={{ color: '#e2e8f0', fontSize: 12, padding: '8px 12px' }}>{c.amazonProductTitle}</td>
                                                        <td style={{ color: '#f59e0b', fontSize: 12, padding: '8px 12px', fontWeight: 600 }}>₹{c.amazonPrice}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <button onClick={runMatch} disabled={nodeLoading === 'match'}
                                        style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: nodeLoading === 'match' ? 0.6 : 1 }}>
                                        {nodeLoading === 'match' ? (
                                            <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Matching...</>
                                        ) : (
                                            <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>sync</span> Match with Shopify</>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* NODE 3: Creative Design */}
                            {currentStep === 2 && (
                                <div style={{ padding: 32 }}>
                                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#f59e0b' }}>palette</span>
                                        Design Price Comparison Creative
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                                        {activeCampaign.matchResults?.totalMatched || 0} products matched • Average savings: ₹{activeCampaign.matchResults?.avgSavings || 0}
                                    </p>

                                    {/* Template selector */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {CREATIVE_TEMPLATES.map(t => (
                                            <div key={t.id} onClick={() => setCreativeTemplate(t.id)}
                                                style={{ background: creativeTemplate === t.id ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${creativeTemplate === t.id ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
                                                <h5 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{t.label}</h5>
                                                <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>{t.desc}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Show generated creative if exists */}
                                    {activeCampaign.creative?.generatedHtml && (
                                        <div style={{ marginBottom: 20 }}>
                                            <h4 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Generated Creative Preview:</h4>
                                            <div style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 600 }}
                                                dangerouslySetInnerHTML={{ __html: activeCampaign.creative.generatedHtml }} />
                                            
                                            {/* Product comparison image */}
                                            <div style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                                    <h4 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#f59e0b' }}>image</span>
                                                        Product Price Comparison Image
                                                    </h4>
                                                    <button onClick={generateProductImage} disabled={imageLoading}
                                                        style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 10, padding: '8px 16px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, opacity: imageLoading ? 0.6 : 1 }}>
                                                        {imageLoading ? (
                                                            <><div style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Generating...</>
                                                        ) : (
                                                            <><span className="material-symbols-outlined" style={{ fontSize: 16 }}>auto_awesome</span> {(generatedImageUrl || activeCampaign.creative.previewImageUrl) ? 'Regenerate Image' : 'Generate Image'}</>  
                                                        )}
                                                    </button>
                                                </div>
                                                {(generatedImageUrl || activeCampaign.creative.previewImageUrl) && (
                                                    <div style={{ background: '#fff', borderRadius: 10, overflow: 'hidden', maxWidth: 600 }}>
                                                        <img src={generatedImageUrl || activeCampaign.creative.previewImageUrl} alt="Product Comparison" 
                                                            style={{ width: '100%', display: 'block' }} />
                                                    </div>
                                                )}
                                                {!generatedImageUrl && !activeCampaign.creative.previewImageUrl && (
                                                    <p style={{ color: '#64748b', fontSize: 12, margin: 0 }}>Click "Generate Image" to create an AI-generated product price comparison banner for your email.</p>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                                <button onClick={() => approveItem('creative')} disabled={activeCampaign.creative.approved}
                                                    style={{ background: activeCampaign.creative.approved ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{activeCampaign.creative.approved ? 'check_circle' : 'thumb_up'}</span>
                                                    {activeCampaign.creative.approved ? 'Approved ✓' : 'Approve Creative'}
                                                </button>
                                                <button onClick={runCreative} disabled={nodeLoading === 'creative'}
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                                                    ↻ Regenerate
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!activeCampaign.creative?.generatedHtml && (
                                        <button onClick={runCreative} disabled={nodeLoading === 'creative'}
                                            style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: nodeLoading === 'creative' ? 0.6 : 1 }}>
                                            {nodeLoading === 'creative' ? (
                                                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Generating...</>
                                            ) : (
                                                <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Generate AI Creative</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* NODE 4: Mailer Compose */}
                            {currentStep === 3 && (
                                <div style={{ padding: 32 }}>
                                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#ec4899' }}>mail</span>
                                        Compose Email Template
                                    </h3>
                                    <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                                        AI will generate a complete email using your Brand DNA's voice, colors, and style.
                                    </p>

                                    {/* Mailer template selector */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
                                        {MAILER_TEMPLATES.map(t => (
                                            <div key={t.id} onClick={() => setMailerTemplate(t.id)}
                                                style={{ background: mailerTemplate === t.id ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.03)', border: `1px solid ${mailerTemplate === t.id ? 'rgba(236,72,153,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 14, padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}>
                                                <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
                                                <h5 style={{ color: '#fff', fontSize: 13, fontWeight: 700, margin: '0 0 4px' }}>{t.label}</h5>
                                                <p style={{ color: '#64748b', fontSize: 11, margin: 0 }}>{t.desc}</p>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Show mailer preview */}
                                    {activeCampaign.mailer?.bodyHtml && (
                                        <div style={{ marginBottom: 20 }}>
                                            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
                                                <div>
                                                    <span style={{ color: '#64748b', fontSize: 11 }}>Subject Line:</span>
                                                    <p style={{ color: '#fff', fontSize: 14, fontWeight: 600, margin: '4px 0 0' }}>{previewData?.subjectLine || activeCampaign.mailer.subjectLine}</p>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748b', fontSize: 11 }}>Preview Text:</span>
                                                    <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>{previewData?.previewText || activeCampaign.mailer.previewText}</p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                                <h4 style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 600, margin: 0 }}>Email Preview{previewData ? ' (Live Data)' : ''}:</h4>
                                                {!previewData && <button onClick={loadPreview} style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: 8, padding: '4px 12px', color: '#818cf8', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>Load Live Preview</button>}
                                            </div>
                                            <div style={{ background: '#fff', borderRadius: 12, maxWidth: 640, maxHeight: 500, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                                                <iframe srcDoc={previewData?.bodyHtml || activeCampaign.mailer.bodyHtml} title="Email Preview"
                                                    style={{ width: '100%', minHeight: 400, border: 'none', borderRadius: 12 }} />
                                            </div>
                                            
                                            {/* Test Email */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '12px 16px', border: '1px solid rgba(255,255,255,0.06)' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#6366f1' }}>forward_to_inbox</span>
                                                <input
                                                    type="email"
                                                    value={testEmail}
                                                    onChange={e => setTestEmail(e.target.value)}
                                                    placeholder="Enter email to send test..."
                                                    style={{ flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none' }}
                                                />
                                                <button onClick={sendTestEmail} disabled={nodeLoading === 'test'}
                                                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', border: 'none', borderRadius: 8, padding: '8px 16px', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 12, opacity: nodeLoading === 'test' ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                                                    {nodeLoading === 'test' ? 'Sending...' : '📧 Send Test'}
                                                </button>
                                            </div>
                                            {testEmailSent && <div style={{ color: '#10b981', fontSize: 12, marginTop: 8 }}>{testEmailSent}</div>}

                                            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                                                <button onClick={() => approveItem('mailer')} disabled={activeCampaign.mailer.approved}
                                                    style={{ background: activeCampaign.mailer.approved ? 'rgba(16,185,129,0.2)' : 'linear-gradient(135deg, #10b981, #059669)', border: 'none', borderRadius: 10, padding: '10px 20px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{activeCampaign.mailer.approved ? 'check_circle' : 'thumb_up'}</span>
                                                    {activeCampaign.mailer.approved ? 'Approved ✓' : 'Approve Email'}
                                                </button>
                                                <button onClick={runCompose} disabled={nodeLoading === 'compose'}
                                                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 20px', color: '#94a3b8', cursor: 'pointer', fontSize: 13 }}>
                                                    ↻ Regenerate
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {!activeCampaign.mailer?.bodyHtml && (
                                        <button onClick={runCompose} disabled={nodeLoading === 'compose'}
                                            style={{ background: 'linear-gradient(135deg, #ec4899, #db2777)', border: 'none', borderRadius: 10, padding: '10px 24px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, opacity: nodeLoading === 'compose' ? 0.6 : 1 }}>
                                            {nodeLoading === 'compose' ? (
                                                <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Composing...</>
                                            ) : (
                                                <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Generate Email</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* NODE 5: Send & Track */}
                            {currentStep === 4 && (
                                <div style={{ padding: 32 }}>
                                    <h3 style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#8b5cf6' }}>send</span>
                                        {activeCampaign.status === 'sent' || activeCampaign.status === 'completed' ? 'Campaign Sent!' : 'Ready to Send'}
                                    </h3>

                                    {(activeCampaign.status === 'sent' || activeCampaign.status === 'completed') ? (
                                        <div>
                                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, padding: '24px', marginBottom: 20, textAlign: 'center' }}>
                                                <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
                                                <h4 style={{ color: '#10b981', fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Emails dispatched!</h4>
                                                <p style={{ color: '#64748b', fontSize: 13 }}>
                                                    {activeCampaign.sendResults?.totalSent || 0} emails sent to matched customers
                                                </p>
                                            </div>
                                            {/* Results grid */}
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                                {[
                                                    { label: 'Sent', value: activeCampaign.sendResults?.totalSent || 0, color: '#6366f1' },
                                                    { label: 'Opened', value: activeCampaign.sendResults?.totalOpened || 0, color: '#10b981' },
                                                    { label: 'Clicked', value: activeCampaign.sendResults?.totalClicked || 0, color: '#f59e0b' },
                                                ].map((s, i) => (
                                                    <div key={i} style={{ background: `${s.color}10`, borderRadius: 12, padding: '16px', textAlign: 'center', border: `1px solid ${s.color}30` }}>
                                                        <div style={{ color: s.color, fontSize: 28, fontWeight: 800 }}>{s.value}</div>
                                                        <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <p style={{ color: '#64748b', fontSize: 13, marginBottom: 20 }}>
                                                Your mailer is approved and ready to send to {activeCampaign.contacts?.filter(c => c.matched).length || 0} matched customers.
                                            </p>
                                            <div style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 12, padding: '12px 16px', marginBottom: 20, color: '#34d399', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>verified</span>
                                                Real emails will be sent via Gmail SMTP to each matched customer with personalized product & price data.
                                            </div>
                                            <button onClick={runSend} disabled={nodeLoading === 'send'}
                                                style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none', borderRadius: 10, padding: '12px 28px', color: '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 20px rgba(139,92,246,0.3)', opacity: nodeLoading === 'send' ? 0.6 : 1 }}>
                                                {nodeLoading === 'send' ? (
                                                    <><div style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTop: '2px solid #fff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} /> Sending...</>
                                                ) : (
                                                    <><span className="material-symbols-outlined" style={{ fontSize: 20 }}>rocket_launch</span> Send Campaign</>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Global spinner animation */}
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </DashboardLayout>
    );
}
