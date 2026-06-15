import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../services/api';

const API = '/api-keys';

const styles = {
    wrap: {
        background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
        borderRadius: '20px',
        padding: '32px',
        color: '#e2e8f0',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        maxWidth: '780px',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        marginBottom: '8px',
    },
    icon: {
        width: '48px',
        height: '48px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        flexShrink: 0,
    },
    title: {
        fontSize: '22px',
        fontWeight: 700,
        color: '#f8fafc',
        margin: 0,
    },
    subtitle: {
        fontSize: '14px',
        color: '#94a3b8',
        margin: '4px 0 0',
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'rgba(124, 58, 237, 0.18)',
        border: '1px solid rgba(124, 58, 237, 0.4)',
        borderRadius: '99px',
        padding: '4px 12px',
        fontSize: '12px',
        color: '#a78bfa',
        fontWeight: 600,
        marginBottom: '24px',
    },
    codeBox: {
        background: 'rgba(0,0,0,0.35)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px 20px',
        marginBottom: '24px',
        fontSize: '12px',
        color: '#94a3b8',
        lineHeight: 1.7,
    },
    codeHighlight: { color: '#a78bfa' },
    codeUrl: { color: '#34d399' },
    codeKey: { color: '#fbbf24' },
    form: {
        display: 'flex',
        gap: '10px',
        marginBottom: '24px',
        flexWrap: 'wrap',
    },
    input: {
        flex: 1,
        minWidth: '200px',
        background: 'rgba(255,255,255,0.06)',
        border: '1.5px solid rgba(255,255,255,0.12)',
        borderRadius: '10px',
        padding: '10px 16px',
        color: '#e2e8f0',
        fontSize: '14px',
        outline: 'none',
        transition: 'border-color 0.2s',
    },
    btn: {
        background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
        border: 'none',
        borderRadius: '10px',
        padding: '10px 22px',
        color: '#fff',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        transition: 'opacity 0.2s, transform 0.1s',
    },
    btnDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
    },
    revealBox: {
        background: 'linear-gradient(135deg, rgba(52, 211, 153, 0.08), rgba(16, 185, 129, 0.05))',
        border: '1.5px solid rgba(52, 211, 153, 0.3)',
        borderRadius: '14px',
        padding: '20px',
        marginBottom: '24px',
    },
    revealLabel: {
        fontSize: '13px',
        color: '#6ee7b7',
        fontWeight: 600,
        marginBottom: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
    },
    revealKey: {
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '8px',
        padding: '12px 16px',
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: '13px',
        color: '#34d399',
        letterSpacing: '0.5px',
        wordBreak: 'break-all',
        marginBottom: '12px',
    },
    copyBtn: {
        background: 'rgba(52, 211, 153, 0.15)',
        border: '1px solid rgba(52, 211, 153, 0.4)',
        borderRadius: '8px',
        padding: '8px 18px',
        color: '#34d399',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    warning: {
        fontSize: '12px',
        color: '#f59e0b',
        marginTop: '10px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
    },
    keyList: { display: 'flex', flexDirection: 'column', gap: '10px' },
    keyCard: {
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        transition: 'border-color 0.2s',
    },
    keyCardRevoked: {
        opacity: 0.45,
        filter: 'grayscale(1)',
    },
    keyName: { fontWeight: 600, fontSize: '14px', color: '#f1f5f9', marginBottom: '3px' },
    keyMeta: { fontSize: '12px', color: '#64748b', display: 'flex', gap: '14px', flexWrap: 'wrap' },
    keyPrefix: {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: '#a78bfa',
        background: 'rgba(124,58,237,0.12)',
        borderRadius: '6px',
        padding: '2px 8px',
    },
    activeDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#34d399',
        flexShrink: 0,
        boxShadow: '0 0 6px rgba(52,211,153,0.6)',
    },
    revokedDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: '#ef4444',
        flexShrink: 0,
    },
    revokeBtn: {
        marginLeft: 'auto',
        background: 'transparent',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '8px',
        padding: '5px 12px',
        color: '#f87171',
        fontSize: '12px',
        cursor: 'pointer',
        flexShrink: 0,
        transition: 'all 0.2s',
    },
    emptyState: {
        textAlign: 'center',
        padding: '32px 0',
        color: '#475569',
    },
    error: {
        background: 'rgba(239,68,68,0.1)',
        border: '1px solid rgba(239,68,68,0.3)',
        borderRadius: '10px',
        padding: '12px 16px',
        color: '#f87171',
        fontSize: '13px',
        marginBottom: '16px',
    },
    divider: {
        borderTop: '1px solid rgba(255,255,255,0.06)',
        margin: '24px 0',
    },
    sectionLabel: {
        fontSize: '12px',
        fontWeight: 600,
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: '12px',
    },
};

export default function ApiKeyManager() {
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [revealed, setRevealed] = useState(null); // { plaintext, id }
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState('');

    const fetchKeys = useCallback(async () => {
        try {
            const data = await apiFetch(API);
            if (data.success) setKeys(data.keys);
        } catch (_) {}
        setLoading(false);
    }, []);

    useEffect(() => { fetchKeys(); }, [fetchKeys]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newKeyName.trim()) return;
        setCreating(true);
        setError('');
        setRevealed(null);
        try {
            const data = await apiFetch(API, { method: 'POST', body: JSON.stringify({ name: newKeyName.trim() }) });
            if (data.success) {
                setRevealed({ plaintext: data.plaintext, id: data.key._id });
                setNewKeyName('');
                fetchKeys();
            }
        } catch (err) {
            setError(err.message || 'Failed to create key');
        }
        setCreating(false);
    };

    const handleRevoke = async (id) => {
        if (!window.confirm('Revoke this API key? Any Claude integrations using it will stop working.')) return;
        try {
            await apiFetch(`${API}/${id}`, { method: 'DELETE' });
            setKeys(keys.map(k => k._id === id ? { ...k, isActive: false } : k));
            if (revealed?.id === id) setRevealed(null);
        } catch (err) {
            setError(err.message || 'Failed to revoke key');
        }
    };

    const handleCopy = () => {
        if (!revealed) return;
        navigator.clipboard.writeText(revealed.plaintext);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div style={styles.wrap}>
            {/* Header */}
            <div style={styles.header}>
                <div style={styles.icon}>🔗</div>
                <div>
                    <h2 style={styles.title}>Mantram MCP</h2>
                    <p style={styles.subtitle}>Connect Claude, Cursor & any AI agent to Mantram</p>
                </div>
            </div>

            <div style={{ marginTop: '16px', marginBottom: '20px' }}>
                <span style={styles.badge}>
                    <span>⚡</span> 2 tools available: generate_image · generate_video
                </span>
            </div>

            {/* Quick start */}
            <div style={styles.codeBox}>
                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Claude Desktop config.json
                </div>
                <div>
                    <span style={styles.codeHighlight}>{`"mcpServers"`}</span>: {`{`}
                </div>
                <div style={{ paddingLeft: '16px' }}>
                    <span style={styles.codeHighlight}>{`"mantram"`}</span>: {`{`}
                </div>
                <div style={{ paddingLeft: '32px' }}>
                    <span style={styles.codeHighlight}>{`"type"`}</span>: <span style={styles.codeUrl}>{`"http"`}</span>,
                </div>
                <div style={{ paddingLeft: '32px' }}>
                    <span style={styles.codeHighlight}>{`"url"`}</span>: <span style={styles.codeUrl}>{`"https://api.mantram.ai/mcp"`}</span>,
                </div>
                <div style={{ paddingLeft: '32px' }}>
                    <span style={styles.codeHighlight}>{`"headers"`}</span>: {`{ "Authorization": "`}<span style={styles.codeKey}>Bearer mnt_sk_...</span>{`" }`}
                </div>
                <div style={{ paddingLeft: '16px' }}>{`}`}</div>
                <div>{`}`}</div>
            </div>

            {/* Error */}
            {error && <div style={styles.error}>⚠️ {error}</div>}

            {/* Revealed key (shown once) */}
            {revealed && (
                <div style={styles.revealBox}>
                    <div style={styles.revealLabel}>
                        ✅ API Key Created — Copy it now!
                    </div>
                    <div style={styles.revealKey}>{revealed.plaintext}</div>
                    <button
                        style={styles.copyBtn}
                        onClick={handleCopy}
                    >
                        {copied ? '✅ Copied!' : '📋 Copy Key'}
                    </button>
                    <div style={styles.warning}>
                        ⚠️ This key will never be shown again. Store it securely.
                    </div>
                </div>
            )}

            {/* Create new key form */}
            <div style={styles.sectionLabel}>Create New Key</div>
            <form onSubmit={handleCreate} style={styles.form}>
                <input
                    style={styles.input}
                    placeholder='Key name (e.g. "Claude Desktop - Work")'
                    value={newKeyName}
                    onChange={e => setNewKeyName(e.target.value)}
                    maxLength={80}
                    disabled={creating}
                />
                <button
                    type="submit"
                    style={{ ...styles.btn, ...(creating || !newKeyName.trim() ? styles.btnDisabled : {}) }}
                    disabled={creating || !newKeyName.trim()}
                >
                    {creating ? '⏳ Creating…' : '+ Generate Key'}
                </button>
            </form>

            <div style={styles.divider} />

            {/* Existing keys */}
            <div style={styles.sectionLabel}>
                Your API Keys ({keys.filter(k => k.isActive).length} active)
            </div>

            {loading ? (
                <div style={styles.emptyState}>Loading…</div>
            ) : keys.length === 0 ? (
                <div style={styles.emptyState}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔑</div>
                    <div>No API keys yet. Create one above to connect Claude.</div>
                </div>
            ) : (
                <div style={styles.keyList}>
                    {keys.map(key => (
                        <div
                            key={key._id}
                            style={{
                                ...styles.keyCard,
                                ...(key.isActive ? {} : styles.keyCardRevoked),
                            }}
                        >
                            <div style={key.isActive ? styles.activeDot : styles.revokedDot} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={styles.keyName}>{key.name}</div>
                                <div style={styles.keyMeta}>
                                    <span style={styles.keyPrefix}>{key.keyPrefix}…</span>
                                    <span>{key.isActive ? '✅ Active' : '❌ Revoked'}</span>
                                    {key.requestCount > 0 && (
                                        <span>{key.requestCount.toLocaleString()} calls</span>
                                    )}
                                    {key.lastUsedAt && (
                                        <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                                    )}
                                    <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                                </div>
                            </div>
                            {key.isActive && (
                                <button
                                    style={styles.revokeBtn}
                                    onClick={() => handleRevoke(key._id)}
                                >
                                    Revoke
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
