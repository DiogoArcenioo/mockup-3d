export type ArtworkLayout = 'wrap' | 'repeat';

export interface ArtworkSettings {
  scale: number;
  x: number;
  y: number;
  layout: ArtworkLayout;
}

export const TEXTURE_WIDTH = 4096;
export const TEXTURE_HEIGHT = 2048;
export const MUG_HEIGHT = 2.48;
export const MUG_RADIUS = 1;

// Texture pixels represent physical distances, so a square stays square on the mug.
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
  const height = imageHeight * fit * settings.scale * TEXTURE_HEIGHT / MUG_HEIGHT;
  return {
    width,
    height,
    centers: settings.layout === 'repeat' ? [0.25, 0.75] : [0.5],
    offsetX: settings.x / 100 * TEXTURE_WIDTH * 0.5,
    offsetY: -settings.y / 100 * TEXTURE_HEIGHT * 0.4,
  };
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
  // Clip only vertically. Horizontal offsets wrap continuously through the 360° seam.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, TEXTURE_HEIGHT * 0.045,
    TEXTURE_WIDTH, TEXTURE_HEIGHT * 0.9);
  ctx.clip();
  for (const center of placement.centers) {
    for (const repeat of [-1, 0, 1]) {
      ctx.drawImage(image,
        center * TEXTURE_WIDTH + placement.offsetX - placement.width / 2 + repeat * TEXTURE_WIDTH,
        TEXTURE_HEIGHT / 2 + placement.offsetY - placement.height / 2,
        placement.width, placement.height);
    }
  }
  ctx.restore();
}
