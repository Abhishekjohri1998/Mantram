/**
 * Embeddable Lead Form Widget — Retention Studio
 * 
 * A self-contained JavaScript snippet that merchants embed on their Shopify storefront.
 * It injects a customizable popup/inline lead capture form that POSTs to the Mantram API.
 * 
 * Embed via: <script src="https://api.mantram.ai/api/retention-studio/widget.js" data-brand="BRAND_ID"></script>
 */

/**
 * Generate the embeddable widget JS code for a brand
 */
export function generateWidgetScript(brandId, config = {}) {
    const apiBase = process.env.BACKEND_URL || 'https://api.mantram.ai';
    const {
        formType = 'popup',        // 'popup', 'inline', 'slide-in', 'bar'
        position = 'bottom-right', // 'bottom-right', 'bottom-left', 'center', 'top'
        title = 'Stay Updated!',
        subtitle = 'Get exclusive deals and new arrivals straight to your inbox.',
        buttonText = 'Subscribe',
        successMessage = 'Thanks for subscribing! 🎉',
        fields = ['email'],        // ['email'], ['email', 'name'], ['email', 'name', 'phone']
        theme = 'dark',            // 'dark', 'light', 'brand'
        primaryColor = '#6366f1',
        delay = 3000,              // ms before popup shows (popup/slide-in only)
        showOnExit = true,         // show on exit intent
        cookieDays = 7,            // don't re-show for N days after close
        collectTags = [],          // auto-apply tags to captured leads
    } = config;

    return `
(function() {
    'use strict';

    // Prevent double-load
    if (window.__mantramWidget) return;
    window.__mantramWidget = true;

    var BRAND_ID = '${brandId}';
    var API_BASE = '${apiBase}';
    var CONFIG = ${JSON.stringify({
        formType, position, title, subtitle, buttonText, successMessage,
        fields, theme, primaryColor, delay, showOnExit, cookieDays, collectTags,
    })};

    // Check cookie to avoid re-showing
    function getCookie(name) {
        var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }
    function setCookie(name, val, days) {
        var d = new Date(); d.setTime(d.getTime() + (days*24*60*60*1000));
        document.cookie = name + '=' + val + ';expires=' + d.toUTCString() + ';path=/';
    }
    if (getCookie('mantram_widget_closed')) return;

    // Inject styles
    var style = document.createElement('style');
    style.textContent = \`
        .mantram-overlay { position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:99998; opacity:0; transition:opacity 0.3s; }
        .mantram-overlay.show { opacity:1; }
        .mantram-widget { position:fixed; z-index:99999; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; transition:all 0.4s cubic-bezier(0.4,0,0.2,1); }
        .mantram-widget.popup { top:50%; left:50%; transform:translate(-50%,-50%) scale(0.9); opacity:0; }
        .mantram-widget.popup.show { transform:translate(-50%,-50%) scale(1); opacity:1; }
        .mantram-widget.slide-in { bottom:-400px; right:20px; }
        .mantram-widget.slide-in.show { bottom:20px; }
        .mantram-widget.bar { bottom:-80px; left:0; width:100%; }
        .mantram-widget.bar.show { bottom:0; }
        .mantram-card {
            background: \${CONFIG.theme==='dark'?'#1a1a2e':'#ffffff'};
            color: \${CONFIG.theme==='dark'?'#e0e0e0':'#333333'};
            border-radius: \${CONFIG.formType==='bar'?'0':'16px'};
            padding: 32px;
            min-width: 340px;
            max-width: 420px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            position: relative;
        }
        .mantram-card.bar-card { display:flex; align-items:center; gap:16px; padding:16px 32px; max-width:100%; min-width:auto; border-radius:0; }
        .mantram-close { position:absolute; top:12px; right:12px; background:none; border:none; color:\${CONFIG.theme==='dark'?'#888':'#999'}; font-size:20px; cursor:pointer; width:28px; height:28px; display:flex; align-items:center; justify-content:center; border-radius:50%; transition:background 0.2s; }
        .mantram-close:hover { background:\${CONFIG.theme==='dark'?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.05)'}; }
        .mantram-title { font-size:22px; font-weight:700; margin:0 0 8px 0; }
        .mantram-subtitle { font-size:14px; opacity:0.8; margin:0 0 20px 0; line-height:1.5; }
        .mantram-input { display:block; width:100%; padding:12px 16px; border:2px solid \${CONFIG.theme==='dark'?'#333':'#e0e0e0'}; border-radius:10px; font-size:14px; background:\${CONFIG.theme==='dark'?'#16213e':'#f8f9fa'}; color:\${CONFIG.theme==='dark'?'#fff':'#333'}; margin-bottom:10px; box-sizing:border-box; outline:none; transition:border-color 0.2s; }
        .mantram-input:focus { border-color:\${CONFIG.primaryColor}; }
        .mantram-btn { display:block; width:100%; padding:13px; border:none; border-radius:10px; background:\${CONFIG.primaryColor}; color:#fff; font-size:15px; font-weight:600; cursor:pointer; transition:opacity 0.2s, transform 0.2s; }
        .mantram-btn:hover { opacity:0.9; transform:translateY(-1px); }
        .mantram-btn:disabled { opacity:0.6; cursor:not-allowed; }
        .mantram-success { text-align:center; padding:20px 0; }
        .mantram-success-icon { font-size:48px; margin-bottom:12px; }
        .mantram-success-text { font-size:16px; font-weight:600; }
        .mantram-bar-card .mantram-title { font-size:16px; margin:0; white-space:nowrap; }
        .mantram-bar-card .mantram-input { margin:0; width:240px; }
        .mantram-bar-card .mantram-btn { width:auto; padding:12px 24px; white-space:nowrap; }
    \`;
    document.head.appendChild(style);

    // Build form HTML
    function buildForm() {
        var isBar = CONFIG.formType === 'bar';
        var fieldsHtml = '';
        CONFIG.fields.forEach(function(f) {
            if (f === 'email') fieldsHtml += '<input class="mantram-input" type="email" name="email" placeholder="Your email address" required>';
            if (f === 'name') fieldsHtml += '<input class="mantram-input" type="text" name="name" placeholder="Your name">';
            if (f === 'phone') fieldsHtml += '<input class="mantram-input" type="tel" name="phone" placeholder="Phone number">';
        });

        if (isBar) {
            return '<div class="mantram-card bar-card">' +
                '<button class="mantram-close" aria-label="Close">&times;</button>' +
                '<p class="mantram-title">' + CONFIG.title + '</p>' +
                '<form class="mantram-form" style="display:flex;gap:8px;align-items:center;flex:1">' +
                fieldsHtml +
                '<button type="submit" class="mantram-btn">' + CONFIG.buttonText + '</button>' +
                '</form></div>';
        }

        return '<div class="mantram-card">' +
            '<button class="mantram-close" aria-label="Close">&times;</button>' +
            '<h2 class="mantram-title">' + CONFIG.title + '</h2>' +
            '<p class="mantram-subtitle">' + CONFIG.subtitle + '</p>' +
            '<form class="mantram-form">' +
            fieldsHtml +
            '<button type="submit" class="mantram-btn">' + CONFIG.buttonText + '</button>' +
            '</form></div>';
    }

    // Create widget
    var overlay = null;
    if (CONFIG.formType === 'popup') {
        overlay = document.createElement('div');
        overlay.className = 'mantram-overlay';
        document.body.appendChild(overlay);
    }

    var widget = document.createElement('div');
    widget.className = 'mantram-widget ' + CONFIG.formType;
    if (CONFIG.formType === 'slide-in') {
        widget.style.right = CONFIG.position === 'bottom-left' ? 'auto' : '20px';
        widget.style.left = CONFIG.position === 'bottom-left' ? '20px' : 'auto';
    }
    widget.innerHTML = buildForm();
    document.body.appendChild(widget);

    // Show widget
    function showWidget() {
        widget.classList.add('show');
        if (overlay) overlay.classList.add('show');
    }

    // Close widget
    function closeWidget() {
        widget.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        setCookie('mantram_widget_closed', '1', CONFIG.cookieDays);
        setTimeout(function() { widget.remove(); if(overlay) overlay.remove(); }, 400);
    }

    // Bind close
    widget.querySelector('.mantram-close').addEventListener('click', closeWidget);
    if (overlay) overlay.addEventListener('click', closeWidget);

    // Form submit
    widget.querySelector('.mantram-form').addEventListener('submit', function(e) {
        e.preventDefault();
        var form = e.target;
        var btn = form.querySelector('.mantram-btn');
        btn.disabled = true; btn.textContent = 'Submitting...';

        var data = { brandId: BRAND_ID, source: 'widget', tags: CONFIG.collectTags, pageUrl: window.location.href };
        CONFIG.fields.forEach(function(f) {
            var input = form.querySelector('[name="'+f+'"]');
            if (input) data[f] = input.value;
        });

        fetch(API_BASE + '/api/retention-studio/leads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(function(r) { return r.json(); })
        .then(function() {
            var card = widget.querySelector('.mantram-card');
            card.innerHTML = '<div class="mantram-success"><div class="mantram-success-icon">🎉</div><div class="mantram-success-text">' + CONFIG.successMessage + '</div></div>';
            setCookie('mantram_widget_closed', '1', CONFIG.cookieDays);
            setTimeout(closeWidget, 3000);
        })
        .catch(function() {
            btn.disabled = false; btn.textContent = CONFIG.buttonText;
            alert('Something went wrong. Please try again.');
        });
    });

    // Trigger display
    if (CONFIG.formType === 'popup' || CONFIG.formType === 'slide-in') {
        setTimeout(showWidget, CONFIG.delay);
    } else {
        showWidget();
    }

    // Exit intent (desktop only)
    if (CONFIG.showOnExit && CONFIG.formType === 'popup') {
        document.addEventListener('mouseout', function(e) {
            if (e.clientY < 5 && !widget.classList.contains('show')) {
                showWidget();
            }
        });
    }
})();
`.trim();
}

/**
 * Generate inline embed snippet for documentation
 */
export function getEmbedSnippet(brandId) {
    const apiBase = process.env.BACKEND_URL || 'https://api.mantram.ai';
    return `<!-- Mantram Lead Capture Widget -->
<script src="${apiBase}/api/retention-studio/widget.js?brand=${brandId}" defer></script>`;
}

/**
 * Available widget configurations
 */
export function getWidgetOptions() {
    return {
        formTypes: ['popup', 'inline', 'slide-in', 'bar'],
        positions: ['bottom-right', 'bottom-left', 'center', 'top'],
        themes: ['dark', 'light', 'brand'],
        fields: ['email', 'name', 'phone'],
        defaults: {
            formType: 'popup',
            position: 'bottom-right',
            theme: 'dark',
            primaryColor: '#6366f1',
            delay: 3000,
            showOnExit: true,
            cookieDays: 7,
        },
    };
}
