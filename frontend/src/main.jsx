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
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    document.body.classList.add('fonts-loaded');
  });
} else {
  // Fallback for older browsers
  window.addEventListener('load', () => {
    document.body.classList.add('fonts-loaded');
  });
}
