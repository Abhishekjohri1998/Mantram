import re

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'r') as f:
    c = f.read()

# 1. Update Models
old_models = r"const MODELS = \{[\s\S]*?\n\}"
new_models = """const MODELS = {
    'kling-3.0-o': { id: 'kling-3.0-o', name: 'Kling 3.O Omni', msIcon: 'all_inclusive', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true, multishot: true, refImages: true, refVideo: true, refAudio: true }, cost: 0.12, desc: "Ultimate cinematic omni-model. Supports multi-shot & native audio." },
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', durs: [5, 10, 15], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], res: ['1080p', '720p'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true, quality: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', durs: [5], ratios: ['16:9', '9:16'], res: ['1080p'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', durs: [5], ratios: ['16:9', '9:16', '1:1', '4:3'], res: ['720p'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', durs: [5, 15], ratios: ['16:9', '9:16', '1:1'], res: ['1080p'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." }
}"""
c = re.sub(old_models, new_models, c)

# 2. Swap 'Director Panel' for 'Scott Panel'
c = c.replace('Director Panel', 'Scott Panel')

# 3. Inject new Hooks for MultiShot and Modal
hooks_loc = "const [resolution, setResolution] = useState('1080p')"
hooks_new = hooks_loc + """
    const [shots, setShots] = useState([{ prompt: '' }])
    const [viewVideo, setViewVideo] = useState(null)
    const hlRef = useRef(null)"""
c = c.replace(hooks_loc, hooks_new)

# 4. Modify handleGenerate to include shots logic
generate_loc = r"prompt: prompt\.trim\(\), model, duration, resolution: resolution, aspectRatio, mode: m\.has\.quality \? quality : 'fast',"
generate_new = "prompt: m.has.multishot ? shots.map(s => s.prompt).join(' | ') : prompt.trim(), model, duration, resolution: resolution, aspectRatio, mode: m.has.quality ? quality : 'fast', shots: m.has.multishot ? shots : [],"
c = re.sub(generate_loc, generate_new, c)

# 4b. Also modify payload mapping logic to strip visual tags properly
# Not strictly required since backend matches text tags, but let's implement the Shadow DOM Highlighting!
prompt_regex = r'<textarea\s*ref=\{promptRef\}\s*className="vm-textarea"[\s\S]*?\/>'
prompt_repl = """
                                <div style={{ position: 'relative', width: '100%', minHeight: '90px' }}>
                                    <div 
                                        className="vm-textarea" 
                                        style={{ position: 'absolute', inset: 0, color: 'var(--sys-text)', pointerEvents: 'none', whiteSpace: 'pre-wrap', wordWrap: 'break-word', overflow: 'hidden' }}
                                        dangerouslySetInnerHTML={{ __html: (m.has.multishot ? shots[0].prompt : prompt).replace(/(@image\\d+|@video\\d+|@audio\\d+)/g, '<span style="color: var(--sys-primary)">$1</span>') }}
                                    />
                                    <textarea
                                        ref={promptRef}
                                        className="vm-textarea"
                                        value={m.has.multishot ? shots[0].prompt : prompt}
                                        onChange={e => {
                                            if (m.has.multishot) {
                                                const n = [...shots]; n[0].prompt = e.target.value; setShots(n);
                                            } else {
                                                handlePromptChange(e);
                                            }
                                        }}
                                        style={{ position: 'relative', background: 'transparent', color: 'transparent', caretColor: 'var(--sys-text)', WebkitTextFillColor: 'transparent' }}
                                        placeholder={videoMode === 'i2v'
                                            ? 'Describe the motion... e.g. "Camera slowly zooms in, product rotates 360°"'
                                            : activeBrand?.name
                                                ? `What's your ${activeBrand.name} ad about? Type @ to tag assets...`
                                                : `What's your ad about? Type @ to tag images, video, audio...`}
                                    />
                                </div>
                                
                                {m.has.multishot && (
                                    <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8}}>
                                        {shots.slice(1).map((s, idx) => (
                                            <div key={idx} style={{display: 'flex', gap: 8}}>
                                                <input className="vm-textarea" style={{minHeight: '40px', flex:1}} value={s.prompt} onChange={(e) => { const n = [...shots]; n[idx+1].prompt = e.target.value; setShots(n); }} placeholder={`Shot ${idx+2} Prompt`} />
                                                <button className="vm-config-trigger" style={{color:'var(--sys-error)'}} onClick={() => setShots(shots.filter((_, i) => i !== idx+1))}><span className="material-symbols-outlined">delete</span></button>
                                            </div>
                                        ))}
                                        {shots.length < 6 && <button className="vm-btn-icon-label" style={{alignSelf: 'flex-start'}} onClick={() => setShots([...shots, {prompt: ''}])}><span className="material-symbols-outlined" style={{fontSize:16}}>add</span> Add Shot</button>}
                                    </div>
                                )}
"""
c = re.sub(prompt_regex, prompt_repl, c)


# 5. Fix Cinematic Background Grid Interactions
bg_regex = r'<video src=\{p\.url\} autoPlay loop muted playsInline \/>'
bg_repl = '<video src={p.url} loop muted playsInline onMouseEnter={e => e.target.play()} onMouseLeave={e => e.target.pause()} />'
c = re.sub(bg_regex, bg_repl, c)

# Update Click on Project
onClick_regex = r'<div key=\{i\} className="vm-bg-item">'
onClick_repl = '<div key={i} className="vm-bg-item" onClick={() => setViewVideo(p)} style={{ cursor: \'pointer\' }}>'
c = re.sub(onClick_regex, onClick_repl, c)

# 6. Inject VideoReuseModal
modal_html = """
    if (viewVideo) {
        return (
            <div className="vm-layout" style={{background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', zIndex: 1000}}>
                <div style={{maxWidth: 1000, width: '100%', position: 'relative'}}>
                    <button style={{position: 'absolute', top: -40, right: 0, background: 'none', border: 'none', color: '#fff', cursor: 'pointer'}} onClick={() => setViewVideo(null)}><span className="material-symbols-outlined" style={{fontSize: 28}}>close</span></button>
                    <video src={viewVideo.url} controls autoPlay style={{width: '100%', borderRadius: 16, border: '1px solid var(--sys-border)'}} />
                    <div style={{display: 'flex', gap: 12, marginTop: 16, justifyContent: 'center'}}>
                        <button className="vm-generate" onClick={() => { setModel(viewVideo.model||'kling-3.0-o'); setPrompt(viewVideo.prompt); setDuration(viewVideo.duration); setViewVideo(null); }}><span className="material-symbols-outlined">auto_fix_high</span> Reuse Settings</button>
                        <button className="vm-config-trigger" style={{background: 'var(--sys-surface-glass)'}} onClick={() => navigator.clipboard.writeText(viewVideo.prompt)}><span className="material-symbols-outlined">content_copy</span> Copy Prompt</button>
                        <a href={viewVideo.url} download className="vm-config-trigger" style={{background: 'var(--sys-surface-glass)', textDecoration:'none'}}><span className="material-symbols-outlined">download</span> Download</a>
                    </div>
                </div>
            </div>
        )
    }

    return (
"""
c = c.replace('    return (', modal_html, 1)

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'w') as f:
    f.write(c)

