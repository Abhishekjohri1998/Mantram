import { useNavigate } from 'react-router-dom';

/**
 * VideoUpgradeModal — shown when a user on a plan below Professional
 * tries to create/generate a video.
 */
export default function VideoUpgradeModal({ onClose }) {
    const navigate = useNavigate();

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'vum-fade-in 0.2s ease',
            }}
        >
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 24, padding: '40px 36px', maxWidth: 440, width: '90%',
                    textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
                    animation: 'vum-scale-in 0.25s cubic-bezier(0.16,1,0.3,1)',
                }}
            >
                {/* Icon */}
                <div style={{
                    width: 72, height: 72, borderRadius: 20,
                    background: 'linear-gradient(135deg, rgba(255,77,0,0.15) 0%, rgba(255,77,0,0.05) 100%)',
                    border: '1px solid rgba(255,77,0,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, color: '#FF4D00' }}>lock</span>
                </div>

                {/* Title */}
                <h3 style={{
                    fontSize: 20, fontWeight: 800, color: '#fff',
                    margin: '0 0 8px', letterSpacing: -0.5,
                }}>
                    Upgrade to Create Videos
                </h3>

                {/* Description */}
                <p style={{
                    fontSize: 14, color: 'rgba(255,255,255,0.5)',
                    margin: '0 0 28px', lineHeight: 1.6,
                }}>
                    Video generation is available on the <strong style={{ color: '#FF4D00' }}>Professional</strong> plan and above.
                    Upgrade now to unlock AI-powered video creation across all models.
                </p>

                {/* CTA Buttons */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button
                        onClick={() => { onClose(); navigate('/credits'); }}
                        style={{
                            background: '#FF4D00', color: '#fff', border: 'none',
                            borderRadius: 14, padding: '14px 24px',
                            fontSize: 14, fontWeight: 800, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 8px 24px rgba(255,77,0,0.4)'; }}
                        onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = 'none'; }}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
                        View Upgrade Plans
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', color: 'rgba(255,255,255,0.5)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 14, padding: '12px 24px',
                            fontSize: 13, fontWeight: 600, cursor: 'pointer',
                            transition: 'all 0.2s',
                        }}
                        onMouseEnter={e => { e.target.style.color = '#fff'; e.target.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                        onMouseLeave={e => { e.target.style.color = 'rgba(255,255,255,0.5)'; e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    >
                        Maybe Later
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes vum-fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes vum-scale-in { from { opacity: 0; transform: scale(0.92); } to { opacity: 1; transform: scale(1); } }
            `}</style>
        </div>
    );
}
