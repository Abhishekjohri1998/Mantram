import React, { useState, useEffect, useRef } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../utils/api';
import { useUI } from '../context/UIContext';

// --- Sortable Item Component ---
function SortableRow({ id, children, className, style }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const dynamicStyle = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        ...style
    };

    return (
        <tr ref={setNodeRef} style={dynamicStyle} className={className}>
            <td style={{ width: 40, cursor: 'grab' }} {...attributes} {...listeners}>
                <span className="material-symbols-outlined" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 18 }}>drag_indicator</span>
            </td>
            {children}
        </tr>
    );
}

const QAdsManager = () => {
    const { addToast } = useUI();
    const [activeTab, setActiveTab] = useState('categories'); // 'categories' | 'presets'
    
    // Data
    const [categories, setCategories] = useState([]);
    const [presets, setPresets] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modals
    const [catModal, setCatModal] = useState({ open: false, data: null });
    const [presetModal, setPresetModal] = useState({ open: false, data: null });

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const fetchData = async () => {
        setLoading(true);
        try {
            const [catRes, preRes] = await Promise.all([
                api('/superadmin/qads/categories'),
                api('/superadmin/qads/presets')
            ]);
            setCategories(catRes.categories || []);
            setPresets(preRes.presets || []);
        } catch (err) {
            addToast(`Error loading data: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // --- CATEGORIES LOGIC ---
    const handleDragEndCategories = async (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        
        const oldIndex = categories.findIndex(c => c._id === active.id);
        const newIndex = categories.findIndex(c => c._id === over.id);
        
        const newCats = [...categories];
        const [moved] = newCats.splice(oldIndex, 1);
        newCats.splice(newIndex, 0, moved);
        setCategories(newCats);
        
        try {
            await api('/superadmin/qads/categories/reorder', {
                method: 'PUT',
                body: JSON.stringify({ orderedIds: newCats.map(c => c._id) })
            });
        } catch (err) {
            addToast('Error reordering categories', 'error');
            fetchData();
        }
    };

    const toggleCatActive = async (cat) => {
        try {
            const res = await api(`/superadmin/qads/categories/${cat._id}`, {
                method: 'PUT',
                body: JSON.stringify({ isActive: !cat.isActive })
            });
            setCategories(prev => prev.map(c => c._id === cat._id ? res.category : c));
            addToast('Category updated');
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const saveCategory = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const data = {
            name: fd.get('name'),
            color: fd.get('color'),
            isActive: fd.get('isActive') === 'on'
        };
        try {
            if (catModal.data?._id) {
                await api(`/superadmin/qads/categories/${catModal.data._id}`, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await api('/superadmin/qads/categories', { method: 'POST', body: JSON.stringify(data) });
            }
            addToast('Category saved');
            setCatModal({ open: false, data: null });
            fetchData();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    // --- PRESETS LOGIC ---
    const handleDragEndPresets = async (event) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        
        const oldIndex = presets.findIndex(p => p._id === active.id);
        const newIndex = presets.findIndex(p => p._id === over.id);
        
        const newPresets = [...presets];
        const [moved] = newPresets.splice(oldIndex, 1);
        newPresets.splice(newIndex, 0, moved);
        setPresets(newPresets);
        
        // Find category siblings to reorder them in DB
        const catId = moved.categoryId;
        const catPresets = newPresets.filter(p => p.categoryId === catId);
        
        try {
            await api('/superadmin/qads/presets/reorder', {
                method: 'PUT',
                body: JSON.stringify({ orderedIds: catPresets.map(p => p._id) })
            });
        } catch (err) {
            addToast('Error reordering presets', 'error');
            fetchData();
        }
    };

    const togglePresetField = async (preset, field) => {
        try {
            const res = await api(`/superadmin/qads/presets/${preset._id}`, {
                method: 'PUT',
                body: JSON.stringify({ [field]: !preset[field] })
            });
            setPresets(prev => prev.map(p => p._id === preset._id ? res.preset : p));
            addToast('Preset updated');
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    const fileInputRef = useRef(null);
    const [uploadingPresetId, setUploadingPresetId] = useState(null);

    const catFileInputRef = useRef(null);
    const [uploadingCatId, setUploadingCatId] = useState(null);

    const handleUploadPreview = async (e, presetId) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingPresetId(presetId);
        
        const fd = new FormData();
        fd.append('file', file);
        
        try {
            const res = await api(`/superadmin/qads/presets/${presetId}/upload-preview`, {
                method: 'POST',
                body: fd,
                headers: {} // let fetch set multipart
            });
            setPresets(prev => prev.map(p => p._id === presetId ? { ...p, previewMediaUrl: res.previewMediaUrl, previewMediaType: res.previewMediaType } : p));
            addToast('Preview uploaded successfully');
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setUploadingPresetId(null);
            e.target.value = null;
        }
    };

    const triggerUpload = (presetId) => {
        setUploadingPresetId(presetId); // temporary set to find the right row for ref
        setTimeout(() => fileInputRef.current?.click(), 0);
    };

    const handleCatUploadPreview = async (e, catId) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingCatId(catId);
        
        const fd = new FormData();
        fd.append('file', file);
        
        try {
            const res = await api(`/superadmin/qads/categories/${catId}/upload-preview`, {
                method: 'POST',
                body: fd,
                headers: {} // let fetch set multipart
            });
            setCategories(prev => prev.map(c => c._id === catId ? { ...c, previewMediaUrl: res.previewMediaUrl, previewMediaType: res.previewMediaType } : c));
            addToast('Category preview uploaded successfully');
        } catch (err) {
            addToast(err.message, 'error');
        } finally {
            setUploadingCatId(null);
            e.target.value = null;
        }
    };

    const triggerCatUpload = (catId) => {
        setUploadingCatId(catId);
        setTimeout(() => catFileInputRef.current?.click(), 0);
    };

    const [presetErrors, setPresetErrors] = useState({});

    const savePreset = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        
        // Validation
        const rules = {
            cameraSignature: fd.get('cameraSignature')?.trim(),
            pacing: fd.get('pacing')?.trim(),
            register: fd.get('register')?.trim(),
            environmentDefault: fd.get('environmentDefault')?.trim(),
        };
        
        let errors = {};
        if (!rules.cameraSignature) errors.cameraSignature = 'Required';
        if (!rules.pacing) errors.pacing = 'Required';
        if (!rules.register) errors.register = 'Required';
        if (!rules.environmentDefault) errors.environmentDefault = 'Required';
        
        if (Object.keys(errors).length > 0) {
            setPresetErrors(errors);
            return;
        }
        
        const data = {
            categoryId: fd.get('categoryId'),
            name: fd.get('name'),
            tagline: fd.get('tagline'),
            description: fd.get('description'),
            isMantramExclusive: fd.get('isMantramExclusive') === 'on',
            isActive: fd.get('isActive') === 'on',
            promptRules: rules
        };
        
        if (!presetModal.data?._id) {
            data.presetCode = fd.get('presetCode')?.trim();
        }

        try {
            if (presetModal.data?._id) {
                await api(`/superadmin/qads/presets/${presetModal.data._id}`, { method: 'PUT', body: JSON.stringify(data) });
            } else {
                await api('/superadmin/qads/presets', { method: 'POST', body: JSON.stringify(data) });
            }
            addToast('Preset updated — AI cache cleared', 'success');
            setPresetModal({ open: false, data: null });
            fetchData();
        } catch (err) {
            addToast(err.message, 'error');
        }
    };

    if (loading) return <div style={{ padding: 40, color: '#fff' }}>Loading Q-Ads Manager...</div>;

    return (
        <div style={{ padding: '32px 40px', color: '#fff', maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24 }}>
                <div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Q-Ads Manager</h1>
                    <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>Manage categories, presets, and AI prompt rules</div>
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={() => setActiveTab('categories')} style={tabBtnStyle(activeTab === 'categories')}>Categories</button>
                    <button onClick={() => setActiveTab('presets')} style={tabBtnStyle(activeTab === 'presets')}>Presets</button>
                </div>
            </div>

            {/* CATEGORIES TAB */}
            {activeTab === 'categories' && (
                <div style={panelStyle}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                        <button onClick={() => setCatModal({ open: true, data: {} })} style={primaryBtnStyle}>+ New Category</button>
                    </div>
                    <input type="file" ref={catFileInputRef} style={{ display: 'none' }} accept="image/*,video/*" onChange={(e) => handleCatUploadPreview(e, uploadingCatId)} />

                    <table style={tableStyle}>
                        <thead>
                            <tr>
                                <th style={{ width: 40 }}></th>
                                <th style={{ width: 60 }}>Preview</th>
                                <th>Name</th>
                                <th>Status</th>
                                <th style={{ textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndCategories}>
                            <SortableContext items={categories.map(c => c._id)} strategy={verticalListSortingStrategy}>
                                <tbody>
                                    {categories.map(cat => (
                                        <SortableRow key={cat._id} id={cat._id} className="sa-table-row">
                                            <td>
                                                {cat.previewMediaUrl ? (
                                                    cat.previewMediaType === 'video' 
                                                        ? <video src={cat.previewMediaUrl} autoPlay muted loop style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                                                        : <img src={cat.previewMediaUrl} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} alt="" />
                                                ) : (
                                                    <div style={{ width: 48, height: 48, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
                                                )}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: cat.color }} />
                                                    <span style={{ fontWeight: 600 }}>{cat.name}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <button onClick={() => toggleCatActive(cat)} style={toggleBtnStyle(cat.isActive)}>
                                                    {cat.isActive ? 'Active' : 'Inactive'}
                                                </button>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                    <button onClick={() => triggerCatUpload(cat._id)} style={actionBtnStyle}>
                                                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload</span> Preview
                                                    </button>
                                                    <button onClick={() => setCatModal({ open: true, data: cat })} style={actionBtnStyle}>Edit</button>
                                                </div>
                                            </td>
                                        </SortableRow>
                                    ))}
                                </tbody>
                            </SortableContext>
                        </DndContext>
                    </table>
                </div>
            )}

            {/* PRESETS TAB */}
            {activeTab === 'presets' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                        <button onClick={() => setPresetModal({ open: true, data: { promptRules: {} } })} style={primaryBtnStyle}>+ New Preset</button>
                    </div>

                    <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept="image/*,video/*" onChange={(e) => handleUploadPreview(e, uploadingPresetId)} />

                    {categories.map(cat => {
                        const catPresets = presets.filter(p => p.categoryId === cat._id);
                        if (catPresets.length === 0) return null;
                        
                        return (
                            <div key={cat._id} style={{ ...panelStyle, marginBottom: 24 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.color }} />
                                    <h3 style={{ fontSize: 16, fontWeight: 700 }}>{cat.name}</h3>
                                </div>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 40 }}></th>
                                            <th style={{ width: 60 }}>Preview</th>
                                            <th>Preset</th>
                                            <th>Badges</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEndPresets}>
                                        <SortableContext items={catPresets.map(p => p._id)} strategy={verticalListSortingStrategy}>
                                            <tbody>
                                                {catPresets.map(p => (
                                                    <SortableRow key={p._id} id={p._id} className="sa-table-row">
                                                        <td>
                                                            {p.previewMediaUrl ? (
                                                                p.previewMediaType === 'video' 
                                                                    ? <video src={p.previewMediaUrl} autoPlay muted loop style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} />
                                                                    : <img src={p.previewMediaUrl} style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} alt="" />
                                                            ) : (
                                                                <div style={{ width: 48, height: 48, borderRadius: 6, background: 'rgba(255,255,255,0.05)' }} />
                                                            )}
                                                        </td>
                                                        <td>
                                                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
                                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                                                                {p.tagline?.length > 40 ? p.tagline.substring(0, 40) + '...' : p.tagline}
                                                            </div>
                                                        </td>
                                                        <td>
                                                            <button onClick={() => togglePresetField(p, 'isMantramExclusive')} style={toggleBtnStyle(p.isMantramExclusive, '#fbbf24')}>
                                                                {p.isMantramExclusive ? '★ Exclusive' : 'Standard'}
                                                            </button>
                                                        </td>
                                                        <td>
                                                            <button onClick={() => togglePresetField(p, 'isActive')} style={toggleBtnStyle(p.isActive)}>
                                                                {p.isActive ? 'Active' : 'Inactive'}
                                                            </button>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                                <button onClick={() => triggerUpload(p._id)} style={actionBtnStyle}>
                                                                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>upload</span> Preview
                                                                </button>
                                                                <button onClick={() => { setPresetErrors({}); setPresetModal({ open: true, data: p }) }} style={actionBtnStyle}>Edit</button>
                                                            </div>
                                                        </td>
                                                    </SortableRow>
                                                ))}
                                            </tbody>
                                        </SortableContext>
                                    </DndContext>
                                </table>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* CATEGORY MODAL */}
            {catModal.open && (
                <Modal onClose={() => setCatModal({ open: false, data: null })} title={catModal.data?._id ? 'Edit Category' : 'New Category'}>
                    <form onSubmit={saveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <label style={labelStyle}>
                            Name
                            <input name="name" defaultValue={catModal.data?.name} required style={inputStyle} />
                        </label>
                        <label style={labelStyle}>
                            Color
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <ColorInput defaultValue={catModal.data?.color || '#ffffff'} />
                            </div>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                            <input type="checkbox" name="isActive" defaultChecked={catModal.data?.isActive ?? true} />
                            Active
                        </label>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                            <button type="submit" style={primaryBtnStyle}>Save Category</button>
                        </div>
                    </form>
                </Modal>
            )}

            {/* PRESET MODAL */}
            {presetModal.open && (
                <Modal onClose={() => setPresetModal({ open: false, data: null })} title={presetModal.data?._id ? 'Edit Preset' : 'New Preset'} width={600}>
                    <form onSubmit={savePreset} style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '75vh', overflowY: 'auto', paddingRight: 8 }}>
                        
                        <label style={labelStyle}>
                            Category
                            <select name="categoryId" defaultValue={presetModal.data?.categoryId} required style={inputStyle}>
                                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                            </select>
                        </label>

                        {presetModal.data?._id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Preset Code</span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.03)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>lock</span>
                                    <code style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{presetModal.data.presetCode}</code>
                                </div>
                                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Preset code cannot be changed after creation</span>
                            </div>
                        ) : (
                            <label style={labelStyle}>
                                Preset Code (unique, e.g. cinematic_fmcg)
                                <input name="presetCode" required style={inputStyle} />
                            </label>
                        )}

                        <div style={{ display: 'flex', gap: 16 }}>
                            <label style={{ ...labelStyle, flex: 1 }}>
                                Name
                                <input name="name" defaultValue={presetModal.data?.name} required style={inputStyle} />
                            </label>
                            <label style={{ ...labelStyle, flex: 1 }}>
                                Tagline
                                <input name="tagline" defaultValue={presetModal.data?.tagline} required style={inputStyle} />
                            </label>
                        </div>

                        <label style={labelStyle}>
                            Description
                            <textarea name="description" defaultValue={presetModal.data?.description} required rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                        </label>

                        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                <input type="checkbox" name="isMantramExclusive" defaultChecked={presetModal.data?.isMantramExclusive ?? false} />
                                Mantram Exclusive
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                                <input type="checkbox" name="isActive" defaultChecked={presetModal.data?.isActive ?? true} />
                                Active
                            </label>
                        </div>

                        <div style={{ margin: '8px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }} />
                        <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#f97316' }}>Prompt Rules — these control the AI director</h4>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0, marginTop: -8 }}>All 4 fields are required.</p>

                        <label style={labelStyle}>
                            Camera Signature
                            <textarea name="cameraSignature" defaultValue={presetModal.data?.promptRules?.cameraSignature} placeholder="e.g. Dynamic handheld moves tracking close to the action." rows={2} style={{ ...inputStyle, resize: 'vertical', borderColor: presetErrors.cameraSignature ? '#ef4444' : 'rgba(255,255,255,0.1)' }} />
                            {presetErrors.cameraSignature && <span style={{ color: '#ef4444', fontSize: 11 }}>{presetErrors.cameraSignature}</span>}
                        </label>

                        <label style={labelStyle}>
                            Pacing
                            <textarea name="pacing" defaultValue={presetModal.data?.promptRules?.pacing} placeholder="e.g. Rapid cuts on beat, high energy transitions." rows={2} style={{ ...inputStyle, resize: 'vertical', borderColor: presetErrors.pacing ? '#ef4444' : 'rgba(255,255,255,0.1)' }} />
                            {presetErrors.pacing && <span style={{ color: '#ef4444', fontSize: 11 }}>{presetErrors.pacing}</span>}
                        </label>

                        <label style={labelStyle}>
                            Register
                            <textarea name="register" defaultValue={presetModal.data?.promptRules?.register} placeholder="e.g. Cinematic, premium, hyper-realistic." rows={2} style={{ ...inputStyle, resize: 'vertical', borderColor: presetErrors.register ? '#ef4444' : 'rgba(255,255,255,0.1)' }} />
                            {presetErrors.register && <span style={{ color: '#ef4444', fontSize: 11 }}>{presetErrors.register}</span>}
                        </label>

                        <label style={labelStyle}>
                            Environment Default
                            <textarea name="environmentDefault" defaultValue={presetModal.data?.promptRules?.environmentDefault} placeholder="e.g. Well-lit urban street or bright studio." rows={2} style={{ ...inputStyle, resize: 'vertical', borderColor: presetErrors.environmentDefault ? '#ef4444' : 'rgba(255,255,255,0.1)' }} />
                            {presetErrors.environmentDefault && <span style={{ color: '#ef4444', fontSize: 11 }}>{presetErrors.environmentDefault}</span>}
                        </label>

                        {presetModal.data?.previewMediaUrl && (
                            <div style={{ marginTop: 8 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Current Preview Media</span>
                                {presetModal.data.previewMediaType === 'video' ? (
                                    <video src={presetModal.data.previewMediaUrl} autoPlay muted loop style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} />
                                ) : (
                                    <img src={presetModal.data.previewMediaUrl} style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover' }} alt="" />
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                            <button type="submit" style={primaryBtnStyle}>Save Preset</button>
                        </div>
                    </form>
                </Modal>
            )}

            <style>{`
                .sa-table-row:hover { background: rgba(255,255,255,0.02); }
                .sa-table-row td { padding: 14px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); vertical-align: middle; }
                .custom-scroll::-webkit-scrollbar { width: 6px; }
                .custom-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
            `}</style>
        </div>
    );
};

// --- Synced Color Input ---
function ColorInput({ defaultValue }) {
    const [color, setColor] = useState(defaultValue);
    return (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 36, height: 36, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
            <input name="color" value={color} onChange={e => setColor(e.target.value)} required style={{ ...inputStyle, width: 120 }} placeholder="#000000" />
        </div>
    );
}

// --- Shared Styles & Components ---
const panelStyle = { background: '#12121A', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 20 };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
const actionBtnStyle = { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 };
const primaryBtnStyle = { background: '#f97316', color: '#fff', border: 'none', padding: '10px 16px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' };
const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', width: '100%', fontSize: 14, outline: 'none' };
const labelStyle = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 0.5 };

const toggleBtnStyle = (isActive, activeColor = '#10b981') => ({
    background: isActive ? `${activeColor}22` : 'rgba(255,255,255,0.05)',
    color: isActive ? activeColor : 'rgba(255,255,255,0.4)',
    border: `1px solid ${isActive ? `${activeColor}44` : 'rgba(255,255,255,0.1)'}`,
    padding: '4px 10px',
    borderRadius: 12,
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer'
});

const tabBtnStyle = (active) => ({
    background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.5)',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer'
});

function Modal({ onClose, title, children, width = 500 }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: '#12121A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, width: '100%', maxWidth: width, padding: 24 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>{title}</h2>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
}

export default QAdsManager;
