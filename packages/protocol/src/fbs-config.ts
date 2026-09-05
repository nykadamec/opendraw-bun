import * as flatbuffers from 'flatbuffers';
import { CompressionMethod } from '../proto/fbs/ts/compression-method.js';
import { GenerationConfiguration } from '../proto/fbs/ts/generation-configuration.js';
import { LoRA } from '../proto/fbs/ts/lo-ra.js';
import { LoRAMode } from '../proto/fbs/ts/lo-ramode.js';
import { resolveSampler } from './samplers.js';
import { SeedMode } from '../proto/fbs/ts/seed-mode.js';
import { ModelVersion } from './model-version.js';

export interface FlatBufferConfigInput {
  model?: string;
  version?: string;
  sampler?: string;
  steps?: number;
  cfg?: number;
  seed?: number;
  batchCount?: number;
  batchSize?: number;
  width?: number;
  height?: number;
  loras?: { file: string; weight: number; mode?: string }[];
  shift?: number;
  clipSkip?: number;
  resolutionDependentShift?: boolean;
  seedMode?: number;
  upscaler?: string;
  upscalerScaleFactor?: number;
  strength?: number;
  stochasticSamplingGamma?: number;
  numFrames?: number;
  cfgZeroStar?: boolean;
  zeroNegativePrompt?: boolean;
  maskBlur?: number;
  originalImageHeight?: number;
  originalImageWidth?: number;
  negativeOriginalImageHeight?: number;
  negativeOriginalImageWidth?: number;
  refinerStart?: number;
  refinerModel?: string;
  tiledDecoding?: boolean;
  tiledDiffusion?: boolean;
  hiresFix?: boolean;
  hiresFixWidth?: number;
  hiresFixHeight?: number;
  hiresFixStrength?: number;
  imageGuidanceScale?: number;
  faceRestoration?: string;
  clipWeight?: number;
  negativePromptForImagePrior?: boolean;
  imagePriorSteps?: number;
  cropTop?: number;
  cropLeft?: number;
  aestheticScore?: number;
  negativeAestheticScore?: number;
  fpsId?: number;
  motionBucketId?: number;
  condAug?: number;
  startFrameCfg?: number;
  maskBlurOutset?: number;
  sharpness?: number;
  stage2Steps?: number;
  stage2Cfg?: number;
  stage2Shift?: number;
  preserveOriginalAfterInpaint?: boolean;
  t5TextEncoder?: boolean;
  separateClipL?: boolean;
  clipLText?: string;
  separateOpenClipG?: boolean;
  openClipGText?: string;
  speedUpWithGuidanceEmbed?: boolean;
  guidanceEmbed?: number;
  teaCacheStart?: number;
  teaCacheEnd?: number;
  teaCacheThreshold?: number;
  teaCache?: boolean;
  teaCacheMaxSkipSteps?: number;
  separateT5?: boolean;
  t5Text?: string;
  causalInferenceEnabled?: boolean;
  causalInference?: number;
  causalInferencePad?: number;
  cfgZeroInitSteps?: number;
  compressionArtifacts?: number;
  compressionArtifactsQuality?: number;
  decodingTileWidth?: number;
  decodingTileHeight?: number;
  decodingTileOverlap?: number;
  diffusionTileWidth?: number;
  diffusionTileHeight?: number;
  diffusionTileOverlap?: number;
}

export function buildGenerationConfiguration(
  input: FlatBufferConfigInput
): { buffer: Buffer; config: Record<string, unknown> } {
  const builder = new flatbuffers.Builder(1024);

  const modelOffset = input.model ? builder.createString(input.model) : 0;
  const upscalerOffset = input.upscaler
    ? builder.createString(input.upscaler)
    : (input.hiresFix ? builder.createString('esrgan_4x_universal_upscaler_v2_sharp_f16.ckpt') : 0);
  const nameOffset = builder.createString('OpenDraw');
  const refinerModelOffset = input.refinerModel ? builder.createString(input.refinerModel) : 0;

  const lorasOffset = (() => {
    if (!input.loras || input.loras.length === 0) return 0;
    const offsets: flatbuffers.Offset[] = input.loras.map((l) => {
      const fileOffset = builder.createString(l.file);
      const mode = l.mode === 'base' ? LoRAMode.Base
        : l.mode === 'refiner' ? LoRAMode.Refiner
        : LoRAMode.All;
      return LoRA.createLoRA(builder, fileOffset, l.weight, mode);
    });
    return GenerationConfiguration.createLorasVector(builder, offsets);
  })();

  const sampler = resolveSampler(input.sampler);
  const steps = input.steps ?? 28;
  const cfg = input.cfg ?? 3.5;
  const seed = input.seed ?? -1;
  const batchCount = input.batchCount ?? 1;
  const batchSize = input.batchSize ?? 1;
  const targetWidth = input.width ?? 1024;
  const targetHeight = input.height ?? 1024;
  const startWidth = Math.max(1, Math.round(targetWidth / 64));
  const startHeight = Math.max(1, Math.round(targetHeight / 64));
  const resolutionDependentShift = input.resolutionDependentShift ?? true;
  const modelVersion = new ModelVersion(input.version ?? '');
  const shift = input.shift ?? (resolutionDependentShift
    ? computeRdsShift(targetWidth, targetHeight)
    : 1.0);
  const clipSkip = input.clipSkip ?? 1;
  const strength = input.strength ?? 1.00;
  const stochasticSamplingGamma = input.stochasticSamplingGamma ?? 0.3;
  const numFrames = input.numFrames ?? 14;
  const cfgZeroStar = input.cfgZeroStar ?? false;
  const cfgZeroInitSteps = input.cfgZeroInitSteps ?? 0;
  const zeroNegativePrompt = input.zeroNegativePrompt ?? false;
  const maskBlur = input.maskBlur ?? 2.5;
  const maskBlurOutset = input.maskBlurOutset ?? 0;
  const originalImageHeight = input.originalImageHeight ?? 0;
  const originalImageWidth = input.originalImageWidth ?? 0;
  const negativeOriginalImageHeight = input.negativeOriginalImageHeight ?? 0;
  const negativeOriginalImageWidth = input.negativeOriginalImageWidth ?? 0;
  const refinerStart = input.refinerStart ?? 0.85;
  const tiledDecoding = input.tiledDecoding ?? false;
  const tiledDiffusion = input.tiledDiffusion ?? false;
  const hiresFix = input.hiresFix ?? false;
  const hiresFixWidth = input.hiresFixWidth ?? 0;
  const hiresFixHeight = input.hiresFixHeight ?? 0;
  const hiresFixStrength = input.hiresFixStrength ?? 0.7;
  const imageGuidanceScale = input.imageGuidanceScale ?? 1.5;
  const faceRestorationOffset = input.faceRestoration ? builder.createString(input.faceRestoration) : 0;
  const clipWeight = input.clipWeight ?? 1;
  const negativePromptForImagePrior = input.negativePromptForImagePrior ?? true;
  const imagePriorSteps = input.imagePriorSteps ?? 5;
  const cropTop = input.cropTop ?? 0;
  const cropLeft = input.cropLeft ?? 0;
  const aestheticScore = input.aestheticScore ?? 6;
  const negativeAestheticScore = input.negativeAestheticScore ?? 2.5;
  const fpsId = input.fpsId ?? 5;
  const motionBucketId = input.motionBucketId ?? 127;
  const condAug = input.condAug ?? 0.02;
  const startFrameCfg = input.startFrameCfg ?? 1.0;
  const sharpness = input.sharpness ?? 0;
  const stage2Steps = input.stage2Steps ?? 10;
  const stage2Cfg = input.stage2Cfg ?? 1.0;
  const stage2Shift = input.stage2Shift ?? 1.0;
  const preserveOriginalAfterInpaint = input.preserveOriginalAfterInpaint ?? true;
  const t5TextEncoder = input.t5TextEncoder ?? true;
  const separateClipL = input.separateClipL ?? false;
  const clipLTextOffset = input.clipLText ? builder.createString(input.clipLText) : 0;
  const separateOpenClipG = input.separateOpenClipG ?? false;
  const openClipGTextOffset = input.openClipGText ? builder.createString(input.openClipGText) : 0;
  const speedUpWithGuidanceEmbed = input.speedUpWithGuidanceEmbed ?? true;
  const guidanceEmbed = input.guidanceEmbed ?? 3.5;
  const teaCacheStart = input.teaCacheStart ?? 5;
  const teaCacheEnd = input.teaCacheEnd ?? -1;
  const teaCacheThreshold = input.teaCacheThreshold ?? 0.06;
  const teaCache = input.teaCache ?? false;
  const teaCacheMaxSkipSteps = input.teaCacheMaxSkipSteps ?? 3;
  const separateT5 = input.separateT5 ?? false;
  const t5TextOffset = input.t5Text ? builder.createString(input.t5Text) : 0;
  const causalInferenceEnabled = input.causalInferenceEnabled ?? false;
  const causalInference = input.causalInference ?? 3;
  const causalInferencePad = input.causalInferencePad ?? 0;
  const compressionArtifacts = input.compressionArtifacts ?? CompressionMethod.Disabled;
  const compressionArtifactsQuality = input.compressionArtifactsQuality ?? 43.1;
  const decodingTileWidth = input.decodingTileWidth ? Math.max(1, Math.round(input.decodingTileWidth / 64)) : 10;
  const decodingTileHeight = input.decodingTileHeight ? Math.max(1, Math.round(input.decodingTileHeight / 64)) : 10;
  const decodingTileOverlap = input.decodingTileOverlap ? Math.max(1, Math.round(input.decodingTileOverlap / 64)) : 2;
  const diffusionTileWidth = input.diffusionTileWidth ? Math.max(1, Math.round(input.diffusionTileWidth / 64)) : 16;
  const diffusionTileHeight = input.diffusionTileHeight ? Math.max(1, Math.round(input.diffusionTileHeight / 64)) : 16;
  const diffusionTileOverlap = input.diffusionTileOverlap ? Math.max(1, Math.round(input.diffusionTileOverlap / 64)) : 2;

  GenerationConfiguration.startGenerationConfiguration(builder);
  GenerationConfiguration.addId(builder, BigInt(0));
  GenerationConfiguration.addStartWidth(builder, startWidth);
  GenerationConfiguration.addStartHeight(builder, startHeight);
  GenerationConfiguration.addSeed(builder, seed);
  GenerationConfiguration.addSteps(builder, steps);
  GenerationConfiguration.addGuidanceScale(builder, cfg);
  GenerationConfiguration.addStrength(builder, strength);
  if (modelOffset) GenerationConfiguration.addModel(builder, modelOffset);
  GenerationConfiguration.addSampler(builder, sampler);
  GenerationConfiguration.addBatchCount(builder, batchCount);
  GenerationConfiguration.addBatchSize(builder, batchSize);
  GenerationConfiguration.addSeedMode(builder, input.seedMode ?? SeedMode.Legacy);
  GenerationConfiguration.addClipSkip(builder, clipSkip);
  GenerationConfiguration.addShift(builder, shift);
  if (modelVersion.resDptShift && resolutionDependentShift) {
    GenerationConfiguration.addResolutionDependentShift(builder, true);
  }
  // else: neposlat (fbs default = false)
  if (upscalerOffset) GenerationConfiguration.addUpscaler(builder, upscalerOffset);
  if (lorasOffset) GenerationConfiguration.addLoras(builder, lorasOffset);
  if (originalImageHeight > 0) GenerationConfiguration.addOriginalImageHeight(builder, originalImageHeight);
  if (originalImageWidth > 0) GenerationConfiguration.addOriginalImageWidth(builder, originalImageWidth);
  if (negativeOriginalImageHeight > 0) GenerationConfiguration.addNegativeOriginalImageHeight(builder, negativeOriginalImageHeight);
  if (negativeOriginalImageWidth > 0) GenerationConfiguration.addNegativeOriginalImageWidth(builder, negativeOriginalImageWidth);
  if (modelVersion.sdxl) {
    GenerationConfiguration.addOriginalImageHeight(builder, targetHeight);
    GenerationConfiguration.addOriginalImageWidth(builder, targetWidth);
    GenerationConfiguration.addTargetImageHeight(builder, targetHeight);
    GenerationConfiguration.addTargetImageWidth(builder, targetWidth);
    GenerationConfiguration.addNegativeOriginalImageHeight(builder, Math.floor(targetHeight / 2));
    GenerationConfiguration.addNegativeOriginalImageWidth(builder, Math.floor(targetWidth / 2));
  }
  GenerationConfiguration.addName(builder, nameOffset);
  if (modelVersion.video && input.numFrames) {
    const step = modelVersion.numFramesStep;
    GenerationConfiguration.addNumFrames(builder, Math.ceil((numFrames - 1) / step) * step + 1);
  }
  GenerationConfiguration.addRefinerStart(builder, refinerStart);
  if (refinerModelOffset) GenerationConfiguration.addRefinerModel(builder, refinerModelOffset);
  if (maskBlur !== 2.5) GenerationConfiguration.addMaskBlur(builder, maskBlur);
  if (maskBlurOutset !== 0) GenerationConfiguration.addMaskBlurOutset(builder, maskBlurOutset);
  if (stochasticSamplingGamma !== 0.3) GenerationConfiguration.addStochasticSamplingGamma(builder, stochasticSamplingGamma);
  if (cfgZeroStar) GenerationConfiguration.addCfgZeroStar(builder, true);
  if (cfgZeroInitSteps > 0) GenerationConfiguration.addCfgZeroInitSteps(builder, cfgZeroInitSteps);
  if (zeroNegativePrompt) GenerationConfiguration.addZeroNegativePrompt(builder, true);
  GenerationConfiguration.addImageGuidanceScale(builder, imageGuidanceScale);
  if (faceRestorationOffset) GenerationConfiguration.addFaceRestoration(builder, faceRestorationOffset);
  GenerationConfiguration.addClipWeight(builder, clipWeight);
  GenerationConfiguration.addNegativePromptForImagePrior(builder, negativePromptForImagePrior);
  GenerationConfiguration.addImagePriorSteps(builder, imagePriorSteps);
  if (cropTop !== 0) GenerationConfiguration.addCropTop(builder, cropTop);
  if (cropLeft !== 0) GenerationConfiguration.addCropLeft(builder, cropLeft);
  if (aestheticScore !== 6) GenerationConfiguration.addAestheticScore(builder, aestheticScore);
  if (negativeAestheticScore !== 2.5) GenerationConfiguration.addNegativeAestheticScore(builder, negativeAestheticScore);
  GenerationConfiguration.addFpsId(builder, fpsId);
  GenerationConfiguration.addMotionBucketId(builder, motionBucketId);
  GenerationConfiguration.addCondAug(builder, condAug);
  GenerationConfiguration.addStartFrameCfg(builder, startFrameCfg);
  if (sharpness !== 0) GenerationConfiguration.addSharpness(builder, sharpness);
  GenerationConfiguration.addStage2Steps(builder, stage2Steps);
  GenerationConfiguration.addStage2Cfg(builder, stage2Cfg);
  GenerationConfiguration.addStage2Shift(builder, stage2Shift);
  GenerationConfiguration.addPreserveOriginalAfterInpaint(builder, preserveOriginalAfterInpaint);
  GenerationConfiguration.addT5TextEncoder(builder, t5TextEncoder);
  if (modelVersion.clipL && separateClipL) {
    GenerationConfiguration.addSeparateClipL(builder, true);
    if (clipLTextOffset) GenerationConfiguration.addClipLText(builder, clipLTextOffset);
  }
  if (modelVersion.openClipG && separateOpenClipG) {
    GenerationConfiguration.addSeparateOpenClipG(builder, true);
    if (openClipGTextOffset) GenerationConfiguration.addOpenClipGText(builder, openClipGTextOffset);
  }
  if (modelVersion.speedUp && input.speedUpWithGuidanceEmbed === false) {
    GenerationConfiguration.addSpeedUpWithGuidanceEmbed(builder, false);
    if (guidanceEmbed !== 3.5) GenerationConfiguration.addGuidanceEmbed(builder, guidanceEmbed);
  }
  if (modelVersion.teaCache && teaCache) {
    GenerationConfiguration.addTeaCache(builder, true);
    GenerationConfiguration.addTeaCacheStart(builder, teaCacheStart);
    GenerationConfiguration.addTeaCacheEnd(builder, teaCacheEnd);
    GenerationConfiguration.addTeaCacheThreshold(builder, teaCacheThreshold);
    GenerationConfiguration.addTeaCacheMaxSkipSteps(builder, teaCacheMaxSkipSteps);
  }
  if (separateT5) {
    GenerationConfiguration.addSeparateT5(builder, true);
    if (t5TextOffset) GenerationConfiguration.addT5Text(builder, t5TextOffset);
  }
  if (modelVersion.causalInference && input.causalInference) {
    if (input.causalInference > 0) {
      GenerationConfiguration.addCausalInferenceEnabled(builder, true);
      GenerationConfiguration.addCausalInference(builder, Math.floor((input.causalInference + 3) / 4));
      GenerationConfiguration.addCausalInferencePad(builder, Math.floor((input.causalInferencePad ?? 0) / 4));
    }
  }
  if (compressionArtifacts !== CompressionMethod.Disabled) {
    GenerationConfiguration.addCompressionArtifacts(builder, compressionArtifacts);
    if (compressionArtifactsQuality !== 43.1) GenerationConfiguration.addCompressionArtifactsQuality(builder, compressionArtifactsQuality);
  }
  if (tiledDecoding) {
    GenerationConfiguration.addTiledDecoding(builder, true);
    GenerationConfiguration.addDecodingTileWidth(builder, decodingTileWidth);
    GenerationConfiguration.addDecodingTileHeight(builder, decodingTileHeight);
    GenerationConfiguration.addDecodingTileOverlap(builder, decodingTileOverlap);
  }
  if (tiledDiffusion) {
    GenerationConfiguration.addTiledDiffusion(builder, true);
    GenerationConfiguration.addDiffusionTileWidth(builder, diffusionTileWidth);
    GenerationConfiguration.addDiffusionTileHeight(builder, diffusionTileHeight);
    GenerationConfiguration.addDiffusionTileOverlap(builder, diffusionTileOverlap);
  }
  if (hiresFix) {
    GenerationConfiguration.addHiresFix(builder, true);
    GenerationConfiguration.addHiresFixStartWidth(builder, Math.max(1, Math.round(hiresFixWidth / 64)));
    GenerationConfiguration.addHiresFixStartHeight(builder, Math.max(1, Math.round(hiresFixHeight / 64)));
    GenerationConfiguration.addHiresFixStrength(builder, hiresFixStrength);
  }
  if (input.upscalerScaleFactor) GenerationConfiguration.addUpscalerScaleFactor(builder, input.upscalerScaleFactor);
  const config = GenerationConfiguration.endGenerationConfiguration(builder);

  builder.finish(config);

  const snapshot: Record<string, unknown> = {
    model: input.model ?? '',
    sampler,
    steps,
    guidanceScale: cfg,
    seed,
    width: targetWidth,
    height: targetHeight,
    batchCount,
    batchSize,
    shift,
    clipSkip,
    resolutionDependentShift,
    seedMode: input.seedMode,
    strength: input.strength ?? 1.0,
    stochasticSamplingGamma: input.stochasticSamplingGamma ?? 0.3,
    numFrames: input.numFrames ?? 14,
    cfgZeroStar: input.cfgZeroStar ?? false,
    cfgZeroInitSteps: input.cfgZeroInitSteps ?? 0,
    zeroNegativePrompt: input.zeroNegativePrompt ?? false,
    hiresFix: input.hiresFix ?? false,
    hiresFixWidth: input.hiresFixWidth ?? 0,
    hiresFixHeight: input.hiresFixHeight ?? 0,
    hiresFixStrength: input.hiresFixStrength ?? 0.7,
    upscaler: input.upscaler ?? '',
    loras: (input.loras ?? []).map((l) => ({ ...l, mode: l.mode ?? 'all' })),
    imageGuidanceScale,
    faceRestoration: input.faceRestoration ?? '',
    clipWeight,
    negativePromptForImagePrior,
    imagePriorSteps,
    cropTop,
    cropLeft,
    aestheticScore,
    negativeAestheticScore,
    fpsId,
    motionBucketId,
    condAug,
    startFrameCfg,
    maskBlurOutset,
    sharpness,
    stage2Steps,
    stage2Cfg,
    stage2Shift,
    preserveOriginalAfterInpaint,
    t5TextEncoder,
    separateClipL,
    clipLText: input.clipLText ?? '',
    separateOpenClipG,
    openClipGText: input.openClipGText ?? '',
    speedUpWithGuidanceEmbed,
    guidanceEmbed,
    teaCache,
    teaCacheStart,
    teaCacheEnd,
    teaCacheThreshold,
    teaCacheMaxSkipSteps,
    separateT5,
    t5Text: input.t5Text ?? '',
    causalInferenceEnabled,
    causalInference,
    causalInferencePad,
    compressionArtifacts,
    compressionArtifactsQuality,
    decodingTileWidth,
    decodingTileHeight,
    decodingTileOverlap,
    diffusionTileWidth,
    diffusionTileHeight,
    diffusionTileOverlap,
  };

  return { buffer: Buffer.from(builder.asUint8Array()), config: snapshot };
}

export function computeRdsShift(width: number, height: number): number {
  const exponent = ((width * height) / 256 - 256) * 0.00016927 + 0.5;
  return Math.round(Math.exp(exponent) * 100) / 100;
}
