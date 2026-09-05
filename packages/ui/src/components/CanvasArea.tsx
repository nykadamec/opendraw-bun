import { useRef, useState, useCallback, useEffect } from 'react';
import { WandSparkle } from 'reicon-react';

interface Props {
  image: string | null;
  loading: boolean;
  progress: { step: number; total: number; phase?: string } | null;
  preview?: string | null;
}

const PHASE_LABELS: Record<string, string> = {
  textEncoded: 'Encoding text…',
  imageEncoded: 'Encoding image…',
  sampling: 'Sampling',
  imageDecoded: 'Decoding…',
  secondPassImageEncoded: 'Encoding hi-res…',
  secondPassSampling: 'Hi-res sampling',
  secondPassImageDecoded: 'Decoding hi-res…',
  faceRestored: 'Face restoration…',
  imageUpscaled: 'Upscaling…',
};

function formatProgress(p: { step: number; total: number; phase?: string }): string {
  const label = p.phase ? (PHASE_LABELS[p.phase] ?? p.phase) : '';
  const hasStep = p.phase === 'sampling' || p.phase === 'secondPassSampling';
  if (hasStep && p.total > 0) {
    const pct = Math.round((p.step / p.total) * 100);
    return `${label} ${pct}% (${p.step}/${p.total})`;
  }
  return label || `${p.step} / ${p.total}`;
}

function clampScale(s: number): number {
  return Math.min(6, Math.max(0.5, s));
}

export default function CanvasArea({ image, preview, loading, progress }: Props) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const lastTouch = useRef<{ startX: number; startY: number; dist: number } | null>(null);
  const isPanning = useRef(false);
  const mouseDown = useRef<{ x: number; y: number } | null>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const zoomIn = useCallback(() => setScale((s) => clampScale(s * 1.2)), []);
  const zoomOut = useCallback(() => setScale((s) => clampScale(s / 1.2)), []);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => clampScale(s * (e.deltaY > 0 ? 0.9 : 1.1)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!image) return;
    mouseDown.current = { x: e.clientX, y: e.clientY };
  }, [image]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDown.current) return;
    const dx = e.clientX - mouseDown.current.x;
    const dy = e.clientY - mouseDown.current.y;
    mouseDown.current = { x: e.clientX, y: e.clientY };
    setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const handleMouseUp = useCallback(() => {
    mouseDown.current = null;
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastTouch.current = { startX: 0, startY: 0, dist };
      isPanning.current = false;
    } else if (e.touches.length === 1) {
      lastTouch.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        dist: 0,
      };
      isPanning.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastTouch.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const delta = dist / lastTouch.current.dist;
      setScale((s) => clampScale(s * delta));
      lastTouch.current.dist = dist;
      isPanning.current = false;
    } else if (e.touches.length === 1 && lastTouch.current && isPanning.current) {
      const dx = e.touches[0].clientX - lastTouch.current.startX;
      const dy = e.touches[0].clientY - lastTouch.current.startY;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      lastTouch.current.startX = e.touches[0].clientX;
      lastTouch.current.startY = e.touches[0].clientY;
    }
  };

  const handleTouchEnd = () => {
    lastTouch.current = null;
  };

  const zoomActive = scale !== 1;

  return (
    <div data-el-name="CanvasArea"
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-surface m-3 rounded-card select-none"
      style={{
        backgroundImage: 'repeating-conic-gradient(var(--color-checker) 0% 25%, transparent 0% 50%)',
        backgroundSize: '20px 20px',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onDoubleClick={resetView}
    >
      {loading && preview && (
        <img data-el-name="CanvasPreviewImage"
          src={`data:image/png;base64,${preview}`}
          alt="preview"
          className="absolute inset-0 w-full h-full object-contain opacity-50 pointer-events-none"
        />
      )}

      {loading && (
        <div data-el-name="CanvasLoadingOverlay" className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-el/80">
          <div data-el-name="CanvasLoadingSpinner" className="w-12 h-12 border-2 border-txt-secondary border-t-transparent rounded-full animate-spin mb-3" />
          {progress && (
            <span data-el-name="CanvasProgressText" className="text-[13px] text-txt-secondary">
              {formatProgress(progress)}
            </span>
          )}
        </div>
      )}

      {image ? (
        <div data-el-name="CanvasImageContainer"
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: `scale(${scale}) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <img data-el-name="CanvasImage"
            src={`data:image/jpeg;base64,${image}`}
            alt="generated"
            className="max-w-full max-h-full object-contain pointer-events-none"
          />
        </div>
      ) : !loading ? (
        <div data-el-name="CanvasEmptyState" className="h-full min-h-[280px] flex items-center justify-center text-txt-tertiary p-6">
            <div data-el-name="CanvasEmptyStateInner" className="text-center max-w-[240px]">
            <div data-el-name="CanvasEmptyIcon" className="mx-auto mb-3 w-16 h-16 rounded-full bg-surface-el border border-border flex items-center justify-center text-txt-secondary">
              <WandSparkle size={26} />
            </div>
            <p data-el-name="CanvasEmptyText" className="text-[15px] text-txt-secondary">Zadej prompt a vygeneruj obrázek</p>
            <p data-el-name="CanvasEmptyHint" className="text-[13px] mt-1">Výsledek se ukáže tady</p>
          </div>
        </div>
      ) : null}

      {/* Tenký progress řádek */}
      {loading && progress && progress.total > 0 && (
        <div data-el-name="CanvasProgressBar" className="absolute bottom-0 inset-x-0 h-1 bg-border/60 z-20">
          <div
            data-el-name="CanvasProgressFill"
            className="h-full bg-txt-primary transition-[width] duration-300"
            style={{ width: `${Math.min(100, Math.round((progress.step / progress.total) * 100))}%` }}
          />
        </div>
      )}

      {/* Zoom controls */}
      {image && (
        <div data-el-name="CanvasZoomControls" className="absolute bottom-2 right-2 z-20 flex items-center gap-1 bg-surface/80 backdrop-blur rounded-lg p-1 border border-border">
          <button data-el-name="CanvasZoomOut" onClick={zoomOut} className="w-7 h-7 rounded flex items-center justify-center text-xs text-txt-primary hover:bg-border active:bg-border transition-colors">−</button>
          <button data-el-name="CanvasZoomReset" onClick={resetView} className="w-7 h-7 rounded flex items-center justify-center text-[10px] text-txt-secondary hover:bg-border active:bg-border transition-colors">{zoomActive ? `${Math.round(scale * 100)}%` : '1:1'}</button>
          <button data-el-name="CanvasZoomIn" onClick={zoomIn} className="w-7 h-7 rounded flex items-center justify-center text-xs text-txt-primary hover:bg-border active:bg-border transition-colors">+</button>
        </div>
      )}
    </div>
  );
}
