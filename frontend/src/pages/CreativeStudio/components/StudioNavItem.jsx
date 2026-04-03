import { memo } from 'react'

const StudioNavItem = memo(({ id, activeId, icon, label, onClick }) => {
    const isActive = activeId === id;
    return (
        <button
            onClick={() => onClick(id)}
            className={`flex items-center gap-3 rounded-2xl px-5 py-3 text-sm font-bold transition-all duration-300 ${
                isActive 
                ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20' 
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            }`}
        >
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            <span>{label}</span>
        </button>
    );
});

export default StudioNavItem;
