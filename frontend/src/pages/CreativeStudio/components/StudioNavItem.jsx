import { memo } from 'react'

const StudioNavItem = memo(({ id, activeId, icon, label, onClick }) => {
    const isActive = activeId === id;
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 ${
                isActive 
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-none' 
                : 'text-[var(--sys-text-muted)] hover:bg-[var(--sys-surface)] hover:text-[var(--sys-text)]'
            }`}
        >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span>{label}</span>
        </button>
    );
});

export default StudioNavItem;
