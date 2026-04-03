import { useRef, useLayoutEffect, memo } from 'react'

const PromptArea = memo(({ value, onChange, placeholder, disabled, onKeyDown, textareaRef }) => {
    const localRef = useRef(null);
    const ref = textareaRef || localRef;

    useLayoutEffect(() => {
        if (ref.current) {
            ref.current.style.height = 'auto';
            ref.current.style.height = Math.min(ref.current.scrollHeight, 400) + 'px';
        }
    }, [value]);

    return (
        <textarea
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="w-full resize-none border-none bg-transparent p-0 text-lg leading-relaxed text-white placeholder-slate-500 focus:outline-none focus:ring-0"
            rows={2}
        />
    );
});

export default PromptArea;
