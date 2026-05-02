/**
 * AI Settings Page — Conversation Studio
 * Configure smart routing rules, AI confidence thresholds, and test AI responses
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '../components/DashboardLayout';
import SEOHead from '../components/SEOHead';
import { useBrand } from '../context/BrandContext';
import { routingRules as routingRulesAPI, brands as brandsAPI, commentReplies as commentRepliesAPI } from '../services/api';

const INTENT_OPTIONS = [
    { id: 'greeting', label: '👋 Greeting' },
    { id: 'price_inquiry', label: '💰 Price Inquiry' },
    { id: 'product_inquiry', label: '🛍️ Product Inquiry' },
    { id: 'order_status', label: '📦 Order Status' },
    { id: 'complaint', label: '⚠️ Complaint' },
    { id: 'support', label: '🛟 Support' },
    { id: 'purchase_intent', label: '🛒 Purchase Intent' },
    { id: 'feedback', label: '⭐ Feedback' },
    { id: 'store_location', label: '📍 Store Location' },
    { id: 'booking', label: '📅 Booking' },
    { id: 'partnership', label: '🤝 Partnership' },
    { id: 'spam', label: '🚫 Spam' },
];

const ACTION_OPTIONS = [
    { id: 'auto_reply', label: '🤖 Auto Reply', color: '#10b981' },
    { id: 'escalate', label: '🚨 Escalate to Human', color: '#ef4444' },
    { id: 'tag', label: '🏷️ Tag Conversation', color: '#f59e0b' },
    { id: 'assign_agent', label: '👤 Assign Agent', color: '#6366f1' },
];

const SENTIMENT_OPTIONS = [
    { id: '', label: 'Any' },
    { id: 'positive', label: '😊 Positive' },
    { id: 'neutral', label: '😐 Neutral' },
    { id: 'negative', label: '😠 Negative' },
];

export default function AISettings() {
    const { activeBrand: currentBrand } = useBrand();
    const navigate = useNavigate();
    const [rules, setRules] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [editingRule, setEditingRule] = useState(null);
    const [showAddRule, setShowAddRule] = useState(false);

    // AI Test panel state
    const [testMessage, setTestMessage] = useState('');
    const [testResult, setTestResult] = useState(null);
    const [testing, setTesting] = useState(false);
    const [autoReplyThreshold, setAutoReplyThreshold] = useState(75);

    // Autonomy state
    const [autonomy, setAutonomy] = useState({
        enabled: true,
        autoReplyConfidence: 75,
        maxAutoRepliesPerConvo: 5,
        commentAutoReply: false,
        commentToDM: true,
        callBookingEnabled: false,
        callBookingLink: '',
        followUpEnabled: false,
        followUpDelayHours: 24,
        businessHours: { enabled: false, start: '09:00', end: '18:00', timezone: 'Asia/Kolkata' },
        escalationEmail: '',
        rateLimitPerConvo: 3,
    });
    const [savingAutonomy, setSavingAutonomy] = useState(false);

    // Recent auto-replies
    const [recentReplies, setRecentReplies] = useState([]);
    const [replyStats, setReplyStats] = useState({ total: 0, replied: 0, dmSent: 0, errors: 0 });
    const [repliesLoading, setRepliesLoading] = useState(false);

    const fetchRules = useCallback(async () => {
        if (!currentBrand?._id) return;
        setLoading(true);
        try {
            const data = await routingRulesAPI.list(currentBrand._id);
            setRules(data.rules || []);
        } catch { } finally {
            setLoading(false);
        }
    }, [currentBrand]);

    // Load autonomy settings from brand
    useEffect(() => {
        if (currentBrand?.autonomy) {
            setAutonomy(prev => ({ ...prev, ...currentBrand.autonomy }));
            setAutoReplyThreshold(currentBrand.autonomy.autoReplyConfidence || 75);
        }
    }, [currentBrand]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    // Fetch recent comment auto-replies
    const fetchCommentReplies = useCallback(async () => {
        if (!currentBrand?._id) return;
        setRepliesLoading(true);
        try {
            const data = await commentRepliesAPI.list(currentBrand._id, 10);
            setRecentReplies(data.replies || []);
            setReplyStats(data.stats || { total: 0, replied: 0, dmSent: 0, errors: 0 });
        } catch { } finally {
            setRepliesLoading(false);
        }
    }, [currentBrand]);

    useEffect(() => { fetchCommentReplies(); }, [fetchCommentReplies]);

    const handleToggleRule = async (ruleId) => {
        const rule = rules.find(r => r.id === ruleId);
        if (!rule) return;
        try {
            await routingRulesAPI.update(ruleId, { brandId: currentBrand._id, enabled: !rule.enabled });
            setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
        } catch { }
    };

    const handleDeleteRule = async (ruleId) => {
        if (!confirm('Delete this routing rule?')) return;
        try {
            await routingRulesAPI.delete(ruleId, currentBrand._id);
            setRules(prev => prev.filter(r => r.id !== ruleId));
        } catch { }
    };

    const handleAddRule = async (newRule) => {
        try {
            const data = await routingRulesAPI.create({ ...newRule, brandId: currentBrand._id });
            if (data.success) {
                setRules(prev => [...prev, data.rule]);
                setShowAddRule(false);
            }
        } catch { }
    };

    const handleTestAI = async () => {
        if (!testMessage.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const data = await routingRulesAPI.test({ message: testMessage, brandId: currentBrand?._id });
            if (data.success) setTestResult(data);
        } catch (err) {
            setTestResult({
                error: err.message,
                isProviderError: err.isProviderError,
                provider: err.provider
            });
        } finally {
            setTesting(false);
        }
    };

    if (!currentBrand) {
        return (
            <DashboardLayout title="Conversation Studio" subtitle="AI-powered routing & settings">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: '#94a3b8' }}>
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">psychology</span></div>
                        <h3 style={{ margin: 0, color: '#e2e8f0' }}>Select a Brand</h3>
                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>Choose a brand to configure AI settings</p>
                    </div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout title="Conversation Studio" subtitle="AI-powered routing & settings">
            <SEOHead title="AI Settings — Mantram AI" noIndex={true} />
            <div className="flex items-center gap-1 mb-6 p-1 glass-panel rounded-xl w-fit">
                <button onClick={() => navigate('/conversations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">inbox</span> Inbox
                </button>
                <button onClick={() => navigate('/conversations/automations')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">bolt</span> Automations
                </button>
                <button className="px-5 py-2 rounded-lg text-sm font-bold bg-primary/10 text-primary flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">psychology</span> AI Settings
                </button>
                <button onClick={() => navigate('/conversations/insights')}
                    className="px-5 py-2 rounded-lg text-sm font-bold text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] transition-all flex items-center gap-2 cursor-pointer">
                    <span className="material-symbols-outlined text-sm">insights</span> Insights
                </button>
            </div>

            {error && (
                <div className={`mb-6 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
                    <span className="material-symbols-outlined text-base">
                        {error.isProviderError ? 'warning' : 'error'}
                    </span>
                    <div className="flex-1">
                        {error.isProviderError && <span className="font-bold mr-1">[{error.provider || 'AI Provider'}]</span>}
                        {error.message}
                    </div>
                    <button onClick={() => setError(null)} className="ml-auto opacity-50 hover:opacity-100 cursor-pointer">
                        <span className="material-symbols-outlined text-base">close</span>
                    </button>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* ── Left Column: Routing Rules ── */}
                <div>
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}>⚡ Smart Routing Rules</h3>
                            <button
                                onClick={() => setShowAddRule(true)}
                                style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}
                            >
                                + Add Rule
                            </button>
                        </div>

                        <div style={{ padding: '0.75rem' }}>
                            {loading ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>Loading rules...</div>
                            ) : rules.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>No routing rules yet</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {rules.map((rule, idx) => (
                                        <RuleCard
                                            key={rule.id || idx}
                                            rule={rule}
                                            onToggle={() => handleToggleRule(rule.id)}
                                            onDelete={() => handleDeleteRule(rule.id)}
                                            onEdit={() => setEditingRule(rule)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Confidence Threshold */}
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', padding: '1.25rem', marginTop: '1rem' }}>
                        <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0', fontSize: '1rem' }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">ads_click</span> Auto-Reply Confidence Threshold</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <input
                                type="range"
                                min="30"
                                max="95"
                                value={autoReplyThreshold}
                                onChange={(e) => setAutoReplyThreshold(Number(e.target.value))}
                                style={{ flex: 1, accentColor: '#6366f1' }}
                            />
                            <span style={{ color: '#e2e8f0', fontWeight: 600, fontSize: '1.25rem', minWidth: '3rem', textAlign: 'right' }}>
                                {autoReplyThreshold}%
                            </span>
                        </div>
                        <p style={{ color: '#64748b', fontSize: '0.75rem', margin: '0.5rem 0 0' }}>
                            AI will auto-reply only when confidence ≥ {autoReplyThreshold}%. Below this, conversations are routed for human review.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                            <ConfidenceBadge level="high" label="Auto-reply" range={`≥${autoReplyThreshold}%`} />
                            <ConfidenceBadge level="medium" label="Suggest" range={`${Math.max(30, autoReplyThreshold - 25)}-${autoReplyThreshold - 1}%`} />
                            <ConfidenceBadge level="low" label="Escalate" range={`<${Math.max(30, autoReplyThreshold - 25)}%`} />
                        </div>
                    </div>
                </div>

                {/* ── Right Column: AI Test Panel ── */}
                <div>
                    <div style={{ background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155' }}>
                            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}>🧪 Test Your AI</h3>
                            <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Send a sample message to see how AI classifies and responds</p>
                        </div>

                        <div style={{ padding: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    value={testMessage}
                                    onChange={(e) => setTestMessage(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleTestAI()}
                                    placeholder="Type a sample DM message..."
                                    style={{ flex: 1, background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.6rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', outline: 'none' }}
                                />
                                <button
                                    onClick={handleTestAI}
                                    disabled={testing || !testMessage.trim()}
                                    style={{ background: testing ? '#334155' : '#6366f1', color: '#fff', border: 'none', padding: '0.6rem 1rem', borderRadius: '8px', cursor: testing ? 'wait' : 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}
                                >
                                    {testing ? '⏳ Analyzing...' : '🔍 Test'}
                                </button>
                            </div>

                            {/* Quick test phrases */}
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1rem' }}>
                                {['How much does this cost?', 'My order is damaged', 'Hello!', 'I want to buy', 'Where is your store?', 'Kya rate hai?'].map(phrase => (
                                    <button
                                        key={phrase}
                                        onClick={() => { setTestMessage(phrase); }}
                                        style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '999px', padding: '0.25rem 0.6rem', color: '#94a3b8', fontSize: '0.7rem', cursor: 'pointer' }}
                                    >
                                        {phrase}
                                    </button>
                                ))}
                            </div>

                            {/* Test Results */}
                            {testResult && !testResult.error && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    {/* Intent */}
                                    <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.75rem' }}>
                                        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Detected Intent</div>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{testResult.intent?.label || testResult.intent?.intent}</span>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <ConfidenceBar value={testResult.intent?.confidence || 0} />
                                                <span style={{ color: getConfidenceColor(testResult.intent?.confidence), fontWeight: 600, fontSize: '0.875rem' }}>
                                                    {testResult.intent?.confidence}%
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <Tag label={`Sentiment: ${testResult.intent?.sentiment || 'neutral'}`} color={testResult.intent?.sentiment === 'negative' ? '#ef4444' : testResult.intent?.sentiment === 'positive' ? '#10b981' : '#64748b'} />
                                            <Tag label={`Language: ${testResult.language || 'en'}`} color="#6366f1" />
                                            <Tag label={`Source: ${testResult.intent?.source || 'ai'}`} color="#f59e0b" />
                                        </div>
                                        {testResult.intent?.reasoning && (
                                            <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.5rem 0 0', fontStyle: 'italic' }}>
                                                💡 {testResult.intent.reasoning}
                                            </p>
                                        )}
                                    </div>

                                    {/* Matching Rules */}
                                    {testResult.matchingRules?.length > 0 && (
                                        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.75rem' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Matching Routes</div>
                                            {testResult.matchingRules.map((r, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                                                    <span style={{ color: ACTION_OPTIONS.find(a => a.id === r.action)?.color || '#6366f1' }}>●</span>
                                                    <span style={{ color: '#e2e8f0', fontSize: '0.875rem' }}>{r.name}</span>
                                                    <span style={{ color: '#64748b', fontSize: '0.75rem' }}>→ {r.action}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* AI Replies */}
                                    {testResult.replies?.length > 0 && (
                                        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.75rem' }}>
                                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: '0.5rem' }}>AI Reply Suggestions</div>
                                            {testResult.replies.map((reply, i) => (
                                                <div key={i} style={{ background: '#1e293b', borderRadius: '6px', padding: '0.6rem', marginTop: i > 0 ? '0.5rem' : 0, border: '1px solid #334155' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                                        <span style={{ color: '#818cf8', fontSize: '0.75rem', fontWeight: 600 }}>{reply.label}</span>
                                                        <span style={{ color: getConfidenceColor(reply.confidence), fontSize: '0.75rem' }}>{reply.confidence}%</span>
                                                    </div>
                                                    <p style={{ color: '#e2e8f0', margin: 0, fontSize: '0.85rem', lineHeight: 1.4 }}>{reply.content}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {testResult?.error && (
                                <div className={`p-4 rounded-xl border ${testResult.isProviderError ? 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary' : 'bg-[var(--sys-primary-dim)] border-[var(--sys-border)] text-primary'} text-sm flex items-center gap-2`}>
                                    <span className="material-symbols-outlined text-base">
                                        {testResult.isProviderError ? 'warning' : 'error'}
                                    </span>
                                    <div className="flex-1">
                                        {testResult.isProviderError && <span className="font-bold mr-1">[{testResult.provider || 'AI Provider'}]</span>}
                                        {testResult.error}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Add Rule Modal */}
            {showAddRule && <AddRuleModal onSave={handleAddRule} onClose={() => setShowAddRule(false)} />}

            {/* ── Autonomy Controls ── */}
            <div style={{ marginTop: '1.5rem', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">smart_toy</span> Autonomous Agent Controls</h3>
                        <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Configure how the AI agent handles DMs and comments autonomously</p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{ color: autonomy.enabled ? '#10b981' : '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>{autonomy.enabled ? '● ACTIVE' : '● DISABLED'}</span>
                        <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
                            <input type="checkbox" checked={autonomy.enabled} onChange={e => setAutonomy(p => ({ ...p, enabled: e.target.checked }))} style={{ opacity: 0, width: 0, height: 0 }} />
                            <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: autonomy.enabled ? '#6366f1' : '#334155', borderRadius: '999px', transition: '0.3s' }}>
                                <span style={{ position: 'absolute', height: '18px', width: '18px', left: autonomy.enabled ? '23px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
                            </span>
                        </label>
                    </div>
                </div>

                <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                    {/* Confidence Threshold */}
                    <SettingCard icon="psychology" title="Auto-Reply Confidence">
                        <input type="range" min={30} max={100} value={autonomy.autoReplyConfidence} onChange={e => { const v = Number(e.target.value); setAutonomy(p => ({ ...p, autoReplyConfidence: v })); setAutoReplyThreshold(v); }}
                            style={{ width: '100%', accentColor: '#6366f1' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.7rem' }}>
                            <span>Lenient (30%)</span>
                            <span style={{ color: '#818cf8', fontWeight: 700 }}>{autonomy.autoReplyConfidence}%</span>
                            <span>Strict (100%)</span>
                        </div>
                    </SettingCard>

                    {/* Max Auto-Replies */}
                    <SettingCard icon="repeat" title="Max Auto-Replies / Conversation">
                        <select value={autonomy.maxAutoRepliesPerConvo} onChange={e => setAutonomy(p => ({ ...p, maxAutoRepliesPerConvo: Number(e.target.value) }))} style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem', color: '#e2e8f0', fontSize: '0.85rem' }}>
                            {[3, 5, 10, 15, 25].map(n => <option key={n} value={n}>{n} replies</option>)}
                        </select>
                        <p style={{ color: '#64748b', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>After this limit, escalates to human</p>
                    </SettingCard>

                    {/* Rate Limit */}
                    <SettingCard icon="speed" title="Rate Limit (per 5 min)">
                        <select value={autonomy.rateLimitPerConvo} onChange={e => setAutonomy(p => ({ ...p, rateLimitPerConvo: Number(e.target.value) }))} style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.5rem', color: '#e2e8f0', fontSize: '0.85rem' }}>
                            {[1, 2, 3, 5, 10].map(n => <option key={n} value={n}>{n} per 5 min</option>)}
                        </select>
                        <p style={{ color: '#64748b', fontSize: '0.7rem', margin: '0.25rem 0 0' }}>Prevents spam loops</p>
                    </SettingCard>

                    {/* Comment Auto-Reply */}
                    <SettingCard icon="comment" title="Comment Auto-Reply">
                        <ToggleSwitch checked={autonomy.commentAutoReply} onChange={v => setAutonomy(p => ({ ...p, commentAutoReply: v }))} label={autonomy.commentAutoReply ? 'ON — Replies to comments' : 'OFF'} />
                    </SettingCard>

                    {/* Comment-to-DM */}
                    <SettingCard icon="forward_to_inbox" title="Comment → DM Flow">
                        <ToggleSwitch checked={autonomy.commentToDM} onChange={v => setAutonomy(p => ({ ...p, commentToDM: v }))} label={autonomy.commentToDM ? 'ON — DMs after purchase comments' : 'OFF'} />
                    </SettingCard>

                    {/* Call Booking */}
                    <SettingCard icon="call" title="Call Booking">
                        <ToggleSwitch checked={autonomy.callBookingEnabled} onChange={v => setAutonomy(p => ({ ...p, callBookingEnabled: v }))} label={autonomy.callBookingEnabled ? 'ON' : 'OFF'} />
                        {autonomy.callBookingEnabled && (
                            <input type="url" value={autonomy.callBookingLink} onChange={e => setAutonomy(p => ({ ...p, callBookingLink: e.target.value }))} placeholder="Calendly / booking link" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.5rem', color: '#e2e8f0', fontSize: '0.8rem', marginTop: '0.5rem' }} />
                        )}
                    </SettingCard>

                    {/* Follow-Up */}
                    <SettingCard icon="schedule_send" title="Proactive Follow-Up">
                        <ToggleSwitch checked={autonomy.followUpEnabled} onChange={v => setAutonomy(p => ({ ...p, followUpEnabled: v }))} label={autonomy.followUpEnabled ? 'ON' : 'OFF'} />
                        {autonomy.followUpEnabled && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>After</span>
                                <select value={autonomy.followUpDelayHours} onChange={e => setAutonomy(p => ({ ...p, followUpDelayHours: Number(e.target.value) }))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.3rem', color: '#e2e8f0', fontSize: '0.8rem' }}>
                                    {[6, 12, 24, 48, 72].map(h => <option key={h} value={h}>{h}h</option>)}
                                </select>
                                <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>of no reply</span>
                            </div>
                        )}
                    </SettingCard>

                    {/* Business Hours */}
                    <SettingCard icon="schedule" title="Business Hours">
                        <ToggleSwitch checked={autonomy.businessHours?.enabled} onChange={v => setAutonomy(p => ({ ...p, businessHours: { ...p.businessHours, enabled: v } }))} label={autonomy.businessHours?.enabled ? 'Restricted' : 'OFF — 24/7'} />
                        {autonomy.businessHours?.enabled && (
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                <input type="time" value={autonomy.businessHours.start} onChange={e => setAutonomy(p => ({ ...p, businessHours: { ...p.businessHours, start: e.target.value } }))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.3rem', color: '#e2e8f0', fontSize: '0.8rem', flex: 1 }} />
                                <span style={{ color: '#64748b', alignSelf: 'center' }}>to</span>
                                <input type="time" value={autonomy.businessHours.end} onChange={e => setAutonomy(p => ({ ...p, businessHours: { ...p.businessHours, end: e.target.value } }))} style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.3rem', color: '#e2e8f0', fontSize: '0.8rem', flex: 1 }} />
                            </div>
                        )}
                    </SettingCard>

                    {/* Escalation Email */}
                    <SettingCard icon="email" title="Escalation Email">
                        <input type="email" value={autonomy.escalationEmail} onChange={e => setAutonomy(p => ({ ...p, escalationEmail: e.target.value }))} placeholder="alerts@company.com" style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '0.4rem 0.5rem', color: '#e2e8f0', fontSize: '0.8rem' }} />
                    </SettingCard>
                </div>

                {/* Save Button */}
                <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                        onClick={async () => {
                            setSavingAutonomy(true);
                            try {
                                await brandsAPI.updateAutonomy(currentBrand._id, autonomy);
                            } catch (err) {
                                setError({
                                    message: err.message,
                                    isProviderError: err.isProviderError,
                                    provider: err.provider
                                });
                            }
                            setSavingAutonomy(false);
                        }}
                        disabled={savingAutonomy}
                        style={{ background: savingAutonomy ? '#334155' : '#6366f1', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: '8px', cursor: savingAutonomy ? 'wait' : 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                    >
                        {savingAutonomy ? '⏳ Saving...' : '💾 Save Autonomy Settings'}
                    </button>
                </div>
            </div>

            {/* ── Recent Auto-Replies Activity ── */}
            {(autonomy.commentAutoReply || autonomy.commentToDM) && (
                <div style={{ marginTop: '1.5rem', background: '#1e293b', borderRadius: '12px', border: '1px solid #334155', overflow: 'hidden' }}>
                    <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, color: '#e2e8f0', fontSize: '1rem' }}><span className="material-symbols-outlined text-[inherit] text-lg align-middle mr-1 -mt-0.5">history</span> Recent Auto-Replies</h3>
                            <p style={{ color: '#64748b', margin: '0.25rem 0 0', fontSize: '0.75rem' }}>Live feed of automated comment responses</p>
                        </div>
                        <button onClick={fetchCommentReplies} disabled={repliesLoading}
                            style={{ background: '#334155', color: '#94a3b8', border: 'none', padding: '0.4rem 0.75rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: '0.85rem' }}>refresh</span>
                            {repliesLoading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>

                    {/* Stats bar */}
                    <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #334155', display: 'flex', gap: '1.5rem' }}>
                        <StatBadge icon="reply" label="Replied" value={replyStats.replied} color="#10b981" />
                        <StatBadge icon="forward_to_inbox" label="DMs Sent" value={replyStats.dmSent} color="#818cf8" />
                        <StatBadge icon="error_outline" label="Errors" value={replyStats.errors} color="#ef4444" />
                        <StatBadge icon="tag" label="Total" value={replyStats.total} color="#64748b" />
                    </div>

                    {/* Reply list */}
                    <div style={{ padding: '0.75rem 1.25rem', maxHeight: '400px', overflowY: 'auto' }}>
                        {recentReplies.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                <span className="material-symbols-outlined" style={{ fontSize: '2rem', marginBottom: '0.5rem', display: 'block', opacity: 0.5 }}>chat_bubble_outline</span>
                                No auto-replies yet. Enable Comment Auto-Reply and wait for incoming comments.
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {recentReplies.map((r, i) => (
                                    <ReplyLogCard key={r._id || i} reply={r} />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
}

// ── Sub-Components ──

function RuleCard({ rule, onToggle, onDelete, onEdit }) {
    const actionInfo = ACTION_OPTIONS.find(a => a.id === rule.action) || {};
    return (
        <div style={{
            background: rule.enabled ? '#0f172a' : '#0f172a80',
            borderRadius: '8px',
            padding: '0.75rem',
            border: `1px solid ${rule.enabled ? '#334155' : '#1e293b'}`,
            opacity: rule.enabled ? 1 : 0.6,
            transition: 'all 0.2s',
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <button
                        onClick={onToggle}
                        style={{
                            width: '36px', height: '20px', borderRadius: '999px', border: 'none',
                            background: rule.enabled ? '#6366f1' : '#334155', cursor: 'pointer',
                            position: 'relative', transition: 'background 0.2s',
                        }}
                    >
                        <div style={{
                            width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
                            position: 'absolute', top: '2px',
                            left: rule.enabled ? '18px' : '2px', transition: 'left 0.2s',
                        }} />
                    </button>
                    <span style={{ color: '#e2e8f0', fontWeight: 500, fontSize: '0.85rem' }}>{rule.name}</span>
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                    <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.8rem' }}>🗑️</button>
                </div>
            </div>
            <div style={{ display: 'flex', gap: '0.375rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                {rule.conditions?.intent && <Tag label={INTENT_OPTIONS.find(i => i.id === rule.conditions.intent)?.label || rule.conditions.intent} color="#6366f1" />}
                {rule.conditions?.intents?.map(i => <Tag key={i} label={INTENT_OPTIONS.find(o => o.id === i)?.label || i} color="#6366f1" />)}
                {rule.conditions?.sentiment && <Tag label={rule.conditions.sentiment} color={rule.conditions.sentiment === 'negative' ? '#ef4444' : '#10b981'} />}
                {rule.conditions?.minConfidence && <Tag label={`≥${rule.conditions.minConfidence}%`} color="#f59e0b" />}
                <span style={{ color: '#475569', margin: '0 0.125rem' }}>→</span>
                <Tag label={actionInfo.label || rule.action} color={actionInfo.color || '#6366f1'} />
            </div>
        </div>
    );
}

function AddRuleModal({ onSave, onClose }) {
    const [name, setName] = useState('');
    const [intent, setIntent] = useState('');
    const [sentiment, setSentiment] = useState('');
    const [minConfidence, setMinConfidence] = useState(70);
    const [action, setAction] = useState('auto_reply');

    const handleSubmit = () => {
        if (!name.trim()) return;
        const conditions = {};
        if (intent) conditions.intent = intent;
        if (sentiment) conditions.sentiment = sentiment;
        conditions.minConfidence = minConfidence;
        onSave({ name, priority: 10, enabled: true, conditions, action, actionConfig: {} });
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
            <div style={{ background: '#1e293b', borderRadius: '12px', padding: '1.5rem', width: '420px', border: '1px solid #334155' }}>
                <h3 style={{ margin: '0 0 1rem', color: '#e2e8f0' }}>Add Routing Rule</h3>

                <label style={labelStyle}>Rule Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Auto-reply to greetings" style={inputStyle} />

                <label style={labelStyle}>When Intent Is</label>
                <select value={intent} onChange={(e) => setIntent(e.target.value)} style={inputStyle}>
                    <option value="">Any intent</option>
                    {INTENT_OPTIONS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}
                </select>

                <label style={labelStyle}>and Sentiment Is</label>
                <select value={sentiment} onChange={(e) => setSentiment(e.target.value)} style={inputStyle}>
                    {SENTIMENT_OPTIONS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>

                <label style={labelStyle}>Min Confidence: {minConfidence}%</label>
                <input type="range" min="30" max="95" value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} style={{ width: '100%', accentColor: '#6366f1', marginBottom: '0.75rem' }} />

                <label style={labelStyle}>Then Do</label>
                <select value={action} onChange={(e) => setAction(e.target.value)} style={inputStyle}>
                    {ACTION_OPTIONS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <button onClick={handleSubmit} style={{ flex: 1, background: '#6366f1', color: '#fff', border: 'none', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>Create Rule</button>
                    <button onClick={onClose} style={{ flex: 1, background: '#334155', color: '#e2e8f0', border: 'none', padding: '0.6rem', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
                </div>
            </div>
        </div>
    );
}

function Tag({ label, color }) {
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', padding: '0.15rem 0.5rem',
            background: `${color}18`, color, borderRadius: '999px', fontSize: '0.7rem',
            border: `1px solid ${color}30`, fontWeight: 500,
        }}>
            {label}
        </span>
    );
}

function ConfidenceBadge({ level, label, range }) {
    const colors = { high: '#10b981', medium: '#f59e0b', low: '#ef4444' };
    const color = colors[level] || '#64748b';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.5rem', background: `${color}12`, borderRadius: '6px', border: `1px solid ${color}25` }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: color }} />
            <span style={{ color, fontSize: '0.7rem', fontWeight: 600 }}>{label}</span>
            <span style={{ color: '#64748b', fontSize: '0.65rem' }}>{range}</span>
        </div>
    );
}

function ConfidenceBar({ value }) {
    return (
        <div style={{ width: '60px', height: '6px', borderRadius: '3px', background: '#334155', overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, value)}%`, height: '100%', borderRadius: '3px', background: getConfidenceColor(value), transition: 'width 0.3s' }} />
        </div>
    );
}

function getConfidenceColor(value) {
    if (value >= 80) return '#10b981';
    if (value >= 50) return '#f59e0b';
    return '#ef4444';
}

const labelStyle = { display: 'block', color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem', marginTop: '0.5rem', textTransform: 'uppercase' };
const inputStyle = { width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '0.5rem 0.75rem', color: '#e2e8f0', fontSize: '0.875rem', marginBottom: '0.5rem', outline: 'none', boxSizing: 'border-box' };

function SettingCard({ icon, title, children }) {
    return (
        <div style={{ background: '#0f172a', borderRadius: '10px', border: '1px solid #334155', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: '#818cf8' }}>{icon}</span>
                <span style={{ color: '#e2e8f0', fontSize: '0.85rem', fontWeight: 600 }}>{title}</span>
            </div>
            {children}
        </div>
    );
}

function ToggleSwitch({ checked, onChange, label }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label style={{ position: 'relative', display: 'inline-block', width: '36px', height: '20px', flexShrink: 0 }}>
                <input type="checkbox" checked={checked || false} onChange={e => onChange(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                <span style={{ position: 'absolute', cursor: 'pointer', inset: 0, background: checked ? '#6366f1' : '#334155', borderRadius: '999px', transition: '0.3s' }}>
                    <span style={{ position: 'absolute', height: '14px', width: '14px', left: checked ? '19px' : '3px', bottom: '3px', background: '#fff', borderRadius: '50%', transition: '0.3s' }} />
                </span>
            </label>
            <span style={{ color: checked ? '#e2e8f0' : '#64748b', fontSize: '0.8rem' }}>{label}</span>
        </div>
    );
}

function StatBadge({ icon, label, value, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '1rem', color }}>{icon}</span>
            <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{label}:</span>
            <span style={{ color, fontSize: '0.85rem', fontWeight: 700 }}>{value}</span>
        </div>
    );
}

function ReplyLogCard({ reply }) {
    const actionColors = {
        comment_replied: '#10b981',
        comment_to_dm: '#818cf8',
        skipped: '#64748b',
        error: '#ef4444',
        no_action: '#64748b',
    };
    const actionLabels = {
        comment_replied: '💬 Replied',
        comment_to_dm: '📤 DM Sent',
        skipped: '⏭️ Skipped',
        error: '❌ Error',
        no_action: '—',
    };
    const color = actionColors[reply.action] || '#64748b';
    const timeAgo = getRelativeTime(reply.createdAt);

    return (
        <div style={{ background: '#0f172a', borderRadius: '8px', padding: '0.75rem', border: '1px solid #334155' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color, fontSize: '0.75rem', fontWeight: 600 }}>{actionLabels[reply.action] || reply.action}</span>
                    {reply.intent && reply.intent !== 'unknown' && (
                        <Tag label={reply.intent.replace('_', ' ')} color="#6366f1" />
                    )}
                    {reply.confidence > 0 && (
                        <Tag label={`${reply.confidence}%`} color={reply.confidence >= 80 ? '#10b981' : '#f59e0b'} />
                    )}
                    <Tag label={reply.platform || 'meta'} color="#64748b" />
                </div>
                <span style={{ color: '#475569', fontSize: '0.65rem' }}>{timeAgo}</span>
            </div>
            {reply.commenterName && (
                <div style={{ color: '#94a3b8', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    <strong style={{ color: '#cbd5e1' }}>{reply.commenterName}:</strong> {(reply.commentText || '').substring(0, 120)}{reply.commentText?.length > 120 ? '…' : ''}
                </div>
            )}
            {reply.replyText && (
                <div style={{ color: '#e2e8f0', fontSize: '0.8rem', background: '#1e293b', borderRadius: '6px', padding: '0.5rem', marginTop: '0.25rem', borderLeft: `3px solid ${color}` }}>
                    ↳ {reply.replyText}
                </div>
            )}
            {reply.errorMessage && (
                <div style={{ color: '#ef4444', fontSize: '0.7rem', marginTop: '0.25rem' }}>⚠️ {reply.errorMessage}</div>
            )}
        </div>
    );
}

function getRelativeTime(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
