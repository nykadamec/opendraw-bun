import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import CanvasTopBar from '../components/CanvasTopBar';
import CanvasMasonryGrid from '../components/CanvasMasonryGrid';
import CanvasComposer from '../components/CanvasComposer';
import {
  generateImage,
  fetchEcho,
  fetchCloudModels,
  getCanvasImages,
  addCanvasPregen,
  deleteCanvasImage,
  completePregen,
  failPregen,
  listCanvasProjects,
} from '@opendraw/api-client';
import type { EchoResponse, CloudModel } from '@opendraw/api-client';
import type { CanvasImage, LoraMetadata } from '@opendraw/api-client';
import { DEFAULT_SAMPLER_ID } from '../samplers';
import { DEFAULT_SEED_MODE_ID, seedModeToInt, type SeedModeId } from '../seedModes';
import { DEFAULT_UPSCALER_SCALE_FACTOR, type UpscalerScaleFactor } from '../upscalers';
import { getLoraMetadata } from '@opendraw/api-client';
import { useFeatureFlag } from '../hooks/useFeatureFlag';
import {
  calcDimensions,
  type SizeLevel,
  type AspectRatio,
} from './GeneratePage';

function round8(n: number): number {
  return Math.max(64, Math.round(n / 8) * 8);
}

const SIZE_LABEL: Record<SizeLevel, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
};

function AccordionSection({ id, label, children, openSection, onToggle }: {
  id: string;
  label: string;
  children: React.ReactNode;
  openSection: string | null;
  onToggle: (id: string) => void;
}) {
  const isOpen = openSection === id;
  const capId = id.charAt(0).toUpperCase() + id.slice(1);
  return (
    <div data-el-name={`AccordionSection${capId}`} className="border border-border rounded-lg overflow-hidden">
      <button data-el-name={`AccordionToggle${capId}`}
        onClick={() => onToggle(id)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-txt-primary bg-surface active:bg-border transition-colors"
      >
        {label}
        <span data-el-name={`AccordionChevron${capId}`} className={`text-txt-tertiary transition-transform ${isOpen ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {isOpen && <div data-el-name={`AccordionContent${capId}`} className="p-3 space-y-3 bg-canvas/60 text-xs">{children}</div>}
    </div>
  );
}

function ChoiceRow<T extends string>({ label, value, options, onChange, cols = 3 }: {
  label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; cols?: number;
}) {
  const rowName = `ChoiceRow${label.replace(/\s+/g, '')}`;
  return (
    <div data-el-name={rowName}>
      <label data-el-name={`${rowName}Label`} className="text-xs text-txt-secondary mb-1.5 block">{label}</label>
      <div data-el-name={`${rowName}Grid`} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <div key={opt.value} data-el-name={`${rowName}Option`} role="button" tabIndex={0} onClick={() => onChange(opt.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange(opt.value); } }}
              aria-pressed={selected}
              className={`text-center py-2 rounded-lg text-xs border cursor-pointer transition-colors ${selected ? 'bg-txt-primary text-canvas border-txt-primary' : 'bg-surface border-border text-txt-primary active:bg-border'}`}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 cursor-pointer">
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="accent-txt-primary mt-0.5" />
      <div>
        <span className="text-xs text-txt-primary">{label}</span>
        {description && <p className="text-[10px] text-txt-tertiary mt-0.5 leading-snug">{description}</p>}
      </div>
    </label>
  );
}

export default function CanvasPage() {
  const { id: canvasId } = useParams<{ id: string }>();

  // Gen config state — mirrors GeneratePage
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegative] = useState('');
  const [model, setModel] = useState('');
  const [sampler, setSampler] = useState(DEFAULT_SAMPLER_ID);
  const [steps, setSteps] = useState(28);
  const [cfg, setCfg] = useState(3.5);
  const [seed, setSeed] = useState(-1);
  const [sizeLevel, setSizeLevel] = useState<SizeLevel>('normal');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1');
  const [customDimensions, setCustomDimensions] = useState(false);
  const [widthCustom, setWidthCustom] = useState(1024);
  const [heightCustom, setHeightCustom] = useState(1024);
  const [shift, setShift] = useState(1.0);
  const [clipSkip, setClipSkip] = useState(1);
  const [resolutionDependentShift, setResolutionDependentShift] = useState(true);
  const [randomizeSeed, setRandomizeSeed] = useState(false);
  const [seedMode, setSeedMode] = useState<SeedModeId>(DEFAULT_SEED_MODE_ID);
  const [upscaler, setUpscaler] = useState('');
  const [upscalerScaleFactor, setUpscalerScaleFactor] = useState<UpscalerScaleFactor>(DEFAULT_UPSCALER_SCALE_FACTOR);
  const [loras, setLoras] = useState<{ file: string; weight: number }[]>([]);
  const [strength, setStrength] = useState(1.0);
  const [stochasticSamplingGamma, setStochasticSamplingGamma] = useState(0.3);
  const [numFrames, setNumFrames] = useState(0);
  const [cfgZeroStar, setCfgZeroStar] = useState(false);
  const [modelList, setModelList] = useState<string[]>([]);
  const [cloudModels, setCloudModels] = useState<CloudModel[]>([]);
  const [loraList, setLoraList] = useState<string[]>([]);
  const [loraNames, setLoraNames] = useState<Record<string, string>>({});
  const [loraMetadataCache, setLoraMetadataCache] = useState<Map<string, LoraMetadata>>(new Map());
  const [loraSearchDesktop, setLoraSearchDesktop] = useState('');

  // Refiner / hires / zero negative
  const [refinerModel, setRefinerModel] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem('opendraw_refinerModel') ?? ''; }
    catch { return ''; }
  });
  const [refinerStart, setRefinerStart] = useState(() => {
    if (typeof window === 'undefined') return 0.85;
    try { return +(window.localStorage.getItem('opendraw_refinerStart') ?? '0.85'); }
    catch { return 0.85; }
  });
  const [zeroNegativePrompt, setZeroNegativePrompt] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('opendraw_zeroNegativePrompt') === 'true'; }
    catch { return false; }
  });
  const [hiresFix, setHiresFix] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem('opendraw_hiresFix') === 'true'; }
    catch { return false; }
  });
  const [hiresFixWidth, setHiresFixWidth] = useState(() => {
    if (typeof window === 'undefined') return 512;
    try { return +(window.localStorage.getItem('opendraw_hiresFixWidth') ?? '512'); }
    catch { return 512; }
  });
  const [hiresFixHeight, setHiresFixHeight] = useState(() => {
    if (typeof window === 'undefined') return 512;
    try { return +(window.localStorage.getItem('opendraw_hiresFixHeight') ?? '512'); }
    catch { return 512; }
  });
  const [hiresFixStrength, setHiresFixStrength] = useState(() => {
    if (typeof window === 'undefined') return 0.7;
    try { return +(window.localStorage.getItem('opendraw_hiresFixStrength') ?? '0.7'); }
    catch { return 0.7; }
  });

  // Canvas-specific state
  const [images, setImages] = useState<CanvasImage[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ step: number; total: number; phase?: string } | null>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activePregenId, setActivePregenId] = useState<string | null>(null);
  const [connected, setConnected] = useState(true);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [projectName, setProjectName] = useState('Canvas');

  const [canvasgen2] = useFeatureFlag('canvasgen2', false);
  const cancelRef = useRef<(() => void) | null>(null);

  // Derived dimensions
  const [derivedWidth, derivedHeight] = useMemo(
    () => calcDimensions(sizeLevel, aspectRatio),
    [sizeLevel, aspectRatio],
  );

  const width = customDimensions ? widthCustom : derivedWidth;
  const height = customDimensions ? heightCustom : derivedHeight;

  const effectiveShift = useMemo(() => {
    if (!resolutionDependentShift) return shift;
    const exponent = ((width * height) / 256 - 256) * 0.00016927 + 0.5;
    return Math.round(Math.exp(exponent) * 100) / 100;
  }, [width, height, shift, resolutionDependentShift]);

  // Load canvas images
  useEffect(() => {
    if (!canvasId) return;
    let cancelled = false;
    (async () => {
      try {
        const imgs = await getCanvasImages(canvasId);
        if (cancelled) return;
        setImages(imgs);
      } catch (err) {
        console.error('Failed to load canvas:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [canvasId]);

  // Load project name for the top bar
  useEffect(() => {
    if (!canvasId) return;
    listCanvasProjects()
      .then((list) => {
        const proj = list.find((pr) => pr.id === canvasId);
        if (proj) setProjectName(proj.name);
      })
      .catch(() => {});
  }, [canvasId]);

  // Fetch echo (models + loras)
  useEffect(() => {
    fetchEcho()
      .then((data: EchoResponse) => {
        setConnected(true);
        if (data.files && data.files.length > 0) {
          const allModels = data.files.filter(
            (f: string) =>
              f.endsWith('.ckpt') &&
              !f.toLowerCase().includes('lora') &&
              !f.toLowerCase().includes('clip'),
          );
          setModelList(allModels);
          if (allModels.length > 0) {
            setModel((current) => (current && current.length > 0 ? current : allModels[0]));
          }
          const loraFiles = data.files.filter((f: string) => f.toLowerCase().includes('lora'));
          setLoraList(loraFiles);
          if (data.loraNames) setLoraNames(data.loraNames);
        }
      })
      .catch(() => setConnected(false));
    fetchCloudModels()
      .then((data) => setCloudModels(data.models || []))
      .catch(() => setCloudModels([]));
  }, []);

  // LoRA metadata loading
  useEffect(() => {
    const active = loras
      .map((l) => l.file)
      .filter((f) => f.endsWith('.safetensors') || f.endsWith('.ckpt'));
    const missing = active.filter((f) => !loraMetadataCache.has(f));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(
      missing.map((file) =>
        getLoraMetadata(file)
          .then((meta) => ({ file, meta }))
          .catch(() => ({ file, meta: { triggerWords: [] } as LoraMetadata })),
      ),
    ).then((results) => {
      if (cancelled) return;
      setLoraMetadataCache((prev) => {
        const next = new Map(prev);
        for (const { file, meta } of results) {
          next.set(file, meta);
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [loras, loraMetadataCache]);

  // Persist refiner/hires/zeroNegative
  useEffect(() => { try { window.localStorage.setItem('opendraw_refinerModel', refinerModel); } catch {} }, [refinerModel]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_refinerStart', String(refinerStart)); } catch {} }, [refinerStart]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_zeroNegativePrompt', String(zeroNegativePrompt)); } catch {} }, [zeroNegativePrompt]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_hiresFix', String(hiresFix)); } catch {} }, [hiresFix]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_hiresFixWidth', String(hiresFixWidth)); } catch {} }, [hiresFixWidth]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_hiresFixHeight', String(hiresFixHeight)); } catch {} }, [hiresFixHeight]);
  useEffect(() => { try { window.localStorage.setItem('opendraw_hiresFixStrength', String(hiresFixStrength)); } catch {} }, [hiresFixStrength]);

  // --- Canvas actions ---

  const startGeneration = useCallback((target: CanvasImage) => {
    if (!canvasId || generating) return;

    // Mark as generating locally
    setImages((prev) =>
      prev.map((img) => (img.id === target.id ? { ...img, status: 'generating' as const } : img)),
    );
    setActivePregenId(target.id);
    setGenerating(true);
    setProgress(null);
    setPreviewImage(null);

    const effectiveSeed = randomizeSeed
      ? Math.floor(Math.random() * 2147483647)
      : seed;

    const cancel = generateImage(
      {
        prompt,
        negativePrompt,
        model,
        sampler,
        steps,
        cfg,
        seed: effectiveSeed,
        batchCount: 1,
        width: target.width,
        height: target.height,
        loras,
        shift: effectiveShift,
        clipSkip,
        resolutionDependentShift,
        saveToGallery: false,
        seedMode: seedModeToInt(seedMode),
        upscaler: upscaler || undefined,
        upscalerScaleFactor: upscaler ? upscalerScaleFactor : undefined,
        strength,
        stochasticSamplingGamma,
        numFrames,
        cfgZeroStar,
        zeroNegativePrompt: zeroNegativePrompt || undefined,
        refinerModel: refinerModel || undefined,
        refinerStart: refinerModel ? refinerStart : undefined,
        hiresFix: hiresFix || undefined,
        hiresFixWidth: hiresFix ? hiresFixWidth : undefined,
        hiresFixHeight: hiresFix ? hiresFixHeight : undefined,
        hiresFixStrength: hiresFix ? hiresFixStrength : undefined,
      },

      {
        onProgress: (step, total, phase) => setProgress({ step, total, phase }),
        onPreview: (imageBase64) => setPreviewImage(imageBase64),
        onComplete: async (data) => {
          if (!canvasId) return;
          try {
            const base64 = data.imageBase64 as string;
            await completePregen(canvasId, target.id, base64, {
              prompt,
              negativePrompt,
              model,
              sampler,
              steps,
              cfg,
              seed: effectiveSeed,
              width: target.width,
              height: target.height,
              loras,
              shift: effectiveShift,
              clipSkip,
              resolutionDependentShift,
              seedMode: seedModeToInt(seedMode),
            });
            // Reload images from server to get the completed state
            const updated = await getCanvasImages(canvasId);
            setImages(updated);
          } catch (err) {
            console.error('Failed to complete pregen:', err);
            try { await failPregen(canvasId, target.id); } catch {}
            setImages((prev) =>
              prev.map((img) => (img.id === target.id ? { ...img, status: 'failed' as const } : img)),
            );
          }
          setGenerating(false);
          setProgress(null);
          setPreviewImage(null);
          setActivePregenId(null);
          cancelRef.current = null;
        },
        onError: async (err) => {
          console.error('Generation error:', err);
          if (canvasId) {
            try { await failPregen(canvasId, target.id); } catch {}
          }
          setImages((prev) =>
            prev.map((img) => (img.id === target.id ? { ...img, status: 'failed' as const } : img)),
          );
          setGenerating(false);
          setProgress(null);
          setPreviewImage(null);
          setActivePregenId(null);
          cancelRef.current = null;
        },
      },
    );
    cancelRef.current = cancel;
  }, [canvasId, generating, prompt, negativePrompt, model, sampler, steps, cfg, seed, randomizeSeed, loras, effectiveShift, clipSkip, resolutionDependentShift, seedMode, upscaler, upscalerScaleFactor, strength, stochasticSamplingGamma, numFrames, cfgZeroStar, zeroNegativePrompt, refinerModel, refinerStart, hiresFix, hiresFixWidth, hiresFixHeight, hiresFixStrength]);

  const handleGeneratePregen = useCallback((imageId: string) => {
    const target = images.find((img) => img.id === imageId);
    if (!target || target.status !== 'pending') return;
    startGeneration(target);
  }, [images, startGeneration]);


  // Composer „Generovat“ — vytvoří pregen nahoře v masonry a hned spustí generování
  const handleGenerate = useCallback(async () => {
    if (!canvasId || generating) return;
    try {
      const img = await addCanvasPregen(canvasId, 0, 0, width, height);
      setImages((prev) => [...prev, img]);
      startGeneration(img);
    } catch (err) {
      console.error('Failed to add pregen:', err);
    }
  }, [canvasId, generating, width, height, startGeneration]);

  const handleStop = useCallback(() => {
    if (cancelRef.current) {
      cancelRef.current();
      cancelRef.current = null;
    }
    setGenerating(false);
    setProgress(null);
    setPreviewImage(null);
    setActivePregenId(null);
  }, []);

  const handleDeleteImage = useCallback(async (imageId: string) => {
    if (!canvasId) return;
    setImages((prev) => prev.filter((img) => img.id !== imageId));
    try {
      await deleteCanvasImage(canvasId, imageId);
    } catch (err) {
      console.error('Failed to delete image:', err);
    }
  }, [canvasId]);


  const handleResetConfig = useCallback(() => {
    setSampler(DEFAULT_SAMPLER_ID);
    setSteps(28);
    setCfg(3.5);
    setSeed(-1);
    setSizeLevel('normal');
    setAspectRatio('1:1');
    setCustomDimensions(false);
    setWidthCustom(1024);
    setHeightCustom(1024);
    setShift(1.0);
    setClipSkip(1);
    setResolutionDependentShift(true);
    setRandomizeSeed(false);
    setSeedMode(DEFAULT_SEED_MODE_ID);
    setUpscaler('');
    setUpscalerScaleFactor(DEFAULT_UPSCALER_SCALE_FACTOR);
    setLoras([]);
    setStrength(1.0);
    setStochasticSamplingGamma(0.3);
    setNumFrames(0);
    setCfgZeroStar(false);
    setRefinerModel('');
    setRefinerStart(0.85);
    setZeroNegativePrompt(false);
    setHiresFix(false);
    setHiresFixWidth(512);
    setHiresFixHeight(512);
    setHiresFixStrength(0.7);
  }, []);

  // Počet shod pro vyhledávání v top baru (stejná logika jako filtr v gridu)
  const matchCount = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return images.filter(
      (img) => img.prompt.toLowerCase().includes(q) || String(img.seed).includes(q),
    ).length;
  }, [images, search]);
  const sizeLabel = customDimensions
    ? `${width}×${height} (custom)`
    : `${width}×${height} (${aspectRatio})`;

  const openDesktopSection = (section: string) => {
    setOpenSection((prev) => (prev === section ? null : section));
  };

  // Trigger chips (same logic as GeneratePage)
  const missingTriggers: string[] = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const promptLower = prompt.toLowerCase();
    for (const l of loras) {
      const meta = loraMetadataCache.get(l.file);
      if (!meta) continue;
      for (const word of meta.triggerWords) {
        const key = word.toLowerCase();
        if (seen.has(key)) continue;
        if (promptLower.includes(key)) continue;
        seen.add(key);
        out.push(word);
      }
    }
    return out;
  }, [loras, loraMetadataCache, prompt]);

  const triggerChips = missingTriggers.length > 0 ? (
    <div data-el-name="TriggerChipList" className="flex flex-wrap gap-1.5 pt-1">
      {missingTriggers.map((word) => (
        <button
          data-el-name="TriggerChipButton"
          key={word}
          type="button"
          onClick={() => setPrompt((prev) => (prev.trim() ? `${word}, ${prev}` : word))}
          className="text-[10px] px-2 py-1 rounded-full bg-surface border border-border text-txt-secondary hover:bg-surface-el hover:text-txt-primary active:bg-border transition-colors"
          title={`Přidat "${word}" na začátek promptu`}
        >
          + {word}
        </button>
      ))}
    </div>
  ) : null;

  if (!canvasId) return null;

  return (
    <div data-el-name="CanvasPageRoot" className="h-full w-full flex flex-col bg-canvas">
      <CanvasTopBar
        projectName={projectName}
        search={search}
        onSearchChange={setSearch}
        matchCount={matchCount}
        floating={canvasgen2}
      />
      <main
        data-el-name="CanvasMasonryMain"
        className={`flex-1 overflow-y-auto ${canvasgen2 ? 'pl-[272px]' : ''}`}
      >
        <CanvasMasonryGrid
          canvasId={canvasId}
          images={images}
          searchQuery={search}
          generating={generating}
          generatingImageId={activePregenId}
          progress={progress}
          previewImage={previewImage}
          onGenerate={handleGeneratePregen}
          onDelete={handleDeleteImage}
        />
      </main>
      <CanvasComposer
        floating={canvasgen2}
        prompt={prompt}
        onPromptChange={setPrompt}
        negativePrompt={negativePrompt}
        onNegativeChange={setNegative}
        triggerChips={triggerChips}
        model={model}
        onModelChange={setModel}
        modelList={modelList}
        cloudModels={cloudModels}
        sizeLevel={sizeLevel}
        onSizeLevelChange={setSizeLevel}
        aspectRatio={aspectRatio}
        onAspectRatioChange={setAspectRatio}
        customDimensions={customDimensions}
        onCustomDimensionsChange={setCustomDimensions}
        widthCustom={widthCustom}
        onWidthCustomChange={setWidthCustom}
        heightCustom={heightCustom}
        onHeightCustomChange={setHeightCustom}
        width={width}
        height={height}
        sampler={sampler}
        onSamplerChange={setSampler}
        steps={steps}
        onStepsChange={setSteps}
        cfg={cfg}
        onCfgChange={setCfg}
        seed={seed}
        onSeedChange={setSeed}
        randomizeSeed={randomizeSeed}
        onRandomizeSeedChange={setRandomizeSeed}
        seedMode={seedMode}
        onSeedModeChange={setSeedMode}
        effectiveShift={effectiveShift}
        onShiftChange={setShift}
        resolutionDependentShift={resolutionDependentShift}
        onResolutionDependentShiftChange={setResolutionDependentShift}
        clipSkip={clipSkip}
        onClipSkipChange={setClipSkip}
        strength={strength}
        onStrengthChange={setStrength}
        stochasticSamplingGamma={stochasticSamplingGamma}
        onStochasticSamplingGammaChange={setStochasticSamplingGamma}
        cfgZeroStar={cfgZeroStar}
        onCfgZeroStarChange={setCfgZeroStar}
        zeroNegativePrompt={zeroNegativePrompt}
        onZeroNegativePromptChange={setZeroNegativePrompt}
        upscaler={upscaler}
        onUpscalerChange={setUpscaler}
        upscalerScaleFactor={upscalerScaleFactor}
        onUpscalerScaleFactorChange={setUpscalerScaleFactor}
        refinerModel={refinerModel}
        onRefinerModelChange={setRefinerModel}
        refinerStart={refinerStart}
        onRefinerStartChange={setRefinerStart}
        hiresFix={hiresFix}
        onHiresFixChange={setHiresFix}
        hiresFixWidth={hiresFixWidth}
        onHiresFixWidthChange={setHiresFixWidth}
        hiresFixHeight={hiresFixHeight}
        onHiresFixHeightChange={setHiresFixHeight}
        hiresFixStrength={hiresFixStrength}
        onHiresFixStrengthChange={setHiresFixStrength}
        loras={loras}
        onLorasChange={setLoras}
        loraList={loraList}
        loraNames={loraNames}
        loraSearch={loraSearchDesktop}
        onLoraSearchChange={setLoraSearchDesktop}
        openSection={openSection}
        onOpenSection={openDesktopSection}
        generating={generating}
        connected={connected}
        onGenerate={handleGenerate}
        onStop={handleStop}
        onResetConfig={handleResetConfig}
      />
    </div>
  );
}