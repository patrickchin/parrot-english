import { asset, type Scene } from './scene';
import type { Takes } from './useDubbing';
import { lineWindow } from './line-window';

const unsupported = '这个浏览器暂不支持导出 MP4。请用新版 Safari 或 Chrome 重试。';

// The same line windows as replay: original voices outside replaced turns,
// backing under replaced turns, and each take at its retained capture offset.
export async function mixDubAudio(scene: Scene, takes: Takes, original: ArrayBuffer, backing?: ArrayBuffer) {
  const context = new OfflineAudioContext(2, Math.ceil(scene.duration * 48000), 48000);
  const turns = scene.lines.filter(line => takes[line.id]);
  const [originalAudio, music, ...voices] = await Promise.all([
    context.decodeAudioData(original),
    backing ? context.decodeAudioData(backing) : undefined,
    ...turns.map(line => takes[line.id].blob.arrayBuffer().then(bytes => context.decodeAudioData(bytes))),
  ]);
  const originalGain = context.createGain(); originalGain.gain.setValueAtTime(1, 0);
  const backingGain = context.createGain(); backingGain.gain.setValueAtTime(0, 0);
  for (const [index, line] of turns.entries()) {
    originalGain.gain.setValueAtTime(0, line.start);
    originalGain.gain.setValueAtTime(1, line.end);
    backingGain.gain.setValueAtTime(0, line.start);
    backingGain.gain.linearRampToValueAtTime(1, line.start + 0.015);
    backingGain.gain.setValueAtTime(1, line.end - 0.015);
    backingGain.gain.linearRampToValueAtTime(0, line.end);
    const take = takes[line.id], buffer = voices[index]!;
    const window = lineWindow(scene, line);
    const voiceStart = Math.max(window.voiceStart, take.start);
    const offset = voiceStart - take.start;
    const duration = Math.min(buffer.duration, window.voiceEnd - take.start) - offset;
    if (duration <= 0) continue;
    const voice = context.createBufferSource(); voice.buffer = buffer;
    voice.connect(context.destination); voice.start(voiceStart, offset, duration);
  }
  const source = context.createBufferSource(); source.buffer = originalAudio;
  source.connect(originalGain).connect(context.destination); source.start();
  if (music) {
    const bed = context.createBufferSource(); bed.buffer = music;
    bed.connect(backingGain).connect(context.destination); bed.start();
  }
  return context.startRendering();
}

export async function exportDub(scene: Scene, takes: Takes, source: string, signal: AbortSignal, progress: (percent: number) => void) {
  signal.throwIfAborted();
  // Loaded only for export: preserve the original picture and its sample times,
  // and encode the locally mixed voice track without a real-time capture clock.
  const { Input, BufferSource, MP4, QTFF, WEBM, Output, BufferTarget, Mp4OutputFormat,
    EncodedPacketSink, EncodedVideoPacketSource, VideoSampleSink, VideoSampleSource,
    AudioBufferSource, Quality, canEncodeAudio } = await import('mediabunny');
  if (!await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000 })) throw new Error(unsupported);
  signal.throwIfAborted();
  let input: import('mediabunny').Input | undefined;
  let output: import('mediabunny').Output | undefined;
  const cancel = () => { if (output && output.state !== 'finalized' && output.state !== 'canceled') void output.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const bytes = async (url: string) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error('视频素材加载失败，请重试。');
      return response.arrayBuffer();
    };
    const [original, backing] = await Promise.all([
      bytes(source), scene.backing && Object.keys(takes).length ? bytes(asset(scene, scene.backing)) : undefined,
    ]);
    signal.throwIfAborted(); progress(10);
    const audio = await mixDubAudio(scene, takes, original.slice(0), backing);
    signal.throwIfAborted(); progress(20);
    input = new Input({ formats: [MP4, QTFF, WEBM], source: new BufferSource(original) });
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('视频导出失败，请重试。');
    const codec = await track.getCodec(), config = await track.getDecoderConfig();
    if (!codec || !config) throw new Error(unsupported);
    const target = new BufferTarget();
    output = new Output({ target, format: new Mp4OutputFormat({ fastStart: 'in-memory' }) });
    let videoProgress = 0, audioProgress = 0;
    const report = () => progress(Math.min(99, 20 + Math.floor(40 * (videoProgress + audioProgress))));
    const voices = new AudioBufferSource({ codec: 'aac', quality: new Quality({ bitrate: 192000 }), onEncodedPacket: packet => {
      audioProgress = Math.min(1, (packet.timestamp + packet.duration) / scene.duration); report();
    } });
    const picture = codec === 'avc' ? new EncodedVideoPacketSource('avc') : new VideoSampleSource({ codec: 'avc', quality: new Quality('high') });
    output.addVideoTrack(picture, { rotation: await track.getRotation() });
    output.addAudioTrack(voices);
    await output.start();
    await Promise.all([
      (async () => {
        if (picture instanceof EncodedVideoPacketSource) {
          for await (const packet of new EncodedPacketSink(track).packets()) {
            signal.throwIfAborted();
            // Keep reference frames in decode order, including B-frame dependencies.
            await picture.add(packet, { decoderConfig: config });
            videoProgress = Math.min(1, (packet.timestamp + packet.duration) / scene.duration); report();
          }
        } else {
          for await (const sample of new VideoSampleSink(track).samples()) {
            try { signal.throwIfAborted(); await picture.add(sample); videoProgress = Math.min(1, (sample.timestamp + sample.duration) / scene.duration); report(); }
            finally { sample.close(); }
          }
        }
        picture.close();
      })(),
      voices.add(audio).then(() => voices.close()),
    ]);
    signal.throwIfAborted(); await output.finalize(); signal.throwIfAborted();
    if (!target.buffer?.byteLength) throw new Error('视频导出失败，请重试。');
    progress(100); return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    if (!signal.aborted && (error instanceof TypeError || error instanceof DOMException)) throw new Error('视频导出失败，请重试。', { cause: error });
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    if (output && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel();
    input?.dispose();
  }
}
