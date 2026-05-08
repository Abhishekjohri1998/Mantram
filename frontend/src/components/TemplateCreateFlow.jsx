/**
 * TemplateCreateFlow — 2-step modal for creating a new AI template.
 *
 * Step 1: Upload a reference marketing image
 *   → Image is uploaded to S3 immediately on select
 *   → User enters a name for the template
 *
 * Step 2: AI analyzes the image → extracts Design DNA
 *   → Shows animated DNA extraction progress
 *   → On success, template is saved and onCreated() is called
 *
 * Key principle: users never write prompts. The AI writes the DNA.
 */

import React, { useState, useRef, useCallback } from 'react';
import { templates as templatesAPI } from '../services/api';
import './TemplateCreateFlow.css';

const ASPECT_RATIOS = [
    { value: '1:1', label: 'Square' },
    { value: '4:5', label: 'Portrait' },
    { value: '9:16', label: 'Story' },
    { value: '16:9', label: 'Landscape' },
];

export default function TemplateCreateFlow({ brandId, onCreated, onClose }) {
    const [step, setStep] = useState(1);                           // 1=upload, 2=analyzing, 3=done
    const [imageFile, setImageFile] = useState(null);
    const [imagePreview, setImagePreview] = useState(null);
    const [imageS3Url, setImageS3Url] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [name, setName] = useState('');
    const [aspectRatio, setAspectRatio] = useState('1:1');
    const [analyzing, setAnalyzing] = useState(false);
    const [dnaResult, setDnaResult] = useState(null);
    const [error, setError] = useState(null);
    const fileInputRef = useRef(null);

    // ── Image selection + instant S3 upload ──────────────────────────────────
    const handleImageSelect = useCallback(async (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
        setUploading(true);
        setError(null);

        try {
            const token = localStorage.getItem('mantram_token') || '';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder', 'template-references');
            const apiBase = (import.meta.env.VITE_API_URL || `${window.location.origin}/api`).replace(/\/$/, '');
            const res = await fetch(`${apiBase}/media/image-reference`, {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: formData,
            });
            if (!res.ok) throw new Error(`Upload error: ${res.status}`);
            const data = await res.json();
            const url = data.url || data.s3Url || data.imageUrl;
            if (!url) throw new Error('Upload failed — no URL returned');
            setImageS3Url(url);
        } catch (e) {
            setError(`Upload failed: ${e.message}`);
        } finally {
            setUploading(false);
        }
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) handleImageSelect(file);
    }, [handleImageSelect]);

    // ── Step 2: Run DNA extraction ────────────────────────────────────────────
    const handleAnalyzeAndCreate = async () => {
        if (!imageS3Url) { setError('Please wait for image upload to complete'); return; }
        if (!name.trim()) { setError('Please enter a name for this template'); return; }

        setAnalyzing(true);
        setStep(2);
        setError(null);

        try {
            const result = await templatesAPI.analyzeAndCreate({
                referenceImageUrl: imageS3Url,
                brandId,
                name: name.trim(),
                aspectRatio,
            });

            if (!result.success) throw new Error(result.error || 'Analysis failed');
            setDnaResult(result.template);
            setStep(3);
        } catch (e) {
            setError(e.message || 'DNA analysis failed');
            setStep(1);
        } finally {
            setAnalyzing(false);
        }
    };

    const handleDone = () => {
        onCreated?.(dnaResult);
        onClose?.();
    };

    const dna = dnaResult?.dna || {};

    return (
        <div className="tcf-backdrop" onClick={(e) => e.target === e.currentTarget && step !== 2 && onClose()}>
            <div className="tcf-modal">
                {/* Step 1: Upload + Name */}
                {step === 1 && (
                    <>
                        <div className="tcf-header">
                            <div className="tcf-header__icon">
                                <span className="material-symbols-outlined">add_photo_alternate</span>
                            </div>
                            <div>
                                <div className="tcf-header__title">Create AI Template</div>
                                <div className="tcf-header__sub">Upload a reference creative — AI will study it and write the design formula</div>
                            </div>
                            <button className="tcf-close" onClick={onClose}>
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        <div className="tcf-body">
                            {/* Image drop zone */}
                            {!imagePreview ? (
                                <div
                                    className="tcf-drop-zone"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                                >
                                    <div className="tcf-drop-zone__icon">
                                        <span className="material-symbols-outlined">image</span>
                                    </div>
                                    <div className="tcf-drop-zone__title">Drop your reference creative here</div>
                                    <div className="tcf-drop-zone__hint">PNG, JPG, WEBP — any marketing image, ad, or poster</div>
                                    <button className="tcf-upload-btn" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                                        <span className="material-symbols-outlined">cloud_upload</span>
                                        Browse Files
                                    </button>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleImageSelect(e.target.files?.[0])}
                                    />
                                </div>
                            ) : (
                                <div className="tcf-image-preview">
                                    <img src={imagePreview} alt="Reference" />
                                    {uploading && (
                                        <div className="tcf-image-uploading">
                                            <span className="material-symbols-outlined spin">progress_activity</span>
                                            Uploading...
                                        </div>
                                    )}
                                    {!uploading && imageS3Url && (
                                        <div className="tcf-image-ready">
                                            <span className="material-symbols-outlined">check_circle</span>
                                            Ready
                                        </div>
                                    )}
                                    <button
                                        className="tcf-image-remove"
                                        onClick={() => { setImagePreview(null); setImageFile(null); setImageS3Url(null); }}
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Name */}
                            <div className="tcf-field">
                                <label className="tcf-field__label">Template Name</label>
                                <input
                                    className="tcf-field__input"
                                    type="text"
                                    placeholder="e.g. Summer Sale Hero, Product Launch, Festive Offer..."
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    maxLength={60}
                                />
                            </div>

                            {/* Aspect Ratio */}
                            <div className="tcf-field">
                                <label className="tcf-field__label">Aspect Ratio</label>
                                <div className="tcf-ratio-grid">
                                    {ASPECT_RATIOS.map(r => (
                                        <button
                                            key={r.value}
                                            className={`tcf-ratio-btn${aspectRatio === r.value ? ' active' : ''}`}
                                            onClick={() => setAspectRatio(r.value)}
                                        >
                                            <span className="tcf-ratio-icon">{r.value}</span>
                                            {r.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="tcf-error">
                                    <span className="material-symbols-outlined">error</span>
                                    {error}
                                </div>
                            )}

                            <button
                                className="tcf-analyze-btn"
                                onClick={handleAnalyzeAndCreate}
                                disabled={!imageS3Url || uploading || !name.trim()}
                            >
                                <span className="material-symbols-outlined">auto_awesome</span>
                                Analyze &amp; Create Template
                            </button>
                        </div>
                    </>
                )}

                {/* Step 2: Analyzing */}
                {step === 2 && (
                    <div className="tcf-analyzing">
                        <div className="tcf-analyzing__pulse">
                            <span className="material-symbols-outlined">auto_awesome</span>
                        </div>
                        <div className="tcf-analyzing__title">Extracting Design DNA</div>
                        <div className="tcf-analyzing__steps">
                            <div className="tcf-anim-step">
                                <span className="material-symbols-outlined spin">progress_activity</span>
                                Analyzing layout &amp; color palette...
                            </div>
                            <div className="tcf-anim-step tcf-anim-step--dim">
                                <span className="material-symbols-outlined">account_tree</span>
                                Mapping content zones...
                            </div>
                            <div className="tcf-anim-step tcf-anim-step--dim">
                                <span className="material-symbols-outlined">description</span>
                                Writing prompt formula...
                            </div>
                        </div>
                        <div className="tcf-analyzing__hint">
                            This takes 20–40 seconds. The AI is studying typography, mood, and layout structure.
                        </div>
                    </div>
                )}

                {/* Step 3: Done */}
                {step === 3 && dnaResult && (
                    <div className="tcf-done">
                        <div className="tcf-done__preview">
                            <img src={dnaResult.previewImageUrl} alt={dnaResult.name} />
                        </div>
                        <div className="tcf-done__body">
                            <div className="tcf-done__success">
                                <span className="material-symbols-outlined">check_circle</span>
                                Template Created!
                            </div>
                            <div className="tcf-done__name">{dnaResult.name}</div>

                            {dna.layout && (
                                <div className="tcf-done__dna">
                                    <div className="tcf-done__dna-row">
                                        <span>Layout</span>
                                        <strong>{dna.layout?.replace(/-/g, ' ')}</strong>
                                    </div>
                                    {dna.mood && (
                                        <div className="tcf-done__dna-row">
                                            <span>Mood</span>
                                            <strong>{dna.mood}</strong>
                                        </div>
                                    )}
                                    {Array.isArray(dna.colorPalette) && dna.colorPalette.length > 0 && (
                                        <div className="tcf-done__dna-row">
                                            <span>Colors</span>
                                            <div className="tcf-done__palette">
                                                {dna.colorPalette.slice(0, 5).map((hex, i) => (
                                                    <div key={i} style={{ background: hex }} className="tcf-done__dot" title={hex} />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {Array.isArray(dna.contentZones) && (
                                        <div className="tcf-done__dna-row">
                                            <span>Zones</span>
                                            <div className="tcf-done__zones">
                                                {dna.contentZones.slice(0, 5).map(z => (
                                                    <span key={z.role} className="tcf-zone-pill">{z.role}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <button className="tcf-done-btn" onClick={handleDone}>
                                <span className="material-symbols-outlined">auto_awesome</span>
                                Use Template Now
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
