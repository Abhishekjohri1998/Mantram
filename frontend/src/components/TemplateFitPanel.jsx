/**
 * TemplateFitPanel — Right-side generation panel for AI Template system.
 *
 * User flow:
 *  1. Template card is clicked → TemplateFitPanel opens for that template
 *  2. User optionally drops a product image
 *  3. User types a brief (optional)
 *  4. Hits Generate → calls POST /api/templates/:id/use (with brief + productImageUrl)
 *  5. Polls job until complete → shows generated image inline
 *
 * Product analysis runs SILENTLY on the backend (no status shown).
 * Panel slides in from the right as a fixed overlay.
 */

import React, { useState, useRef, useCallback } from 'react';
import { templates as templatesAPI, creatives as creativesAPI, media as mediaAPI } from '../services/api';
import './TemplateFitPanel.css';

export default function TemplateFitPanel({ template, brandId, onClose, onSuccess }) {
    const [productImage, setProductImage] = useState(null);       // { file, previewUrl, s3Url }
    const [brief, setBrief] = useState('');
    const [generating, setGenerating] = useState(false);
    const [uploadingProduct, setUploadingProduct] = useState(false);
    const [result, setResult] = useState(null);                   // generated image URL
    const [error, setError] = useState(null);
    const [pollJobId, setPollJobId] = useState(null);
    const productInputRef = useRef(null);
    const pollRef = useRef(null);

    // ── Product image upload ──────────────────────────────────────────────────
    const handleProductImageSelect = useCallback(async (file) => {
        if (!file || !file.type.startsWith('image/')) return;
        const previewUrl = URL.createObjectURL(file);
        setProductImage({ file, previewUrl, s3Url: null });
        setUploadingProduct(true);

        try {
            // Upload to S3 via media/upload endpoint
            const formData = new FormData();
            formData.append('file', file);
            const token = localStorage.getItem('mantram_token') || '';
            const res = await fetch(`${import.meta.env.VITE_API_URL || `${window.location.origin}/api`}/media/image-reference`, {
                method: 'POST',
                headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: formData,
            });
            if (!res.ok) throw new Error(`Upload error: ${res.status}`);
            const data = await res.json();
            const s3Url = data.url || data.s3Url || data.imageUrl || null;
            if (s3Url) {
                setProductImage(prev => ({ ...prev, s3Url }));
            }
        } catch (e) {
            console.warn('[FitPanel] Product upload failed:', e.message);
        } finally {
            setUploadingProduct(false);
        }
    }, []);

    const handleProductDrop = useCallback((e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files?.[0];
        if (file) handleProductImageSelect(file);
    }, [handleProductImageSelect]);

    // ── Generation & polling ──────────────────────────────────────────────────
    const handleGenerate = async () => {
        if (generating) return;
        setGenerating(true);
        setError(null);
        setResult(null);

        try {
            const productImageUrl = productImage?.s3Url || null;
            const data = await templatesAPI.use(template._id, {
                userInputs: {
                    brief: brief.trim(),
                    productImageUrl,
                    brandId,
                },
            });

            if (data.jobId) {
                // Background job — poll until done
                setPollJobId(data.jobId);
                pollJob(data.jobId);
            } else if (data.imageUrl || data.result?.imageUrl) {
                // Synchronous result
                const url = data.imageUrl || data.result?.imageUrl;
                setResult(url);
                setGenerating(false);
                onSuccess?.(url, template);
            } else {
                throw new Error('No image returned from generation');
            }
        } catch (e) {
            setError(e.message || 'Generation failed');
            setGenerating(false);
        }
    };

    const pollJob = useCallback((jobId) => {
        let attempts = 0;
        const maxAttempts = 80; // 4 minutes max (80 × 3s)

        const poll = async () => {
            try {
                const data = await creativesAPI.pollJob(jobId);
                const status = data.job?.status || data.status;

                if (status === 'completed') {
                    // URL lives at job.result.creative.imageUrl (set when S3 upload completes)
                    // or job.imageUrl (top-level alias, updated at same time)
                    const url =
                        data.job?.result?.creative?.imageUrl ||
                        data.job?.imageUrl ||
                        data.job?.result?.imageUrl ||  // legacy fallback
                        data.imageUrl;

                    if (!url) {
                        // S3 upload still in flight — job is 'completed' but URL not yet set
                        // Keep polling until URL resolves (usually 2-5s after completed)
                        if (++attempts < maxAttempts) {
                            pollRef.current = setTimeout(poll, 2000);
                        } else {
                            throw new Error('Image URL not available — S3 upload may have failed');
                        }
                        return;
                    }

                    setResult(url);
                    setGenerating(false);
                    setPollJobId(null);
                    onSuccess?.(url, template);
                    return;
                }

                if (status === 'failed') {
                    throw new Error(data.job?.errorMessage || data.job?.error || data.error || 'Generation failed');
                }

                if (++attempts < maxAttempts) {
                    pollRef.current = setTimeout(poll, 3000);
                } else {
                    throw new Error('Generation timed out after 4 minutes');
                }
            } catch (e) {
                setError(e.message);
                setGenerating(false);
                setPollJobId(null);
            }
        };

        poll();
    }, [onSuccess, template]);

    const dna = template.dna || {};
    const colorPalette = Array.isArray(dna.colorPalette) ? dna.colorPalette.slice(0, 5) : [];

    return (
        <div className="tfp-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="tfp-panel">
                {/* Header */}
                <div className="tfp-header">
                    <div className="tfp-header__left">
                        {template.previewImageUrl && (
                            <img
                                src={template.previewImageUrl}
                                alt={template.name}
                                className="tfp-header__thumb"
                            />
                        )}
                        <div>
                            <div className="tfp-header__title">{template.name}</div>
                            {dna.mood && (
                                <div className="tfp-header__meta">
                                    <span className="material-symbols-outlined">auto_awesome</span>
                                    {dna.mood}
                                    {colorPalette.length > 0 && (
                                        <div className="tfp-palette">
                                            {colorPalette.map((hex, i) => (
                                                <div key={i} style={{ background: hex }} className="tfp-palette-dot" />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <button className="tfp-close" onClick={onClose} aria-label="Close">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="tfp-body">
                    {/* Result */}
                    {result && (
                        <div className="tfp-result">
                            <img src={result} alt="Generated" />
                            <div className="tfp-result-actions">
                                <a href={result} download="generated.jpg" className="tfp-result-btn">
                                    <span className="material-symbols-outlined">download</span>
                                    Download
                                </a>
                                <button
                                    className="tfp-result-btn tfp-result-btn--outline"
                                    onClick={() => { setResult(null); }}
                                >
                                    <span className="material-symbols-outlined">refresh</span>
                                    Regenerate
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Product image drop zone */}
                    {!result && (
                        <>
                            <div className="tfp-section-label">
                                <span className="material-symbols-outlined">deployed_code</span>
                                Product Image
                                <span className="tfp-optional">optional</span>
                            </div>

                            {productImage ? (
                                <div className="tfp-product-preview">
                                    <img src={productImage.previewUrl} alt="Product" />
                                    {uploadingProduct && (
                                        <div className="tfp-product-uploading">
                                            <span className="material-symbols-outlined spin">progress_activity</span>
                                            Uploading...
                                        </div>
                                    )}
                                    <button
                                        className="tfp-product-remove"
                                        onClick={() => setProductImage(null)}
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="tfp-drop-zone"
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={handleProductDrop}
                                    onClick={() => productInputRef.current?.click()}
                                    role="button"
                                    tabIndex={0}
                                    onKeyDown={(e) => e.key === 'Enter' && productInputRef.current?.click()}
                                >
                                    <span className="material-symbols-outlined">cloud_upload</span>
                                    <div className="tfp-drop-zone__text">
                                        Drop your product image here
                                        <span>PNG, JPG, WEBP</span>
                                    </div>
                                    <input
                                        ref={productInputRef}
                                        type="file"
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        onChange={(e) => handleProductImageSelect(e.target.files?.[0])}
                                    />
                                </div>
                            )}

                            {/* Brief */}
                            <div className="tfp-section-label" style={{ marginTop: 20 }}>
                                <span className="material-symbols-outlined">edit_note</span>
                                Brief / Offer Text
                                <span className="tfp-optional">optional</span>
                            </div>
                            <textarea
                                className="tfp-brief"
                                placeholder="e.g. 50% OFF this weekend · Summer Sale · Buy 2 Get 1 Free..."
                                value={brief}
                                onChange={(e) => setBrief(e.target.value)}
                                rows={3}
                            />

                            {/* DNA info strip */}
                            {dna.layout && (
                                <div className="tfp-dna-strip">
                                    <span className="material-symbols-outlined">account_tree</span>
                                    <div className="tfp-dna-strip__info">
                                        <strong>Design DNA</strong>
                                        <span>{dna.layout.replace(/-/g, ' ')} · {dna.mood}</span>
                                    </div>
                                    <div className="tfp-dna-strip__zones">
                                        {(dna.contentZones || []).slice(0, 4).map(z => (
                                            <span key={z.role} className="tfp-zone-pill">{z.role}</span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Error */}
                            {error && (
                                <div className="tfp-error">
                                    <span className="material-symbols-outlined">error</span>
                                    {error}
                                </div>
                            )}

                            {/* Generate button */}
                            <button
                                className="tfp-generate-btn"
                                onClick={handleGenerate}
                                disabled={generating || uploadingProduct}
                            >
                                {generating ? (
                                    <>
                                        <span className="material-symbols-outlined spin">progress_activity</span>
                                        {pollJobId ? 'Generating...' : 'Analyzing...'}
                                    </>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined">auto_awesome</span>
                                        Generate with This Template
                                    </>
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
