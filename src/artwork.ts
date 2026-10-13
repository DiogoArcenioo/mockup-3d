export type ArtworkLayout = 'wrap' | 'repeat';

export interface ArtworkSettings {
  scale: number;
  heightScale?: number;
  x: number;
  y: number;
  layout: ArtworkLayout;
}

export const TEXTURE_WIDTH = 4096;
export const TEXTURE_HEIGHT = 2048;
export const MUG_HEIGHT = 2.48;
export const MUG_RADIUS = 1;

// Preserve physical proportions unless the user explicitly adjusts only the height.
export function calculatePlacement(
  imageWidth: number,
  imageHeight: number,
  settings: ArtworkSettings,
) {
  const circumference = 2 * Math.PI * MUG_RADIUS;
  // Extend the continuous print slightly toward the handle, without stretching the image.
  const availableWidth = circumference * (settings.layout === 'repeat' ? 0.43 : 0.93);
  const availableHeight = MUG_HEIGHT * (settings.layout === 'repeat' ? 0.87 : 0.89);
  const fit = Math.min(availableWidth / imageWidth, availableHeight / imageHeight);
  const width = imageWidth * fit * settings.scale * TEXTURE_WIDTH / circumference;
  const height = imageHeight * fit * settings.scale * (settings.heightScale ?? 1) * TEXTURE_HEIGHT / MUG_HEIGHT;
  return {
    width,
    height,
    centers: settings.layout === 'repeat' ? [0.25, 0.75] : [0.5],
    offsetX: settings.x / 100 * TEXTURE_WIDTH * 0.5,
    offsetY: -settings.y / 100 * TEXTURE_HEIGHT * 0.4,
  };
}

export function fillArtworkHeight(
  imageWidth: number,
  imageHeight: number,
  settings: ArtworkSettings,
): ArtworkSettings {
  const placement = calculatePlacement(imageWidth, imageHeight, { ...settings, heightScale: 1 });
  // Only stretch vertically; preserve the horizontal extent and the gap near the handle.
  return { ...settings, heightScale: TEXTURE_HEIGHT / placement.height, y: 0 };
}

export function paintArtwork(
  canvas: HTMLCanvasElement,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  settings: ArtworkSettings,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não foi possível preparar sua arte.');
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  // Keep source transparency; the print material filters premultiplied colour
  // so empty areas reveal either ceramic colour without an outline.
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const placement = calculatePlacement(imageWidth, imageHeight, settings);
  // The canvas clips at the full height of the outer wall. Horizontal placement
  // still wraps through the 360° seam, independently of vertical coverage.
  for (const center of placement.centers) {
    for (const repeat of [-1, 0, 1]) {
      ctx.drawImage(image,
        center * TEXTURE_WIDTH + placement.offsetX - placement.width / 2 + repeat * TEXTURE_WIDTH,
        TEXTURE_HEIGHT / 2 + placement.offsetY - placement.height / 2,
        placement.width, placement.height);
    }
  }
}
