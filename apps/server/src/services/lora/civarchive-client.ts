// CivArchive klient – port proxy/src/civarchive-client.ts 1:1 (F5). Beze změny.

export interface CivArchiveHit {
  name: string;
  model_id: number;
  modelVersionName?: string;
  base_model: string;
  username: string;
  download_count: number;
}

const CIVARCHIVE_API = "https://civarchive.com/api/search";

function wordOverlapScore(queryWords: string[], name: string): number {
  const lower = name.toLowerCase();
  return queryWords.filter((w) => lower.includes(w)).length;
}

export async function searchByCivArchive(
  query: string,
  baseModels?: string[],
): Promise<CivArchiveHit | null> {
  try {
    let url = `${CIVARCHIVE_API}?q=${encodeURIComponent(query)}&type=LORA&limit=50`;
    if (baseModels && baseModels.length > 0) {
      for (const bm of baseModels) {
        url += `&base_model=${encodeURIComponent(bm)}`;
      }
    }

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const results: any[] = data?.results ?? [];
    if (results.length === 0) return null;

    const queryWords = query
      .replace(/\.safetensors$/, "")
      .replace(/\.ckpt$/, "")
      .replace(/[_-]/g, " ")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    if (queryWords.length === 0) return null;

    const scored = results
      .filter((r: any) => r.kind === "version" || r.kind === "file")
      .map((r: any) => ({
        hit: {
          name: r.name,
          model_id: Number(r.model_id),
          modelVersionName: r.name,
          base_model: r.base_model,
          username: r.username,
          download_count: r.download_count ?? 0,
        } as CivArchiveHit,
        score: wordOverlapScore(queryWords, r.name),
      }));

    scored.sort((a: any, b: any) => b.score - a.score);

    const best = scored[0];
    if (!best || best.score < 1) return null;

    return best.hit;
  } catch {
    return null;
  }
}
