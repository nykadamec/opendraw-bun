export interface GenerateRequest {
  prompt: string;
  negativePrompt?: string;
  model?: string;
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
  saveToGallery?: boolean;
  seedMode?: number;
  upscaler?: string;
  upscalerScaleFactor?: number;
  strength?: number;
  stochasticSamplingGamma?: number;
  numFrames?: number;
  cfgZeroStar?: boolean;
  cfgZeroInitSteps?: number;
  zeroNegativePrompt?: boolean;
  refinerModel?: string;
  refinerStart?: number;
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
  compressionArtifacts?: number;
  compressionArtifactsQuality?: number;
  version?: string;
  decodingTileWidth?: number;
  decodingTileHeight?: number;
  decodingTileOverlap?: number;
  diffusionTileWidth?: number;
  diffusionTileHeight?: number;
  diffusionTileOverlap?: number;
  tiledDecoding?: boolean;
  tiledDiffusion?: boolean;
}

export interface GalleryEntry {
  id: string;
  filename: string;
  createdAt: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  source: 'generated' | 'imported';
  sampler?: string;
  steps?: number;
  cfg?: number;
  loras?: { file: string; weight: number; mode?: number }[];
  shift?: number;
  clipSkip?: number;
  seedMode?: number;
  resolutionDependentShift?: boolean;
  upscaler?: string;
  upscalerScaleFactor?: number;
  strength?: number;
  stochasticSamplingGamma?: number;
  cfgZeroStar?: boolean;
  cfgZeroInitSteps?: number;
  hiresFix?: boolean;
  hiresFixWidth?: number;
  hiresFixHeight?: number;
  hiresFixStrength?: number;
  teaCache?: boolean;
  causalInference?: boolean;
  refinerModel?: string;
  refinerStart?: number;
  numFrames?: number;
  imageGuidanceScale?: number;
  faceRestoration?: string;
  generationConfig?: Record<string, unknown>;
}

export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  entryCount: number;
}

export interface ProjectEntry {
  id: string;
  projectId: string;
  prompt: string;
  negativePrompt: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  createdAt: string;
  thumbnail: string | null;
}

export interface ProjectEntryConfig {
  prompt: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  steps: number;
  cfg: number;
  seed: number;
  width: number;
  height: number;
  shift: number;
  clipSkip: number;
  loras: { file: string; weight: number; mode: number }[];
  seedMode: number;
  upscaler: string;
  upscalerScaleFactor: number;
  strength: number;
  stochasticSamplingGamma: number;
  cfgZeroStar: boolean;
  cfgZeroInitSteps: number;
  generated: boolean;
  batchSize: number;
  reason: number;
  hiresFix: boolean;
  hiresFixStartWidth: number;
  hiresFixStartHeight: number;
  hiresFixStrength: number;
  refinerModel: string;
  refinerStart: number;
  numFrames: number;
  maskBlurOutset: number;
  sharpness: number;
  stage2Steps: number;
  stage2Cfg: number;
  stage2Shift: number;
  tiledDecoding: boolean;
  tiledDiffusion: boolean;
  teaCache: boolean;
  teaCacheStart: number;
  teaCacheEnd: number;
  teaCacheThreshold: number;
  generationTime: number;
  clipId: number;
  indexInAClip: number;
  audio: boolean;
  compressionArtifacts: number;
  imageGuidanceScale: number;
  faceRestoration: string;
  maskBlur: number;
  cropTop: number;
  cropLeft: number;
  aestheticScore: number;
  negativeAestheticScore: number;
  preserveOriginalAfterInpaint: boolean;
  t5TextEncoder: boolean;
  separateClipL: boolean;
  clipLText: string;
  separateOpenClipG: boolean;
  openClipGText: string;
  separateT5: boolean;
  t5Text: string;
  causalInferenceEnabled: boolean;
  causalInference: number;
  causalInferencePad: number;
}

export interface EntryViewData {
  id: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  width: number;
  height: number;
  seed: number;
  source: 'generated' | 'imported';
  sampler?: string;
  steps?: number;
  cfg?: number;
  shift?: number;
  clipSkip?: number;
  seedMode?: number;
  loras?: { file: string; weight: number; mode?: number }[];
  upscaler?: string;
  upscalerScaleFactor?: number;
  strength?: number;
  stochasticSamplingGamma?: number;
  cfgZeroStar?: boolean;
  cfgZeroInitSteps?: number;
  resolutionDependentShift?: boolean;
  teaCache?: boolean;
  causalInference?: boolean;
  lcmMode?: boolean;
  refinerModel?: string;
  refinerStart?: number;
  numFrames?: number;
  imageGuidanceScale?: number;
  faceRestoration?: string;
  hiresFix?: boolean;
  hiresFixWidth?: number;
  hiresFixHeight?: number;
  hiresFixStrength?: number;
  generationConfig?: Record<string, unknown>;
  createdAt: string;
}

export interface GalleryStats {
  imagesSize: number;
  metadataSize: number;
  totalSize: number;
  imageCount: number;
  metadataCount: number;
}

export interface LoraEnrichedImage {
  url: string;
  nsfw: boolean;
  width: number;
  height: number;
}

export interface LoraEnrichedVersion {
  id: number;
  modelId: number;
  name: string;
  baseModel: string;
  trainedWords: string[];
  description?: string;
  files: { name: string; sizeKB: number; downloadUrl: string }[];
  images: LoraEnrichedImage[];
  downloadUrl: string;
  stats?: { downloadCount: number; rating?: number };
}

export interface LoraEnrichedModel {
  id: number;
  name: string;
  description?: string;
  creator?: { username: string; image?: string };
  stats?: { downloadCount: number; rating?: number; favoriteCount?: number };
  modelVersions: LoraEnrichedVersion[];
  tags?: { name: string }[];
}

export interface LoraEnriched {
  file: string;
  byHash: LoraEnrichedVersion | null;
  byName: LoraEnrichedModel[];
}

export interface LoraMetadata {
  triggerWords: string[];
  name?: string;
}

export interface DrawThingsAuthStatus {
  configured: boolean;
  expiresAt: string | null;
  expiresIn: number | null;
}

export interface CanvasProjectInfo {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  imageCount: number;
}

export interface CanvasImage {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  prompt: string;
  negativePrompt: string;
  model: string;
  seed: number;
  sampler: string;
  steps: number;
  cfg: number;
  loras: string;
  generationConfig: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  createdAt: string;
}
