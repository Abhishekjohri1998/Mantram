const fs = require('fs');

let content = fs.readFileSync('scratch_advancedmode.jsx', 'utf8');

// 1. Replace the CSS block
const cssRegex = /const css = `[\s\S]*?`\s*function ConfigDropdown/m;
const newCss = `const css = \`
/* Layout */
.vm-layout { position: relative; min-height: calc(100vh - 120px); display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 24px; overflow: hidden; align-items: center; }

/* Background Grid */
.vm-bg-grid { position: absolute; inset: -20px; z-index: 0; display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: minmax(180px, auto); gap: 8px; pointer-events: none; opacity: 0.9; }
@media(max-width: 1024px) { .vm-bg-grid { grid-template-columns: repeat(3, 1fr); } }
@media(max-width: 768px) { .vm-bg-grid { grid-template-columns: repeat(2, 1fr); } }
.vm-bg-item { width: 100%; height: 100%; object-fit: cover; border-radius: 8px; opacity: 0.6; transition: opacity .3s, transform .5s; position: relative; overflow: hidden; pointer-events: auto; }
.vm-bg-item video { width: 100%; height: 100%; object-fit: cover; }
.vm-bg-item:hover { opacity: 1; transform: scale(1.02); z-index: 2; }
.vm-bg-overlay { position: absolute; inset: 0; z-index: 1; pointer-events: none; background: linear-gradient(to top, var(--sys-surface) 5%, transparent 50%, var(--sys-surface) 95%); }

/* Director Panel (Floating Card) */
.vm-card { width: 95%; max-width: 900px; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; padding: 0; backdrop-filter: blur(30px); box-shadow: 0 30px 60px rgba(0,0,0,0.2); z-index: 10; display: flex; flex-direction: column; color: var(--sys-text); overflow: visible; font-family: 'Inter', sans-serif; }

/* Panel Header */
.vm-card-header { padding: 12px 20px; border-bottom: 1px solid var(--sys-border); display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 13px; color: var(--sys-text); border-radius: 20px 20px 0 0; background: rgba(0,0,0,0.1); }
.vm-card-header .drag-handle { width: 30px; height: 4px; border-radius: 2px; background: var(--sys-border); margin: 0 auto; position: absolute; left: 50%; transform: translateX(-50%); }

/* Modes */
.vm-modes { display: flex; border-bottom: 1px solid var(--sys-border); }
.vm-mode-btn { flex: 1; padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: var(--sys-text-muted); cursor: pointer; border: none; background: none; transition: all .2s; }
.vm-mode-btn:hover { color: var(--sys-text); background: rgba(255,255,255,0.02); }
.vm-mode-btn.active { color: var(--sys-text); background: rgba(255, 77, 0,0.08); border-bottom: 2px solid var(--sys-primary); }

/* Upper Controls (Sliders & Thumbnails) */
.vm-upper-controls { padding: 16px 24px; display: flex; gap: 16px; border-bottom: 1px solid var(--sys-border); align-items: stretch; flex-wrap: wrap; }
.vm-thumb-box { width: 44px; height: 44px; border-radius: 12px; border: 1px dashed var(--sys-border); background: rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center; cursor: pointer; position: relative; overflow: hidden; transition: all .2s; }
.vm-thumb-box:hover { border-color: var(--sys-primary); background: rgba(0,0,0,0.2); }
.vm-thumb-box img { width: 100%; height: 100%; object-fit: cover; }
.vm-slider-wrap { flex: 1; min-width: 200px; display: flex; flex-direction: column; justify-content: center; background: rgba(0,0,0,0.1); border: 1px solid var(--sys-border); border-radius: 12px; padding: 6px 16px; }
.vm-slider-top { display: flex; justify-content: space-between; font-size: 11px; color: var(--sys-text-muted); margin-bottom: 6px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
.vm-slider-track { width: 100%; height: 4px; border-radius: 2px; background: var(--sys-border); position: relative; }
.vm-slider-knob { width: 12px; height: 12px; border-radius: 50%; background: #06b6d4; position: absolute; top: -4px; left: 50%; transform: translateX(-50%); box-shadow: 0 0 10px rgba(6,182,212,0.5); }
.vm-slider-dots { position: absolute; width: 100%; display: flex; justify-content: space-between; top: -1px; }
.vm-slider-dot { width: 6px; height: 6px; border-radius: 50%; background: rgba(255,255,255,0.2); }

/* Prompt area */
.vm-prompt { padding: 16px 24px 0; position: relative; flex: 1; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: none; color: var(--sys-text); font-size: 15px; line-height: 1.6; font-family: inherit; min-height: 100px; font-weight: 500; }
.vm-textarea::placeholder { color: var(--sys-text-muted); font-weight: 400; opacity: 0.6; }

/* Config Modules */
.vm-config { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 24px; }
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 6px 10px; border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); transition: all .15s; }
.vm-config-trigger:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.02); }
.vm-config-menu { position: absolute; bottom: calc(100% + 6px); left: 0; min-width: 140px; max-height: 220px; overflow-y: auto; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 12px; padding: 4px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-config-opt { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px; border: none; background: transparent; color: var(--sys-text); font-size: 12px; font-weight: 500; cursor: pointer; border-radius: 8px; text-align: left; transition: all .12s; }
.vm-config-opt:hover { background: rgba(255,255,255,0.05); }

/* Bottom Bar */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--sys-border); background: rgba(0,0,0,0.1); border-radius: 0 0 20px 20px; }
.vm-bottom-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
.vm-bottom-left .vm-config-trigger { background: transparent; border: 1px solid transparent; }
.vm-bottom-left .vm-config-trigger:hover { background: rgba(255,255,255,0.05); border-color: var(--sys-border); }
.vm-btn-icon-label { display: flex; align-items: center; gap: 4px; padding: 6px 10px; background: transparent; border: none; color: var(--sys-text-muted); cursor: pointer; font-size: 12px; font-weight: 600; border-radius: 8px; transition: 0.2s; }
.vm-btn-icon-label:hover { color: var(--sys-text); background: rgba(255,255,255,0.05); }

.vm-generate { padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; color: #111; background: #eab308; box-shadow: 0 0 20px rgba(234,179,8,0.3); transition: all .2s; flex-shrink: 0; }
.vm-generate:hover { transform: translateY(-1px); box-shadow: 0 0 25px rgba(234,179,8,0.5); background: #fde047; }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Status overlays */
.vm-gen-card { max-width: 600px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); margin: 0 auto; }
.vm-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: var(--sys-surface); }
.vm-gen-preview img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.4; }
.vm-gen-info { padding: 20px 24px; color: var(--sys-text); }
.vm-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: var(--sys-border); overflow: hidden; }
.vm-progress-fill { height: 100%; border-radius: 3px; background: #eab308; transition: width 1s ease; }

.vm-done-card { max-width: 800px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; margin: 0 auto 20px auto; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
.vm-done-card video { width: 100%; display: block; }
.vm-done-btns { display: flex; gap: 12px; max-width: 800px; margin: 0 auto; flex-wrap: wrap; z-index: 20; position: relative; }
.vm-btn-sec { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); transition: all .15s; backdrop-filter: blur(10px); }
.vm-btn-sec:hover { background: rgba(255,255,255,0.05); }
.vm-btn-pri { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: none; background: #eab308; color: #111; transition: all .15s; }
.vm-btn-pri:hover { transform: translateY(-1px); background: #fde047; }

/* Extend */
.vm-extend { padding: 16px; border-radius: 14px; background: rgba(255, 77, 0,0.05); border: 1px solid rgba(255, 77, 0,0.18); margin-top: 16px; max-width: 680px; margin-left: auto; margin-right: auto; z-index: 20; position: relative; }
.vm-extend h4 { font-size: 13px; font-weight: 700; color: #c4b5fd; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
.vm-extend-row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.vm-extend-input { flex: 1; min-width: 160px; padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.08); background: rgba(0,0,0,0.2); color: #e2e8f0; font-size: 13px; }
.vm-btn-extend { padding: 10px 16px; border-radius: 10px; border: none; background: linear-gradient(135deg, #7c3aed, #06b6d4); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; }

/* Autocomplete & Library */
.vm-autocomplete { position: absolute; bottom: 100%; left: 24px; right: 24px; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 12px; padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 20; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-ac-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-ac-item:hover { border-color: var(--sys-primary); background: rgba(255,255,255,0.05); }

.vm-library { margin: 0 24px 16px; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 14px; padding: 14px; color: var(--sys-text);  position: absolute; bottom: 100%; max-width: calc(100% - 48px); z-index: 100; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-library-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.vm-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.vm-library-grid img:hover { border-color: #eab308; }

@keyframes vm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.vm-spin { animation: vm-spin 1s linear infinite; }
\`;
function ConfigDropdown`;
content = content.replace(cssRegex, newCss);

// 2. Add projects prop
content = content.replace(
  /export default function AdvancedMode\(\{ activeBrand, initialData \}\) \{/,
  `export default function AdvancedMode({ activeBrand, initialData, projects = [] }) {
    const bgProjects = projects.filter(p => (p.status === 'done' || p.status === 'critique') && p.generation?.videoUrl).slice(0, 8);`
);

// 3. Replace the rendering of <div className="vm-layout">
const oldLayoutStart = /\{\/\* ══════════ COMPOSE — Floating Card at Bottom ══════════ \*\/\}/;
const backgroundRender = `
            {/* Background Grid */}
            <div className="vm-bg-grid">
                 {bgProjects.map((p, i) => (
                      <div key={p._id || i} className="vm-bg-item">
                           <video 
                               src={\`\${API_BASE}/video-studio/\${p._id}/video#t=1\`} 
                               muted loop playsInline crossOrigin="anonymous"
                               onMouseOver={e => e.target.play()}
                               onMouseOut={e => { e.target.pause(); e.target.currentTime = 1; }}
                           />
                      </div>
                 ))}
                 {[...Array(Math.max(0, 8 - bgProjects.length))].map((_, i) => (
                      <div key={\`empty-\${i}\`} className="vm-bg-item" style={{ background: 'rgba(0,0,0,0.05)', border: '1px dashed var(--sys-border)' }} />
                 ))}
            </div>
            <div className="vm-bg-overlay" />

            {/* ══════════ COMPOSE — Floating Card at Bottom ══════════ */}`;

content = content.replace(oldLayoutStart, backgroundRender);

// Replace the vm-card layout 
const cardRegex = /<div className="vm-card">[\s\S]*?(?=<\/div>\s*<\/div>\s*<\/div>\s*\)\}\s*<\/>)/;

const newCard = `<div className="vm-card">
                            {/* Panel Header */}
                            <div className="vm-card-header">
                                <div style={{width: 60}}></div>
                                <div className="drag-handle"></div>
                                <span style={{display: 'flex', alignItems: 'center', gap: 6}}>
                                    <span className="material-symbols-outlined" style={{fontSize: 16}}>movie_creation</span> Director Panel
                                </span>
                                <div style={{display: 'flex', gap: 12}}>
                                    <button style={{background: 'none', border: 'none', color: videoMode === 't2v' ? 'var(--sys-text)' : 'var(--sys-text-muted)', cursor: 'pointer', transition: '0.2s'}} onClick={() => setVideoMode('t2v')} title="Text to Video">
                                        <span className="material-symbols-outlined" style={{fontSize: 18}}>text_fields</span>
                                    </button>
                                    <button style={{background: 'none', border: 'none', color: videoMode === 'i2v' ? 'var(--sys-text)' : 'var(--sys-text-muted)', cursor: 'pointer', transition: '0.2s'}} onClick={() => setVideoMode('i2v')} title="Image to Video">
                                        <span className="material-symbols-outlined" style={{fontSize: 18}}>image</span>
                                    </button>
                                </div>
                            </div>
                            
                            {/* Upper Controls */}
                            <div className="vm-upper-controls">
                                <div className="vm-thumb-box" onClick={() => videoMode === 'i2v' ? (!i2vImage && i2vRef.current?.click()) : firstFrameRef.current?.click()} title={videoMode === 'i2v' ? "Upload Image to Animate" : "Start Frame"}>
                                    {(videoMode === 'i2v' && i2vImage) ? <img src={i2vImage.url} alt=""/> : (firstFrame ? <img src={firstFrame.url} alt=""/> : <span className="material-symbols-outlined" style={{fontSize: 20, color: 'var(--sys-text-muted)'}}>add_photo_alternate</span>)}
                                </div>
                                <input ref={i2vRef} type="file" accept="image/*" onChange={onI2VFile} style={{ display: 'none' }} />
                                
                                {/* Dummy Sliders (Visual Match) */}
                                <div className="vm-slider-wrap">
                                    <div className="vm-slider-top"><span>Movement</span> <span style={{color: 'var(--sys-text)'}}>Auto</span></div>
                                    <div className="vm-slider-track">
                                        <div className="vm-slider-knob"></div>
                                        <div className="vm-slider-dots">
                                            {[...Array(5)].map((_,i) => <div key={i} className="vm-slider-dot"/>)}
                                        </div>
                                    </div>
                                </div>
                                <div className="vm-slider-wrap">
                                    <div className="vm-slider-top"><span>Speed Ramp</span> <span style={{color: 'var(--sys-text)'}}>Auto</span></div>
                                    <div className="vm-slider-track">
                                        <div className="vm-slider-knob"></div>
                                    </div>
                                </div>
                                <div className="vm-slider-wrap" style={{flex: '0 0 auto', minWidth: 90}}>
                                     <div className="vm-slider-top"><span>Duration</span></div>
                                     <div style={{color: 'var(--sys-text)', fontSize: 13, fontWeight: 700, textAlign: 'center'}}>{duration}s</div>
                                </div>
                            </div>

                            {/* Prompt area */}
                            <div className="vm-prompt">
                                <textarea
                                    ref={promptRef}
                                    className="vm-textarea"
                                    value={prompt}
                                    onChange={handlePromptChange}
                                    placeholder={videoMode === 'i2v'
                                        ? 'Describe the motion... e.g. "Camera slowly zooms in, product rotates 360°"'
                                        : activeBrand?.name
                                            ? \`What's your \${activeBrand.name} ad about? Type @ to tag assets...\`
                                            : 'What\\'s your ad about? Type @ to tag images, video, audio...'}
                                />
                                {/* @ Autocomplete popup */}
                                {showAutocomplete && acItems.length > 0 && (
                                    <div className="vm-autocomplete">
                                        {acItems.map(item => (
                                            <button key={item.tag} className="vm-ac-item" onClick={() => insertTag(item.tag)}>
                                                {item.thumb ? <img src={item.thumb} alt="" /> : <span className="icon"><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{item.msIcon || 'attach_file'}</span></span>}
                                                <span>{item.tag}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                
                                {/* Library Modal (inline floating) */}
                                {showLibrary && (
                                    <div className="vm-library">
                                        <div className="vm-library-head">
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span className="material-symbols-outlined" style={{ fontSize: '16px' }}>photo_library</span> Image Library</span>
                                            <button onClick={() => setShowLibrary(false)} style={{background: 'none', border: 'none', color: 'var(--sys-text-muted)', cursor: 'pointer'}}>
                                                <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
                                            </button>
                                        </div>
                                        {libraryLoading ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>Loading...</p>
                                            : libraryImages.length === 0 ? <p style={{ fontSize: '12px', color: 'var(--sys-text-muted)', textAlign: 'center', padding: '12px 0' }}>No images yet</p>
                                                : <div className="vm-library-grid">{libraryImages.map((img, i) => <img key={i} src={img.url || img.imageUrl} alt="" onClick={() => pickFromLibrary(img)} />)}</div>
                                        }
                                    </div>
                                )}
                            </div>

                            {/* Tags (if any exist) */}
                            {allTags.length > 0 && (
                                <div style={{padding: '0 24px 10px', display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                                    {allTags.map(tag => (
                                        <div key={tag.id} className="vm-tag">
                                            {tag.thumb && <img src={tag.thumb} alt="" style={{width: 16, height: 16, borderRadius: 4, objectFit: 'cover'}} />}
                                            <span>{tag.label}</span>
                                            <button style={{background: 'none', border: 'none', color: 'var(--sys-text-muted)', padding: 0, marginLeft: 4, cursor: 'pointer', fontSize: 14}} onClick={() => removeTag(tag)}>×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            {/* Hidden file inputs */}
                            <input ref={firstFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setFirstFrame)} style={{ display: 'none' }} />
                            <input ref={lastFrameRef} type="file" accept="image/*" onChange={e => onFile(e, setLastFrame)} style={{ display: 'none' }} />
                            <input ref={refImgRef} type="file" accept="image/*" onChange={onRefFile} style={{ display: 'none' }} />
                            <input ref={refVideoRef} type="file" accept="video/*" onChange={e => onMediaFile(e, setRefVideo)} style={{ display: 'none' }} />
                            <input ref={refAudioRef} type="file" accept="audio/*" onChange={e => onMediaFile(e, setRefAudio)} style={{ display: 'none' }} />


                            {/* Bottom Bar Controls */}
                            <div className="vm-bottom">
                                <div className="vm-bottom-left">
                                    <ConfigDropdown
                                        value={model}
                                        onChange={setModel}
                                        options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))}
                                        label="Model"
                                    />
                                    <button className="vm-btn-icon-label" onClick={() => loadLibrary('ref')}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>photo_library</span> Ref
                                    </button>
                                    <button className="vm-btn-icon-label" style={{opacity: m.has.audio ? 1 : 0.5}}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>{m.has.audio ? 'volume_up' : 'volume_off'}</span> Audio
                                    </button>
                                    <ConfigDropdown
                                        value={aspectRatio}
                                        onChange={setAspectRatio}
                                        options={m.ratios.map(r => ({ value: r, label: r }))}
                                        label="Ratio"
                                    />
                                    <ConfigDropdown
                                        value={duration}
                                        onChange={setDuration}
                                        options={Array.from({ length: m.dur[1] - m.dur[0] + 1 }, (_, i) => m.dur[0] + i).map(d => ({ value: d, label: \`\${d}s\` }))}
                                        label="Duration"
                                    />
                                </div>

                                <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>
                                    <CreditTooltipWrapper action="promptEnhance">
                                        <button className="vm-btn-icon-label" onClick={handleEnhance} disabled={enhancing || !prompt.trim()} style={{color: 'var(--sys-primary)'}}>
                                            {enhancing ? <><span className="material-symbols-outlined vm-spin" style={{fontSize: 16}}>progress_activity</span></> : <><span className="material-symbols-outlined" style={{fontSize: 16}}>auto_awesome</span> Enhance</>}
                                        </button>
                                    </CreditTooltipWrapper>

                                    {videoMode === 'i2v' ? (
                                        <button className="vm-generate" onClick={handleI2VGenerate} disabled={loading || !i2vImage?.url}>
                                            {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 18 }}>progress_activity</span></>
                                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>animation</span> GENERATE <span style={{fontSize: 12, opacity: 0.6}}>· {credits}</span></>}
                                        </button>
                                    ) : (
                                        <button className="vm-generate" onClick={handleGenerate} disabled={loading || !prompt.trim()}>
                                            {loading ? <><span className="material-symbols-outlined vm-spin" style={{ fontSize: 18 }}>progress_activity</span></>
                                                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>movie_creation</span> GENERATE <span style={{fontSize: 12, opacity: 0.6}}>· {credits}</span></>}
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>`;

content = content.replace(cardRegex, newCard);

fs.writeFileSync('frontend/src/components/VideoStudio/AdvancedMode.jsx', content);
console.log('Patched correctly!');
