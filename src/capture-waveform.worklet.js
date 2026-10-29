// Capture actual 5 ms peaks off the UI thread, including samples between paints.
class CaptureWaveform extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.count = 0;
    this.peak = 0;
    this.window = sampleRate * 0.005;
    this.port.onmessage = () => { this.active = true; this.count = 0; this.peak = 0; };
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (this.active && samples) {
      const peaks = [];
      for (const sample of samples) {
        this.peak = Math.max(this.peak, Math.abs(sample));
        if (++this.count >= this.window) {
          peaks.push(this.peak); this.peak = 0; this.count -= this.window;
        }
      }
      if (peaks.length) this.port.postMessage(peaks);
    }
    // The output stays silent; never route the microphone to the speakers.
    return true;
  }
}
registerProcessor('capture-waveform', CaptureWaveform);
