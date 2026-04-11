const css = `
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
.vm-prompt { padding: 16px 24px 0; position: relative; }
.vm-textarea { width: 100%; background: transparent; border: none; outline: none; resize: none; color: var(--sys-text); font-size: 15px; line-height: 1.6; font-family: inherit; min-height: 100px; font-weight: 500; }
.vm-textarea::placeholder { color: var(--sys-text-muted); font-weight: 400; opacity: 0.6; }

/* Config Modules */
.vm-config { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 24px; }
.vm-tag { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 8px; background: rgba(255, 77, 0,0.08); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-config-trigger { display: flex; align-items: center; gap: 5px; padding: 8px 12px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); transition: all .15s; }
.vm-config-trigger:hover { border-color: rgba(255,255,255,0.15); background: rgba(255,255,255,0.02); }
.vm-config-menu { position: absolute; bottom: calc(100% + 6px); left: 0; min-width: 140px; max-height: 220px; overflow-y: auto; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 12px; padding: 4px; z-index: 50; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }

/* Bottom Bar */
.vm-bottom { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 24px; border-top: 1px solid var(--sys-border); background: rgba(0,0,0,0.1); border-radius: 0 0 20px 20px; }
.vm-bottom-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex: 1; }
.vm-bottom-left .vm-config-trigger { padding: 6px 12px; font-size: 12px; border-radius: 8px; background: transparent; }
.vm-bottom-left .vm-config-trigger:hover { background: rgba(255,255,255,0.05); }

.vm-generate { padding: 12px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; cursor: pointer; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; color: #111; background: #eab308; box-shadow: 0 0 20px rgba(234,179,8,0.3); transition: all .2s; }
.vm-generate:hover { transform: translateY(-1px); box-shadow: 0 0 25px rgba(234,179,8,0.5); background: #fde047; }
.vm-generate:disabled { opacity: 0.4; cursor: default; background: var(--sys-border); color: var(--sys-text-muted); box-shadow: none; transform: none; }

/* Status overlays */
.vm-gen-card { max-width: 600px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; backdrop-filter: blur(24px); box-shadow: 0 20px 40px rgba(0,0,0,0.5); }
.vm-gen-preview { position: relative; width: 100%; padding-bottom: 56.25%; background: var(--sys-surface); }
.vm-gen-info { padding: 20px 24px; color: var(--sys-text); }
.vm-progress-bar { width: 100%; height: 6px; border-radius: 3px; background: var(--sys-border); overflow: hidden; }
.vm-progress-fill { height: 100%; border-radius: 3px; background: #eab308; transition: width 1s ease; }

.vm-done-card { max-width: 800px; width: 100%; z-index: 20; background: var(--sys-surface-glass); border: 1px solid var(--sys-border); border-radius: 20px; overflow: hidden; margin-bottom: 20px; backdrop-filter: blur(24px); }
.vm-done-card video { width: 100%; display: block; }
.vm-done-btns { display: flex; gap: 12px; max-width: 800px; margin: 0 auto; flex-wrap: wrap; z-index: 20; }
.vm-btn-sec { flex: 1; padding: 12px; border-radius: 12px; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--sys-border); background: var(--sys-surface); color: var(--sys-text); transition: all .15s; backdrop-filter: blur(10px); }
.vm-btn-sec:hover { background: rgba(255,255,255,0.05); }

/* Autocomplete & Library remain same structure mostly, tweaked colors */
.vm-autocomplete { position: absolute; bottom: 100%; left: 24px; right: 24px; background: var(--sys-surface-raised); border: 1px solid var(--sys-border); border-radius: 12px; padding: 8px; display: flex; gap: 6px; flex-wrap: wrap; z-index: 20; box-shadow: 0 10px 30px rgba(0,0,0,0.6); }
.vm-ac-item { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; cursor: pointer; background: rgba(255,255,255,0.02); border: 1px solid var(--sys-border); font-size: 12px; color: var(--sys-text); font-weight: 600; }
.vm-ac-item:hover { border-color: var(--sys-primary); background: rgba(255,255,255,0.05); }

/* Ensure z-indexes and stacking */
.vm-library { margin: 0 24px 16px; background: rgba(0,0,0,0.2); border: 1px solid var(--sys-border); border-radius: 14px; padding: 14px; color: var(--sys-text); }
.vm-library-head { display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 13px; font-weight: 700; }
.vm-library-grid img { width: 100%; height: 56px; border-radius: 8px; object-fit: cover; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.vm-library-grid img:hover { border-color: #eab308; }
`
