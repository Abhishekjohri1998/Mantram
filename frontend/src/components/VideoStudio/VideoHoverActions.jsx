import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import './VideoHoverActions.css';

export default function VideoHoverActions({ videoUrl, onPreview, project, onReuse, onExtractFirstFrame, onExtractLastFrame }) {
    const navigate = useNavigate();
    const [showMenu, setShowMenu] = useState(false);
    const [toast, setToast] = useState('');
    const [isLiked, setIsLiked] = useState(false);
    const menuRef = useRef(null);

    // Sync like state
    useEffect(() => {
        if (!project?._id) return;
        const checkLike = () => {
            try {
                const liked = JSON.parse(localStorage.getItem('mantram_liked_videos') || '[]');
                setIsLiked(liked.includes(project._id));
            } catch (e) { }
        };
        checkLike();
        window.addEventListener('likedVideosChanged', checkLike);
        return () => window.removeEventListener('likedVideosChanged', checkLike);
    }, [project?._id]);

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

    const toggleLike = () => {
        if (!project?._id) {
            showFeedback("Cannot like video without project ID");
            return;
        }
        try {
            let liked = JSON.parse(localStorage.getItem('mantram_liked_videos') || '[]');
            if (liked.includes(project._id)) {
                liked = liked.filter(id => id !== project._id);
            } else {
                liked.push(project._id);
                showFeedback("Added to Liked Videos");
            }
            localStorage.setItem('mantram_liked_videos', JSON.stringify(liked));
            window.dispatchEvent(new Event('likedVideosChanged'));
        } catch (e) { console.error(e); }
    };

    const extractFrame = (position) => {
        showFeedback(`Extracting ${position} frame...`);
        const video = document.createElement('video');
        video.crossOrigin = 'anonymous'; // Important for CORS
        video.src = videoUrl;
        
        video.addEventListener('loadeddata', () => {
            if (position === 'last') {
                video.currentTime = video.duration - 0.1;
            } else {
                video.currentTime = 0;
            }
        });

        video.addEventListener('seeked', () => {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            try {
                const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
                if (position === 'first' && onExtractFirstFrame) onExtractFirstFrame(dataUrl);
                if (position === 'last' && onExtractLastFrame) onExtractLastFrame(dataUrl);
                showFeedback(`Set as ${position} frame!`);
            } catch (e) {
                console.error('Canvas extraction failed, falling back to thumbnail:', e);
                const fallbackUrl = project?.generation?.thumbnailUrl || project?.thumbUrl || videoUrl;
                if (position === 'first' && onExtractFirstFrame) onExtractFirstFrame(fallbackUrl);
                if (position === 'last' && onExtractLastFrame) onExtractLastFrame(fallbackUrl);
                showFeedback(`Set ${position} frame (fallback)`);
            }
        });

        video.addEventListener('error', () => {
            showFeedback('Failed to extract frame');
        });
    };

    const triggerDownload = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFeedback("Downloading video...");
        try {
            const resp = await fetch(videoUrl);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = project?.title ? `${project.title.substring(0,30).replace(/[^a-zA-Z0-9]/g, '_')}.mp4` : 'video.mp4';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showFeedback("Downloaded successfully!");
        } catch (err) {
            console.error('Download failed, opening in new tab:', err);
            window.open(videoUrl, '_blank');
        }
    };

    const handleAction = (e, actionName) => {
        e.stopPropagation();
        if (actionName === 'preview' && onPreview) {
            onPreview(videoUrl);
        } else if (actionName === 'like') {
            toggleLike();
        } else if (actionName === 'reuse' && onReuse && project) {
            onReuse(project);
            showFeedback('Prompt and settings retrieved!');
        } else if (actionName === 'publish') {
            const defaultText = project?.prompt || project?.input?.prompt || project?.brief || '';
            navigate('/publish-schedule', { state: { videoUrl, caption: defaultText, autoPublish: true } });
        } else if (actionName === 'virality') {
            navigate('/virality-predictor', { state: { videoUrl } });
        } else if (actionName === 'extract_first_frame') {
            extractFrame('first');
        } else if (actionName === 'extract_last_frame') {
            extractFrame('last');
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
                <span className="material-symbols-outlined" style={{ color: isLiked ? '#ef4444' : 'inherit', fontVariationSettings: isLiked ? "'FILL' 1" : "'FILL' 0" }}>favorite</span>
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
            <button title="Download" onClick={triggerDownload}>
                <span className="material-symbols-outlined">download</span>
            </button>
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
