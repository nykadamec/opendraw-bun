// Doporučené konfigurace pro modely (B2).
// Zdroj: apps/server/src/model-configs.json (snapshot stažený skriptem
// scripts/ref_models.ts z https://models.drawthings.ai/configs.json).
//
// Mapování klíčů → FlatBufferConfigInput: viz plans/dt-protocol-parity-plan.md
// §B0 (zamrzenej kontrakt). Klíče configs.json jsou 1:1 se jmény v
// FlatBufferConfigInput, jen 3 vyjímky:
//   - guidanceScale → cfg (přejmenování)
//   - sampler (uint) → sampler (string) přes resolveSampler
//   - causalInference (uint) → causalInference + causalInferenceEnabled
//   - negative (top-level klíč) → default negativePrompt (jiná úroveň JSONu)

import rawConfigs from "../model-configs.json";

export interface ModelConfig {
  name: string;
  version: string;
  negative: string;
  configuration: Record<string, unknown>;
}

interface ConfigIndex {
  byModelFile: Map<string, ModelConfig>;
}

function isModelConfig(c: unknown): c is ModelConfig {
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  const r = c as Record<string, unknown>;
  if (!(typeof r.name === "string" && r.name.length > 0)) return false;
  const cfg = r.configuration;
  if (!(cfg && typeof cfg === "object" && !Array.isArray(cfg))) return false;
  const model = (cfg as Record<string, unknown>).model;
  return typeof model === "string" && model.length > 0;
}

function loadIndex(): ConfigIndex {
  const list: unknown[] = Array.isArray(rawConfigs)
    ? rawConfigs
    : (rawConfigs as { configs?: unknown[] }).configs ?? [];
  const byModelFile = new Map<string, ModelConfig>();
  for (const c of list) {
    if (!isModelConfig(c)) continue;
    const modelFile = c.configuration.model as string;
    if (!byModelFile.has(modelFile)) byModelFile.set(modelFile, c);
  }
  return { byModelFile };
}

const index: ConfigIndex = loadIndex();

/**
 * Vrací doporučenou konfiguraci pro daný model (search by file name).
 * `null` pokud model v snapshotu není (229 z 248 modelů nemá config).
 */
export function getModelConfig(modelFile: string): ModelConfig | null {
  return index.byModelFile.get(modelFile) ?? null;
}

/**
 * Mapuje ModelConfig.configuration → partial FlatBufferConfigInput.
 * Pouze pole, která configs.json explicitně obsahuje (nenulová, non-undefined).
 * Pouze pole, která umíme bezpečně mapovat do FlatBufferConfigInput.
 */
export function mapConfigToInput(cfg: ModelConfig): Record<string, unknown> {
  const c = cfg.configuration;
  const out: Record<string, unknown> = {};
  const put = (key: string, val: unknown): void => {
    if (val !== undefined && val !== null) out[key] = val;
  };

  // 1:1 jména
  put("steps", c.steps);
  put("shift", c.shift);
  put("resolutionDependentShift", c.resolutionDependentShift);
  put("seedMode", c.seedMode);
  put("clipSkip", c.clipSkip);
  put("maskBlur", c.maskBlur);
  put("maskBlurOutset", c.maskBlurOutset);
  put("strength", c.strength);
  put("sharpness", c.sharpness);
  put("batchCount", c.batchCount);
  put("batchSize", c.batchSize);
  put("hiresFix", c.hiresFix);
  put("upscalerScaleFactor", c.upscalerScaleFactor);
  put("tiledDecoding", c.tiledDecoding);
  put("tiledDiffusion", c.tiledDiffusion);
  put("teaCache", c.teaCache);
  put("teaCacheStart", c.teaCacheStart);
  put("teaCacheEnd", c.teaCacheEnd);
  put("teaCacheThreshold", c.teaCacheThreshold);
  put("teaCacheMaxSkipSteps", c.teaCacheMaxSkipSteps);
  put("preserveOriginalAfterInpaint", c.preserveOriginalAfterInpaint);

  // Přejmenování: guidanceScale → cfg
  put("cfg", c.guidanceScale);

  // sampler: uint → name přes resolveSampler (nebo raw string fallback)
  if (typeof c.sampler === "number") {
    try {
      // Lazy import – samplers.ts je v packages/protocol, ale server ho už
      // importuje přes @opendraw/protocol. Pokud resolveSampler chybí,
      // fallback na raw number (fbs-config.ts to zvládne).
      const { resolveSampler } = require("@opendraw/protocol/src/samplers.js") as {
        resolveSampler?: (n: number) => string;
      };
      if (resolveSampler) put("sampler", resolveSampler(c.sampler));
      else put("sampler", c.sampler);
    } catch {
      put("sampler", c.sampler);
    }
  } else if (typeof c.sampler === "string") {
    put("sampler", c.sampler);
  }

  // causalInference (uint) → 2 pole
  if (typeof c.causalInference === "number") {
    put("causalInference", c.causalInference);
    put("causalInferenceEnabled", c.causalInference > 0);
  }

  // negative (top-level klíč, ne v configuration) → fallback negativePrompt
  if (typeof cfg.negative === "string" && cfg.negative.length > 0) {
    // negative se aplikuje jen když je negativePrompt prázdné (viz generate.ts).
    // Sem ho dáme jako _negativeDefault, aby generate.ts mohl rozhodnout.
    out._negativeDefault = cfg.negative;
  }

  return out;
}

/**
 * Apply enrichment: vráti upravený config input s doporučenými hodnotami
 * pro `pristineParams` (pole, která UI ještě nedotklo).
 *
 * Priorita: explicitní user value > recommended > generic default.
 * `pristineParams` = pole fieldů, u kterých UI posílá `undefined` (nebo
 * explicitně označí jako "nepřepsané"). Server je nahradí doporučenými.
 */
export function applyRecommendedConfig(
  input: Record<string, unknown>,
  modelConfig: ModelConfig | null,
  pristineParams: string[] = [],
): Record<string, unknown> {
  if (!modelConfig) return input;
  const recommended = mapConfigToInput(modelConfig);
  const out: Record<string, unknown> = { ...input };
  for (const field of pristineParams) {
    if (field in recommended) {
      out[field] = recommended[field];
    }
  }
  // negative fallback: jen když je negativePrompt prázdný
  const negDefault = recommended._negativeDefault as string | undefined;
  if (negDefault && !(out.negativePrompt as string | undefined)) {
    out.negativePrompt = negDefault;
  }
  delete out._negativeDefault;
  return out;
}
