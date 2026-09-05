// Seznam cloud modelů servrovaný routou GET /api/cloud-models.
// Zdroj: apps/server/src/cloud-models.json (F0 kopie proxy/src/cloud-models.json).

import rawModels from "../cloud-models.json";

export interface CloudModel {
  name: string;
  version: string;
  file: string;
}

function isCloudModel(m: unknown): m is CloudModel {
  if (!m || typeof m !== "object") return false;
  const r = m as Record<string, unknown>;
  return typeof r.name === "string" && typeof r.version === "string" && typeof r.file === "string";
}

function load(): readonly CloudModel[] {
  if (!Array.isArray(rawModels)) {
    throw new Error("cloud-models.json must be a JSON array");
  }
  const models = rawModels.filter(isCloudModel);
  if (models.length !== rawModels.length) {
    throw new Error(
      `cloud-models.json contains ${rawModels.length - models.length} invalid entries (expected {name, version, file})`,
    );
  }
  return models;
}

const models: readonly CloudModel[] = load();

export function getCloudModels(): readonly CloudModel[] {
  return models;
}
