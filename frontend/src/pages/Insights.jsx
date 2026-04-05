/**
 * Insights Dashboard — Conversation Studio
 * Rich analytics: volume trends, intent heatmap, sentiment, compliance, response times
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SEOHead from '../components/SEOHead';
import { useBrand } from '../context/BrandContext';
import { conversations as conversationsAPI } from '../services/api';

const INTENT_LABELS = {
    price_inquiry: { label: 'Price Inquiry', icon: 'sell', color: '#f59e0b' },
    product_inquiry: { label: 'Product Inquiry', icon: 'inventory_2', color: '#6366f1' },
    order_status: { label: 'Order Status', icon: 'package_2', color: '#06b6d4' },
    complaint: { label: 'Complaint', icon: 'warning', color: '#ef4444' },
    greeting: { label: 'Greeting', icon: 'waving_hand', color: '#10b981' },
    support: { label: 'Support', icon: 'support_agent', color: '#8b5cf6' },
    purchase_intent: { label: 'Purchase Intent', icon: 'shopping_cart', color: '#f97316' },
    feedback: { label: 'Feedback', icon: 'star', color: '#eab308' },
    store_location: { label: 'Store Location', icon: 'location_on', color: '#14b8a6' },
    booking: { label: 'Booking', icon: 'calendar_month', color: '#a855f7' },
    unknown: { label: 'Unknown', icon: 'help', color: '#64748b' },
};

const CHANNEL_LABELS = {
    instagram_dm: { label: 'Instagram DM', icon: 'photo_camera', color: '#e1306c' },
    facebook_messenger: { label: 'Messenger', icon: 'chat', color: '#0084ff' },
    instagram_comment: { label: 'IG Comment', icon: 'comment', color: '#c13584' },
    instagram_story_reply: { label: 'Story Reply', icon: 'smartphone', color: '#fd8d32' },
    instagram_mention: { label: 'Mention', icon: 'alternate_email', color: '#7c3aed' },
};

export default function Insights() {
    const { activeBrand: currentBrand } = useBrand();
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const fetchStats = useCallback(async () => {
        if (!currentBrand?._id) return;
        setLoading(true);
        try {
            const data = await conversationsAPI.stats({ brandId: currentBrand._id });
            if (data.success) setStats(data.stats);
        } catch (err) {
            console.error('Failed to fetch stats:', err);
        } finally {
            setLoading(false);
        }
    }, [currentBrand?._id]);

    useEffect(() => { fetchStats(); }, [fetchStats]);

    if (!currentBrand) {
        return (
            <DashboardLayout title="Conversation Studio" subtitle="AI-powered inbox analytics">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
                    <div style={{ textAlign: 'center' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', color: '#6366f1' }}>bar_chart</span>
                        <h3 style={{ margin: 0, color: '#e2e8f0' }}>Select a Brand</h3>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>Choose a brand to view conversation insights</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Conversation Studio" subtitle="AI-powered inbox analytics">
            <SEOHead title="Insights — Mantram AI" noIndex={true} />
            <div className="flex items-center gap-1 mb-6 p-1 glass-panel rounded-xl w-fit">
                <button onClick={() => navigate('/conversations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">inbox</span> Inbox
                </button>
                <button onClick={() => navigate('/conversations/automations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">bolt</span> Automations
                </button>
                <button onClick={() => navigate('/conversations/ai-settings')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-slate-400 hover:text-white hover:bg-white/[0.04] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">psychology</span> AI Settings
                </button>
                <button className="px-5 py-2 rounded-lg text-sm font-bold bg-primary/10 text-primary flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">insights</span> Insights
                </button>
            </div>

            {loading && !stats ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem', color: '#64748b' }}>
                    <div style={{ textAlign: 'center' }}>
                        <span className="material-symbols-outlined animate-spin" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block' }}>progress_activity</span>
                        Loading analytics...
                    </div>
                </div>
            ) : stats ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* ── Row 1: KPI Cards ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
                        <KPICard icon="forum" label="Total Conversations" value={stats.total} color="#6366f1" />
                        <KPICard icon="chat" label="Active" value={stats.active} color="#10b981" />
                        <KPICard icon="check_circle" label="Resolved" value={stats.resolved} color="#06b6d4" />
                        <KPICard icon="support_agent" label="Human Handled" value={stats.handedOff} color="#f59e0b" />
                        <KPICard icon="timer" label="Avg Response" value={stats.avgResponseTimeSec ? `${stats.avgResponseTimeSec}s` : 'N/A'} color="#8b5cf6" subtitle="response time" />
                    </div>

                    {/* ── Row 2: Volume Chart + Compliance ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                        <VolumeChart data={stats.volumeSeries || []} />
                        <CompliancePanel compliance={stats.compliance} active={stats.active} />
                    </div>

                    {/* ── Row 3: Intent Breakdown + Sentiment + Channels ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                        <IntentBreakdown intents={stats.topIntents || []} total={stats.total} />
                        <SentimentPanel sentiments={stats.sentiments} />
                        <ChannelBreakdown channels={stats.channelBreakdown || []} total={stats.total} />
                    </div>

                    {/* ── Row 4: AI Performance ── */}
                    <AIPerformance replies={stats.repliesByType} aiHandled={stats.aiHandled} total={stats.total} />
                </div>
            ) : (
                <div style={{ textAlign: 'center', padding: '4rem', color: '#64748b' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '3rem', marginBottom: '1rem', display: 'block', color: '#475569' }}>bar_chart</span>
                    <h3 style={{ color: '#e2e8f0' }}>No Insights Yet</h3>
                    <p style={{ fontSize: '0.875rem' }}>Start conversations to see analytics appear here</p>
                </div>
            )}
        </DashboardLayout>
    );
}

// ═══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════

function KPICard({ icon, label, value, color, subtitle }) {
    return (
        <div style={{
            background: '#1e293b', borderRadius: '12px', padding: '1.25rem', border: '1px solid #334155',
            position: 'relative', overflow: 'hidden',
        }}>
            <div style={{ position: 'absolute', top: '-4px', right: '-4px', opacity: 0.08 }}>
                <span className="material-symbols-outlined" style={{ fontSize: '3rem', color }}>{icon}</span>
            </div>
            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color, display: 'block', marginBottom: '0.5rem' }}>{icon}</span>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>{label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color }}>{value}</div>
            {subtitle && <div style={{ fontSize: '0.65rem', color: '#64748b', marginTop: '0.25rem' }}>{subtitle}</div>}
        </div>
    );
}

function VolumeChart({ data }) {
    const maxVal = Math.max(...data.map(d => d.total), 1);

    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', verticalAlign: 'middle', color: '#6366f1' }}>trending_up</span>
                    Conversation Volume (7 Days)
                </h3>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <LegendDot color="#6366f1" label="Total" />
                    <LegendDot color="#10b981" label="AI Handled" />
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '140px', padding: '0 0.5rem' }}>
                {data.map((d, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>{d.total}</span>
                        <div style={{ width: '100%', display: 'flex', gap: '2px', alignItems: 'flex-end', height: '100px' }}>
                            <div style={{
                                flex: 1, borderRadius: '4px 4px 0 0', background: 'linear-gradient(to top, #6366f120, #6366f1)',
                                height: `${Math.max(4, (d.total / maxVal) * 100)}%`, transition: 'height 0.5s ease',
                            }} />
                            <div style={{
                                flex: 1, borderRadius: '4px 4px 0 0', background: 'linear-gradient(to top, #10b98120, #10b981)',
                                height: `${Math.max(4, (d.aiHandled / maxVal) * 100)}%`, transition: 'height 0.5s ease',
                            }} />
                        </div>
                        <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{d.day}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function CompliancePanel({ compliance, active }) {
    const open = compliance?.open || 0;
    const closed = compliance?.closed || 0;
    const total = open + closed || 1;
    const openPct = Math.round((open / total) * 100);

    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#10b981' }}>security</span>
                Meta Compliance Status
            </h3>

            {/* Gauge-style ring */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                <div style={{ position: 'relative', width: '120px', height: '120px' }}>
                    <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#334155" strokeWidth="2.5" />
                        <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#10b981" strokeWidth="2.5"
                            strokeDasharray={`${openPct} ${100 - openPct}`} strokeLinecap="round" />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                        <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#10b981' }}>{openPct}%</span>
                        <span style={{ fontSize: '0.6rem', color: '#64748b' }}>compliant</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1.25rem' }}>{open}</div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Window Open</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#ef4444', fontWeight: 700, fontSize: '1.25rem' }}>{closed}</div>
                    <div style={{ color: '#64748b', fontSize: '0.7rem' }}>Window Closed</div>
                </div>
            </div>

            <p style={{ color: '#64748b', fontSize: '0.7rem', textAlign: 'center', margin: '0.75rem 0 0' }}>
                Meta requires responses within 24h. Open = can send promotional. Closed = standard only.
            </p>
        </div>
    );
}

function IntentBreakdown({ intents, total }) {
    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#6366f1' }}>ads_click</span>
                Top Intents
            </h3>
            {intents.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No intent data yet</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {intents.map((intent, i) => {
                        const info = INTENT_LABELS[intent._id] || { label: intent._id || 'Unknown', icon: 'help', color: '#64748b' };
                        const pct = total > 0 ? Math.round((intent.count / total) * 100) : 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem', width: '24px', textAlign: 'center', color: info.color }}>{info.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                        <span style={{ color: '#e2e8f0', fontSize: '0.8rem', fontWeight: 500 }}>{info.label}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{intent.count} ({pct}%)</span>
                                    </div>
                                    <div style={{ height: '4px', borderRadius: '2px', background: '#334155' }}>
                                        <div style={{ height: '100%', borderRadius: '2px', background: info.color, width: `${pct}%`, transition: 'width 0.5s' }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function SentimentPanel({ sentiments }) {
    const s = sentiments || { positive: 0, neutral: 0, negative: 0 };
    const total = s.positive + s.neutral + s.negative || 1;
    const data = [
        { label: 'Positive', value: s.positive, pct: Math.round((s.positive / total) * 100), color: '#10b981', icon: 'sentiment_satisfied' },
        { label: 'Neutral', value: s.neutral, pct: Math.round((s.neutral / total) * 100), color: '#f59e0b', icon: 'sentiment_neutral' },
        { label: 'Negative', value: s.negative, pct: Math.round((s.negative / total) * 100), color: '#ef4444', icon: 'sentiment_dissatisfied' },
    ];

    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#6366f1' }}>chat</span>
                Sentiment Analysis
            </h3>

            {/* Stacked bar */}
            <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '24px', marginBottom: '1rem', background: '#334155' }}>
                {data.map(d => d.pct > 0 && (
                    <div key={d.label} style={{ width: `${d.pct}%`, background: d.color, transition: 'width 0.5s', minWidth: '4px' }} />
                ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {data.map(d => (
                    <div key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: d.color }}>{d.icon}</span>
                            <span style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{d.label}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: d.color, fontWeight: 700, fontSize: '0.9rem' }}>{d.value}</span>
                            <span style={{ color: '#64748b', fontSize: '0.7rem' }}>({d.pct}%)</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ChannelBreakdown({ channels, total }) {
    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#06b6d4' }}>cell_tower</span>
                Channel Breakdown
            </h3>
            {channels.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '1rem' }}>No channel data yet</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                    {channels.map((ch, i) => {
                        const info = CHANNEL_LABELS[ch._id] || { label: ch._id || 'Unknown', icon: 'forum', color: '#64748b' };
                        const pct = total > 0 ? Math.round((ch.count / total) * 100) : 0;
                        return (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '1rem', width: '24px', textAlign: 'center', color: info.color }}>{info.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                                        <span style={{ color: '#e2e8f0', fontSize: '0.8rem' }}>{info.label}</span>
                                        <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{ch.count} ({pct}%)</span>
                                    </div>
                                    <div style={{ height: '4px', borderRadius: '2px', background: '#334155' }}>
                                        <div style={{ height: '100%', borderRadius: '2px', background: info.color, width: `${pct}%`, transition: 'width 0.5s' }} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function AIPerformance({ replies, aiHandled, total }) {
    const r = replies || { ai: 0, human: 0, automation: 0 };
    const totalReplies = r.ai + r.human + r.automation || 1;
    const aiPct = Math.round((r.ai / totalReplies) * 100);
    const humanPct = Math.round((r.human / totalReplies) * 100);
    const autoPct = Math.round((r.automation / totalReplies) * 100);
    const aiHandlePct = total > 0 ? Math.round((aiHandled / total) * 100) : 0;

    return (
        <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem' }}>
            <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1.1rem', color: '#6366f1' }}>smart_toy</span>
                AI Performance
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#6366f1', fontWeight: 700, fontSize: '1.75rem' }}>{aiHandlePct}%</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>AI Handling Rate</div>
                    <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem' }}>{aiHandled}/{total} conversations</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#10b981', fontWeight: 700, fontSize: '1.75rem' }}>{r.ai}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>AI Replies </div>
                    <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem' }}>{aiPct}% of all replies</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: '1.75rem' }}>{r.human}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Human Replies</div>
                    <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem' }}>{humanPct}% of all replies</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ color: '#8b5cf6', fontWeight: 700, fontSize: '1.75rem' }}>{r.automation}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Automation Replies</div>
                    <div style={{ color: '#64748b', fontSize: '0.65rem', marginTop: '0.25rem' }}>{autoPct}% of all replies</div>
                </div>
            </div>

            {/* AI vs Human bar */}
            <div style={{ marginTop: '1rem' }}>
                <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', height: '12px', background: '#334155' }}>
                    {aiPct > 0 && <div style={{ width: `${aiPct}%`, background: '#10b981', transition: 'width 0.5s' }} />}
                    {humanPct > 0 && <div style={{ width: `${humanPct}%`, background: '#f59e0b', transition: 'width 0.5s' }} />}
                    {autoPct > 0 && <div style={{ width: `${autoPct}%`, background: '#8b5cf6', transition: 'width 0.5s' }} />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                    <LegendDot color="#10b981" label="AI" />
                    <LegendDot color="#f59e0b" label="Human" />
                    <LegendDot color="#8b5cf6" label="Automation" />
                </div>
            </div>
        </div>
    );
}

function LegendDot({ color, label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, display: 'inline-block' }} />
            <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>{label}</span>
        </div>
    );
}
