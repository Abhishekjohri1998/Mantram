import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

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
