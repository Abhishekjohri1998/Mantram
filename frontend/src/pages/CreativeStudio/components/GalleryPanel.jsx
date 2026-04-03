import { memo, useRef } from 'react'
import GlobalLoader from '../../../components/GlobalLoader'
import { templateCategories } from '../constants'
import CreditBadge from '../../../components/CreditBadge'

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
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                                galleryFilter === cat
                                    ? 'bg-primary/15 text-primary border-primary/25'
                                    : 'bg-white/[0.04] text-slate-400 hover:text-white border-transparent hover:border-white/[0.08]'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex rounded-lg border border-white/[0.08] overflow-hidden">
                        <button onClick={() => setViewMode('list')}
                            className={`p-1.5 cursor-pointer transition-all ${viewMode === 'list' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`} title="List view">
                            <span className="material-symbols-outlined text-sm">view_list</span>
                        </button>
                        <button onClick={() => setViewMode('grid')}
                            className={`p-1.5 cursor-pointer transition-all ${viewMode === 'grid' ? 'bg-white/[0.08] text-white' : 'text-slate-600 hover:text-slate-400'}`} title="Grid view">
                            <span className="material-symbols-outlined text-sm">grid_view</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* ── AI Provider Warnings ── */}
            {aiWarnings.length > 0 && (
                <div className="space-y-2 mb-4">
                    {aiWarnings.map((warn, i) => (
                        <div key={i} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs flex items-center gap-2 animate-fade-in">
                            <span className="material-symbols-outlined text-sm">warning</span>
                            <span>{warn}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Error ── */}
            {error && (
                <div className={`mb-4 p-4 rounded-xl border ${error.isProviderError ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
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
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 transition text-white border border-white/10">
                                🔄 Try Again
                            </button>
                            <button onClick={() => setError(null)}
                                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-white/5 hover:bg-white/10 transition text-white/60 border border-white/5">
                                Dismiss
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Current Result ── */}
            {result && activeGenerations.length === 0 && (
                <div className="generation-card generation-card--new mb-5">
                    <p className="text-xs text-slate-400 mb-2.5 line-clamp-2 leading-relaxed">
                        {prompt || 'Generated creative'}
                    </p>
                    <div className="relative rounded-xl overflow-hidden border border-white/[0.08] bg-black/20 cursor-pointer group mb-3"
                        style={{ maxHeight: '500px' }}
                        onClick={() => result.imageUrl && setZoomImage(result.imageUrl)}>
                        {result.imageUrl ? (
                            <>
                                <img src={result.imageUrl} alt={result.title || 'Generated creative'} loading="eager" decoding="async"
                                    className="w-full h-auto object-contain mx-auto block"
                                    style={{ maxHeight: '500px' }} />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                    <span className="material-symbols-outlined text-3xl text-white bg-black/50 rounded-full p-2">zoom_in</span>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center p-8 text-center"
                                style={{ aspectRatio: aspectRatio?.replace(':', '/') || '1/1', background: `linear-gradient(135deg, ${activeBrand?.dna?.colors?.[0]?.hex || '#2B4BEE'}40, ${activeBrand?.dna?.colors?.[1]?.hex || '#8B5CF6'}40)` }}>
                                <span className="material-symbols-outlined text-6xl text-white/20 mb-4 block">image</span>
                                <p className="text-white font-bold text-lg mb-2">{textOverlay || result.title || prompt.substring(0, 40)}</p>
                                <p className="text-sm text-white/50">{activeBrand?.name}</p>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/15 text-primary border border-primary/20">
                            {selectedTypeInfo?.label || 'Creative'}
                        </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-white/[0.04] text-slate-500">
                            {style}
                        </span>
                        <span className="text-[10px] text-slate-600">Just now</span>
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-white/[0.05]">
                        <button onClick={() => handleFeedback('accept')}
                            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${feedbackState === 'accepted' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10'}`}>
                            <span className="material-symbols-outlined text-sm">{feedbackState === 'accepted' ? 'check_circle' : 'check'}</span>
                            {feedbackState === 'accepted' ? 'Accepted' : 'Accept'}
                        </button>
                        <button onClick={() => handleDownloadImage(result?.imageUrl, `${result?.title || 'creative'}.png`)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all" title="Download Original">
                            <span className="material-symbols-outlined text-sm">download</span>
                        </button>
                        <div className="relative">
                            <button onClick={(e) => { e.stopPropagation(); setUpscaleMenu(upscaleMenu ? null : { url: result?.imageUrl, filename: `${result?.title || 'creative'}.png` }) }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 cursor-pointer transition-all" title="Download HD / 4K">
                                {upscalingState ? <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-sm">high_quality</span>}
                            </button>
                            {upscaleMenu && upscaleMenu.url === result?.imageUrl && (
                                <div ref={upscaleMenuRef} className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-slate-800/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl p-1.5 min-w-[180px] z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="text-[10px] text-slate-500 px-2 pt-1 pb-1.5 font-semibold uppercase tracking-wider">Download Quality</div>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '1k')}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white transition-all cursor-pointer">
                                        <span className="material-symbols-outlined text-sm text-slate-500">image</span>
                                        <div><div className="font-semibold">1K Original</div><div className="text-[10px] text-slate-500">1024px • Instant</div></div>
                                    </button>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '2k')}
                                        disabled={upscalingState === '2k'}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all cursor-pointer disabled:opacity-50">
                                        <span className="material-symbols-outlined text-sm text-emerald-500">hd</span>
                                        <div><div className="font-semibold">2K HD{upscalingState === '2k' ? ' — Upscaling...' : ''}</div><div className="text-[10px] text-slate-500">2048px • Free</div></div>
                                        {upscalingState === '2k' && <span className="material-symbols-outlined text-sm animate-spin ml-auto text-emerald-400">progress_activity</span>}
                                    </button>
                                    <button onClick={() => handleDownloadWithUpscale(upscaleMenu.url, upscaleMenu.filename, '4k')}
                                        disabled={upscalingState === '4k'}
                                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-slate-300 hover:bg-amber-500/10 hover:text-amber-400 transition-all cursor-pointer disabled:opacity-50">
                                        <span className="material-symbols-outlined text-sm text-amber-500">4k</span>
                                        <div><div className="font-semibold">4K Ultra HD{upscalingState === '4k' ? ' — AI Upscaling...' : ''}</div><div className="text-[10px] text-slate-500">4096px • AI Enhanced</div></div>
                                        {upscalingState === '4k' && <span className="material-symbols-outlined text-sm animate-spin ml-auto text-amber-400">progress_activity</span>}
                                    </button>
                                </div>
                            )}
                        </div>
                        <button onClick={() => setPublishData({ image: result?.imageUrl, text: result?.copy?.caption || result?.title || '' })}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-[#1877F2] hover:bg-[#1877F2]/10 cursor-pointer transition-all" title="Publish">
                            <span className="material-symbols-outlined text-sm">share</span>
                        </button>
                        <button onClick={handleAnimateClick}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-purple-400 hover:bg-purple-400/10 cursor-pointer transition-all" title="Animate">
                            <span className="material-symbols-outlined text-sm">animation</span>
                        </button>
                        <button onClick={() => {
                            if (!result?.imageUrl) return
                            const params = new URLSearchParams({ fromCreative: 'true', imageUrl: result.imageUrl })
                            navigate(`/content-studio?${params.toString()}`)
                        }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-400/10 cursor-pointer transition-all" title="Get Caption">
                            <span className="material-symbols-outlined text-sm">edit_note</span>
                        </button>
                        <button onClick={handleGenerate}
                            className="ml-auto p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] cursor-pointer transition-all" title="Regenerate">
                            <span className="material-symbols-outlined text-sm">refresh</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Text on Image Card ── */}
            {result?.copy?.headline && (
                <div className="studio-card p-0 mb-5 overflow-hidden border border-violet-500/20 animate-in fade-in slide-in-from-bottom-3 duration-500" style={{ animationDelay: '200ms' }}>
                    <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-sm text-violet-400">title</span>
                            <h4 className="text-xs font-bold text-white">Text on Image</h4>
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300 border border-violet-500/30">RENDERED ON IMAGE</span>
                        </div>
                        <button onClick={() => {
                            const c = result.copy;
                            const full = [c.headline, c.subtext, c.ctaText].filter(Boolean).join('\n');
                            navigator.clipboard.writeText(full);
                            setCopiedField('all');
                            setTimeout(() => setCopiedField(null), 2000);
                        }} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${copiedField === 'all' ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'}`}>
                            <span className="material-symbols-outlined text-xs">{copiedField === 'all' ? 'check' : 'content_copy'}</span>
                            {copiedField === 'all' ? 'Copied!' : 'Copy All'}
                        </button>
                    </div>

                    <div className="mx-4 mt-4 rounded-xl bg-gradient-to-br from-slate-900/80 to-slate-800/60 border border-white/[0.06] p-4 text-center space-y-1.5">
                        <p className="text-lg font-black text-white leading-tight tracking-tight">{result.copy.headline}</p>
                        {result.copy.subtext && (
                            <p className="text-xs text-slate-300 font-medium">{result.copy.subtext}</p>
                        )}
                        {result.copy.ctaText && (
                            <div className="pt-1">
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-[10px] font-bold">
                                    {result.copy.ctaText}
                                    <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                                </span>
                            </div>
                        )}
                    </div>

                    <div className="p-4 space-y-3">
                        <div className="group flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Headline</p>
                                <p className="text-sm font-bold text-white">{result.copy.headline}</p>
                            </div>
                            <button onClick={() => { navigator.clipboard.writeText(result.copy.headline); setCopiedField('headline'); setTimeout(() => setCopiedField(null), 1500); }}
                                className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'headline' ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}>
                                {copiedField === 'headline' ? '✓' : 'Copy'}
                            </button>
                        </div>
                        {result.copy.subtext && (
                            <div className="group flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Subtext</p>
                                    <p className="text-xs text-slate-300">{result.copy.subtext}</p>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(result.copy.subtext); setCopiedField('subtext'); setTimeout(() => setCopiedField(null), 1500); }}
                                    className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'subtext' ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}>
                                    {copiedField === 'subtext' ? '✓' : 'Copy'}
                                </button>
                            </div>
                        )}
                        {result.copy.ctaText && (
                            <div className="group flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">CTA Button Text</p>
                                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30">
                                        <span className="text-xs font-bold text-violet-300">{result.copy.ctaText}</span>
                                    </div>
                                </div>
                                <button onClick={() => { navigator.clipboard.writeText(result.copy.ctaText); setCopiedField('cta'); setTimeout(() => setCopiedField(null), 1500); }}
                                    className={`ml-3 opacity-0 group-hover:opacity-100 transition-all text-[10px] px-1.5 py-0.5 rounded cursor-pointer ${copiedField === 'cta' ? 'text-emerald-400' : 'text-slate-500 hover:text-white'}`}>
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
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-sm text-violet-400">history</span>
                            Generations ({generationHistory.length})
                        </h4>
                        <button onClick={() => setGenerationHistory([])} className="text-[10px] text-slate-600 hover:text-slate-400 cursor-pointer transition-all">Clear</button>
                    </div>

                    {viewMode === 'grid' ? (
                        <div className="grid grid-cols-3 gap-2 max-h-[700px] overflow-y-auto pr-1">
                            {generationHistory.map((item, idx) => (
                                <div key={item._id || idx} className={`group relative rounded-xl overflow-hidden border ${idx === 0 ? 'border-violet-500/30' : 'border-white/[0.06]'} bg-black/20 cursor-pointer transition-all hover:scale-[1.02]`}
                                    onClick={() => setZoomImage(item.imageUrl)}>
                                    <img src={item.imageUrl} alt={item._prompt || 'Creative'} className="w-full aspect-square object-cover" />
                                    {idx === 0 && <span className="absolute top-1.5 left-1.5 text-[8px] font-bold text-violet-300 bg-violet-500/30 px-1.5 py-0.5 rounded-md">Latest</span>}
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-all flex flex-col justify-end p-2 text-left">
                                        <p className="text-[9px] text-white/80 line-clamp-2 mb-1.5 leading-tight">{item._prompt || 'AI Generated'}</p>
                                        <div className="flex gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); handleDownloadImage(item.imageUrl, `creative-${idx}.png`) }} className="p-1 rounded-md bg-white/10 text-white"><span className="material-symbols-outlined text-xs">download</span></button>
                                            <button onClick={(e) => { e.stopPropagation(); setDesignBaseImage(item.imageUrl); setPrompt(item._prompt || ''); }} className="p-1 rounded-md bg-white/10 text-white"><span className="material-symbols-outlined text-xs">edit</span></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                            {/* List grouping logic (simplified for extraction) */}
                            {generationHistory.map((item, idx) => (
                                <div key={item._id || idx} className={`rounded-xl border ${idx === 0 ? 'border-violet-500/20 bg-violet-500/[0.03]' : 'border-white/[0.06] bg-white/[0.02]'} overflow-hidden p-3`}>
                                    <div className="flex gap-3">
                                        <div className="w-24 h-24 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer" onClick={() => setZoomImage(item.imageUrl)}>
                                            <img src={item.imageUrl} alt="Creative" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0 text-left">
                                            <p className="text-xs text-slate-300 mb-2 leading-relaxed line-clamp-2">{item._prompt || item.prompt}</p>
                                            <div className="flex gap-2 flex-wrap mb-2">
                                                {item.aspectRatio && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white/5 text-slate-500">{item.aspectRatio}</span>}
                                                <span className="text-[9px] text-slate-600">{getTimeAgo(item.createdAt)}</span>
                                            </div>
                                            <div className="flex gap-1.5">
                                                <button onClick={() => setPrompt(item._prompt || item.prompt)} className="px-2 py-1 rounded bg-violet-500/10 text-violet-400 text-[10px] font-bold">Reuse</button>
                                                <button onClick={() => handleDownloadImage(item.imageUrl, `creative-${idx}.png`)} className="p-1 rounded bg-white/5 text-slate-400"><span className="material-symbols-outlined text-xs">download</span></button>
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
                        <p className="text-xs text-slate-400 mb-2 line-clamp-2 leading-relaxed text-left">{img.prompt || img.title}</p>
                        <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-black/20 cursor-pointer group mb-2.5" onClick={() => setZoomImage(img.imageUrl || img.thumbnailUrl)}>
                            <img src={img.imageUrl || img.thumbnailUrl} alt="Generated" className="w-full object-cover" style={{ maxHeight: '300px' }} />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                                <span className="material-symbols-outlined text-2xl text-white bg-black/50 rounded-full p-2">zoom_in</span>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <button onClick={() => setPrompt(img.prompt || img.title)} className="px-2 py-1 rounded bg-violet-500/10 text-violet-400 text-[10px] font-bold">Reuse</button>
                            <button onClick={() => handleDownloadImage(img.imageUrl || img.thumbnailUrl, 'creative.png')} className="p-1.5 rounded bg-white/5 text-slate-500"><span className="material-symbols-outlined text-sm">download</span></button>
                            <button onClick={() => setDesignBaseImage(img.imageUrl || img.thumbnailUrl)} className="p-1.5 rounded bg-white/5 text-slate-500"><span className="material-symbols-outlined text-sm">edit</span></button>
                            <span className="ml-auto text-[10px] text-slate-600">{getTimeAgo(img.createdAt)}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Empty State ── */}
            {!result && activeGenerations.length === 0 && bankImages.filter(img => img.source === 'ai-generated' || img.category === 'generated').length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-4">
                        <span className="material-symbols-outlined text-3xl text-slate-600">palette</span>
                    </div>
                    <h3 className="text-base font-bold text-white mb-1">No generations yet</h3>
                    <p className="text-sm text-slate-500 max-w-xs text-center mb-6">Describe your vision and hit Generate to start.</p>
                    <div className="flex flex-wrap justify-center gap-2">
                        {['Social Post', 'Product Shot', 'Brand Story'].map(label => (
                            <button key={label} onClick={() => setPrompt(`Create a ${label} for ${activeBrand?.name || 'the brand'}`)}
                                className="px-3 py-2 rounded-xl text-xs font-semibold bg-white/5 border border-white/5 text-slate-300 hover:bg-white/10">{label}</button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

export default GalleryPanel;
