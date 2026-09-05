import { useState, useEffect, useRef } from 'react';
import { displayLoraName } from '../lora-utils';
import type { SizeLevel, AspectRatio } from '../pages/GeneratePage';
import { SIZE_LEVELS, ASPECT_RATIOS } from '../pages/GeneratePage';
import { SAMPLERS } from '../samplers';
import { SEED_MODES, type SeedModeId } from '../seedModes';
import { UPSCALER_PRESETS, UPSCALER_SCALE_FACTORS, type UpscalerScaleFactor } from '../upscalers';

interface Props {
  open: boolean;
  section: string;
  onClose: () => void;
  model: string;
  modelList: string[];
  cloudModels: { name: string; version: string; file: string }[];
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  sizeLevel: SizeLevel;
  aspectRatio: AspectRatio;
  customDimensions: boolean;
  widthCustom: number;
  heightCustom: number;
  shift: number;
  clipSkip: number;
  resolutionDependentShift: boolean;
  randomizeSeed: boolean;
  seedMode: SeedModeId;
  upscaler: string;
  upscalerScaleFactor: UpscalerScaleFactor;
  saveToGallery: boolean;
  loras: { file: string; weight: number }[];
  loraList: string[];
  loraNames: Record<string, string>;
  refinerModel: string;
  refinerStart: number;
  strength: number;
  stochasticSamplingGamma: number;
  cfgZeroStar: boolean;
  zeroNegativePrompt: boolean;
  onUpdate: (field: string, value: any) => void;
}

const SIZE_LABEL: Record<SizeLevel, string> = {
  small: 'Small',
  normal: 'Normal',
  large: 'Large',
};

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  cols = 3,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  cols?: number;
}) {
  return (
    <div data-el-name="SheetChoiceRow">
      <label data-el-name="SheetChoiceLabel" className="text-[13px] text-txt-secondary mb-1.5 block">{label}</label>
      <div data-el-name="SheetChoiceGrid" className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((opt) => {
          const selected = opt.value === value;
          return (
            <div
              data-el-name="SheetChoiceOption"
              key={opt.value}
              role="button"
              tabIndex={0}
              onClick={() => onChange(opt.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(opt.value);
                }
              }}
              aria-pressed={selected}
              className={`text-center py-2 rounded-lg text-[13px] border cursor-pointer transition-colors ${
                selected
                  ? 'bg-txt-primary text-canvas border-txt-primary'
                  : 'bg-surface border-border text-txt-primary active:bg-border'
              }`}
            >
              {opt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      data-el-name="SheetToggleRow"
      role="button"
      tabIndex={0}
      onClick={() => onChange(!value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onChange(!value);
        }
      }}
      aria-pressed={value}
      className={`flex flex-col p-2.5 rounded-lg text-[13px] border cursor-pointer transition-colors ${
        value ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <span data-el-name="SheetToggleLabel" className="text-txt-primary">{label}</span>
        <span
          data-el-name="SheetToggleTrack"
          className={`w-9 h-5 rounded-full relative transition-colors ${
            value ? 'bg-txt-primary' : 'bg-border'
          }`}
        >
          <span
            data-el-name="SheetToggleThumb"
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-canvas transition-transform ${
              value ? 'translate-x-[18px]' : 'translate-x-0.5'
            }`}
          />
        </span>
      </div>
      {description && (
        <p data-el-name="SheetToggleDescription" className="text-[11px] text-txt-tertiary mt-1 leading-tight">{description}</p>
      )}
    </div>
  );
}

export default function ParamSheet({
  open,
  section,
  onClose,
  model,
  modelList,
  cloudModels,
  sampler,
  steps,
  cfg,
  seed,
  width,
  height,
  sizeLevel,
  aspectRatio,
  customDimensions,
  widthCustom,
  heightCustom,
  shift,
  clipSkip,
  resolutionDependentShift,
  randomizeSeed,
  seedMode,
  upscaler,
  upscalerScaleFactor,
  saveToGallery,
  loras,
  loraList,
  loraNames,
  refinerModel,
  refinerStart,
  strength,
  stochasticSamplingGamma,
  cfgZeroStar,
  zeroNegativePrompt,
  onUpdate,
}: Props) {
  const [loraSearch, setLoraSearch] = useState('');
  const [modelSearch, setModelSearch] = useState('');
  const [detent, setDetent] = useState(1);
  const [dragOffset, setDragOffset] = useState(0);
  const dragStartY = useRef<number | null>(null);

  const DETENT_HEIGHTS = ['40dvh', '70dvh', '92dvh'];

  // Při každém otevření začít na prostředním detentu
  useEffect(() => {
    if (open) {
      setDetent(1);
      setDragOffset(0);
    }
  }, [open]);

  // Escape zavírá sheet
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const handleDragStart = (clientY: number) => {
    dragStartY.current = clientY;
  };

  const handleDragMove = (clientY: number) => {
    if (dragStartY.current === null) return;
    const delta = clientY - dragStartY.current;
    // Táhnout jde jen dolů (nahoru řeší swipe-end skokem)
    setDragOffset(delta > 0 ? delta : delta / 3);
  };

  const handleDragEnd = () => {
    if (dragStartY.current === null) return;
    const delta = dragOffset;
    dragStartY.current = null;
    setDragOffset(0);
    if (delta > 80) {
      // Swipe dolů: nižší detent, z nejnižšího zavřít
      if (detent === 0) onClose();
      else setDetent((d) => d - 1);
    } else if (delta < -80) {
      // Swipe nahoru: vyšší detent
      setDetent((d) => Math.min(2, d + 1));
    }
  };

  if (!open) return null;

  const sections: Record<string, React.ReactNode> = {
    model: (
      <div data-el-name="SheetModelSection">
        {model && (
          <p data-el-name="SheetModelSelected" className="text-[13px] text-txt-secondary mb-2 truncate" title={model}>
            Vybráno: <span className="text-txt-primary">{model}</span>
          </p>
        )}
        <input
          data-el-name="SheetModelSearchInput"
          type="text"
          value={modelSearch}
          onChange={(e) => setModelSearch(e.target.value)}
          placeholder="Hledat model..."
          className="w-full bg-surface rounded-lg p-2.5 text-[13px] mb-3 border border-border focus:border-txt-secondary outline-none transition-colors"
        />
        <label data-el-name="SheetModelListLabel" className="text-[13px] text-txt-secondary mb-1 block">Dostupné modely</label>
        <div data-el-name="SheetModelList" className="space-y-1 max-h-60 overflow-y-auto">
          {(() => {
            const q = modelSearch.trim().toLowerCase();
            const local = modelList.filter((m) => m.toLowerCase().includes(q));
            const cloud = cloudModels.filter((cm) => `${cm.name} ${cm.file}`.toLowerCase().includes(q));
            if (local.length === 0 && cloud.length === 0) {
              return <p data-el-name="SheetModelEmpty" className="text-[13px] text-txt-tertiary">Žádné modely neodpovídají hledání</p>;
            }
            return (
              <>
                {local.map((m) => (
                  <button
                    data-el-name="SheetModelItem"
                    key={m}
                    onClick={() => {
                      onUpdate('model', m);
                      onClose();
                    }}
                    className={`w-full text-left p-2 rounded-lg text-[13px] border truncate ${
                      model === m
                        ? 'bg-surface-el border-txt-secondary'
                        : 'bg-surface border-border'
                    }`}
                    title={m}
                  >
                    {m}
                  </button>
                ))}
                {cloud.length > 0 && (
                  <div data-el-name="SheetCloudModelsDivider" className="pt-2 mt-2 border-t border-border">
                    <p className="text-[11px] text-txt-tertiary uppercase tracking-wide mb-1">DT+ Cloud modely</p>
                    <div data-el-name="SheetCloudModelList" className="space-y-1">
                      {cloud.map((cm) => (
                        <button
                          data-el-name="SheetCloudModelItem"
                          key={cm.file}
                          onClick={() => {
                            onUpdate('model', cm.file);
                            onClose();
                          }}
                          className={`w-full text-left p-2 rounded-lg text-[13px] border truncate ${
                            model === cm.file
                              ? 'bg-surface-el border-txt-secondary'
                              : 'bg-surface border-border'
                          }`}
                          title={`${cm.name} (${cm.file})`}
                        >
                          {cm.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    ),
    params: (
      <div data-el-name="SheetParamsSection" className="space-y-4">
        <ChoiceRow<SizeLevel>
          label="Velikost"
          value={sizeLevel}
          options={SIZE_LEVELS.map((s) => ({ value: s, label: SIZE_LABEL[s] }))}
          onChange={(v) => onUpdate('sizeLevel', v)}
        />

        <ChoiceRow<AspectRatio>
          label="Poměr stran"
          value={aspectRatio}
          options={ASPECT_RATIOS.map((a) => ({ value: a, label: a }))}
          onChange={(v) => onUpdate('aspectRatio', v)}
          cols={4}
        />

        <div data-el-name="SheetDimensionsBox" className="bg-surface rounded-lg p-2.5 text-[13px] text-txt-secondary border border-border">
          Rozměry: <span data-el-name="SheetDimensionsValue" className="text-txt-primary tabular-nums">{width}×{height}</span>
        </div>

        <ToggleRow
          label="Vlastní rozměry"
          value={customDimensions}
          onChange={(v) => onUpdate('customDimensions', v)}
        />

        {customDimensions && (
          <div data-el-name="SheetCustomDimensionsGrid" className="grid grid-cols-2 gap-2">
            <div data-el-name="SheetCustomWidth">
              <label data-el-name="SheetCustomWidthLabel" className="text-[13px] text-txt-secondary mb-1 block">Width</label>
              <input
                data-el-name="SheetCustomWidthInput"
                type="number"
                min={64}
                max={4096}
                step={8}
                value={widthCustom}
                onChange={(e) => onUpdate('widthCustom', +e.target.value)}
                className="w-full bg-surface rounded p-2 text-[13px] border border-border tabular-nums"
              />
            </div>
            <div data-el-name="SheetCustomHeight">
              <label data-el-name="SheetCustomHeightLabel" className="text-[13px] text-txt-secondary mb-1 block">Height</label>
              <input
                data-el-name="SheetCustomHeightInput"
                type="number"
                min={64}
                max={4096}
                step={8}
                value={heightCustom}
                onChange={(e) => onUpdate('heightCustom', +e.target.value)}
                className="w-full bg-surface rounded p-2 text-[13px] border border-border tabular-nums"
              />
            </div>
          </div>
        )}

        <div data-el-name="SheetShiftSlider">
          <label data-el-name="SheetShiftLabel" className={`text-[13px] ${resolutionDependentShift ? 'text-txt-tertiary' : 'text-txt-secondary'}`}>
            Shift: <span data-el-name="SheetShiftValue" className="tabular-nums">{(() => {
              if (resolutionDependentShift) {
                const exponent = ((width * height) / 256 - 256) * 0.00016927 + 0.5;
                return (Math.round(Math.exp(exponent) * 100) / 100).toFixed(2);
              }
              return shift.toFixed(2);
            })()}</span>{resolutionDependentShift && <span className="ml-1 text-[11px] opacity-60">auto</span>}
          </label>
          <input
            data-el-name="SheetShiftInput"
            type="range"
            min={0}
            max={7}
            step={0.05}
            value={(() => {
              if (resolutionDependentShift) {
                const exponent = ((width * height) / 256 - 256) * 0.00016927 + 0.5;
                return Math.round(Math.exp(exponent) * 100) / 100;
              }
              return shift;
            })()}
            onChange={(e) => { onUpdate('shift', +e.target.value); if (resolutionDependentShift) onUpdate('resolutionDependentShift', false); }}
            disabled={resolutionDependentShift}
            className={`w-full ${resolutionDependentShift ? 'accent-txt-tertiary opacity-50' : 'accent-txt-primary'}`}
          />
        </div>
        <div data-el-name="SheetClipSkipSlider">
          <label data-el-name="SheetClipSkipLabel" className="text-[13px] text-txt-secondary">
            Clip skip: <span data-el-name="SheetClipSkipValue" className="tabular-nums">{clipSkip}</span>
          </label>
          <input
            data-el-name="SheetClipSkipInput"
            type="range"
            min={1}
            max={12}
            step={1}
            value={clipSkip}
            onChange={(e) => onUpdate('clipSkip', +e.target.value)}
            className="w-full accent-txt-primary"
          />
        </div>

        <div data-el-name="SheetStrengthSlider">
          <label data-el-name="SheetStrengthLabel" className="text-[13px] text-txt-secondary">
            Strength: <span data-el-name="SheetStrengthValue" className="tabular-nums">{strength.toFixed(2)}</span>
          </label>
          <input
            data-el-name="SheetStrengthInput"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={strength}
            onChange={(e) => onUpdate('strength', +e.target.value)}
            className="w-full accent-txt-primary"
          />
        </div>

        <div data-el-name="SheetSssSlider">
          <label data-el-name="SheetSssLabel" className="text-[13px] text-txt-secondary">
            SSS: <span data-el-name="SheetSssValue" className="tabular-nums">{stochasticSamplingGamma.toFixed(2)}</span>
          </label>
          <input
            data-el-name="SheetSssInput"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={stochasticSamplingGamma}
            onChange={(e) => onUpdate('stochasticSamplingGamma', +e.target.value)}
            className="w-full accent-txt-primary"
          />
        </div>

        <ToggleRow
          label="CFG Zero Star"
          description="When enabled, sets CFG (guidance) scale to 0 for the positive prompt. The model generates without guidance toward the prompt, producing more creative and organic results. The negative prompt is still applied normally."
          value={cfgZeroStar}
          onChange={(v) => onUpdate('cfgZeroStar', v)}
        />

        <ToggleRow
          label="Zero Negative Prompt"
          description="When enabled, ignores the negative prompt entirely — sets it to an empty string before generation. Use this when you want to generate without a negative prompt or when certain models or LoRAs work better without one."
          value={zeroNegativePrompt}
          onChange={(v) => onUpdate('zeroNegativePrompt', v)}
        />

        <ToggleRow
          label="Resolution dependent shift"
          value={resolutionDependentShift}
          onChange={(v) => onUpdate('resolutionDependentShift', v)}
        />

        <ToggleRow
          label="Uložit do galerie"
          value={saveToGallery}
          onChange={(v) => onUpdate('saveToGallery', v)}
        />

        <div data-el-name="SheetStepsSlider">
          <label data-el-name="SheetStepsLabel" className="text-[13px] text-txt-secondary">Steps: {steps}</label>
          <input
            data-el-name="SheetStepsInput"
            type="range"
            min={1}
            max={50}
            value={steps}
            onChange={(e) => onUpdate('steps', +e.target.value)}
            className="w-full accent-txt-primary"
          />
        </div>
        <div data-el-name="SheetCfgSlider">
          <label data-el-name="SheetCfgLabel" className="text-[13px] text-txt-secondary">CFG: {cfg}</label>
          <input
            data-el-name="SheetCfgInput"
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={cfg}
            onChange={(e) => onUpdate('cfg', +e.target.value)}
            className="w-full accent-txt-primary"
          />
        </div>
        <div data-el-name="SheetSeedContainer">
          <div data-el-name="SheetSeedHeader" className="flex items-center justify-between mb-1">
            <label data-el-name="SheetSeedLabel" className="text-[13px] text-txt-secondary">Seed</label>
            <div data-el-name="SheetSeedRandomize" className="flex items-center gap-1.5">
              <input
                data-el-name="SheetSeedRandomizeCheckbox"
                id="randomize-seed"
                type="checkbox"
                checked={randomizeSeed}
                onChange={(e) => onUpdate('randomizeSeed', e.target.checked)}
                className="accent-txt-primary"
              />
              <label data-el-name="SheetSeedRandomizeLabel" htmlFor="randomize-seed" className="text-[11px] text-txt-secondary cursor-pointer">
                Randomize every run
              </label>
            </div>
          </div>
          <div data-el-name="SheetSeedInputRow" className="flex gap-2">
            <input
              data-el-name="SheetSeedInput"
              type="number"
              value={seed}
              disabled={randomizeSeed}
              onChange={(e) => onUpdate('seed', +e.target.value)}
              className="flex-1 bg-surface rounded p-2 text-[13px] border border-border disabled:opacity-40"
            />
            <button
              data-el-name="SheetSeedRandomButton"
              onClick={() => onUpdate('seed', -1)}
              className="bg-surface rounded px-3 text-[13px] border border-border"
              title="Náhodný seed"
            >
              ⏳
            </button>
          </div>
        </div>
        <ChoiceRow<SeedModeId>
          label="Seed Mode"
          value={seedMode}
          options={SEED_MODES.map((m) => ({ value: m.id, label: m.label }))}
          onChange={(v) => onUpdate('seedMode', v)}
          cols={2}
        />
        <div data-el-name="SheetSamplerContainer">
          <label data-el-name="SheetSamplerLabel" className="text-[13px] text-txt-secondary">Sampler</label>
          <select
            data-el-name="SheetSamplerSelect"
            value={sampler}
            onChange={(e) => onUpdate('sampler', e.target.value)}
            className="w-full bg-surface rounded p-2 text-[13px] border border-border"
          >
            {SAMPLERS.map((s) => (
              <option data-el-name="SheetSamplerOption" key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    ),
    upscaler: (
      <div data-el-name="SheetUpscalerSection" className="space-y-4">
        <div data-el-name="SheetUpscalerModel">
          <label data-el-name="SheetUpscalerModelLabel" className="text-[13px] text-txt-secondary mb-1 block">Model</label>
          <select
            data-el-name="SheetUpscalerSelect"
            value={upscaler}
            onChange={(e) => onUpdate('upscaler', e.target.value)}
            className="w-full bg-surface rounded-lg p-2.5 text-[13px] border border-border focus:border-txt-secondary outline-none transition-colors"
          >
            {UPSCALER_PRESETS.map((u) => (
              <option data-el-name="SheetUpscalerOption" key={u.id} value={u.id}>{u.label}</option>
            ))}
          </select>
        </div>
        <ChoiceRow<string>
          label="Scale factor"
          value={String(upscalerScaleFactor)}
          options={UPSCALER_SCALE_FACTORS.map((s) => ({ value: String(s), label: `${s}x` }))}
          onChange={(v) => onUpdate('upscalerScaleFactor', +v)}
          cols={4}
        />
      </div>
    ),
    refiner: (
      <div data-el-name="SheetRefinerSection" className="space-y-4">
        <div data-el-name="SheetRefinerModelRow">
          <label data-el-name="SheetRefinerModelLabel" className="text-[13px] text-txt-secondary mb-1 block">
            Refiner model <span className="text-txt-tertiary">(prázdné = vypnuto)</span>
          </label>
          <input data-el-name="SheetRefinerModelInput" type="text"
            value={refinerModel}
            onChange={(e) => onUpdate('refinerModel', e.target.value)}
            placeholder="např. sdxl_refiner_v0.9"
            className="w-full bg-surface rounded-lg p-2.5 text-[13px] border border-border focus:border-txt-secondary outline-none transition-colors"
          />
        </div>
        {refinerModel && modelList.length > 0 && (
          <div data-el-name="SheetRefinerModelList" className="space-y-1 max-h-32 overflow-y-auto">
            {modelList.filter((m) => m !== model && m.toLowerCase().includes(refinerModel.toLowerCase()))
              .slice(0, 15)
              .map((m) => (
                <button key={m} data-el-name="SheetRefinerModelItem"
                  onClick={() => onUpdate('refinerModel', m)}
                  className={`w-full text-left p-2 rounded-lg text-[13px] border ${refinerModel === m ? 'bg-surface-el border-txt-secondary' : 'bg-surface border-border'}`}
                >
                  {m}
                </button>
              ))}
          </div>
        )}
        {refinerModel && (
          <div data-el-name="SheetRefinerStartSlider">
            <label data-el-name="SheetRefinerStartLabel" className="text-[13px] text-txt-secondary">
              Refiner start: <span data-el-name="SheetRefinerStartValue" className="tabular-nums">{refinerStart.toFixed(2)}</span>
            </label>
            <input data-el-name="SheetRefinerStartInput" type="range"
              min={0} max={1} step={0.01} value={refinerStart}
              onChange={(e) => onUpdate('refinerStart', +e.target.value)}
              className="w-full accent-txt-primary"
            />
          </div>
        )}
      </div>
    ),
    loras: (
      <div data-el-name="SheetLorasSection">
        <input
          data-el-name="SheetLoraSearchInput"
          type="text"
          placeholder="Hledat LoRA..."
          value={loraSearch}
          onChange={(e) => setLoraSearch(e.target.value)}
          className="w-full bg-surface rounded-lg p-2.5 text-[13px] mb-3 border border-border focus:border-txt-secondary outline-none transition-colors"
        />
        <div data-el-name="SheetLoraList" className="space-y-3 max-h-60 overflow-y-auto">
        {loraList.length === 0 && (
          <p data-el-name="SheetLoraEmpty" className="text-[13px] text-txt-tertiary">Žádné LoRA nejsou k dispozici</p>
        )}
        {loraList
          .filter((lora) => lora.toLowerCase().includes(loraSearch.toLowerCase()))
          .sort((a, b) => {
            const aActive = loras.some((l) => l.file === a) ? 0 : 1;
            const bActive = loras.some((l) => l.file === b) ? 0 : 1;
            return aActive - bActive;
          })
          .map((lora) => {
            const active = loras.find((l) => l.file === lora);
            const toggle = () => {
              if (active) {
                onUpdate('loras', loras.filter((l) => l.file !== lora));
              } else {
                onUpdate('loras', [...loras, { file: lora, weight: 0.6 }]);
              }
            };
            return (
              <div
                data-el-name="SheetLoraItemRow"
                key={lora}
                role="button"
                tabIndex={0}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                  }
                }}
                className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-[13px] border cursor-pointer ${
                  active
                    ? 'bg-surface-el border-txt-secondary'
                    : 'bg-surface border-border'
                }`}
              >
                <div
                  data-el-name="SheetLoraCheckbox"
                  className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border ${
                    active
                      ? 'bg-surface-el border-txt-primary'
                      : 'border-txt-tertiary'
                  }`}
                >
                  {active && <span data-el-name="SheetLoraCheckmark" className="text-txt-primary text-[13px]">✓</span>}
                </div>
                <span data-el-name="SheetLoraName" className="flex-1 truncate text-txt-primary">
                  {displayLoraName(lora, loraNames)}
                </span>
                {active && (
                  <div
                    data-el-name="SheetLoraWeightControls"
                    className="flex items-center gap-1.5 flex-shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      data-el-name="SheetLoraWeightDecrement"
                      type="button"
                      onClick={(e) => {
                        const step = e.shiftKey ? 0.1 : 0.01;
                        onUpdate(
                          'loras',
                          loras.map((l) =>
                            l.file === lora
                              ? { ...l, weight: Math.max(-2, +(l.weight - step).toFixed(2)) }
                              : l
                          )
                        );
                      }}
                      className="w-7 h-7 rounded bg-surface text-sm font-medium flex items-center justify-center border border-border active:bg-border"
                    >
                      −
                    </button>
                    <input
                      data-el-name="SheetLoraWeightSlider"
                      type="range"
                      min={-2}
                      max={2}
                      step={0.01}
                      value={active.weight}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        onUpdate(
                          'loras',
                          loras.map((l) =>
                            l.file === lora ? { ...l, weight: +e.target.value } : l
                          )
                        )
                      }
                      className="w-16 h-6 accent-txt-primary"
                    />
                    <span data-el-name="SheetLoraWeightValue" className="text-[13px] text-txt-tertiary w-10 text-right tabular-nums">
                      {active.weight.toFixed(2)}
                    </span>
                    <button
                      data-el-name="SheetLoraWeightIncrement"
                      type="button"
                      onClick={(e) => {
                        const step = e.shiftKey ? 0.1 : 0.01;
                        onUpdate(
                          'loras',
                          loras.map((l) =>
                            l.file === lora
                              ? { ...l, weight: Math.min(2, +(l.weight + step).toFixed(2)) }
                              : l
                          )
                        );
                      }}
                      className="w-7 h-7 rounded bg-surface text-sm font-medium flex items-center justify-center border border-border active:bg-border"
                    >
                      +
                    </button>
                  </div>
                )}
              </div>
            );
          })}
      </div>
      </div>
    ),
  };

  return (
    <>
      <div data-el-name="ParamSheetBackdrop" className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={onClose} />
      <div data-el-name="ParamSheetPanel"
        className="fixed z-50 bg-surface p-4 pt-0 overflow-y-auto
          bottom-0 inset-x-0 rounded-t-[24px]
          lg:top-1/2 lg:left-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2 lg:bottom-auto lg:inset-x-auto lg:rounded-[24px] lg:max-h-[80vh] lg:max-w-lg lg:w-full lg:hidden"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
          maxHeight: DETENT_HEIGHTS[detent],
          transform: dragOffset ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset ? 'none' : 'max-height 0.25s ease',
        }}
      >
        <div
          data-el-name="SheetDragHandle"
          className="min-h-[44px] flex items-center justify-center touch-none cursor-grab active:cursor-grabbing lg:hidden"
          onTouchStart={(e) => handleDragStart(e.touches[0].clientY)}
          onTouchMove={(e) => handleDragMove(e.touches[0].clientY)}
          onTouchEnd={handleDragEnd}
          onMouseDown={(e) => handleDragStart(e.clientY)}
          onMouseMove={(e) => { if (e.buttons === 1) handleDragMove(e.clientY); }}
          onMouseUp={handleDragEnd}
          onMouseLeave={() => { if (dragStartY.current !== null) handleDragEnd(); }}
          aria-label="Táhnutím změnit velikost nebo zavřít"
        >
          <div data-el-name="SheetDragHandleBar" className="w-10 h-1 bg-border rounded-full" />
        </div>
        <h3 data-el-name="SheetTitle" className="text-[17px] font-semibold mb-3 capitalize text-txt-primary">{section}</h3>
        {sections[section] || null}
      </div>
    </>
  );
}