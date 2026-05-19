import React, { useState, useRef, useEffect } from 'react';
import './VideoHoverActions.css';

export default function VideoHoverActions({ videoUrl, onPreview }) {
    const [showMenu, setShowMenu] = useState(false);
    const [toast, setToast] = useState('');
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setShowMenu(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (!videoUrl) return null;

    const showFeedback = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 2500);
    };

    const handleAction = (e, actionName) => {
        e.stopPropagation();
        if (actionName === 'preview' && onPreview) {
            onPreview(videoUrl);
        } else {
            console.log(`Action ${actionName} triggered for ${videoUrl}`);
            const actionDisplay = actionName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            showFeedback(`${actionDisplay} triggered successfully`);
        }
    };

    return (
        <>
        {toast && (
            <div style={{ position: 'absolute', bottom: '40px', right: '8px', zIndex: 100, background: 'rgba(16,185,129,0.9)', color: '#fff', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', backdropFilter: 'blur(4px)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                {toast}
            </div>
        )}
        <div className="vha-wrapper" onClick={e => e.stopPropagation()}>
            <button title="Like" onClick={(e) => handleAction(e, 'like')}>
                <span className="material-symbols-outlined">favorite</span>
            </button>
            <button title="Preview" onClick={(e) => handleAction(e, 'preview')}>
                <span className="material-symbols-outlined">visibility</span>
            </button>
            <button title="Reuse" onClick={(e) => handleAction(e, 'reuse')}>
                <span className="material-symbols-outlined">recycling</span>
            </button>
            <button title="Virality Check" onClick={(e) => handleAction(e, 'virality')}>
                <span className="material-symbols-outlined">trending_up</span>
            </button>
            <a title="Download" href={videoUrl} download="video.mp4" onClick={e => e.stopPropagation()}>
                <span className="material-symbols-outlined">download</span>
            </a>
            <div style={{ position: 'relative' }} ref={menuRef}>
                <button title="More Options" onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}>
                    <span className="material-symbols-outlined">more_vert</span>
                </button>
                {showMenu && (
                    <div className="vha-more-menu" onClick={e => e.stopPropagation()}>
                        <button onClick={(e) => { handleAction(e, 'extract_first_frame'); setShowMenu(false); }}>
                            <span className="material-symbols-outlined">first_page</span> Extract First Frame
                        </button>
                        <button onClick={(e) => { handleAction(e, 'extract_last_frame'); setShowMenu(false); }}>
                            <span className="material-symbols-outlined">last_page</span> Extract Last Frame
                        </button>
                        <button onClick={(e) => { handleAction(e, 'publish'); setShowMenu(false); }}>
                            <span className="material-symbols-outlined">share</span> Publish
                        </button>
                        <button onClick={(e) => { handleAction(e, 'delete'); setShowMenu(false); }} style={{ color: '#ef4444' }}>
                            <span className="material-symbols-outlined">delete</span> Delete
                        </button>
                    </div>
                )}
            </div>
        </div>
        </>
    );
}
