import React from 'react';
import './VideoHoverActions.css';

export default function VideoHoverActions({ videoUrl, onPreview }) {
    if (!videoUrl) return null;

    const handleAction = (e, actionName) => {
        e.stopPropagation();
        if (actionName === 'preview' && onPreview) {
            onPreview(videoUrl);
        } else {
            console.log(`Action ${actionName} triggered for ${videoUrl}`);
            // Future implementation hooks
        }
    };

    return (
        <div className="vha-wrapper" onClick={e => e.stopPropagation()}>
            <button title="Like" onClick={(e) => handleAction(e, 'like')}>
                <span className="material-symbols-outlined">thumb_up</span>
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
        </div>
    );
}
