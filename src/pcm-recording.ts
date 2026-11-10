// Standard mono PCM WAV preserves the worklet's sample zero without a separate
// encoder timeline that can shift the saved voice relative to its waveform.
export function encodePcmWav(chunks: Float32Array[], sampleRate: number) {
  const frames = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(bytes);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const value of chunk) {
    const sample = Math.min(1, Math.max(-1, value));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], { type: 'audio/wav' });
}
