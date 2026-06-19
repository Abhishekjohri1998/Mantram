/**
 * CopilotDock.jsx — The AI copilot side panel.
 *
 * The dock is collapsible. Inside: a chat thread + brief input.
 * User messages go to /agent/v2/copilot for canvas commands.
 * Agent responses appear as messages AND the canvas updates via SSE.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import useGraphStore from '../state/useGraphStore';
import { useCommandBus } from '../state/useCommandBus';
import { apiFetch } from '../../../../services/api';

const SUGGESTIONS = [
    { label: '30s 9:16 product teaser', icon: '🎬' },
    { label: '60-second brand film workflow', icon: '🎞️' },
    { label: 'Explain this canvas', icon: '💬' },
    { label: 'Add voiceover and lipsync', icon: '🎙️' },
];

export default function CopilotDock({ sessionId }) {
    const store = useGraphStore();
    const { emitBatch } = useCommandBus();
    const [input, setInput]         = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const bottomRef  = useRef(null);
    const inputRef   = useRef(null);
    const messagesEl = useRef(null);

    // Auto-scroll on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [store.messages]);

    const sendMessage = useCallback(async (text) => {
        const msg = (text ?? input).trim();
        if (!msg || isStreaming) return;
        setInput('');

        store.addMessage({ role: 'user', content: msg });
        store.setCopilotBusy(true);
        setIsStreaming(true);

        // Typing placeholder
        store.addMessage({ role: 'agent', content: '', typing: true });

        try {
            const graph = useGraphStore.getState().graph;
            const conversationHistory = useGraphStore.getState().messages
                .filter(m => !m.typing)
                .slice(-12)
                .map(m => ({ role: m.role, content: m.content }));

            const data = await apiFetch('/video-studio/agent/v2/copilot', {
                method: 'POST',
                body: JSON.stringify({
                    sessionId,
                    message: msg,
                    graph: graph ? { nodes: graph.nodes, edges: graph.edges, version: graph.version } : null,
                    conversationHistory,
                }),
            });

            // Replace typing placeholder with real response
            useGraphStore.setState(s => ({
                messages: [
                    ...s.messages.filter(m => !m.typing),
                    { role: 'agent', content: data.agentResponse || 'Got it!', ts: Date.now(), intent: data.intent },
                ],
            }));

            // Apply canvas commands if any
            if (data.commands?.length) {
                const result = await emitBatch(data.commands, 'agent');
                if (!result.ok) {
                    store.addMessage({
                        role: 'agent',
                        content: `⚠ One of my actions was rejected: ${result.error}. I'll adjust.`,
                    });
                }
            }
        } catch (err) {
            useGraphStore.setState(s => ({
                messages: [
                    ...s.messages.filter(m => !m.typing),
                    { role: 'agent', content: `Sorry, I ran into an error: ${err.message}`, ts: Date.now() },
                ],
            }));
        } finally {
            store.setCopilotBusy(false);
            setIsStreaming(false);
        }
    }, [input, isStreaming, sessionId, emitBatch]); // eslint-disable-line

    function handleKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    }

    const messages = store.messages;
    const isOpen   = store.isDockOpen;

    return (
        <div className={`copilot-dock ${isOpen ? 'copilot-dock--open' : 'copilot-dock--collapsed'}`}>
            {/* ── Header ── */}
            <div className="copilot-dock__header" onClick={store.toggleDock}>
                <div className="copilot-dock__title">
                    <span className="copilot-orb">✦</span>
                    {isOpen && (
                        <>
                            <span>AI Copilot</span>
                            {store.copilotBusy && (
                                <span className="copilot-thinking">thinking…</span>
                            )}
                        </>
                    )}
                </div>
                {isOpen && (
                    <button className="copilot-collapse-btn" onClick={e => { e.stopPropagation(); store.toggleDock(); }}>
                        ›
                    </button>
                )}
            </div>

            {isOpen && (
                <>
                    {/* ── Empty / welcome state ── */}
                    {messages.length === 0 && (
                        <div className="copilot-empty">
                            <div className="copilot-empty__orb">✦</div>
                            <div className="copilot-empty__title">Canvas Copilot</div>
                            <div className="copilot-empty__sub">
                                Describe what you want to create and I'll build the workflow on the canvas for you.
                            </div>
                            <div className="copilot-suggestions">
                                {SUGGESTIONS.map(s => (
                                    <button
                                        key={s.label}
                                        className="copilot-suggestion"
                                        onClick={() => sendMessage(s.label)}
                                    >
                                        <span style={{ marginRight: 6 }}>{s.icon}</span>
                                        {s.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Message thread ── */}
                    {messages.length > 0 && (
                        <div ref={messagesEl} className="copilot-messages">
                            {messages.map((msg, i) => (
                                <div key={i} className={`copilot-msg copilot-msg--${msg.role}`}>
                                    {msg.role === 'agent' && (
                                        <div className="copilot-msg__avatar">✦</div>
                                    )}
                                    <div className="copilot-msg__bubble">
                                        {msg.typing
                                            ? <span className="copilot-typing"><span/><span/><span/></span>
                                            : msg.content
                                        }
                                    </div>
                                </div>
                            ))}
                            <div ref={bottomRef} />
                        </div>
                    )}

                    {/* ── Input ── */}
                    <div className="copilot-input-row">
                        <textarea
                            ref={inputRef}
                            className="copilot-input"
                            placeholder={isStreaming ? 'Thinking…' : 'Describe what you want…'}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            rows={2}
                            disabled={isStreaming}
                        />
                        <button
                            className="copilot-send-btn"
                            onClick={() => sendMessage()}
                            disabled={!input.trim() || isStreaming}
                            title="Send (Enter)"
                        >
                            {isStreaming
                                ? <span className="copilot-typing" style={{ gap: 3 }}><span/><span/><span/></span>
                                : '↑'
                            }
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
