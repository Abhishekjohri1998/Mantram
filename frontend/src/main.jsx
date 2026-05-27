import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// ── Theme bootstrap (must run BEFORE first paint) ─────────────────────────────
// The theme class used to be applied only from <Sidebar/> after login, which
// meant the auth screen + initial paint always rendered in dark mode regardless
// of the user’s preference. Apply it here, synchronously, so light mode works
// across the whole app and there’s no dark-mode flash.
;(() => {
  try {
    const stored = localStorage.getItem('mantram-theme') || 'auto'
    const isLight = stored === 'light'
      || (stored === 'auto' && window.matchMedia?.('(prefers-color-scheme: light)').matches)
    document.documentElement.classList.toggle('theme-light', isLight)
    if (stored === 'auto' && window.matchMedia) {
      const mql = window.matchMedia('(prefers-color-scheme: light)')
      mql.addEventListener?.('change', e => {
        if ((localStorage.getItem('mantram-theme') || 'auto') === 'auto') {
          document.documentElement.classList.toggle('theme-light', e.matches)
        }
      })
    }
  } catch { /* localStorage / matchMedia may be blocked */ }
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Antigravity Pro — FOUT/FOUC Fix for Material Icons
const revealFonts = () => {
  if (!document.body.classList.contains('fonts-loaded')) {
    document.body.classList.add('fonts-loaded');
  }
};

// 1. Try to load specific icon fonts first
if (document.fonts && document.fonts.load) {
  Promise.all([
    document.fonts.load('24px "Material Symbols Outlined"'),
    document.fonts.load('24px "Material Icons"')
  ]).then(revealFonts).catch(revealFonts);
} else {
  window.addEventListener('load', revealFonts);
}

// 2. Safety Timeout (2 seconds) — Ensure icons show up anyway
setTimeout(revealFonts, 2000);
