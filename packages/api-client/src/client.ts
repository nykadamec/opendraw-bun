import type { GenerateRequest, GalleryEntry, ProjectInfo, ProjectEntry, ProjectEntryConfig, GalleryStats, LoraEnriched, LoraMetadata, DrawThingsAuthStatus, CanvasProjectInfo, CanvasImage } from './types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export interface EchoResponse {
  message: string;
  files: string[];
  serverIdentifier: string;
  sharedSecretMissing: boolean;
  loraNames: Record<string, string>;
}

export async function fetchEcho(): Promise<EchoResponse> {
  return request('/echo');
}

export interface CloudModel {
  name: string;
  version: string;
  file: string;
}

export interface CloudModelsResponse {
  models: CloudModel[];
}

export async function fetchCloudModels(): Promise<CloudModelsResponse> {
  return request('/cloud-models');
}

export function generateImage(
  req: GenerateRequest,
  callbacks: {
    onProgress?: (step: number, total: number, phase?: string) => void;
    onComplete?: (data: any) => void;
    onError?: (err: string) => void;
    onPreview?: (imageBase64: string) => void;
  }
): () => void {
  const controller = new AbortController();

  fetch(`${BASE}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
    signal: controller.signal,
  }).then(async (res) => {
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        if (!part.trim()) continue;
        const lines = part.split('\n');
        let eventType = '';
        let dataStr = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) eventType = line.slice(7);
          else if (line.startsWith('data: ')) dataStr = line.slice(6);
        }
        if (!dataStr) continue;
        try {
          const data = JSON.parse(dataStr);
          if (eventType === 'progress') {
            callbacks.onProgress?.(data.step ?? 0, data.total ?? 0, data.phase);
          } else if (eventType === 'complete') {
            callbacks.onComplete?.(data);
          } else if (eventType === 'error') {
            callbacks.onError?.(data.message);
          } else if (eventType === 'preview') {
            callbacks.onPreview?.(data.data);
          }
        } catch {}
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      callbacks.onError?.(err.message);
    }
  });

  return () => controller.abort();
}

export async function listGallery(): Promise<GalleryEntry[]> {
  return request('/gallery');
}

export function getGalleryImageUrl(id: string): string {
  return `${BASE}/gallery/${id}/image`;
}

export async function getGalleryMetadata(id: string): Promise<GalleryEntry> {
  return request(`/gallery/${id}/metadata`);
}

export async function deleteGalleryEntry(id: string): Promise<void> {
  return request(`/gallery/${id}`, { method: 'DELETE' });
}

export async function getGalleryStats(): Promise<GalleryStats> {
  return request('/gallery/stats');
}

export async function cleanGallery(type: 'all' | 'images' | 'metadata'): Promise<{ deleted: number }> {
  return request(`/gallery/clean?type=${type}`, { method: 'DELETE' });
}

export async function listProjects(refresh = false): Promise<ProjectInfo[]> {
  return request(`/projects${refresh ? '?refresh=true' : ''}`);
}

export async function getProjectEntries(
  projectId: string,
  page = 1,
  limit = 50
): Promise<{ entries: ProjectEntry[]; total: number }> {
  return request(`/projects/${projectId}/entries?page=${page}&limit=${limit}`);
}

export function getProjectEntryImageUrl(projectId: string, entryId: string): string {
  return `${BASE}/projects/${projectId}/entries/${entryId}/image`;
}

export async function getProjectEntryConfig(
  projectId: string,
  entryId: string
): Promise<ProjectEntryConfig> {
  return request(`/projects/${projectId}/entries/${entryId}/config`);
}

export async function getLoraMetadata(file: string): Promise<LoraMetadata> {
  return request(`/lora-metadata?file=${encodeURIComponent(file)}`);
}

export async function clearLoraCache(): Promise<{ deleted: number }> {
  return request('/loras/clear-cache', { method: 'POST' });
}

export async function enrichLora(file: string, apiKey?: string, models?: string[]): Promise<LoraEnriched> {
  const params = new URLSearchParams({ file });
  if (apiKey) params.set('apiKey', apiKey);
  if (models && models.length > 0) params.set('model', models.join(','));
  return request(`/loras/enrich?${params}`);
}

export async function configureDrawThingsAuth(apiKey: string): Promise<DrawThingsAuthStatus> {
  return request('/auth/configure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  });
}

export async function getDrawThingsAuthStatus(): Promise<DrawThingsAuthStatus> {
  return request('/auth/status');
}

export async function logoutDrawThingsAuth(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
}

// --- Canvas ---

export async function listCanvasProjects(): Promise<CanvasProjectInfo[]> {
  return request('/canvas');
}

export async function createCanvasProject(name: string): Promise<CanvasProjectInfo> {
  return request('/canvas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function deleteCanvasProject(id: string): Promise<void> {
  await request(`/canvas/${id}`, { method: 'DELETE' });
}

export async function renameCanvasProject(id: string, name: string): Promise<void> {
  await request(`/canvas/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function getCanvasImages(canvasId: string): Promise<CanvasImage[]> {
  return request(`/canvas/${canvasId}/images`);
}

export function getCanvasImageUrl(canvasId: string, imageId: string): string {
  return `${BASE}/canvas/${canvasId}/images/${imageId}`;
}

export function getCanvasThumbnailUrl(canvasId: string, imageId: string): string {
  return `${BASE}/canvas/${canvasId}/images/${imageId}/thumbnail`;
}

export async function addCanvasPregen(canvasId: string, x: number, y: number, width: number, height: number): Promise<CanvasImage> {
  return request(`/canvas/${canvasId}/pregen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, width, height }),
  });
}

export async function updateCanvasImagePosition(canvasId: string, imageId: string, x: number, y: number): Promise<void> {
  await request(`/canvas/${canvasId}/images/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y }),
  });
}

export async function deleteCanvasImage(canvasId: string, imageId: string): Promise<void> {
  await request(`/canvas/${canvasId}/images/${imageId}`, { method: 'DELETE' });
}

export async function completePregen(canvasId: string, imageId: string, imageBase64: string, genConfig: Record<string, unknown>): Promise<void> {
  await request(`/canvas/${canvasId}/pregen/${imageId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, genConfig }),
  });
}

export async function failPregen(canvasId: string, imageId: string): Promise<void> {
  await request(`/canvas/${canvasId}/pregen/${imageId}/fail`, { method: 'POST' });
}

export async function saveCanvasViewport(canvasId: string, x: number, y: number, zoom: number): Promise<void> {
  await request(`/canvas/${canvasId}/viewport`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ x, y, zoom }),
  });
}

export async function loadCanvasViewport(canvasId: string): Promise<{ x: number; y: number; zoom: number }> {
  return request(`/canvas/${canvasId}/viewport`);
}
