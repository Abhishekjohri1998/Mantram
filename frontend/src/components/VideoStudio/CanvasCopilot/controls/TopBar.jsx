/**
 * TopBar.jsx — Canvas top bar: project name, undo/redo, run status, credits, run/cancel.
 */

import useGraphStore from '../state/useGraphStore';
import { useCommandBus } from '../state/useCommandBus';
import { apiFetch } from '../../../../services/api';

const STATUS_ICONS = {
    running:   '◉',
    completed: '✓',
    failed:    '✕',
    cancelled: '—',
};

export default function TopBar({ projectName, userCredits }) {
    const store = useGraphStore();
    const { undo, redo } = useCommandBus();
    const { sessionId, runStatus, activeRunId, creditGate } = store;

    const isRunning = runStatus === 'running';

    async function handleRun() {
        if (!sessionId) return;
        try {
            const res = await apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run`, {
                method: 'POST',
                body: JSON.stringify({ confirmed: false }),
            });
            if (res.gated)        store.setCreditGate(res);
            else if (res.success) store.setActiveRun(res.runId, 'running');
        } catch (err) {
            store.setError(err.message);
        }
    }

    async function handleConfirmRun() {
        if (!sessionId) return;
        store.setCreditGate(null);
        try {
            const res = await apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run`, {
                method: 'POST',
                body: JSON.stringify({ confirmed: true }),
            });
            if (res.success) store.setActiveRun(res.runId, 'running');
        } catch (err) {
            store.setError(err.message);
        }
    }

    async function handleCancelRun() {
        if (!sessionId || !activeRunId) return;
        try {
            await apiFetch(`/video-studio/agent/v2/graph/${sessionId}/run/${activeRunId}`, {
                method: 'DELETE',
            });
        } catch (err) {
            store.setError(err.message);
        }
    }

    return (
        <>
            <div className="canvas-topbar">
                {/* ── Left ── */}
                <div className="canvas-topbar__left">
                    {/* Canvas icon + project name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: '#FF4D00',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, color: '#fff', flexShrink: 0,
                        boxShadow: '0 2px 8px rgba(255,77,0,0.4)',
                        fontWeight: 800,
                    }}>✦</span>
                        <span className="canvas-topbar__project">{projectName || 'Untitled Workflow'}</span>
                    </div>

                    <div className="topbar-divider" />

                    {/* Undo / Redo */}
                    <button
                        className="topbar-btn topbar-btn--icon"
                        onClick={undo}
                        title="Undo (⌘Z)"
                        style={{ fontSize: 15 }}
                    >
                        ↩
                    </button>
                    <button
                        className="topbar-btn topbar-btn--icon"
                        onClick={redo}
                        title="Redo (⌘⇧Z)"
                        style={{ fontSize: 15 }}
                    >
                        ↪
                    </button>
                </div>

                {/* ── Center — run status pill ── */}
                <div className="canvas-topbar__center">
                    {runStatus && (
                        <div className={`topbar-run-status topbar-run-status--${runStatus}`}>
                            {runStatus === 'running' && <span className="topbar-run-dot" />}
                            {STATUS_ICONS[runStatus]}&nbsp;
                            {{
                                running:   'Running workflow…',
                                completed: 'Run complete',
                                cancelled: 'Cancelled',
                                failed:    'Run failed',
                            }[runStatus]}
                        </div>
                    )}
                </div>

                {/* ── Right ── */}
                <div className="canvas-topbar__right">
                    {userCredits !== undefined && (
                        <div className="topbar-credits">
                            <span className="topbar-credits__icon">⚡</span>
                            <span>{(userCredits ?? 0).toLocaleString()}</span>
                            <span style={{ opacity: 0.5, fontSize: 10 }}>cr</span>
                        </div>
                    )}

                    <button
                        className={`topbar-btn topbar-btn--run${isRunning ? ' topbar-btn--cancel' : ''}`}
                        onClick={isRunning ? handleCancelRun : handleRun}
                        disabled={!sessionId}
                        title={isRunning ? 'Cancel run' : 'Run workflow (⌘↵)'}
                    >
                        {isRunning ? (
                            <><span style={{ fontSize: 10 }}>■</span> Cancel</>
                        ) : (
                            <><span style={{ fontSize: 11 }}>▶</span> Run</>
                        )}
                    </button>
                </div>
            </div>

            {/* ── Credit Gate Modal ── */}
            {creditGate && (
                <div className="credit-gate-overlay" onClick={() => store.setCreditGate(null)}>
                    <div className="credit-gate-modal" onClick={e => e.stopPropagation()}>
                        <div className="credit-gate-modal__icon">⚡</div>
                        <div className="credit-gate-modal__title">Confirm Workflow Run</div>
                        <div className="credit-gate-modal__sub">
                            The following nodes will consume credits. Review and confirm to proceed.
                        </div>

                        <div className="credit-gate-modal__list">
                            {creditGate.billedNodes?.map(n => (
                                <div key={n.nodeId} className="credit-gate-modal__item">
                                    <span style={{ textTransform: 'capitalize' }}>
                                        {n.type.replace(/_/g, ' ')}
                                    </span>
                                    <span className="credit-gate-modal__cost">~{n.credits} cr</span>
                                </div>
                            ))}
                        </div>

                        <div className="credit-gate-modal__total">
                            <span style={{ opacity: 0.65, fontSize: 13 }}>Total cost</span>
                            <strong>~{creditGate.estimate} credits</strong>
                        </div>

                        {creditGate.warnings?.length > 0 && (
                            <div className="credit-gate-modal__warnings">
                                {creditGate.warnings.map((w, i) => (
                                    <div key={i} className="credit-gate-modal__warning">
                                        <span>⚠</span>
                                        <span>{w.message}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="credit-gate-modal__actions">
                            <button
                                className="credit-gate-btn credit-gate-btn--cancel"
                                onClick={() => store.setCreditGate(null)}
                            >
                                Cancel
                            </button>
                            <button
                                className="credit-gate-btn credit-gate-btn--confirm"
                                onClick={handleConfirmRun}
                            >
                                ▶ Run ({creditGate.estimate} cr)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
