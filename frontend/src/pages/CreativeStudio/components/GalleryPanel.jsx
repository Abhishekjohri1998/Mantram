import { memo, useRef } from 'react'
import GlobalLoader from '../../../components/GlobalLoader'
import { templateCategories } from '../constants'
import { CreditBadge } from '../../../components/CreditBadge'

const GalleryPanel = memo(({
    galleryFilter, setGalleryFilter, viewMode, setViewMode,
    aiWarnings, error, setError, handleGenerate,
    result, setResult, activeGenerations, prompt, activeBrand, selectedTypeInfo, style, feedbackState, handleFeedback,
    handleDownloadImage, upscaleMenu, setUpscaleMenu, upscalingState, handleDownloadWithUpscale, upscaleMenuRef,
    setPublishData, handleAnimateClick, navigate,
    textOverlay, aspectRatio,
    copiedField, setCopiedField,
    pipelineSteps,
    generationHistory, setGenerationHistory, setZoomImage, setDesignBaseImage, setPrompt,
    expandedReasoning, setExpandedReasoning, getTimeAgo,
    bankImages,
    setActiveQuickTemplate, setTemplateFields,
    setFeedbackToast
}) => {
    return (
        <div className="creative-gallery">

            {/* ── Gallery Filter Bar ── */}
            <div className="flex items-center justify-between mb-4 px-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                    {['All', 'Social', 'Product', 'Promo', 'Quote', 'Event'].map(cat => (
                        <button key={cat}
                            onClick={() => setGalleryFilter(cat)}
                            className={`gallery-cat-pill ${galleryFilter === cat ? 'active' : ''}`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex rounded-lg border border-[var(--sys-border)] overflow-hidden">
                        <button onClick={() => setViewMode('list')}
                            className={`studio-action-btn-sm border-none ${viewMode === 'list' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : ''}`} title="List view">
                            <span className="material-symbols-outlined">view_list</span>
                        </button>
                        <button onClick={() => setViewMode('grid')}
                            className={`studio-action-btn-sm border-none ${viewMode === 'grid' ? 'bg-[var(--sys-primary-dim)] text-[var(--sys-primary)]' : ''}`} title="Grid view">
                            <span className="material-symbols-outlined">grid_view</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── AI Provider Warnings ── */}
            {aiWarnings.length > 0 && (
                <div className="space-y-2 mb-4">
                    {aiWarnings.map((warn, i) => (
                        <div key={i} className="studio-highlight-panel text-amber-500 animate-fade-in">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            <span>{warn}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Error ── */}
            {error && (
                <div className={`mb-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-[var(--sys-surface)] border-[var(--sys-border)] text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    <div className="flex items-start gap-2">
                        <span className="material-symbols-outlined text-lg mt-0.5">{error.isProviderError ? 'warning' : 'error'}</span>
                        <div className="flex-1">
                            <span className="font-bold mr-1">{error.isProviderError ? `${error.provider || 'AI Provider'} Notice:` : 'Error:'}</span>
                            {error.message}
                        </div>
                    </div>
                    {error.isRetryable && (
                        <div className="flex gap-2 mt-3 ml-7">
                            <button onClick={() => { setError(null); handleGenerate() }}
                                className="studio-btn-secondary py-1 px-3 text-[10px]">
                                🔄 Try Again
                            </button>
                            <button onClick={() => setError(null)}
                                className="studio-btn-ghost text-[10px]">
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Current Result ── */}
            {result && activeGenerations.length === 0 && (
                <div className="generation-card generation-card--new mb-5">
                    <div className="studio-compact-prompt-container mb-2.5 group/prompt">
                        <p className="studio-compact-prompt-text text-xs" title={prompt}>
                            {prompt || 'Generated creative'}
                        </p>
                        <div className="studio-prompt-actions">
                            <button onClick={() => { 
                                navigator.clipboard.writeText(prompt); 
                                setFeedbackToast?.('Prompt copied to clipboard');
                                setCopiedField?.('prompt_result');
                                setTimeout(() => setCopiedField?.(null), 2000);
                            }}
                                className={`studio-prompt-action-btn ${copiedField === 'prompt_result' ? 'text-primary' : ''}`} 
                                title="Copy Complete Prompt">
                                <span className="material-symbols-outlined">{copiedField === 'prompt_result' ? 'check' : 'content_copy'}</span>
                            </button>
                            <button onClick={() => { setPrompt(prompt); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                className="studio-prompt-action-btn" title="Reuse Prompt">
                                <span className="material-symbols-outlined">refresh</span>
                            </button>
                        </div>
                    </div>
                    <div className="relative rounded-xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-bg)] cursor-pointer group mb-3"
                        style={{ maxHeight: '500px' }}
                        onClick={() => result.imageUrl && setZoomImage(result.imageUrl)}>
                        {result.imageUrl ? (
                            <>
                                <img src={result.imageUrl} alt={result.title || 'Generated creative'} loading="eager" decoding="async"
                                    className="w-full h-auto object-contain mx-auto block"
                                    style={{ maxHeight: '500px' }} />
                                <div className="absolute inset-0 bg-[var(--sys-bg)] group-hover:bg-[var(--sys-bg)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <span className="material-symbols-outlined text-3xl text-[var(--sys-text)] bg-[var(--sys-bg)] rounded-full p-2">zoom_in</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center"
                                style={{ aspectRatio: aspectRatio?.replace(':', '/') || '1/1', background: `linear-gradient(135deg, ${activeBrand?.dna?.colors?.[0]?.hex || '#2B4BEE'}40, ${activeBrand?.dna?.colors?.[1]?.hex || '#8B5CF6'}40)` }}>
                                <span className="material-symbols-outlined text-6xl text-[var(--sys-text)]/20 mb-4 block">image</span>
                                <p className="text-[var(--sys-text)] font-bold text-lg mb-2">{textOverlay || result.title || prompt.substring(0, 40)}</p>
                                <p className="text-sm text-[var(--sys-text)]/50">{activeBrand?.name}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="studio-badge">
                            {selectedTypeInfo?.label || 'Creative'}
                        </span>
                        <span className="studio-badge-secondary">
                            {style}
                        </span>
                        <span className="text-[10px] text-[var(--sys-text-muted)]">Just now</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-[var(--sys-border)]">
                        <button onClick={() => handleFeedback('accept')}
                            className={`studio-btn-pill ${feedbackState === 'accepted' ? 'active' : ''}`}>
                            <span className="material-symbols-outlined text-sm">{feedbackState === 'accepted' ? 'check_circle' : 'check'}</span>
                            {feedbackState === 'accepted' ? 'Accepted' : 'Accept'}
                        </button>
                        <button onClick={() => handleDownloadImage(result?.imageUrl, `${result?.title || 'creative'}.png`)}
                            className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] hover:bg-[var(--sys-surface)] cursor-pointer transition-all" title="Download Original">
                            <span className="material-symbols-outlined text-sm">download</span>
                        </button>
                        <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setUpscaleMenu(upscaleMenu ? null : { url: result?.imageUrl, filename: `${result?.title || 'creative'}.png` }) }}
                                className="p-1.5 rounded-lg text-[var(--sys-text-muted)] hover:text-amber-400 hover:bg-amber-400/10 cursor-pointer transition-all" title="Download HD / 4K">
                                {upscalingState ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">high_quality</span>}
                            </button>
                            {upscaleMenu && upscaleMenu.url === result?.imageUrl && (
                                <div ref={upscaleMenuRef} className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 studio-card p-1.5 min-w-[200px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="text-[10px] text-[var(--sys-text-muted)] px-2 pt-1 pb-1.5 font-bold uppercase tracking-wider">Download Quality</div>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '1k')}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-[var(--sys-surface)] text-[var(--sys-text)] transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)]">image</span>
                                        <div className="text-left"><div className="font-bold">1K Original</div><div className="text-[10px] text-[var(--sys-text-muted)]">1024px • Instant</div></div>
                                    </button>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '2k')}
                                        disabled={upscalingState === '2k'}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text)] transition-all cursor-pointer disabled:opacity-50">
                                        <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">hd</span>
                                        <div className="text-left"><div className="font-bold text-[var(--sys-primary)]">2K HD{upscalingState === '2k' ? ' — Upscaling...' : ''}</div><div className="text-[10px] text-[var(--sys-text-muted)]">2048px • Free</div></div>
                                        {upscalingState === '2k' && <span className="material-symbols-outlined text-sm animate-spin ml-auto text-[var(--sys-primary)]">progress_activity</span>}
                                    </button>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '4k')}
                                        disabled={upscalingState === '4k'}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs hover:bg-[var(--sys-primary-dim)] text-[var(--sys-text)] transition-all cursor-pointer disabled:opacity-50">
                                        <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">4k</span>
                                        <div className="text-left"><div className="font-bold text-[var(--sys-primary)]">4K Ultra HD{upscalingState === '4k' ? ' — AI Upscaling...' : ''}</div><div className="text-[10px] text-[var(--sys-text-muted)]">4096px • AI Enhanced</div></div>
                                        {upscalingState === '4k' && <span className="material-symbols-outlined text-sm animate-spin ml-auto text-[var(--sys-primary)]">progress_activity</span>}
                                    </button>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setPublishData({ image: result?.imageUrl, text: result?.copy?.caption || result?.title || '' })}
                            className="studio-action-btn-sm" title="Publish">
                            <span className="material-symbols-outlined">share</span>
                        </button>
                        <button onClick={handleAnimateClick}
                            className="studio-action-btn-sm" title="Animate">
                            <span className="material-symbols-outlined">animation</span>
                        </button>
                        <button onClick={() => {
                            if (!result?.imageUrl) return
                            const params = new URLSearchParams({ fromCreative: 'true', imageUrl: result.imageUrl })
                            navigate(`/content-studio?${params.toString()}`)
                        }}
                            className="studio-action-btn-sm" title="Get Caption">
                            <span className="material-symbols-outlined">edit_note</span>
                        </button>
                        <button onClick={handleGenerate}
                            className="ml-auto studio-action-btn-sm" title="Regenerate">
                            <span className="material-symbols-outlined">refresh</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Text on Image Card ── */}
            {result?.copy?.headline && (
                <div className="studio-card p-0 mb-5 overflow-hidden border border-[var(--sys-border)] animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center justify-between px-4 py-3 bg-[var(--sys-primary-dim)] border-b border-[var(--sys-border)]">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">title</span>
                        <h4 className="text-xs font-bold text-[var(--sys-text)]">Text on Image</h4>
                        <span className="studio-badge">RENDERED ON IMAGE</span>
                    </div>
                    <button onClick={() => {
                        const c = result.copy;
                        const full = [c.headline, c.subtext, c.ctaText].filter(Boolean).join('\n');
                        navigator.clipboard.writeText(full);
                        setCopiedField('all');
                        setTimeout(() => setCopiedField(null), 2000);
                    }} className={`studio-btn-pill py-1 px-3 text-[11px] ${copiedField === 'all' ? 'active' : ''}`}>
                        <span className="material-symbols-outlined text-xs">{copiedField === 'all' ? 'check' : 'content_copy'}</span>
                        {copiedField === 'all' ? 'Copied!' : 'Copy All'}
                    </button>
                </div>

                    <div className="mx-4 mt-4 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/60 border border-[var(--sys-border)] p-4 text-center space-y-1.5">
                        <p className="text-lg font-black text-[var(--sys-text)] leading-tight tracking-tight">{result.copy.headline}</p>
                        {result.copy.subtext && (
                            <p className="text-xs text-[var(--sys-text)] font-medium">{result.copy.subtext}</p>
                        )}
                        {result.copy.ctaText && (
                            <div className="pt-1">
                                <span className="inline-flex items-center gap-1 px-4 py-1.5 rounded-full bg-[var(--sys-primary)] text-white text-[10px] font-bold shadow-lg">
                                    {result.copy.ctaText}
                                    <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="p-4 space-y-3">
                        <div className="group flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-0.5">Headline</p>
                                <p className="text-sm font-bold text-[var(--sys-text)]">{result.copy.headline}</p>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(result.copy.headline); setCopiedField('headline'); setTimeout(() => setCopiedField(null), 1500); }}
                                className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'headline' ? 'text-emerald-400' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                {copiedField === 'headline' ? '✓' : 'Copy'}
                            </button>
                        </div>
                        {result.copy.subtext && (
                            <div className="group flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-0.5">Subtext</p>
                                    <p className="text-xs text-[var(--sys-text)]">{result.copy.subtext}</p>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(result.copy.subtext); setCopiedField('subtext'); setTimeout(() => setCopiedField(null), 1500); }}
                                    className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'subtext' ? 'text-emerald-400' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    {copiedField === 'subtext' ? '✓' : 'Copy'}
                                </button>
                            </div>
                        )}
                        {result.copy.ctaText && (
                            <div className="group flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-[var(--sys-text-muted)] uppercase tracking-wider mb-0.5">CTA Button Text</p>
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--sys-primary-dim)] border border-[var(--sys-primary)] text-[var(--sys-primary)]">
                                        <span className="text-xs font-bold">{result.copy.ctaText}</span>
                                    </div>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(result.copy.ctaText); setCopiedField('cta'); setTimeout(() => setCopiedField(null), 1500); }}
                                    className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'cta' ? 'text-emerald-400' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    {copiedField === 'cta' ? '✓' : 'Copy'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ── Generating Indicators ── */}
            {activeGenerations.map((job, idx) => (
                <GlobalLoader
                    key={job.jobId}
                    isActive={true}
                    title={activeGenerations.length > 1 ? `Creating visual ${idx + 1}/${activeGenerations.length}...` : 'Creating your visual...'}
                    pipelineSteps={idx === 0 ? pipelineSteps : []}
                    currentStage={`${job.prompt}${job.prompt.length >= 60 ? '...' : ''}`}
                    icon="photo_camera"
                    estimatedDuration={60}
                />
            ))}

            {/* ── Session Generation Gallery ── */}
            {generationHistory.length > 0 && (
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-[var(--sys-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-[var(--sys-primary)]">history</span>
                            Generations ({generationHistory.length})
                        </h4>
                        <button onClick={() => setGenerationHistory([])} className="text-[10px] text-[var(--sys-text-muted)] hover:text-[var(--sys-text-muted)] cursor-pointer transition-all">Clear</button>
                    </div>

                    {viewMode === 'grid' ? (
                        <div className="space-y-6 max-h-[700px] overflow-y-auto pr-1 pb-12 custom-scrollbar">
                            {(() => {
                                // Dynamically group generationHistory sequentially by identical prompt logic
                                const groupedBlocks = [];
                                let currentGroup = null;

                                generationHistory.forEach(item => {
                                    const pText = (item._prompt || item.prompt || '').trim().toLowerCase();
                                    const rText = item.aspectRatio || '1:1';
                                    
                                    if (!currentGroup || currentGroup.promptKey !== pText || currentGroup.ratioKey !== rText) {
                                        if (currentGroup) groupedBlocks.push(currentGroup);
                                        currentGroup = {
                                            promptKey: pText,
                                            promptText: item._prompt || item.prompt || 'Generated Visual',
                                            ratioKey: rText,
                                            timestamp: item.createdAt,
                                            items: [item]
                                        };
                                    } else {
                                        currentGroup.items.push(item);
                                    }
                                });
                                if (currentGroup) groupedBlocks.push(currentGroup);

                                return groupedBlocks.map((group, gIdx) => (
                                    <div key={gIdx} className="w-full bg-[var(--sys-surface)] border border-[var(--sys-border)] hover:border-[var(--sys-primary)] shadow-sm rounded-2xl p-1 sm:p-2 flex flex-col xl:flex-row gap-4 mb-4 animate-fade-in group/band">
                                        
                                        {/* Left Side: Images Grid */}
                                        <div className="flex-1 flex gap-2 overflow-x-auto snap-x snap-mandatory pr-2 custom-scrollbar min-h-[300px]">
                                            {group.items.map((item, idx) => (
                                                <div key={item._id || idx} className="relative rounded-xl overflow-hidden cursor-pointer group/card snap-start flex-shrink-0 transition-transform duration-300 hover:scale-[1.01]"
                                                    style={{ width: idx === 0 ? '45%' : '30%', minWidth: idx === 0 ? '300px' : '220px' }}
                                                    onClick={() => setZoomImage(item.imageUrl)}>
                                                    <img src={item.imageUrl} alt="Creative" className="w-full h-full object-cover rounded-xl shadow-md" />
                                                    {idx === 0 && gIdx === 0 && <span className="absolute top-2 left-2 text-[8px] font-bold text-white bg-[var(--sys-primary)] px-1.5 py-0.5 rounded-sm shadow-sm opacity-90 uppercase tracking-widest">Latest</span>}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Right Side: Text & Actions Box */}
                                        <div className="w-full xl:w-[350px] p-2 xl:p-4 flex flex-col justify-between flex-shrink-0">
                                            <div>
                                            <div className="studio-compact-prompt-container mb-4 group/prompt">
                                                <p className="studio-compact-prompt-text text-xs text-[var(--sys-text-muted)] font-medium" title={group.promptText}>
                                                    {group.promptText}
                                                </p>
                                                <div className="studio-prompt-actions">
                                                    <button onClick={() => { 
                                                        navigator.clipboard.writeText(group.promptText); 
                                                        setFeedbackToast?.('Prompt copied to clipboard');
                                                        setCopiedField?.(`prompt_history_${gIdx}`);
                                                        setTimeout(() => setCopiedField?.(null), 2000);
                                                    }}
                                                        className={`studio-prompt-action-btn ${copiedField === `prompt_history_${gIdx}` ? 'text-primary' : ''}`} 
                                                        title="Copy Prompt">
                                                        <span className="material-symbols-outlined">{copiedField === `prompt_history_${gIdx}` ? 'check' : 'content_copy'}</span>
                                                    </button>
                                                    <button onClick={() => { setPrompt(group.promptText); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                                        className="studio-prompt-action-btn" title="Reuse Prompt">
                                                        <span className="material-symbols-outlined">refresh</span>
                                                    </button>
                                                </div>
                                            </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="studio-badge">
                                                        {group.items.length} variations
                                                    </span>
                                                    <span className="text-[10px] text-[var(--sys-text-muted)] font-bold">
                                                        {getTimeAgo ? getTimeAgo(group.timestamp) : 'Recent'}
                                                    </span>
                                                </div>
                                            </div>
                                            
                                            <div className="flex flex-wrap items-center gap-2 mt-6">
                                                <button onClick={() => setZoomImage(group.items[0].imageUrl)}
                                                        className="studio-btn-secondary py-1.5 px-3 text-[11px]">
                                                    <span className="material-symbols-outlined text-[14px]">open_in_full</span> View Full
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(group.items[0].imageUrl, `creative-${gIdx}.png`) }} 
                                                        className="studio-btn-secondary py-1.5 px-3 text-[11px]">
                                                    <span className="material-symbols-outlined text-[14px]">download</span> Download
                                                </button>
                                                
                                                <div className="flex-1" />
                                                
                                                <button onClick={() => setZoomImage(group.items[0].imageUrl)}
                                                        className="studio-btn-primary py-1.5 px-4 text-[11px]">
                                                    <span className="material-symbols-outlined text-[14px]">north_east</span> View Actions
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ));
                            })()}
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                            {/* List grouping logic (simplified for extraction) */}
                            {generationHistory.map((item, idx) => (
                                <div key={item._id || idx} className={`studio-card mb-4 p-3 ${idx === 0 ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-dim)]' : ''}`}>
                                    <div className="flex gap-3">
                                        <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => setZoomImage(item.imageUrl)}>
                                            <img src={item.imageUrl} alt="Creative" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <div className="studio-compact-prompt-container mb-2 group/prompt">
                                                <p className="studio-compact-prompt-text text-xs text-[var(--sys-text-muted)]" title={item._prompt || item.prompt}>
                                                    {item._prompt || item.prompt}
                                                </p>
                                                <div className="studio-prompt-actions">
                                                    <button onClick={() => { 
                                                        navigator.clipboard.writeText(item._prompt || item.prompt); 
                                                        setFeedbackToast?.('Prompt copied to clipboard');
                                                        setCopiedField?.(`prompt_list_${idx}`);
                                                        setTimeout(() => setCopiedField?.(null), 2000);
                                                    }}
                                                        className={`studio-prompt-action-btn ${copiedField === `prompt_list_${idx}` ? 'text-primary' : ''}`} 
                                                        title="Copy Prompt">
                                                        <span className="material-symbols-outlined">{copiedField === `prompt_list_${idx}` ? 'check' : 'content_copy'}</span>
                                                    </button>
                                                    <button onClick={() => { setPrompt(item._prompt || item.prompt); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                                        className="studio-prompt-action-btn" title="Reuse Prompt">
                                                        <span className="material-symbols-outlined">refresh</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 flex-wrap mb-2">
                                                {item.aspectRatio && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--sys-surface)] text-[var(--sys-text-muted)]">{item.aspectRatio}</span>}
                                                <span className="text-[9px] text-[var(--sys-text-muted)]">{getTimeAgo(item.createdAt)}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button onClick={() => handleDownloadImage(item.imageUrl, `creative-${idx}.png`)} className="studio-action-btn-sm w-7 h-7"><span className="material-symbols-outlined text-xs">download</span></button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Image Bank History ── */}
            <div className="space-y-4">
                {bankImages.filter(img => img.source === 'ai-generated' || img.category === 'generated' || img.type !== 'uploaded').map(img => (
                    <div key={img._id} className="generation-card p-3">
                        <div className="studio-compact-prompt-container mb-2 group/prompt">
                            <p className="studio-compact-prompt-text text-xs text-[var(--sys-text-muted)]" title={img.prompt || img.title}>
                                {img.prompt || img.title}
                            </p>
                            <div className="studio-prompt-actions">
                                <button onClick={() => { 
                                    navigator.clipboard.writeText(img.prompt || img.title); 
                                    setFeedbackToast?.('Prompt copied to clipboard');
                                    setCopiedField?.(`prompt_bank_${img._id}`);
                                    setTimeout(() => setCopiedField?.(null), 2000);
                                }}
                                    className={`studio-prompt-action-btn ${copiedField === `prompt_bank_${img._id}` ? 'text-primary' : ''}`} 
                                    title="Copy Prompt">
                                    <span className="material-symbols-outlined">{copiedField === `prompt_bank_${img._id}` ? 'check' : 'content_copy'}</span>
                                </button>
                                <button onClick={() => { setPrompt(img.prompt || img.title); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                                    className="studio-prompt-action-btn" title="Reuse Prompt">
                                    <span className="material-symbols-outlined">refresh</span>
                                </button>
                            </div>
                        </div>
                        <div className="relative rounded-xl overflow-hidden border border-[var(--sys-border)] bg-[var(--sys-bg)] cursor-pointer group mb-2.5" onClick={() => setZoomImage(img.imageUrl || img.thumbnailUrl)}>
                            <img src={img.imageUrl || img.thumbnailUrl} alt="Generated" className="w-full object-cover" style={{ maxHeight: '300px' }} />
                            <div className="absolute inset-0 bg-[var(--sys-bg)] group-hover:bg-[var(--sys-bg)] transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="material-symbols-outlined text-2xl text-[var(--sys-text)] bg-[var(--sys-bg)] rounded-full p-2">zoom_in</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => handleDownloadImage(img.imageUrl || img.thumbnailUrl, 'creative.png')} className="studio-action-btn-sm w-8 h-8"><span className="material-symbols-outlined">download</span></button>
                            <button onClick={() => setDesignBaseImage(img.imageUrl || img.thumbnailUrl)} className="studio-action-btn-sm w-8 h-8"><span className="material-symbols-outlined">edit</span></button>
                            <span className="ml-auto text-[10px] text-[var(--sys-text-muted)]">{getTimeAgo(img.createdAt)}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Empty State ── */}
            {!result && activeGenerations.length === 0 && bankImages.filter(img => img.source === 'ai-generated' || img.category === 'generated').length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--sys-surface)] border border-[var(--sys-border)] flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-3xl text-[var(--sys-text-muted)]">palette</span>
                    </div>
                    <h3 className="text-base font-bold text-[var(--sys-text)] mb-1">No generations yet</h3>
                    <p className="text-sm text-[var(--sys-text-muted)] max-w-xs text-center mb-6">Describe your vision and hit Generate to start.</p>
                </div>
            )}
        </div>
    );
});

export default GalleryPanel;
