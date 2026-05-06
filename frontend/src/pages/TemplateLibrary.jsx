import { useState, useEffect, useRef } from 'react';
import { templates as templatesAPI } from '../services/api';
import DashboardLayout from '../components/DashboardLayout';
import TemplateGenerationModal from '../components/Templates/TemplateGenerationModal';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// ── Helpers ──
const MOCK_USERS = ['Roman','Alla nov','Sachin','Minuit','L4c','Kira','Nova','Zephyr','Pixel','Onyx'];
const MOCK_COLORS = ['#E84118','#00D4AA','#7c3aed','#F59E0B','#3B82F6','#EC4899','#14B8A6','#6366F1','#F97316','#06B6D4'];
function pickUser(i) { return MOCK_USERS[i % MOCK_USERS.length]; }
function pickColor(i) { return MOCK_COLORS[i % MOCK_COLORS.length]; }
function fmtLikes(n) { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }
function randDuration(seed) { const m = ((seed * 7 + 3) % 3); const s = ((seed * 13 + 5) % 50); return `${m}:${String(s).padStart(2,'0')}`; }

const HERO_BANNERS = [
    {
        title: 'Mantram Elite Creators Program',
        cta: 'Applications Now Open',
        gradient: 'linear-gradient(135deg, #0a1a0f 0%, #0d2818 40%, #0f1a12 100%)',
        accent: '#00D4AA',
        particles: true,
    },
    {
        title: 'Mantram Native 4K,\nOne-Click Output',
        subtitle: 'hero • creator portrait',
        cta: 'Limited-Time Up to 20%\nOff for Subscribers',
        gradient: 'linear-gradient(135deg, #2a1810 0%, #3d2215 40%, #1a0f08 100%)',
        accent: '#E84118',
        badge: '4K',
    },
];

const QUICK_ACTIONS = [
    { label: 'Image Generation', icon: 'image', to: '/creative-studio?mode=create' },
    { label: 'Video Generation', icon: 'movie', to: '/video-studio' },
    { label: 'Motion Control', icon: 'animation', to: '/video-studio' },
    { label: 'Mantram Canvas', icon: 'draw', to: '/ai-canvas', badge: 'Agent' },
    { label: 'Avatar 2.0', icon: 'face_retouching_natural', to: '/avatar-generator' },
];

const SUB_TABS = ['For You','Shorts','3.0 Model','Motion Control','Creatives'];

// ── Styles (injected) ──
const EXPLORE_CSS = `
.explore-root { max-width: 1600px; margin: 0 auto; padding: 0 20px 80px; width: 100%; }

/* Hero */
.explore-hero { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
@media (max-width: 768px) { .explore-hero { grid-template-columns: 1fr; } }
.hero-card { border-radius: 14px; padding: 28px 32px; min-height: 150px; position: relative; overflow: hidden; display: flex; flex-direction: column; justify-content: flex-end; border: 1px solid rgba(255,255,255,0.06); }
.hero-card h2 { font-family: 'Georgia', serif; font-size: 22px; font-weight: 700; color: #fff; white-space: pre-line; line-height: 1.3; margin-bottom: 14px; font-style: italic; }
.hero-cta { display: inline-flex; padding: 8px 18px; background: #fff; color: #111; font-size: 12px; font-weight: 700; border-radius: 8px; border: none; cursor: pointer; width: fit-content; }
.hero-subtitle { font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; position: absolute; top: 16px; right: 20px; text-transform: lowercase; letter-spacing: 0.05em; }
.hero-badge { position: absolute; top: 14px; right: 16px; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; padding: 3px 8px; font-size: 11px; font-weight: 800; color: #fff; backdrop-filter: blur(4px); }
.hero-cta-sub { font-size: 12px; color: rgba(255,255,255,0.7); white-space: pre-line; line-height: 1.4; margin-top: auto; }
.hero-particles { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.hero-particles span { position: absolute; width: 6px; height: 6px; border-radius: 50%; animation: heroPulse 3s ease-in-out infinite; }
@keyframes heroPulse { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 0.6; transform: scale(1.2); } }

/* Quick Actions */
.qa-strip { display: flex; gap: 10px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
.qa-strip::-webkit-scrollbar { display: none; }
.qa-primary { display: flex; align-items: center; gap: 10px; background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 28px; padding: 8px 12px 8px 16px; flex-shrink: 0; cursor: pointer; }
.qa-primary-label { font-size: 13px; font-weight: 700; color: var(--sys-text); white-space: nowrap; }
.qa-primary-btn { background: var(--sys-primary); color: #fff; border: none; border-radius: 20px; padding: 6px 14px; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.qa-pill { display: flex; align-items: center; gap: 8px; background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 28px; padding: 10px 16px; flex-shrink: 0; cursor: pointer; transition: all 0.2s; font-size: 13px; font-weight: 600; color: var(--sys-text); white-space: nowrap; text-decoration: none; }
.qa-pill:hover { border-color: var(--sys-primary); background: var(--sys-primary-dim); }
.qa-pill .material-symbols-outlined { font-size: 18px; }
.qa-badge { font-size: 9px; font-weight: 800; background: var(--sys-primary); color: #fff; padding: 2px 6px; border-radius: 10px; text-transform: uppercase; margin-left: -4px; }

/* Tabs */
.explore-tabs { display: flex; align-items: center; gap: 0; margin-bottom: 14px; border-bottom: 1px solid var(--sys-border); }
.explore-tab { padding: 10px 20px; font-size: 13px; font-weight: 600; color: var(--sys-text-muted); background: none; border: none; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
.explore-tab.active { color: var(--sys-text); border-bottom-color: var(--sys-text); }
.explore-tab:hover { color: var(--sys-text); }
.explore-search { margin-left: auto; display: flex; align-items: center; gap: 10px; padding-bottom: 6px; }
.explore-search input { background: var(--sys-surface); border: 1px solid var(--sys-border); border-radius: 8px; padding: 7px 12px 7px 34px; font-size: 13px; color: var(--sys-text); outline: none; width: 200px; transition: border-color 0.2s; }
.explore-search input:focus { border-color: var(--sys-primary); }
.explore-search .search-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); font-size: 16px; color: var(--sys-text-muted); pointer-events: none; }

/* Sub-tabs */
.sub-tabs { display: flex; gap: 6px; margin-bottom: 18px; overflow-x: auto; scrollbar-width: none; }
.sub-tabs::-webkit-scrollbar { display: none; }
.sub-tab { padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--sys-text-muted); background: none; border: none; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.sub-tab.active { color: var(--sys-text); background: var(--sys-surface); }
.sub-tab:hover { color: var(--sys-text); }

/* Grid */
.explore-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 14px; }
@media (max-width: 1400px) { .explore-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 1024px) { .explore-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 768px) { .explore-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .explore-grid { grid-template-columns: 1fr; } }

/* Card */
.explore-card { display: flex; flex-direction: column; cursor: pointer; border: none; background: none; padding: 0; text-align: left; position: relative; }
.explore-card-thumb { width: 100%; aspect-ratio: 3/4; border-radius: 12px; overflow: hidden; position: relative; background: var(--sys-surface); border: 1px solid var(--sys-border); }
.explore-card-thumb img, .explore-card-thumb video { width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.4s ease, filter 0.3s ease; }
.explore-card:hover .explore-card-thumb img, .explore-card:hover .explore-card-thumb video { transform: scale(1.05); filter: brightness(1.1); }
.card-badge-featured { position: absolute; top: 10px; left: 10px; background: rgba(0,212,170,0.9); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 10px; border-radius: 14px; z-index: 5; display: flex; align-items: center; gap: 4px; }
.card-badge-featured::before { content: '★'; font-size: 9px; }
.card-badge-duration { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.65); color: #fff; font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 6px; z-index: 5; display: flex; align-items: center; gap: 4px; backdrop-filter: blur(4px); }
.card-badge-duration::before { content: '▶'; font-size: 8px; }
.card-title-overlay { position: absolute; bottom: 0; left: 0; right: 0; padding: 16px 14px; background: linear-gradient(transparent, rgba(0,0,0,0.7)); z-index: 4; }
.card-title-text { font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 0.12em; font-family: monospace; }
.card-footer { display: flex; align-items: center; gap: 8px; padding: 8px 2px 4px; }
.card-avatar { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.card-username { font-size: 12px; font-weight: 600; color: var(--sys-text); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card-likes { font-size: 11px; color: var(--sys-text-muted); display: flex; align-items: center; gap: 3px; flex-shrink: 0; }

/* Shimmer */
.ex-shimmer { background: linear-gradient(90deg, var(--sys-surface) 25%, var(--sys-bg) 50%, var(--sys-surface) 75%); background-size: 200% 100%; animation: exShimmer 1.5s infinite; }
@keyframes exShimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

/* Overlay mode header */
.explore-overlay-header { display: flex; align-items: center; justify-content: space-between; padding: 16px; border-bottom: 1px solid var(--sys-border); background: var(--sys-surface); }
`;

export default function TemplateLibrary({ overlayMode = false, onCloseOverlay, studioFilter = '' }) {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [studioOrigin, setStudioOrigin] = useState(studioFilter);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [mobileTappedTemplateId, setMobileTappedTemplateId] = useState(null);
    const [activeTab, setActiveTab] = useState('Recommended');
    const [activeSubTab, setActiveSubTab] = useState('For You');
    const [previewModal, setPreviewModal] = useState({ open: false, src: '', type: 'image', name: '' });

    useEffect(() => { loadTemplates(); }, [studioOrigin]);

    const loadTemplates = async () => {
        setLoading(true);
        try {
            const params = { limit: 200 };
            if (studioOrigin) params.studioOrigin = studioOrigin;
            const res = await templatesAPI.list(params);
            setTemplates(res.templates || []);
        } catch (error) {
            console.error('Failed to load templates:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredTemplates = templates.filter(t => {
        const matchesSearch = !search ||
            t.name.toLowerCase().includes(search.toLowerCase()) ||
            t.tags?.some(tag => tag.toLowerCase().includes(search.toLowerCase())) ||
            t.categoryId?.name?.toLowerCase().includes(search.toLowerCase());
        // Sub-tab filtering
        if (activeSubTab === 'Shorts') return matchesSearch && t.previewType === 'video';
        if (activeSubTab === 'Creatives') return matchesSearch && (t.studioOrigin === 'creative' || t.studioOrigin === 'image');
        if (activeSubTab === 'Motion Control') return matchesSearch && t.previewType === 'video';
        return matchesSearch;
    });

    // ── Template click handler (preserved from original) ──
    const handleTemplateClick = (template) => {
        if (window.innerWidth < 768 && mobileTappedTemplateId !== template._id) {
            setMobileTappedTemplateId(template._id);
            return;
        }
        const categoryName = (template.categoryId?.name || '').toLowerCase().trim();
        const origin = (template.studioOrigin || '').toLowerCase().trim();
        let targetRoute = null, targetMode = null;

        if (categoryName === 'video q-ads' || categoryName === 'video qads' || origin === 'video') {
            targetRoute = '/video-studio'; targetMode = 'q-ads';
        } else if (categoryName === 'ai create' || categoryName === 'ai creative') {
            targetRoute = '/creative-studio'; targetMode = 'create';
        } else if (categoryName === 'campaign shot' || categoryName === 'campaignshot') {
            targetRoute = '/creative-studio'; targetMode = 'campaignshot';
        } else if (categoryName === 'carousel' || categoryName === 'carousels') {
            targetRoute = '/creative-studio'; targetMode = 'carousel';
        } else if (categoryName === 'campaigns' || categoryName === 'campaign') {
            targetRoute = '/creative-studio'; targetMode = 'campaigns';
        } else if (categoryName === 'logo' || categoryName === 'logo gen' || categoryName === 'campaign logo') {
            targetRoute = '/creative-studio'; targetMode = 'campaignlogo';
        } else if (categoryName === 'photoshoot' || categoryName === 'ai photoshoot') {
            targetRoute = '/creative-studio'; targetMode = 'photoshoot';
        } else if (categoryName === 'try-on' || categoryName === 'tryon' || categoryName === 'virtual try-on') {
            targetRoute = '/creative-studio'; targetMode = 'tryon';
        } else if (categoryName === 'mockups' || categoryName === 'mockup') {
            targetRoute = '/creative-studio'; targetMode = 'mockups';
        } else if (template.studioSection) {
            const section = template.studioSection.toLowerCase().trim();
            targetRoute = '/creative-studio';
            if (section === 'carousel') targetMode = 'carousel';
            else if (section === 'campaign_shot') targetMode = 'campaignshot';
            else if (section === 'campaign') targetMode = 'campaigns';
            else if (section === 'ai_create') targetMode = 'create';
            else if (section === 'avatar') targetMode = 'photoshoot';
            else targetMode = 'create';
        } else if (origin === 'creative' || origin === 'image') {
            targetRoute = '/creative-studio'; targetMode = 'create';
        } else if (origin === 'content') {
            targetRoute = '/content-studio';
        } else {
            targetRoute = '/creative-studio'; targetMode = 'create';
        }

        if (targetRoute) {
            let url = `${targetRoute}?templateId=${template._id}`;
            if (targetMode) url += `&mode=${targetMode}`;
            navigate(url);
            if (overlayMode && onCloseOverlay) onCloseOverlay();
        } else {
            setSelectedTemplate(template);
        }
    };

    // ── Render ──
    const content = (
        <div className={overlayMode ? "fixed inset-0 z-[9999] bg-[var(--sys-background)] flex flex-col overflow-hidden" : "explore-root"}>
            <style dangerouslySetInnerHTML={{ __html: EXPLORE_CSS }} />

            {overlayMode && (
                <div className="explore-overlay-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <button onClick={onCloseOverlay} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                            <span className="material-symbols-outlined" style={{ color: 'var(--sys-text-muted)' }}>close</span>
                        </button>
                        <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--sys-text)' }}>
                            {studioFilter === 'creative' ? 'Image Templates' : studioFilter === 'video' ? 'Video Templates' : 'Explore'}
                        </h2>
                    </div>
                </div>
            )}

            <div className={overlayMode ? 'p-5 overflow-y-auto flex-1' : ''}>
                {/* ═══ Hero Banners ═══ */}
                {!overlayMode && (
                    <div className="explore-hero">
                        {HERO_BANNERS.map((b, i) => (
                            <div key={i} className="hero-card" style={{ background: b.gradient }}>
                                {b.particles && (
                                    <div className="hero-particles">
                                        {[...Array(8)].map((_, j) => (
                                            <span key={j} style={{
                                                background: b.accent,
                                                left: `${20 + j * 10}%`, top: `${60 + (j % 3) * 12}%`,
                                                animationDelay: `${j * 0.4}s`,
                                            }} />
                                        ))}
                                    </div>
                                )}
                                {b.badge && <div className="hero-badge">{b.badge}</div>}
                                {b.subtitle && <div className="hero-subtitle">{b.subtitle}</div>}
                                <h2>{b.title}</h2>
                                {i === 0 ? (
                                    <button className="hero-cta">{b.cta}</button>
                                ) : (
                                    <div className="hero-cta-sub">{b.cta}</div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* ═══ Quick Action Strip ═══ */}
                {!overlayMode && (
                    <div className="qa-strip">
                        <div className="qa-primary">
                            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--sys-primary)' }}>auto_awesome</span>
                            <span className="qa-primary-label">Mantram Does It All</span>
                            <button className="qa-primary-btn" onClick={() => navigate('/creative-studio')}>Experience Now</button>
                        </div>
                        {QUICK_ACTIONS.map(a => (
                            <a key={a.label} className="qa-pill" onClick={() => navigate(a.to)}>
                                <span className="material-symbols-outlined">{a.icon}</span>
                                {a.label}
                                {a.badge && <span className="qa-badge">{a.badge}</span>}
                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--sys-text-muted)' }}>arrow_forward</span>
                            </a>
                        ))}
                    </div>
                )}

                {/* ═══ Top Tabs + Search ═══ */}
                <div className="explore-tabs">
                    {['Recommended'].map(tab => (
                        <button key={tab} className={`explore-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                            {tab}
                        </button>
                    ))}
                    <div className="explore-search" style={{ position: 'relative' }}>
                        <span className="material-symbols-outlined search-icon">search</span>
                        <input
                            type="text" placeholder="Search" value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                </div>

                {/* ═══ Sub-tabs ═══ */}
                <div className="sub-tabs">
                    {SUB_TABS.map(st => (
                        <button key={st} className={`sub-tab ${activeSubTab === st ? 'active' : ''}`} onClick={() => setActiveSubTab(st)}>
                            {st}
                        </button>
                    ))}
                </div>

                {/* ═══ Grid ═══ */}
                {loading ? (
                    <div className="explore-grid">
                        {[...Array(10)].map((_, i) => (
                            <div key={i} style={{ aspectRatio: '3/4', borderRadius: 12 }} className="ex-shimmer" />
                        ))}
                    </div>
                ) : filteredTemplates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--sys-text-muted)' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>search_off</span>
                        <p style={{ fontSize: 15, fontWeight: 600 }}>No templates found</p>
                        <p style={{ fontSize: 13, marginTop: 4 }}>Try adjusting your search or filters.</p>
                    </div>
                ) : (
                    <div className="explore-grid">
                        {filteredTemplates.map((template, idx) => {
                            const isVideo = template.previewType === 'video';
                            const isFeatured = template.isMantramExclusive || idx < 3;
                            const likes = template.usageCount || Math.floor(Math.random() * 900) + 10;
                            const username = pickUser(idx);
                            const avatarColor = pickColor(idx);
                            const titleText = (template.name || '').toUpperCase().replace(/\s+/g, ' • ');

                            return (
                                <button key={template._id} className="explore-card" onClick={() => handleTemplateClick(template)} onMouseLeave={() => setMobileTappedTemplateId(null)}>
                                    <div className="explore-card-thumb">
                                        {isVideo && (template.previewVideoUrl || template.previewUrl) ? (
                                            <video src={template.previewVideoUrl || template.previewUrl} muted autoPlay loop playsInline />
                                        ) : (template.previewUrl || template.previewImageUrl) ? (
                                            <img src={template.previewUrl || template.previewImageUrl} alt={template.name}
                                                onError={e => { e.target.style.display = 'none'; e.target.parentElement.classList.add('ex-shimmer'); }} />
                                        ) : (
                                            <div className="ex-shimmer" style={{ width: '100%', height: '100%' }} />
                                        )}

                                        {isFeatured && <div className="card-badge-featured">Featured</div>}
                                        {isVideo && <div className="card-badge-duration">{randDuration(idx)}</div>}

                                        <div className="card-title-overlay">
                                            <div className="card-title-text">{titleText}</div>
                                        </div>
                                    </div>

                                    <div className="card-footer">
                                        <div className="card-avatar" style={{ background: avatarColor }}>
                                            <span style={{ fontSize: 11, fontWeight: 700, color: '#fff' }}>{username.charAt(0)}</span>
                                        </div>
                                        <span className="card-username">{username}</span>
                                        <span className="card-likes">♥ {fmtLikes(likes)}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Template Generation Modal ── */}
            {selectedTemplate && (
                <TemplateGenerationModal template={selectedTemplate} onClose={() => setSelectedTemplate(null)} />
            )}

            {/* ── Preview Lightbox ── */}
            {previewModal.open && (
                <div onClick={() => setPreviewModal({ open: false, src: '', type: 'image', name: '' })}
                    style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, cursor: 'zoom-out' }}>
                    <button onClick={() => setPreviewModal({ open: false, src: '', type: 'image', name: '' })}
                        style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '50%', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#fff' }}>close</span>
                    </button>
                    <div onClick={e => e.stopPropagation()} style={{ cursor: 'default', maxWidth: '90vw', maxHeight: '85vh' }}>
                        {previewModal.type === 'video' ? (
                            <video src={previewModal.src} controls autoPlay loop style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12 }} />
                        ) : (
                            <img src={previewModal.src} alt={previewModal.name} style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} />
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return overlayMode ? content : (
        <DashboardLayout title="EXPLORE" subtitle="">
            {content}
        </DashboardLayout>
    );
}
