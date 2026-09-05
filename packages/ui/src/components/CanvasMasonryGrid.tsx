import { useState, useCallback, useEffect, useMemo } from 'react';
import type { CanvasImage } from '@opendraw/api-client';
import { getCanvasImageUrl } from '@opendraw/api-client';
import { Download, Trash, Sparkles } from 'reicon-react';

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

interface ContextMenuState {
  x: number;
  y: number;
  imageId: string;
  seed: number;
}

interface TileProps {
  image: CanvasImage;
  canvasId: string;
  isGenerating: boolean;
  progress: { step: number; total: number; phase?: string } | null;
  previewImage: string | null;
  onGenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, image: CanvasImage) => void;
}

function TileActions({
  image,
  canvasId,
  onDelete,
}: {
  image: CanvasImage;
  canvasId: string;
  onDelete: (id: string) => void;
}) {
  const url = getCanvasImageUrl(canvasId, image.id);
  return (
    <div
      data-el-name="CanvasCardActions"
      className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-10"
    >
      <a
        data-el-name="CanvasCardDownload"
        href={url}
        download
        target="_blank"
        rel="noreferrer"
        title="Stáhnout"
        onClick={(e) => e.stopPropagation()}
        className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md flex items-center justify-center transition-colors"
      >
        <Download size={12} />
      </a>
      <button
        data-el-name="CanvasCardDelete"
        title="Smazat"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(image.id);
        }}
        className="w-7 h-7 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md flex items-center justify-center transition-colors"
      >
        <Trash size={12} />
      </button>
    </div>
  );
}

function PromptOverlay({ image }: { image: CanvasImage }) {
  return (
    <div
      data-el-name="CanvasCardPromptOverlay"
      className="absolute inset-x-0 bottom-0 p-2 pt-7 bg-gradient-to-t from-black/80 via-black/35 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none"
    >
      <p data-el-name="CanvasCardPrompt" className="text-[10px] leading-tight text-white/90 line-clamp-2">
        {image.prompt}
      </p>
      <p data-el-name="CanvasCardMeta" className="text-[9px] text-white/50 mt-0.5 tabular-nums">
        {image.width}×{image.height} · seed {image.seed}
      </p>
    </div>
  );
}

function CanvasTile({
  image,
  canvasId,
  isGenerating,
  progress,
  previewImage,
  onGenerate,
  onDelete,
  onContextMenu,
}: TileProps) {
  const url = getCanvasImageUrl(canvasId, image.id);

  if (image.status === 'completed') {
    return (
      <div
        data-el-name="CanvasMasonryCard"
        className="group relative break-inside-avoid mb-px bg-canvas cursor-pointer"
        onContextMenu={(e) => onContextMenu(e, image)}
      >
        <img
          data-el-name="CanvasMasonryImage"
          src={url}
          alt={image.prompt || 'canvas image'}
          loading="lazy"
          draggable={false}
          className="w-full h-auto block animate-canvas-fade-in"
        />
        <TileActions image={image} canvasId={canvasId} onDelete={onDelete} />
        <PromptOverlay image={image} />
      </div>
    );
  }

  // Pending / generating / failed → pulzující placeholder na poměru stran
  const failed = image.status === 'failed';
  const pending = image.status === 'pending';

  return (
    <div
      data-el-name="CanvasPlaceholderCard"
      className="group relative break-inside-avoid mb-px bg-canvas"
      onContextMenu={(e) => onContextMenu(e, image)}
    >
      <div
        data-el-name="CanvasPlaceholder"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        className={`relative w-full overflow-hidden ${pending ? 'cursor-pointer hover:bg-surface/10' : ''}`}
        onClick={pending ? () => onGenerate(image.id) : undefined}
      >
        <div
          data-el-name="CanvasPlaceholderPulse"
          className={`absolute inset-0 m-px border ${
            failed
              ? 'bg-err/10 border-err/40 border-dashed'
              : 'bg-surface opacity-50 animate-pulse'
          }`}
        />
        {isGenerating && previewImage && (
          <img
            data-el-name="CanvasPlaceholderPreview"
            src={`data:image/png;base64,${previewImage}`}
            alt="generating preview"
            className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
          />
        )}
        <div data-el-name="CanvasPlaceholderContent" className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-2 text-center">
          {isGenerating ? (
            <>
              <div data-el-name="CanvasPlaceholderSpinner" className="w-6 h-6 border-2 border-txt-secondary border-t-transparent rounded-full animate-spin" />
              <span data-el-name="CanvasPlaceholderProgress" className="text-[11px] text-txt-secondary">
                {progress ? formatProgress(progress) : 'Generuji…'}
              </span>
              <span className="text-[10px] text-txt-tertiary tabular-nums">{image.width}×{image.height}</span>
            </>
          ) : pending ? (
            <>
              <Sparkles data-el-name="CanvasPlaceholderSparkles" size={18} className="text-txt-tertiary" />
              <span className="text-[11px] text-txt-secondary">Čeká na generování</span>
              <span className="text-[10px] text-txt-tertiary tabular-nums">{image.width}×{image.height}</span>
              <span className="text-[10px] text-txt-tertiary/70">Klikni a generuj</span>
            </>
          ) : (
            <>
              <span className="text-[11px] text-err">Generování selhalo</span>
              <button
                data-el-name="CanvasPlaceholderRetry"
                onClick={(e) => {
                  e.stopPropagation();
                  onGenerate(image.id);
                }}
                className="text-[10px] px-2.5 py-1 rounded-full bg-black/70 hover:bg-black text-white backdrop-blur-md transition-colors"
              >
                Zkusit znovu
              </button>
            </>
          )}
        </div>
      </div>
      {!isGenerating && <TileActions image={image} canvasId={canvasId} onDelete={onDelete} />}
    </div>
  );
}

interface Props {
  canvasId: string;
  images: CanvasImage[];
  searchQuery: string;
  generating: boolean;
  generatingImageId: string | null;
  progress: { step: number; total: number; phase?: string } | null;
  previewImage: string | null;
  onGenerate: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function CanvasMasonryGrid({
  canvasId,
  images,
  searchQuery,
  generating,
  generatingImageId,
  progress,
  previewImage,
  onGenerate,
  onDelete,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Nové nahoře
  const sorted = useMemo(
    () => [...images].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [images],
  );

  const visible = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter(
      (img) => img.prompt.toLowerCase().includes(q) || String(img.seed).includes(q),
    );
  }, [sorted, searchQuery]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, image: CanvasImage) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, imageId: image.id, seed: image.seed });
    },
    [],
  );

  const handleCopySeed = useCallback(() => {
    if (!contextMenu) return;
    navigator.clipboard.writeText(String(contextMenu.seed));
    setContextMenu(null);
  }, [contextMenu]);

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    onDelete(contextMenu.imageId);
    setContextMenu(null);
  }, [contextMenu, onDelete]);

  // Zavření context menu při kliku jinde
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [contextMenu]);

  if (images.length === 0) {
    return (
      <div data-el-name="CanvasEmptyState" className="h-full flex flex-col items-center justify-center text-txt-tertiary pb-40">
        <Sparkles data-el-name="CanvasEmptyIcon" size={28} className="mb-3" />
        <p data-el-name="CanvasEmptyTitle" className="text-sm text-txt-secondary">Canvas je prázdný</p>
        <p data-el-name="CanvasEmptyHint" className="text-xs mt-1">
          Napiš prompt do pole níže a stiskni Generovat
        </p>
      </div>
    );
  }

  return (
    <div data-el-name="CanvasMasonryRoot" className="min-h-full relative">
      {visible.length === 0 ? (
        <div data-el-name="CanvasSearchEmpty" className="h-full flex flex-col items-center justify-center text-txt-tertiary pb-40">
          <p data-el-name="CanvasSearchEmptyText" className="text-sm">
            Žádné shody pro „{searchQuery.trim()}“
          </p>
        </div>
      ) : (
        <div
          data-el-name="CanvasMasonryGrid"
          className="columns-2 md:columns-4 gap-px bg-canvas pb-56"
        >
          {visible.map((img) => (
            <CanvasTile
              key={img.id}
              image={img}
              canvasId={canvasId}
              isGenerating={generating && generatingImageId === img.id}
              progress={generating && generatingImageId === img.id ? progress : null}
              previewImage={generating && generatingImageId === img.id ? previewImage : null}
              onGenerate={onGenerate}
              onDelete={onDelete}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      )}

      {contextMenu && (
        <div
          data-el-name="CanvasContextMenu"
          className="fixed z-50 glass-panel rounded-lg shadow-xl py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            data-el-name="CanvasContextMenuDelete"
            className="w-full px-3 py-1.5 text-left text-xs text-txt-primary hover:bg-surface-el transition-colors"
            onClick={handleDeleteFromMenu}
          >
            Smazat
          </button>
          <button
            data-el-name="CanvasContextMenuCopySeed"
            className="w-full px-3 py-1.5 text-left text-xs text-txt-primary hover:bg-surface-el transition-colors"
            onClick={handleCopySeed}
          >
            Kopírovat seed
          </button>
        </div>
      )}
    </div>
  );
}
