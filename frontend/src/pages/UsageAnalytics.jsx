import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { useUI } from '../context/UIContext';

const UsageAnalytics = () => {
    const { addToast } = useUI();
    
    const [templatesData, setTemplatesData] = useState({ topTemplates: [], mostUsedThisMonth: null, totalUsage: 0 });
    const [presetsData, setPresetsData] = useState({ topPresets: [], mostUsedThisMonth: null, totalUsage: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const [tempRes, preRes] = await Promise.all([
                    api('/superadmin/analytics/templates'),
                    api('/superadmin/analytics/presets')
                ]);
                setTemplatesData(tempRes);
                setPresetsData(preRes);
            } catch (err) {
                addToast(`Failed to load analytics: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        };
        fetchAnalytics();
    }, [addToast]);

    if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading Analytics...</div>;

    // Highest counts for relative bars
    const maxTemplateCount = templatesData.topTemplates.length > 0 ? templatesData.topTemplates[0].usageCount : 1;
    const maxPresetCount = presetsData.topPresets.length > 0 ? presetsData.topPresets[0].usageCount : 1;

    return (
        <div style={{ padding: '32px 40px', color: '#fff', maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Usage Analytics</h1>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 32 }}>Monitor platform adoption and template performance</div>

            {/* Top Level Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
                <div style={statCardStyle}>
                    <div style={statLabelStyle}>Total Template Uses</div>
                    <div style={statValueStyle}>{templatesData.totalUsage.toLocaleString()}</div>
                    {templatesData.mostUsedThisMonth && (
                        <div style={calloutStyle}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Most used template this month</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#E84118' }}>{templatesData.mostUsedThisMonth.name}</span>
                                <span style={{ fontWeight: 800, fontSize: 13 }}>{templatesData.mostUsedThisMonth.count}</span>
                            </div>
                        </div>
                    )}
                </div>

                <div style={statCardStyle}>
                    <div style={statLabelStyle}>Total Preset Uses</div>
                    <div style={statValueStyle}>{presetsData.totalUsage.toLocaleString()}</div>
                    {presetsData.mostUsedThisMonth && (
                        <div style={calloutStyle}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Most used preset this month</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                <span style={{ fontWeight: 600, fontSize: 13, color: '#7C3AED' }}>{presetsData.mostUsedThisMonth.name}</span>
                                <span style={{ fontWeight: 800, fontSize: 13 }}>{presetsData.mostUsedThisMonth.count}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Top 10 Lists */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                {/* Templates List */}
                <div style={panelStyle}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>Top 10 Templates</h3>
                    {templatesData.topTemplates.length === 0 ? (
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No template usage data available.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {templatesData.topTemplates.map((t, idx) => {
                                const percentage = (t.usageCount / maxTemplateCount) * 100;
                                return (
                                    <div key={t._id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, width: 20 }}>{idx + 1}.</span>
                                                <span style={{ fontWeight: 600 }}>{t.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 800 }}>{t.usageCount.toLocaleString()}</span>
                                        </div>
                                        {/* Relative Usage Bar */}
                                        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${percentage}%`, 
                                                height: '100%', 
                                                background: '#E84118', 
                                                borderRadius: 2, 
                                                transition: 'width 0.4s ease' 
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Presets List */}
                <div style={panelStyle}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>Top 10 Presets</h3>
                    {presetsData.topPresets.length === 0 ? (
                        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>No preset usage data available.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {presetsData.topPresets.map((p, idx) => {
                                const percentage = (p.usageCount / maxPresetCount) * 100;
                                return (
                                    <div key={p._id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, width: 20 }}>{idx + 1}.</span>
                                                <span style={{ fontWeight: 600 }}>{p.name}</span>
                                            </div>
                                            <span style={{ fontWeight: 800 }}>{p.usageCount.toLocaleString()}</span>
                                        </div>
                                        {/* Relative Usage Bar */}
                                        <div style={{ width: '100%', background: 'rgba(255,255,255,0.05)', height: 3, borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ 
                                                width: `${percentage}%`, 
                                                height: '100%', 
                                                background: '#7C3AED', 
                                                borderRadius: 2, 
                                                transition: 'width 0.4s ease' 
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Styles ---
const statCardStyle = { 
    background: '#12121A', 
    border: '1px solid rgba(255,255,255,0.08)', 
    borderRadius: 16, 
    padding: 24,
    display: 'flex',
    flexDirection: 'column'
};

const statLabelStyle = { 
    fontSize: 12, 
    fontWeight: 800, 
    color: 'rgba(255,255,255,0.5)', 
    textTransform: 'uppercase', 
    letterSpacing: 0.5,
    marginBottom: 8 
};

const statValueStyle = { 
    fontSize: 48, 
    fontWeight: 900, 
    letterSpacing: -1,
    lineHeight: 1,
    marginBottom: 20 
};

const calloutStyle = { 
    marginTop: 'auto', 
    background: 'rgba(255,255,255,0.03)', 
    border: '1px solid rgba(255,255,255,0.05)', 
    borderRadius: 8, 
    padding: '12px 16px'
};

const panelStyle = { 
    background: '#12121A', 
    border: '1px solid rgba(255,255,255,0.08)', 
    borderRadius: 16, 
    padding: 24 
};

export default UsageAnalytics;
