import re

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'r') as f:
    c = f.read()

# 1. Update MODELS with exact duration arrays and resolutions
old_models = r"const MODELS = \{[\s\S]*?\n\}"
new_models = """const MODELS = {
    'seedance-2.0': { id: 'seedance-2.0', name: 'Seedance 2.0', msIcon: 'movie_filter', durs: [5, 10], ratios: ['16:9', '9:16', '1:1', '4:3', '21:9'], res: ['1080p', '720p'], has: { firstFrame: true, refImages: true, refVideo: true, refAudio: true, audio: true }, cost: 0.08, desc: "Best for Lip-Sync and precise motion tracking." },
    'kling-3.0': { id: 'kling-3.0', name: 'Kling 3.0', msIcon: 'videocam', durs: [5, 10], ratios: ['16:9', '9:16', '1:1'], res: ['1080p', '720p'], has: { firstFrame: true, lastFrame: true, audio: true, quality: true }, cost: 0.07, desc: "High realistic generation with Fast and Pro options." },
    'veo-3.1': { id: 'veo-3.1', name: 'Veo 3.1', msIcon: 'smart_display', durs: [5, 8], ratios: ['16:9', '9:16'], res: ['1080p'], has: { firstFrame: true, lastFrame: true, refImages: true, audio: true, quality: true }, cost: 0.10, desc: "Incredible Cinematic physics. Fast and Pro options." },
    'seedance-1.0': { id: 'seedance-1.0', name: 'Seedance 1.0', msIcon: 'slow_motion_video', durs: [5], ratios: ['16:9', '9:16', '1:1', '4:3'], res: ['720p'], has: { firstFrame: true, lastFrame: true }, cost: 0.05, desc: "Cost-effective, reliable motion." },
    'grok-imagine': { id: 'grok-imagine', name: 'Grok Imagine', msIcon: 'neurology', durs: [5, 15], ratios: ['16:9', '9:16', '1:1'], res: ['1080p'], has: { firstFrame: true }, cost: 0.08, desc: "Ultra-fast text-to-video capabilities without reference locks." }
}"""
c = re.sub(old_models, new_models, c)

# 2. Modify State Initializations to include resolution
c = c.replace("const [duration, setDuration] = useState(5)", "const [duration, setDuration] = useState(5)\n    const [resolution, setResolution] = useState('1080p')")

# 3. Update handleGenerate to pass actual resolution
c = c.replace("resolution: '1080p', aspectRatio,", "resolution: resolution, aspectRatio,")

# 4. Remove Tabs from Panel Header (Lines related to Toggle)
tabs_regex = r'<div style={{display: \'flex\', gap: 16, fontSize: 13}}>[\s\S]*?<\/div>\n\s*<\/div>'
c = re.sub(tabs_regex, '</div>', c)

# 5. Bottom Settings rendering - Resolution & explicit duration options
bottom_settings_regex = r'<div className="vm-bottom-left">[\s\S]*?<\/div>\s*<div style={{display: \'flex\', gap: 12, alignItems: \'center\'}}>'
bottom_settings_replacement = """<div className="vm-bottom-left">
                                    <ConfigDropdown
                                        value={model}
                                        onChange={setModel}
                                        options={Object.values(MODELS).map(mod => ({ value: mod.id, label: mod.name, msIcon: mod.msIcon }))}
                                        label="Model"
                                    />
                                    <ConfigDropdown
                                        value={aspectRatio}
                                        onChange={setAspectRatio}
                                        options={m.ratios.map(r => ({ value: r, label: r, meta: r === '16:9' || r === '21:9' ? 'Cinematic' : null }))}
                                        label="Ratio"
                                    />
                                    <ConfigDropdown
                                        value={resolution}
                                        onChange={setResolution}
                                        options={m.res.map(r => ({ value: r, label: r }))}
                                        label="Resolution"
                                    />
                                    <ConfigDropdown
                                        value={duration}
                                        onChange={setDuration}
                                        options={m.durs.map(d => ({ value: d, label: str(d) + 's' }))}
                                        label="Duration"
                                    />
                                </div>

                                <div style={{display: 'flex', gap: 12, alignItems: 'center'}}>"""
# Wait python string str() wouldn't work in JS! I should use `${d}s`.
bottom_settings_replacement = bottom_settings_replacement.replace("str(d) + 's'", "`${d}s`")
c = re.sub(bottom_settings_regex, bottom_settings_replacement, c)

# 6. Upgrade ConfigDropdown component and Menu CSS to match reference
dropdown_js = r"\{open && \(\s*<div className=\"vm-config-menu\">\s*\{options\.map\(o => \(\s*<button key=\{o\.value\} type=\"button\" className=\{\`vm-config-opt \$\{o\.value === value \? 'sel' : ''\}\`\} onClick=\{\(\) => \{ onChange\(o\.value\); setOpen\(false\) \}\}>\s*\{o\.msIcon && <span className=\"material-symbols-outlined\" style=\{\{ fontSize: '15px' \}\}>\{o\.msIcon\}<\/span>\} \{o\.label\}\s*<\/button>\s*\)\}\s*<\/div>\s*\)\}"

new_dropdown_js = """{open && (
                <div className="vm-config-menu">
                    {options.map(o => (
                        <button key={o.value} type="button" className={`vm-config-opt ${o.value === value ? 'sel' : ''}`} onClick={() => { onChange(o.value); setOpen(false) }}>
                            <div style={{display:'flex', alignItems:'center', gap: 10, width:'100%'}}>
                                {o.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>{o.msIcon}</span>}
                                {!o.msIcon && o.value === value ? <span className="material-symbols-outlined" style={{ fontSize: '14px', color:'transparent' }}>crop_square</span> : !o.msIcon && <span className="material-symbols-outlined" style={{ fontSize: '14px', opacity: 0.5 }}>crop_square</span>}
                                <span style={{ flex: 1, textAlign: 'left', fontWeight: o.value === value ? 600 : 400 }}>{o.label}</span>
                                {o.meta && <span style={{fontSize: 9, padding: '2px 6px', background: 'var(--sys-primary)', color: '#000', borderRadius: 4, fontWeight: 700}}>{o.meta}</span>}
                                {o.value === value && <span className="material-symbols-outlined" style={{ fontSize: '16px', color: 'var(--sys-primary)' }}>check</span>}
                            </div>
                        </button>
                    ))}
                </div>
            )}"""
c = re.sub(dropdown_js, new_dropdown_js, c)

# 7. Upgrade main CSS classes
c = c.replace(
    ".vm-layout { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; padding: 0 16px 32px 16px; }",
    ".vm-layout { position: relative; flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 0 16px 32px 16px; }"
)

# Wait we want vm-card to be at the bottom, so margin-top: auto is better. Plus padding-bottom: 24px in vm-layout to keep it pushed.
c = c.replace(
    ".vm-card { width: 100%; max-width: 860px;",
    ".vm-card { margin-top: auto; width: 100%; max-width: 860px;"
)

c = c.replace(
    ".vm-config-menu { position: absolute; bottom: calc(100% + 4px); left: 0; transform-origin: bottom left; min-width: 140px; max-height: 220px; overflow-y: auto; background: var(--sys-surface-glass); backdrop-filter: blur(20px); border: 1px solid var(--sys-border); border-radius: 12px; padding: 4px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }",
    ".vm-config-menu { position: absolute; bottom: -8px; left: -8px; min-width: 200px; max-height: 320px; overflow-y: auto; background: #161616; border: 1px solid var(--sys-border); border-radius: 16px; padding: 8px; z-index: 100; box-shadow: 0 15px 40px rgba(0,0,0,0.8); display: flex; flex-direction: column; gap: 2px; } /* Updated to Dark Glassmorphism Menu anchored exactly over trigger */"
)

c = c.replace(
    ".vm-config-opt { display: flex; align-items: center; gap: 6px; width: 100%; padding: 8px 10px; border: none; background: transparent; color: var(--sys-text); font-size: 12px; font-weight: 500; cursor: pointer; border-radius: 8px; text-align: left; transition: all .12s; }",
    ".vm-config-opt { display: flex; align-items: center; width: 100%; padding: 10px 12px; border: none; background: transparent; color: rgba(255,255,255,0.8); font-size: 13px; cursor: pointer; border-radius: 8px; text-align: left; transition: all .2s; }\n.vm-config-opt.sel { color: #fff; background: rgba(255,255,255,0.06); }"
)

with open('frontend/src/components/VideoStudio/AdvancedMode.jsx', 'w') as f:
    f.write(c)

