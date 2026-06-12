import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useUI } from '../context/UIContext';

const VideoStudioManager = () => {
    const { addToast } = useUI();

    // Data
    const [projects, setProjects] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, pages: 0 });

    // Filters
    const [statusFilter, setStatusFilter] = useState('completed');
    const [visibilityFilter, setVisibilityFilter] = useState('all'); // all | published | homescreen | draft
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const fetchProjects = async (page = 1) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            params.set('page', page);
            params.set('limit', pagination.limit);
            params.set('status', statusFilter);

            if (visibilityFilter === 'published') params.set('isPublished', 'true');
            else if (visibilityFilter === 'homescreen') params.set('showOnHomeScreen', 'true');
            else if (visibilityFilter === 'draft') params.set('isPublished', 'false');
            else if (visibilityFilter === 'inactive') params.set('isActive', 'false');

            if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

            const res = await api(`/superadmin/video-studio?${params.toString()}`);
            setProjects(res.projects || []);
            setPagination(res.pagination || { page: 1, limit: 50, total: 0, pages: 0 });
        } catch (err) {
            addToast(`Error loading videos: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProjects(1);
    }, [statusFilter, visibilityFilter, debouncedSearch]);

    const toggleField = async (project, field) => {
        try {
            const res = await api(`/superadmin/video-studio/${project._id}`, {
                method: 'PUT',
                body: JSON.stringify({ [field]: !project[field] })
            });
            setProjects(prev => prev.map(p => p._id === project._id ? res.project : p));
            addToast(`Video ${field} updated`);
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    // Get the best available prompt/description for display
    const getProjectDescription = (p) => {
        if (p.advancedConfig?.prompt) return p.advancedConfig.prompt;
        if (p.input?.brief) return p.input.brief;
        return p.title || 'No description';
    };

    // Get the best available thumbnail
    const getProjectThumbnail = (p) => {
        return p.generation?.s3ThumbnailUrl || p.generation?.thumbnailUrl || '';
    };

    // Get the best available video URL
    const getProjectVideo = (p) => {
        return p.generation?.s3VideoUrl || p.generation?.videoUrl || '';
    };

    // Get studio mode display label
    const getStudioLabel = (p) => {
        const mode = p.studioMode || p.mode || 'unknown';
        const labels = {
            'advanced': 'Advanced',
            'storyboard': 'Storyboard',
            'ugc': 'UGC',
            'ugc-pro': 'UGC Pro',
            'q-ads': 'Q-Ads',
            'q-ads-v2': 'Q-Ads V2',
            'agent-scene': 'Agent',
            'image-to-video': 'I2V',
            'extend': 'Extend',
        };
        return labels[mode] || mode;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
    };

    if (loading && projects.length === 0) {
        return <div style={{ padding: 40, color: '#fff' }}>Loading Video Studio Manager...</div>;
    }

    return (
        <div style={{ padding: '32px 40px', color: '#fff', maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Video Studio Manager</h1>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>
                        Manage visibility of video projects — {pagination.total} total
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                {/* Status Filter */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {['completed', 'all'].map(s => (
                        <button
                            key={s}
                            onClick={() => setStatusFilter(s)}
                            style={filterBtnStyle(statusFilter === s)}
                        >
                            {s === 'completed' ? 'Completed' : 'All Status'}
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)' }} />

                {/* Visibility Filter */}
                <div style={{ display: 'flex', gap: 4 }}>
                    {[
                        { id: 'all', label: 'All' },
                        { id: 'published', label: 'Published' },
                        { id: 'homescreen', label: 'Homescreen' },
                        { id: 'draft', label: 'Draft' },
                        { id: 'inactive', label: 'Inactive' },
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setVisibilityFilter(f.id)}
                            style={filterBtnStyle(visibilityFilter === f.id)}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.1)' }} />

                {/* Search */}
                <div style={{ position: 'relative', flex: '0 0 240px' }}>
                    <span className="material-symbols-outlined" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>search</span>
                    <input
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by title..."
                        style={{ ...inputStyle, paddingLeft: 32, width: '100%' }}
                    />
                </div>
            </div>

            {/* Table */}
            <div style={panelStyle}>
                <table style={tableStyle}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Thumbnail</th>
                            <th style={{ ...thStyle, minWidth: 200 }}>Project</th>
                            <th style={thStyle}>Mode</th>
                            <th style={thStyle}>User</th>
                            <th style={thStyle}>Homescreen</th>
                            <th style={thStyle}>Active</th>
                            <th style={thStyle}>Published</th>
                            <th style={thStyle}>Created</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.length === 0 ? (
                            <tr>
                                <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>
                                    No video projects found with current filters
                                </td>
                            </tr>
                        ) : (
                            projects.map(p => (
                                <tr key={p._id} className="vs-mgr-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                    {/* Thumbnail */}
                                    <td style={tdStyle}>
                                        {getProjectThumbnail(p) ? (
                                            <div style={{ width: 64, height: 40, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                                                <img
                                                    src={getProjectThumbnail(p)}
                                                    alt=""
                                                    loading="lazy"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                />
                                            </div>
                                        ) : getProjectVideo(p) ? (
                                            <div style={{ width: 64, height: 40, borderRadius: 6, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                                                <video
                                                    src={`${getProjectVideo(p)}#t=1.0`}
                                                    muted
                                                    preload="metadata"
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                                />
                                            </div>
                                        ) : (
                                            <div style={{ width: 64, height: 40, borderRadius: 6, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.2)' }}>videocam_off</span>
                                            </div>
                                        )}
                                    </td>

                                    {/* Title / Description */}
                                    <td style={tdStyle}>
                                        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {p.title || 'Untitled Video'}
                                        </div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {getProjectDescription(p)?.substring(0, 80)}
                                        </div>
                                    </td>

                                    {/* Studio Mode */}
                                    <td style={tdStyle}>
                                        <span style={modeBadgeStyle}>{getStudioLabel(p)}</span>
                                    </td>

                                    {/* User */}
                                    <td style={tdStyle}>
                                        <div style={{ fontSize: 12, fontWeight: 500 }}>{p.user?.name || 'Unknown'}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{p.user?.email || ''}</div>
                                    </td>

                                    {/* Homescreen Toggle */}
                                    <td style={tdStyle}>
                                        <button onClick={() => toggleField(p, 'showOnHomeScreen')} style={toggleBtnStyle(p.showOnHomeScreen, '#10b981')}>
                                            {p.showOnHomeScreen ? 'Shown' : 'Hidden'}
                                        </button>
                                    </td>

                                    {/* Active Toggle */}
                                    <td style={tdStyle}>
                                        <button onClick={() => toggleField(p, 'isActive')} style={toggleBtnStyle(p.isActive)}>
                                            {p.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                    </td>

                                    {/* Published Toggle */}
                                    <td style={tdStyle}>
                                        <button onClick={() => toggleField(p, 'isPublished')} style={toggleBtnStyle(p.isPublished, '#E84118')}>
                                            {p.isPublished ? 'Published' : 'Draft'}
                                        </button>
                                    </td>

                                    {/* Created */}
                                    <td style={tdStyle}>
                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{formatDate(p.createdAt)}</span>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 20 }}>
                    <button
                        onClick={() => fetchProjects(pagination.page - 1)}
                        disabled={pagination.page <= 1}
                        style={pageBtnStyle(false)}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                    </button>
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                        Page {pagination.page} of {pagination.pages}
                    </span>
                    <button
                        onClick={() => fetchProjects(pagination.page + 1)}
                        disabled={pagination.page >= pagination.pages}
                        style={pageBtnStyle(false)}
                    >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                    </button>
                </div>
            )}

            <style>{`
                .vs-mgr-row:hover { background: rgba(255,255,255,0.02); }
            `}</style>
        </div>
    );
};

// ── Shared Styles ──
const panelStyle = { background: '#12121A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, overflow: 'hidden' };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid rgba(255,255,255,0.08)' };
const tdStyle = { padding: '12px 16px', verticalAlign: 'middle' };
const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 13, outline: 'none' };

const modeBadgeStyle = {
    background: 'rgba(249,115,22,0.1)',
    color: '#f97316',
    border: '1px solid rgba(249,115,22,0.2)',
    padding: '2px 8px',
    borderRadius: 10,
    fontSize: 11,
    fontWeight: 600,
};

const toggleBtnStyle = (isActive, activeColor = '#10b981') => ({
    background: isActive ? `${activeColor}22` : 'rgba(255,255,255,0.05)',
    color: isActive ? activeColor : 'rgba(255,255,255,0.4)',
    border: `1px solid ${isActive ? `${activeColor}44` : 'rgba(255,255,255,0.1)'}`,
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
});

const filterBtnStyle = (active) => ({
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    border: active ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
});

const pageBtnStyle = () => ({
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#fff',
    padding: '6px 10px',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
});

export default VideoStudioManager;
