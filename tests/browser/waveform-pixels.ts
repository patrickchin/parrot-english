import type { Locator } from '@playwright/test';

export function waveformImage(waveform: Locator) {
  return waveform.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}

// Read the rendered pixels, independent of the renderer's data structures.
export function waveformOnset(waveform: Locator, start: number, end: number) {
  return waveform.evaluate((canvas: HTMLCanvasElement, { start, end }) => {
    const row = canvas.getContext('2d')!.getImageData(0, Math.floor(canvas.height * 0.4), canvas.width, 1).data;
    for (let x = 0; x < canvas.width; x++) if (row[x * 4 + 3]) return start + x / canvas.width * (end - start);
    throw new Error('No audible waveform pixels');
  }, { start, end });
}
