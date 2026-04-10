import re

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'r') as f:
    content = f.read()

# 1. Update opacity and transparent layer issues
content = re.sub(
    r'\.vm-bg-item \{(.*?opacity:\s*0\.4.*?)\}',
    lambda m: '.vm-bg-item {' + m.group(1).replace('opacity: 0.4;', 'opacity: 1.0;') + '}',
    content
)
content = re.sub(
    r'\.vm-bg-grid \{(.*?opacity:\s*0\.95.*?)\}',
    lambda m: '.vm-bg-grid {' + m.group(1).replace('opacity: 0.95;', 'opacity: 0.8;') + '}',
    content
)

# Fix background grid layout to expand to full height
# Remove the empty bg fade entirely
# Ensure flex layout pushes to bottom correctly by giving vm-studio-root min-height: 100vh instead of 100%
content = content.replace(
    ".vm-studio-root { position: relative; width: 100%; min-height: 100%; display: flex; flex-direction: column; }",
    ".vm-studio-root { position: relative; width: 100%; min-height: calc(100vh - 80px); display: flex; flex-direction: column; }"
)

# Optional: Fix configuration dropdown stacking (Top vs Bottom)
content = content.replace(
    ".vm-config-menu { position: absolute; bottom: calc(100% + 6px); left: 0;",
    ".vm-config-menu { position: absolute; bottom: calc(100% + 4px); left: 0; transform-origin: bottom left;"
)

# 2. Add Dynamic Options in JS models
old_models = r"const MODELS = \{(.*?)\}"
new_models = """const MODELS = {
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', dur: [5, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', dur: [3, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', dur: [5, 8], ratios: ['16:9', '9:16'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', dur: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', dur: [1, 15], ratios: ['16:9', '9:16', '1:1'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." },
}"""
content = re.sub(old_models, new_models, content, flags=re.DOTALL)

# 3. Apply Dynamic Render Logic into JSX Components
# Look for Upper Controls Block
upper_controls_regex = r'<div className="vm-upper-controls">[\s\S]*?(?=<\/div>\s*<div className="vm-prompt">)'
def replacement_logic(match):
    return """<div className="vm-upper-controls">
                                {/* DYNAMIC MODEL BANNER */}
                                <div style={{width: '100%', marginBottom: 12, paddingBottom: 12, borderBottom: '1px dashed var(--sys-border)', display: 'flex', gap: 6, alignItems: 'center'}}>
                                    <span style={{fontSize: 12, fontWeight: 700, color: 'var(--sys-primary)'}}>💡 {m.desc}</span>
                                    {videoMode === 'i2v' && <span style={{marginLeft: 'auto', fontSize: 11, background: 'rgba(255, 255, 255, 0.1)', padding: '4px 8px', borderRadius: 6, color: 'var(--sys-text)'}}>Image-to-Video Active</span>}
                                </div>

                                <div className="vm-thumb-group">
                                    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                        <div className="vm-thumb-box" onClick={() => videoMode === 'i2v' ? (!i2vImage && i2vRef.current?.click()) : firstFrameRef.current?.click()} title={videoMode === 'i2v' ? "Upload Image to Animate" : "Start Frame"}>
                                            {(videoMode === 'i2v' && i2vImage) ? <img src={i2vImage.url} alt=""/> : (firstFrame ? <img src={firstFrame.url} alt=""/> : <span className="material-symbols-outlined" style={{fontSize: 20, color: 'var(--sys-text-muted)'}}>image</span>)}
                                        </div>
                                        <span className="vm-thumb-label">Start</span>
                                    </div>
                                    
                                    {m.has.lastFrame && (
                                        <>
                                            <span className="material-symbols-outlined" style={{color: 'var(--sys-border)', fontSize: 16}}>arrow_forward</span>
                                            <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
                                                <div className="vm-thumb-box" onClick={() => lastFrameRef.current?.click()} title="End Frame (Optional)">
                                                    {lastFrame ? <img src={lastFrame.url} alt=""/> : <span className="material-symbols-outlined" style={{fontSize: 20, color: 'var(--sys-text-muted)'}}>image</span>}
                                                </div>
                                                <span className="vm-thumb-label">End</span>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {(m.has.refAudio || m.has.refVideo) && <div style={{width: 1, height: 32, background: 'var(--sys-border)', margin: '0 8px'}}></div>}

                                {m.has.refAudio && (
                                    <button className="vm-btn-icon-label" style={{opacity: refAudio ? 1 : 0.6}} onClick={() => refAudioRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>{refAudio ? 'audio_file' : 'music_note'}</span> {refAudio ? 'Audio Selected' : 'Add Audio'}
                                    </button>
                                )}
                                
                                {m.has.refVideo && (
                                    <button className="vm-btn-icon-label" style={{opacity: refVideo ? 1 : 0.6}} onClick={() => refVideoRef.current?.click()}>
                                        <span className="material-symbols-outlined" style={{fontSize: 16}}>video_library</span> {refVideo ? 'Ref Selected' : 'Add Ref Video'}
                                    </button>
                                )}

                                {m.has.quality && (
                                    <div className="vm-quality-group">
                                        <button className={`vm-quality-pill ${quality === 'fast' ? 'active' : ''}`} onClick={() => setQuality('fast')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>bolt</span> Fast</button>
                                        <button className={`vm-quality-pill ${quality === 'quality' ? 'active' : ''}`} onClick={() => setQuality('quality')}><span className="material-symbols-outlined" style={{ fontSize: '14px' }}>auto_awesome</span> Pro Quality</button>
                                    </div>
                                )}
                            </div>"""

content = re.sub(upper_controls_regex, replacement_logic, content)

# 4. Connect actual quality parameter to handleGenerate in AdvancedMode
content = re.sub(
    r'resolution: \'1080p\', aspectRatio',
    r'resolution: \'1080p\', aspectRatio, mode: m.has.quality ? quality : \'fast\'',
    content
)

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'w') as f:
    f.write(content)
