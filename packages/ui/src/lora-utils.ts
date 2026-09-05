export function displayLoraName(
  filename: string,
  nameMap: Record<string, string>
): string {
  if (nameMap[filename]) return nameMap[filename];

  let name = filename.replace(/\.(safetensors|ckpt)$/i, '');

  const noiseWords = new Set(['lora', 'f16', 'f32', 'safetensors', 'ckpt']);
  name = name
    .split(/[_-]+/)
    .filter((part) => !noiseWords.has(part.toLowerCase()))
    .join('_');

  return name.toUpperCase();
}
