import { CanvasTexture, SRGBColorSpace } from 'three';
import type { KitStyle } from '@the-cricketer/game-core';

/**
 * Draws the jersey look onto a canvas: base colour, pattern and the player's number. One jersey
 * model serves every colour and every number; nothing is baked into the mesh. The back of the shirt
 * is the middle of the texture (u = 0.5), the chest sits at the edges. The jersey UVs follow glTF
 * orientation (u grows to the viewer's right, v = 0 at the top), so the number is not mirrored.
 * Player names can later be added the same way (`KitStyle.nameplate`).
 */
export function drawJerseyCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  style: KitStyle,
  number: number | null,
  size: number,
): void {
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return;
  ctx.fillStyle = style.primary;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = style.secondary;
  if (style.pattern === 'stripe')
    ctx.fillRect(0, size * 0.52, size, size * 0.07);
  if (style.pattern === 'hoops')
    for (let y = size * 0.3; y < size * 0.95; y += size * 0.2)
      ctx.fillRect(0, y, size, size * 0.08);
  ctx.fillStyle = style.accent;
  ctx.fillRect(0, size * 0.99, size, size * 0.01);
  if (style.number && number !== null) {
    const text = String(number);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const draw = (x: number, y: number, px: number) => {
      ctx.font = `800 ${Math.round(px)}px system-ui, "Segoe UI", sans-serif`;
      ctx.lineWidth = Math.max(2, px * 0.08);
      ctx.strokeStyle = style.secondary;
      ctx.strokeText(text, x, y);
      ctx.fillStyle = style.accent;
      ctx.fillText(text, x, y);
    };
    draw(size * 0.5, size * 0.38, size * 0.3); // back
    draw(size * 0.07, size * 0.3, size * 0.11); // chest, left of the seam
    draw(size * 0.93, size * 0.3, size * 0.11);
  }
}

export function createJerseyTexture(
  style: KitStyle,
  number: number | null,
  size: number,
): CanvasTexture {
  const canvas = document.createElement('canvas');
  drawJerseyCanvas(canvas, style, number, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.flipY = false; // glTF UVs start at the top-left, like the canvas
  return texture;
}
