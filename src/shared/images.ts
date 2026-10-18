export const maxImageBytes = 256 * 1024;
export const maxImageDimension = 1024;
export const maxSourceImageBytes = 20 * 1024 * 1024;

export type CharacterImage = {
  version: string;
  size: number;
  width: number;
  height: number;
};

export function imageUrl(id: string, version: string) {
  return `/api/characters/${encodeURIComponent(id)}/image?v=${encodeURIComponent(version)}`;
}
