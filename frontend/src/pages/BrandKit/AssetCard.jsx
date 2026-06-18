/**
 * AssetCard — Reusable card for displaying a generated brand kit asset
 * Supports: image assets, HTML guide assets, email signature HTML, collection assets
 */

import { useState } from 'react'
import { API_BASE } from '../../services/brandKitApi'

export default function AssetCard({ asset, onDelete, onRegenerate, compact = false }) {
    const [deleting, setDeleting] = useState(false)
    const [imgError, setImgError] = useState(false)

    const isImage = asset.format === 'image' || asset.imageUrl
    const isHtml = asset.format === 'html'
    const isEmailSig = asset.assetSubType === 'email-signature'

    const handleDelete = async () => {
        if (!window.confirm(`Delete "${asset.name}"?`)) return
        setDeleting(true)
        try { await onDelete?.(asset) } finally { setDeleting(false) }
    }

    const handleDownload = () => {
        if (asset.imageUrl) {
            const a = document.createElement('a')
            a.href = asset.imageUrl
            a.download = `${asset.name?.replace(/\s+/g, '-').toLowerCase() || 'asset'}.png`
            a.target = '_blank'
            a.click()
        } else if (asset.hostedUrl) {
            const apiDomain = API_BASE.endsWith('/api') ? API_BASE.substring(0, API_BASE.length - 4) : API_BASE;
            const finalUrl = asset.hostedUrl.startsWith('/') ? `${apiDomain}${asset.hostedUrl}` : asset.hostedUrl;
            window.open(finalUrl, '_blank')
        } else if (asset.htmlContent) {
            const blob = new Blob([asset.htmlContent], { type: 'text/html' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `${asset.name?.replace(/\s+/g, '-').toLowerCase() || 'signature'}.html`
            a.click()
            URL.revokeObjectURL(url)
        }
    }

    return (
        <div className={`glass-panel rounded-2xl overflow-hidden border border-[var(--sys-border)] group transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 animate-fade-in ${compact ? '' : ''}`}>

            {/* Preview Area */}
            <div className="relative bg-[var(--sys-surface)] overflow-hidden" style={{ aspectRatio: isImage ? '1/1' : 'auto', minHeight: isImage ? undefined : '80px' }}>

                {isImage && !imgError && asset.imageUrl ? (
                    <img
                        src={asset.imageUrl}
                        alt={asset.name}
                        className="w-full h-full object-contain"
                        onError={() => setImgError(true)}
                    />
                ) : isImage && (imgError || !asset.imageUrl) ? (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="material-symbols-outlined text-4xl text-[var(--sys-text-muted)] opacity-30">image</span>
                    </div>
                ) : isEmailSig ? (
                    <div className="p-4 overflow-hidden max-h-32">
                        <div dangerouslySetInnerHTML={{ __html: asset.htmlContent || '' }}
                            className="scale-75 origin-top-left pointer-events-none" />
                    </div>
                ) : isHtml ? (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                        <span className="material-symbols-outlined text-3xl text-primary">article</span>
                        <span className="text-xs text-[var(--sys-text-muted)]">Interactive HTML</span>
                    </div>
                ) : null}

                {/* Hover overlay with actions */}
                <div className="absolute inset-0 bg-[var(--sys-surface)]/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-3 z-10">
                    <button onClick={handleDownload}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-all cursor-pointer">
                        <span className="material-symbols-outlined text-sm">{isHtml ? 'open_in_new' : 'download'}</span>
                        {isHtml ? 'Open' : 'Download'}
                    </button>
                    {onRegenerate && (
                        <button onClick={() => onRegenerate?.(asset)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-[var(--sys-text)] text-xs font-medium hover:border-primary/30 transition-all cursor-pointer">
                            <span className="material-symbols-outlined text-sm">refresh</span>
                            Redo
                        </button>
                    )}
                    {onDelete && (
                        <button onClick={handleDelete} disabled={deleting}
                            className="p-2 rounded-xl bg-[var(--sys-surface)] border border-[var(--sys-border)] text-primary/60 hover:text-primary transition-all cursor-pointer disabled:opacity-50">
                            <span className="material-symbols-outlined text-sm">delete</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Card Footer */}
            <div className="p-3">
                <p className="text-sm font-medium text-[var(--sys-text)] truncate">{asset.name}</p>
                {asset.assetSubType && (
                    <p className="text-xs text-[var(--sys-text-muted)] mt-0.5 capitalize">{asset.assetSubType.replace(/-/g, ' ')}</p>
                )}
            </div>
        </div>
    )
}
