import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle } from 'react';

const MaskingCanvas = forwardRef(({ imageUrl, width = 512 }, ref) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [brushSize, setBrushSize] = useState(30);
    const [isErasing, setIsErasing] = useState(false);
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ w: width, h: width });

    // Load image and set canvas size
    useEffect(() => {
        if (!imageUrl) return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const aspect = img.height / img.width;
            const targetW = containerRef.current ? containerRef.current.clientWidth : width;
            const targetH = targetW * aspect;
            setCanvasSize({ w: targetW, h: targetH });
            setIsImageLoaded(true);
        };
        img.src = imageUrl;
    }, [imageUrl, width]);

    // Setup canvas drawing context
    useEffect(() => {
        if (!isImageLoaded || !canvasRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        // Clear when loaded
        ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
    }, [isImageLoaded, canvasSize]);

    // Expose extractMask to parent
    useImperativeHandle(ref, () => ({
        extractMask: () => {
            if (!canvasRef.current) return null;
            // The drawing canvas currently has red strokes. We need to convert it to a black and white mask.
            // White = editable area (the brush strokes), Black = unedited (background)
            const offscreen = document.createElement('canvas');
            offscreen.width = canvasRef.current.width;
            offscreen.height = canvasRef.current.height;
            const oCtx = offscreen.getContext('2d');
            
            // Fill with black background
            oCtx.fillStyle = 'black';
            oCtx.fillRect(0, 0, offscreen.width, offscreen.height);
            
            // Draw the strokes in solid white
            // We can do this by using source-in compositing if we just want to replace transparency
            // But since our main canvas has red (#FF4D00) with various opacities, we can process imageData or just draw it.
            // Since the main canvas ONLY has the red strokes (rest is transparent), we can just draw it, then use globalCompositeOperation
            oCtx.globalCompositeOperation = 'source-over';
            oCtx.drawImage(canvasRef.current, 0, 0);
            
            // Convert any non-black pixel to white
            const imgData = oCtx.getImageData(0, 0, offscreen.width, offscreen.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                // If opacity > 0 and it's not totally black from the background fill
                if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0 || data[i+3] > 0) {
                    if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0) { // If not the background black
                        data[i] = 255;     // R
                        data[i+1] = 255;   // G
                        data[i+2] = 255;   // B
                        data[i+3] = 255;   // A
                    }
                }
            }
            oCtx.putImageData(imgData, 0, 0);
            
            return offscreen.toDataURL('image/png');
        },
        clearMask: () => {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
            }
        },
        hasMask: () => {
            if (!canvasRef.current) return false;
            const ctx = canvasRef.current.getContext('2d');
            const data = ctx.getImageData(0, 0, canvasSize.w, canvasSize.h).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] > 0) return true; // Found a non-transparent pixel
            }
            return false;
        }
    }));

    const startDrawing = (e) => {
        const { offsetX, offsetY } = getCoordinates(e);
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        ctx.moveTo(offsetX, offsetY);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const { offsetX, offsetY } = getCoordinates(e);
        const ctx = canvasRef.current.getContext('2d');
        
        ctx.lineWidth = brushSize;
        if (isErasing) {
            ctx.globalCompositeOperation = 'destination-out';
            ctx.strokeStyle = 'rgba(0,0,0,1)';
        } else {
            ctx.globalCompositeOperation = 'source-over';
            // We use a solid color, but when displayed it looks like a red overlay. 
            // We use actual solid red so extraction pixel math is easy.
            ctx.strokeStyle = '#FF4D00';
        }
        
        ctx.lineTo(offsetX, offsetY);
        ctx.stroke();
    };

    const stopDrawing = () => {
        if (isDrawing) {
            const ctx = canvasRef.current.getContext('2d');
            ctx.closePath();
            setIsDrawing(false);
        }
    };

    const getCoordinates = (e) => {
        if (e.touches && e.touches.length > 0) {
            const rect = canvasRef.current.getBoundingClientRect();
            return {
                offsetX: e.touches[0].clientX - rect.left,
                offsetY: e.touches[0].clientY - rect.top
            };
        }
        return {
            offsetX: e.nativeEvent.offsetX,
            offsetY: e.nativeEvent.offsetY
        };
    };

    return (
        <div className="flex flex-col gap-3">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--sys-surface-hover)] border border-[var(--sys-border)]">
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsErasing(false)} className={`p-1.5 rounded-lg flex items-center transition ${!isErasing ? 'bg-violet-500 text-white' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`} title="Brush Tool">
                        <span className="material-symbols-outlined text-sm">brush</span>
                    </button>
                    <button onClick={() => setIsErasing(true)} className={`p-1.5 rounded-lg flex items-center transition ${isErasing ? 'bg-violet-500 text-white' : 'text-[var(--sys-text-muted)] hover:text-[var(--sys-text)]'}`} title="Eraser Tool">
                        <span className="material-symbols-outlined text-sm">ink_eraser</span>
                    </button>
                    <div className="w-px h-5 bg-[var(--sys-border)] mx-1" />
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[10px] text-[var(--sys-text-muted)]">fiber_manual_record</span>
                        <input type="range" min="5" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-20 accent-violet-500" />
                        <span className="material-symbols-outlined text-[16px] text-[var(--sys-text-muted)]">fiber_manual_record</span>
                    </div>
                </div>
                <button onClick={() => {
                     const ctx = canvasRef.current.getContext('2d');
                     ctx.clearRect(0, 0, canvasSize.w, canvasSize.h);
                }} className="text-[10px] font-bold text-[var(--sys-text-muted)] hover:text-rose-400 uppercase tracking-wider px-2">
                    Clear
                </button>
            </div>

            {/* Canvas Area */}
            <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-[var(--sys-border)] shadow-inner" style={{ cursor: isErasing ? 'crosshair' : 'crosshair' }}>
                {imageUrl && (
                    <img 
                        src={imageUrl} 
                        alt="Background" 
                        crossOrigin="anonymous"
                        className="w-full block pointer-events-none" 
                        style={{ display: isImageLoaded ? 'block' : 'none' }} 
                    />
                )}
                <canvas
                    ref={canvasRef}
                    width={canvasSize.w}
                    height={canvasSize.h}
                    className="absolute top-0 left-0 w-full h-full touch-none"
                    style={{ opacity: 0.6 }} // Draw in solid red, display it as 60% opacity red
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {!isImageLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[var(--sys-surface)]">
                        <span className="material-symbols-outlined animate-spin text-[var(--sys-text-muted)]">refresh</span>
                    </div>
                )}
            </div>
            
            {/* Guide */}
            <p className="text-[10px] text-[var(--sys-text-muted)] italic text-center">
                Paint over the areas you want to modify. Leave untouched areas blank.
            </p>
        </div>
    );
});

export default MaskingCanvas;
