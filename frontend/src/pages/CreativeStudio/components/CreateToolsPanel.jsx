import { memo, useState } from 'react'
import PromptArea from './PromptArea'
import { IMAGE_MODELS, CAMERA_SHOT_PRESETS, creativeTypes, styles, ASPECT_RATIOS, templateCategories } from '../constants'
import VoiceInput from '../../../components/VoiceInput'
import { CreditBadge, CreditTooltipWrapper } from '../../../components/CreditBadge'

const CreateToolsPanel = memo(({ 
    activeBrand, fromContent, setFromContent, designBaseImage, setDesignBaseImage,
    selectedProduct, setSelectedProduct, setShowProductPicker, setProductsList, productsAPI,
    selectedType, setSelectedType, aspectRatio, setAspectRatio, customWidth, setCustomWidth, customHeight, setCustomHeight,
    textOverlay, setTextOverlay, addLogo, setAddLogo, logoPosition, setLogoPosition, logoSize, setLogoSize,
    selectedShot, setSelectedShot, 
    prompt, setPrompt, promptTextareaRef, handleGenerate, activeGenerations,
    showCharTags, setShowCharTags, charTagFilter, setCharTagFilter, characters, setCharacters, referenceImages, setReferenceImages, 
    suggestCopy, copyLoading, copyIsAiSuggested, setCopyIsAiSuggested, customHeadline, setCustomHeadline, customCtaText, setCustomCtaText, copyRationale,
    activeQuickTemplate, setActiveQuickTemplate, templateFields, setTemplateFields,
    handleEnhancePrompt, enhancing, imageModel, setImageModel, showModelMenu, setShowModelMenu,
    showAdvanced, setShowAdvanced, agenticQuality, setAgenticQuality, style, setStyle,
    generateCopy, setGenerateCopy, setRefPickerSlot, setRefPickerTab
}) => {
    
    const selectedTypeInfo = creativeTypes.find(t => t.id === selectedType)

    return (
        <div className="creative-tools-panel">

            {/* Content-linked banner */}
            {fromContent && (
                <div className="studio-highlight-panel">
                    <span className="material-symbols-outlined text-[var(--sys-primary)]">link</span>
                    <div className="flex-1">
                        <p className="text-sm font-bold text-[var(--sys-text)]">Linked to Content Studio</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">Image will match your content in {activeBrand?.name}'s brand style</p>
                    </div>
                    <button onClick={() => setFromContent(false)} className="studio-btn-ghost">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}
            {designBaseImage && (
                <div className="studio-card flex items-center gap-3 p-3 mb-4">
                    <img src={designBaseImage} alt="Base" className="w-10 h-10 rounded-lg object-cover" />
                    <div className="flex-1">
                        <p className="text-sm font-bold text-[var(--sys-text)]">✏️ Editing image as template</p>
                        <p className="text-sm text-[var(--sys-text-muted)]">Describe what to change — layout, characters & products will be preserved</p>
                    </div>
                    <button onClick={() => setDesignBaseImage(null)} className="studio-btn-ghost">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* Product Selection Banner */}
            {selectedProduct && (
                <div className="studio-card flex items-center gap-3 mb-4 p-3">
                    {selectedProduct.images?.[0]?.url && (
                        <img src={selectedProduct.images[0].url} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--sys-text)] truncate">{selectedProduct.title}</p>
                        <p className="text-sm text-[var(--sys-primary)]">Product selected — will be featured in creative</p>
                    </div>
                    <button onClick={() => setSelectedProduct(null)} className="studio-btn-ghost">
                        <span className="material-symbols-outlined text-sm">close</span>
                    </button>
                </div>
            )}

            {/* ── Format Selector ── */}
            <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-widest font-bold">Format & Size</span>
                    {selectedTypeInfo && selectedType !== 'custom-size' && (
                        <span className="text-[9px] text-[var(--sys-text-muted)] font-mono bg-[var(--sys-surface)] px-1.5 py-0.5 rounded">{selectedTypeInfo.size} · {selectedTypeInfo.aspectRatio}</span>
                    )}
                    {selectedType === 'custom-size' && customWidth && customHeight && (
                        <span className="text-[9px] text-emerald-500 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded">{customWidth}×{customHeight}px</span>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-1">
                    {creativeTypes.map(ct => (
                        <button key={ct.id} onClick={() => setSelectedType(ct.id)}
                            className={`studio-btn-pill flex items-center gap-1.5 ${selectedType === ct.id ? 'active' : ''}`}>
                            <span className="material-symbols-outlined text-xs">{ct.icon}</span>
                            <span className="truncate">{ct.label}</span>
                        </button>
                    ))}
                </div>

                {/* ── Custom Size Inputs ── */}
                {selectedType === 'custom-size' && (
                    <div className="studio-card mt-2 p-3">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="material-symbols-outlined text-xs text-[var(--sys-primary)]">straighten</span>
                            <span className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">Custom Dimensions (px)</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <input type="number" value={customWidth} onChange={e => setCustomWidth(e.target.value)}
                                placeholder="Width" min="100" max="4096"
                                className="studio-input-glass text-center" />
                            <span className="text-[var(--sys-text-muted)] text-xs font-bold">×</span>
                            <input type="number" value={customHeight} onChange={e => setCustomHeight(e.target.value)}
                                placeholder="Height" min="100" max="4096"
                                className="studio-input-glass text-center" />
                        </div>
                        {customWidth && customHeight && (() => {
                            const w = parseInt(customWidth), h = parseInt(customHeight)
                            if (!w || !h) return null
                            const r = w / h
                            const totalPx = w * h
                            const isExtreme = r > 3 || r < 0.33
                            return (
                                <div className="mt-2 space-y-1">
                                    <p className="text-[10px] text-[var(--sys-text-muted)] flex items-center gap-1">
                                        Ratio: <span className="text-[var(--sys-text)] font-mono">{(r).toFixed(2)}:1</span>
                                        <span className="text-[var(--sys-text-muted)]">·</span>
                                        <span className="text-[var(--sys-text-muted)]">{(totalPx / 1000000).toFixed(1)}MP</span>
                                    </p>
                                    {isExtreme && (
                                        <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[11px]">warning</span>
                                            Extreme ratio — AI will generate at nearest safe ratio, then smart-resize
                                        </p>
                                    )}
                                    {totalPx > 4194304 && (
                                        <p className="text-[10px] text-amber-400/80 flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[11px]">memory</span>
                                            Over 4MP — image will be generated smaller then AI-upscaled
                                        </p>
                                    )}
                                </div>
                            )
                        })()}
                    </div>
                )}
            </div>

            {/* ── References Row ── */}
            <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-widest font-bold">References</span>
                    <span className="text-[9px] text-[var(--sys-text-muted)]">Style guide for the image</span>
                </div>
                <div className="flex items-center gap-2">
                    {/* Style Ref */}
                    {referenceImages.style ? (
                        <div className="relative flex-shrink-0 group">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--sys-border)]">
                                <img src={referenceImages.style} alt="Style" className="w-full h-full object-cover" />
                            </div>
                            <button onClick={() => setReferenceImages(prev => ({ ...prev, style: null }))}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--sys-primary)] text-white text-[8px] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                        </div>
                    ) : (
                        <button onClick={() => { setRefPickerSlot('style'); setRefPickerTab('upload') }}
                            className="studio-drop-zone group" title="Add style reference">
                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)]">brush</span>
                            <span className="text-[7px] text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)] font-bold leading-none">Style</span>
                        </button>
                    )}

                    {/* Characters */}
                    {characters.map((char, idx) => (
                        <div key={idx} className="relative flex-shrink-0 group">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--sys-border)]">
                                <img src={char.image} alt={char.name} className="w-full h-full object-cover" />
                            </div>
                            <button onClick={() => setCharacters(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-[var(--sys-text)] text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">×</button>
                            <input
                                value={char.name}
                                onChange={e => setCharacters(prev => prev.map((c, i) => i === idx ? { ...c, name: e.target.value } : c))}
                                className="w-10 mt-0.5 text-[7px] text-center bg-transparent text-violet-300 outline-none font-bold truncate"
                                placeholder="Name"
                            />
                        </div>
                    ))}
                    {characters.length < 5 && (
                        <button onClick={() => { setRefPickerSlot(`character-${characters.length}`); setRefPickerTab('upload') }}
                            className="studio-drop-zone group" title="Add character">
                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)]">person_add</span>
                            <span className="text-[7px] text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)] font-bold leading-none">Person</span>
                        </button>
                    )}

                    {/* Upload Ref */}
                    {referenceImages.upload ? (
                        <div className="relative flex-shrink-0 group">
                            <div className="w-10 h-10 rounded-lg overflow-hidden border border-[var(--sys-border)]">
                                <img src={referenceImages.upload} alt="Ref" className="w-full h-full object-cover" />
                            </div>
                            <button onClick={() => setReferenceImages(prev => ({ ...prev, upload: null }))}
                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--sys-primary)] text-white text-[8px] flex items-center justify-center cursor-pointer z-10 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                            <button onClick={() => { setCharacters(prev => [...prev, { name: `Character ${prev.length + 1}`, image: referenceImages.upload }]); setReferenceImages(prev => ({ ...prev, upload: null })) }}
                                className="absolute -bottom-1 -left-1 w-4 h-4 rounded-full bg-[var(--sys-primary)] text-white text-[8px] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-10" title="Use as Character">
                                <span className="material-symbols-outlined text-[8px]">person_add</span>
                            </button>
                        </div>
                    ) : (
                        <button onClick={() => { setRefPickerSlot('upload'); setRefPickerTab('upload') }}
                            className="studio-drop-zone group" title="Upload reference image">
                            <span className="material-symbols-outlined text-sm text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)]">add_photo_alternate</span>
                            <span className="text-[7px] text-[var(--sys-text-muted)] group-hover:text-[var(--sys-primary)] font-bold leading-none">Upload</span>
                        </button>
                    )}
                </div>
            </div>
            {characters.length > 0 && (
                <p className="text-[9px] text-violet-400/50 mb-2 -mt-1 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[10px]">info</span>
                    Type <span className="font-bold text-violet-400">@name</span> in prompt to tag characters
                </p>
            )}

            {/* ── Camera Shot Presets ── */}
            <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-[var(--sys-text-muted)] uppercase tracking-widest font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[11px]">movie</span>
                        Camera Shot
                    </span>
                    {selectedShot && (
                        <button onClick={() => setSelectedShot(null)}
                            className="text-[9px] text-[var(--sys-text-muted)] hover:text-rose-400 transition-colors cursor-pointer flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[10px]">close</span> Clear
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-3 gap-1">
                    {CAMERA_SHOT_PRESETS.map(shot => (
                        <button key={shot.id}
                            onClick={() => setSelectedShot(prev => prev === shot.id ? null : shot.id)}
                            title={shot.description}
                            className={`studio-btn-pill flex flex-col items-center gap-0.5 group ${selectedShot === shot.id ? 'active' : ''}`}
                        >
                            <span className="text-base leading-none">{shot.emoji}</span>
                            <span className="leading-tight text-center">{shot.label}</span>
                            {selectedShot === shot.id && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center bg-[var(--sys-primary)] shadow-sm">
                                    <span className="material-symbols-outlined text-white" style={{ fontSize: '8px' }}>check</span>
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Add Text to Image Toggle ── */}
            <div className={`studio-card mb-3 transition-all ${generateCopy ? 'border-[var(--sys-primary)] bg-[var(--sys-primary-dim)]' : ''}`}>
                <div className="flex items-center justify-between px-3 py-2">
                    <div className="flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${generateCopy ? 'bg-[var(--sys-primary)]/10' : 'bg-[var(--sys-surface)]'}`}>
                            <span className={`material-symbols-outlined text-sm ${generateCopy ? 'text-[var(--sys-primary)]' : 'text-[var(--sys-text-muted)]'}`}>title</span>
                        </div>
                        <div>
                            <p className="text-xs font-bold text-[var(--sys-text)] leading-tight">Add Text to Image</p>
                            <p className="text-[10px] text-[var(--sys-text-muted)] leading-tight truncate max-w-[150px]">
                                {!generateCopy && 'AI generates headline + CTA printed on the image'}
                                {generateCopy && copyLoading && 'Reading brief...'}
                                {generateCopy && !copyLoading && customHeadline && `"${customHeadline}"`}
                            </p>
                        </div>
                    </div>
                    <div onClick={() => setGenerateCopy(!generateCopy)}
                        className={`studio-toggle ${generateCopy ? 'active' : 'inactive'}`}>
                        <div className="studio-toggle-knob shadow-sm" />
                    </div>
                </div>

                {generateCopy && (
                    <div className="px-3 pb-3 border-t border-[var(--sys-border)] pt-2.5 space-y-2">
                        <div className="flex items-center justify-between">
                            {copyLoading ? (
                                <span className="flex items-center gap-1.5 text-[10px] text-[var(--sys-primary)] animate-studio-pulse">
                                    Agent is reading your brief...
                                </span>
                            ) : copyIsAiSuggested ? (
                                <span className="flex items-center gap-1 text-[10px] text-[var(--sys-primary)]">
                                    <span className="material-symbols-outlined text-[9px]">auto_awesome</span>
                                    AI suggested — edit freely
                                </span>
                            ) : (
                                <span className="text-[10px] text-[var(--sys-text-muted)]">Type your brief below</span>
                            )}
                            {!copyLoading && prompt?.trim().length > 5 && (
                                <button onClick={() => suggestCopy(prompt)}
                                    className="flex items-center gap-0.5 text-[10px] text-[var(--sys-text-muted)] hover:text-violet-400 transition-colors cursor-pointer">
                                    <span className="material-symbols-outlined text-[10px]">refresh</span>
                                    Regenerate
                                </button>
                            )}
                        </div>
                        <input
                            type="text"
                            value={customHeadline}
                            onChange={e => { setCustomHeadline(e.target.value); setCopyIsAiSuggested(false) }}
                            maxLength={40}
                            placeholder="Headline (AI will generate from brief)"
                            className="studio-input-glass"
                        />
                        <input
                            type="text"
                            value={customCtaText}
                            onChange={e => { setCustomCtaText(e.target.value); setCopyIsAiSuggested(false) }}
                            maxLength={20}
                            placeholder="CTA button (e.g. Shop Now)"
                            className="studio-input-glass"
                        />
                        {copyRationale && !copyLoading && (
                            <p className="text-[9px] text-[var(--sys-text-muted)] italic flex items-start gap-1 pt-0.5">
                                <span className="material-symbols-outlined text-[9px] mt-[1px] flex-shrink-0">lightbulb</span>
                                {copyRationale}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* ── Prompt Area ── */}
            <div className="relative mb-3">
                <PromptArea
                    value={prompt}
                    onChange={val => {
                        setPrompt(val)
                        const textarea = promptTextareaRef.current
                        if (textarea) {
                            const cursor = textarea.selectionStart
                            const textBefore = val.substring(0, cursor)
                            const atMatch = textBefore.match(/@(\w*)$/)
                            if (atMatch && (characters.length > 0 || referenceImages.upload)) {
                                setShowCharTags(true)
                                setCharTagFilter(atMatch[1].toLowerCase())
                            } else {
                                setShowCharTags(false)
                            }
                        }
                    }}
                    onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey && !showCharTags) { e.preventDefault(); handleGenerate() }
                        if (e.key === 'Escape') setShowCharTags(false)
                    }}
                    placeholder={activeBrand
                        ? `Describe your visual for ${activeBrand.name}...`
                        : "Create a brand first to start generating visuals"}
                    disabled={!activeBrand || activeGenerations.length >= 3}
                    textareaRef={promptTextareaRef}
                />

                {/* @character dropdown */}
                {showCharTags && (characters.length > 0 || referenceImages.upload || referenceImages.style) && (
                    <div className="absolute left-4 bottom-full mb-1 bg-[var(--sys-bg)] border border-[var(--sys-border)] rounded-xl shadow-2xl p-2 z-50 min-w-[200px]">
                        {(() => {
                            const tagOptions = [...characters];
                            if (referenceImages.upload) tagOptions.push({ name: 'Reference', image: referenceImages.upload });
                            if (referenceImages.style) tagOptions.push({ name: 'Style', image: referenceImages.style });
                            return tagOptions.filter(c => !charTagFilter || c.name.toLowerCase().includes(charTagFilter)).map((char, idx) => (
                                <button key={idx} onClick={() => {
                                    const textarea = promptTextareaRef.current
                                    if (!textarea) return
                                    const cursor = textarea.selectionStart
                                    const textBefore = prompt.substring(0, cursor)
                                    const textAfter = prompt.substring(cursor)
                                    const tagName = char.name.replace(/\s/g, '')
                                    const newBefore = textBefore.replace(/@\w*$/, `@${tagName} `)
                                    setPrompt(newBefore + textAfter)
                                    setShowCharTags(false)
                                    setTimeout(() => { textarea.focus(); textarea.selectionStart = textarea.selectionEnd = newBefore.length }, 50)
                                }} className="flex items-center gap-2 w-full px-2 py-1.5 rounded-lg hover:bg-violet-500/15 text-left transition-colors">
                                    <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-black/20">
                                        <img src={char.image} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <div>
                                        <span className="text-xs font-bold text-[var(--sys-text)]">{char.name}</span>
                                        <span className="text-[10px] text-violet-400 ml-1.5">@{char.name.replace(/\s/g, '')}</span>
                                    </div>
                                </button>
                            ));
                        })()}
                    </div>
                )}

                <div className="absolute right-3 top-3">
                    <VoiceInput onResult={(text) => setPrompt(prev => prev ? prev + ' ' + text : text)} size="small" />
                </div>

                <div className="absolute left-2 right-2 bottom-2 flex items-center gap-1.5 pointer-events-none">
                    {prompt.trim() && (
                        <CreditTooltipWrapper action="promptEnhance">
                            <button onClick={handleEnhancePrompt} disabled={enhancing || !activeBrand}
                                className={`pointer-events-auto studio-btn-pill py-1 px-2.5 text-[10px] ${enhancing ? 'active' : ''}`}>
                                <span className={`material-symbols-outlined text-xs ${enhancing ? 'animate-spin' : ''}`}>{enhancing ? 'progress_activity' : 'auto_awesome'}</span>
                                {enhancing ? 'Enhancing...' : 'Enhance'}
                            </button>
                        </CreditTooltipWrapper>
                    )}
                </div>
            </div>

            {/* ── Action Row ── */}
            <div className="space-y-2">
                <div className="relative">
                    <button onClick={() => setShowModelMenu(!showModelMenu)}
                        className="flex items-center gap-2 w-full px-3 py-2 rounded-xl text-[11px] font-bold bg-[var(--sys-surface)] text-[var(--sys-text)] border border-[var(--sys-border)] hover:border-[var(--sys-border)] cursor-pointer transition-all">
                        <span className="material-symbols-outlined text-xs" style={{ color: IMAGE_MODELS.find(m => m.id === imageModel)?.color || '#a855f7' }}>
                            {IMAGE_MODELS.find(m => m.id === imageModel)?.icon || 'auto_awesome'}
                        </span>
                        <span>{IMAGE_MODELS.find(m => m.id === imageModel)?.name || 'NanoBanana 2'}</span>
                        <span className="material-symbols-outlined text-[10px] ml-auto">{showModelMenu ? 'expand_less' : 'expand_more'}</span>
                    </button>
                    {showModelMenu && (
                        <div className="absolute left-0 right-0 bottom-full mb-1 bg-[var(--sys-bg)]/95 backdrop-blur-xl border border-[var(--sys-border)] rounded-xl shadow-2xl z-50 p-1.5 space-y-0.5">
                            {IMAGE_MODELS.map(m => (
                                <button key={m.id} onClick={() => { setImageModel(m.id); setShowModelMenu(false) }}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-all ${imageModel === m.id ? 'bg-[var(--sys-surface)] text-[var(--sys-text)]' : 'text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)]'}`}>
                                    <span className="material-symbols-outlined text-sm" style={{ color: m.color }}>{m.icon}</span>
                                    <div className="flex-1 min-w-0">
                                        <span className="text-[11px] font-bold truncate block">{m.name}</span>
                                        <span className="text-[9px] text-[var(--sys-text-muted)] truncate block">{m.desc}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <CreditTooltipWrapper action="creative">
                        <button onClick={handleGenerate} disabled={!prompt.trim() || !activeBrand || activeGenerations.length >= 3}
                            className="studio-btn-primary flex-1">
                            {activeGenerations.length > 0 ? (
                                <><span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> Generating...</>
                            ) : (
                                <><span className="material-symbols-outlined text-sm">auto_awesome</span> Generate <CreditBadge action="creative" /></>
                            )}
                        </button>
                    </CreditTooltipWrapper>
                    <button onClick={() => setShowAdvanced(!showAdvanced)} className={`studio-action-btn-sm ${showAdvanced ? 'active' : ''}`}>
                        <span className="material-symbols-outlined text-sm">tune</span>
                    </button>
                    <button onClick={() => {
                        if (activeBrand?._id) {
                            productsAPI.list({ brandId: activeBrand._id, limit: 50 })
                                .then(res => setProductsList(res.products || []))
                        }
                        setShowProductPicker(true)
                    }} className="studio-action-btn-sm">
                        <span className="material-symbols-outlined text-sm">inventory_2</span>
                    </button>
                </div>
            </div>

            {/* ── Advanced Drawer ── */}
            {showAdvanced && (
                <div className="studio-card p-5 mt-4 space-y-4 animate-fade-in">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-[var(--sys-text)]">Advanced Options</p>
                        <button onClick={() => setShowAdvanced(false)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer"><span className="material-symbols-outlined text-sm">close</span></button>
                    </div>
                    <div className="flex items-center justify-between py-2 border-b border-[var(--sys-border)]">
                        <p className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider">AI Quality</p>
                        <div className="flex gap-1 bg-[var(--sys-bg)] rounded-lg p-0.5">
                            {['fast', 'quality'].map(q => (
                                <button key={q} onClick={() => setAgenticQuality(q)} className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${agenticQuality === q ? 'bg-[var(--sys-primary)] text-white shadow-sm' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`}>
                                    {q.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-[10px] text-[var(--sys-text-muted)] font-bold uppercase tracking-wider mb-2">Style Preset</p>
                        <div className="flex flex-wrap gap-1.5">
                            {styles.map(s => (
                                <button key={s.id} onClick={() => setStyle(s.id)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${style === s.id ? 'bg-[var(--sys-text)] text-[var(--sys-bg)] border-[var(--sys-text)]' : 'bg-[var(--sys-surface)] text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] border-[var(--sys-border)]'}`}>
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Inline Template Form ── */}
            {activeQuickTemplate && (
                <div className="studio-card p-4 mt-4 border border-[var(--sys-border)] animate-fade-in">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-bold text-[var(--sys-text)]">{activeQuickTemplate.label}</h4>
                        <button onClick={() => setActiveQuickTemplate(null)} className="text-[var(--sys-text-muted)] hover:text-[var(--sys-text)] cursor-pointer shadow"><span className="material-symbols-outlined text-sm">close</span></button>
                    </div>
                    <div className="space-y-3">
                        {activeQuickTemplate.fields?.filter(f => f.type !== 'image').map(field => (
                            <div key={field.key}>
                                <label className="text-[10px] font-bold text-[var(--sys-text-muted)] mb-1 block">{field.label}</label>
                                <input value={templateFields[field.key] || ''} onChange={e => setTemplateFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                                    placeholder={field.placeholder} className="input-glass w-full py-2 text-xs border border-[var(--sys-border)]" />
                            </div>
                        ))}
                        <button onClick={() => {
                            const built = activeQuickTemplate.buildPrompt(activeBrand, templateFields)
                            setPrompt(built)
                            setActiveQuickTemplate(null)
                        }} className="studio-btn-primary w-full py-2 text-xs">
                            Apply to Prompt
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default CreateToolsPanel;
