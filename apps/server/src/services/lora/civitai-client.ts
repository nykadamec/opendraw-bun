// CivitAI klient – port proxy/src/civitai-client.ts 1:1 (F5). Beze změny.

export interface CivitaiImage {
  url: string;
  nsfw: boolean;
  width: number;
  height: number;
}

export interface CivitaiModelVersionFile {
  name: string;
  sizeKB: number;
  hashes: { SHA256?: string; AutoV2?: string };
  downloadUrl: string;
}

export interface CivitaiModelVersion {
  id: number;
  modelId: number;
  name: string;
  baseModel: string;
  trainedWords: string[];
  files: CivitaiModelVersionFile[];
  images: CivitaiImage[];
  downloadUrl: string;
  stats?: { downloadCount: number; rating?: number };
  description?: string;
}

export interface CivitaiSearchResult {
  id: number;
  name: string;
  type: string;
  description?: string;
  creator?: { username: string; image?: string };
  stats?: { downloadCount: number; rating?: number; favoriteCount?: number };
  modelVersions: CivitaiModelVersion[];
  tags?: { name: string }[];
}

const CIVITAI_API = "https://civitai.com/api/v1";

const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv|flv|wmv)(\?|$)/i;

function isImageUrl(url: string): boolean {
  return !VIDEO_EXTS.test(url);
}

function stripVideosFromVersion(v: CivitaiModelVersion): CivitaiModelVersion {
  if (!v.images) return v;
  return { ...v, images: v.images.filter((img) => isImageUrl(img.url)) };
}

function stripVideosFromResult(r: CivitaiSearchResult): CivitaiSearchResult {
  if (!r.modelVersions) return r;
  return { ...r, modelVersions: r.modelVersions.map(stripVideosFromVersion) };
}

function headers(apiKey?: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) h["Authorization"] = `Bearer ${apiKey}`;
  return h;
}

export async function searchByHash(hash: string, apiKey?: string): Promise<CivitaiModelVersion | null> {
  try {
    const res = await fetch(`${CIVITAI_API}/model-versions/by-hash/${hash}`, {
      headers: headers(apiKey),
    });
    if (!res.ok) return null;
    const data: CivitaiModelVersion = await res.json();
    return stripVideosFromVersion(data);
  } catch {
    return null;
  }
}

export async function searchByName(
  query: string,
  apiKey?: string,
  baseModels?: string[],
): Promise<CivitaiSearchResult[]> {
  try {
    const h = headers(apiKey);
    let url = `${CIVITAI_API}/models?query=${encodeURIComponent(query)}&types=LORA&limit=50`;
    if (baseModels && baseModels.length > 0) {
      for (const bm of baseModels) {
        url += `&baseModels=${encodeURIComponent(bm)}`;
      }
    }
    const res = await fetch(url, { headers: h });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map(stripVideosFromResult);
  } catch {
    return [];
  }
}

export async function searchByModelId(
  modelId: number,
  apiKey?: string,
): Promise<CivitaiSearchResult | null> {
  try {
    const res = await fetch(`${CIVITAI_API}/models/${modelId}`, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result: CivitaiSearchResult = {
      id: data.id,
      name: data.name,
      type: data.type,
      description: data.description ?? undefined,
      creator: data.creator ?? undefined,
      stats: data.stats
        ? { downloadCount: data.stats.downloadCount ?? 0, rating: data.stats.thumbsUpCount ?? 0 }
        : undefined,
      modelVersions: data.modelVersions ?? [],
      tags: (data.tags ?? []).map((t: string) => ({ name: t })),
    };
    return stripVideosFromResult(result);
  } catch {
    return null;
  }
}
