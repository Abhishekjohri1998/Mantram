import { memo } from 'react'

const GalleryItem = memo(({ item, onZoom, onDownload, onDownloadHD, onDownload4K, onHistorySelect, isLatest, upscaleMenu, setUpscaleMenu, upscalingState, expandedReasoning, setExpandedReasoning, getTimeAgo }) => {
    return (
        <div className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${isLatest ? 'border-[var(--sys-border)] bg-[var(--sys-surface)] shadow-lg shadow-none' : 'border-[var(--sys-border)] bg-[var(--sys-surface)] hover:border-[var(--sys-border)]'}`}>
            <div className="aspect-[4/5] relative cursor-zoom-in overflow-hidden" onClick={() => onZoom(item.imageUrl)}>
                <img src={item.imageUrl} alt={item.prompt} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" loading="lazy" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                
                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-0 transition-all duration-300 translate-y-[-10px] group-hover:opacity-100 group-hover:translate-y-0">
                    <button onClick={(e) => { e.stopPropagation(); onDownload(item.imageUrl, `mantram-${item._id}.png`) }} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--sys-bg)] text-[var(--sys-text)] backdrop-blur-md transition-all hover:bg-[var(--sys-surface)]">
                        <span className="material-symbols-outlined text-sm">download</span>
                    </button>
                </div>
            </div>
            <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--sys-text-muted)]">{getTimeAgo(item._timestamp || item.createdAt)}</span>
                    <span className="rounded-full bg-[var(--sys-surface)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[var(--sys-text-muted)]">{item.type || 'creative'}</span>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-[var(--sys-text)]">{item._prompt || item.prompt}</p>
            </div>
        </div>
    );
});

export default GalleryItem;
