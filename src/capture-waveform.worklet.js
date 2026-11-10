// The saved PCM and 5 ms peaks share exactly the same first sample and clock.
class CaptureWaveform extends AudioWorkletProcessor {
  constructor() {
    super();
    this.active = false;
    this.window = sampleRate * 0.005;
    this.port.onmessage = event => {
      if (event.data === 'stop') {
        if (!this.active) return;
        if (this.count) this.peaks.push(this.peak);
        this.flush(); this.active = false;
        this.port.postMessage({ type: 'stopped' });
      } else {
        this.active = true; this.starting = true;
        this.count = 0; this.peak = 0; this.peaks = [];
        this.samples = new Float32Array(512); this.filled = 0;
      }
    };
  }
  flush() {
    if (!this.filled && !this.peaks.length) return;
    const samples = this.samples.subarray(0, this.filled);
    this.port.postMessage({ type: 'data', samples, peaks: this.peaks }, [samples.buffer]);
    this.samples = new Float32Array(512); this.filled = 0; this.peaks = [];
  }
  process(inputs) {
    const samples = inputs[0]?.[0];
    if (this.active && samples) {
      if (this.starting) {
        this.starting = false;
        this.port.postMessage({ type: 'started', time: currentFrame / sampleRate });
      }
      for (const sample of samples) {
        this.samples[this.filled++] = sample;
        this.peak = Math.max(this.peak, Math.abs(sample));
        if (++this.count >= this.window) {
          this.peaks.push(this.peak); this.peak = 0; this.count -= this.window;
        }
        if (this.filled === this.samples.length) this.flush();
      }
    }
    // The output stays silent; never route the microphone to the speakers.
    return true;
  }
}
registerProcessor('capture-waveform', CaptureWaveform);
