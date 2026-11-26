import { useEffect, useRef, useState } from 'react';

type YouTubePlayer = {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(time: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
};
type PlayerApi = { Player: new (target: HTMLElement, options: object) => YouTubePlayer };
declare global { interface Window { YT?: PlayerApi; onYouTubeIframeAPIReady?: () => void } }

let apiRequest: Promise<PlayerApi> | undefined;
function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiRequest ??= new Promise<PlayerApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    const script = document.createElement('script');
    const finish = () => {
      window.clearTimeout(timeout);
      window.onYouTubeIframeAPIReady = previous;
      if (window.YT?.Player) resolve(window.YT);
      else { script.remove(); reject(new Error('YouTube player unavailable')); }
    };
    const timeout = window.setTimeout(finish, 12000);
    window.onYouTubeIframeAPIReady = () => { previous?.(); finish(); };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = finish;
    document.head.append(script);
  }).catch(error => { apiRequest = undefined; throw error; });
  return apiRequest;
}

export function youtubeId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    const id = url.hostname === 'youtu.be' ? url.pathname.split('/')[1] :
      /(^|\.)youtube\.com$/.test(url.hostname) ?
        url.searchParams.get('v') ?? url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] : '';
    return id && /^[\w-]{11}$/.test(id) ? id : '';
  } catch { return ''; }
}

export function useStudioPreview(youtube: string, initialTime: number, sourceKey: string) {
  const mount = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const youtubePlayer = useRef<YouTubePlayer | null>(null);
  const playUntil = useRef<number | null>(null);
  const requestedStart = useRef(initialTime);
  requestedStart.current = initialTime;
  const [time, setTime] = useState(initialTime);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setTime(requestedStart.current);
    playUntil.current = null;
    const host = mount.current;
    if (!youtube || !host) return;
    let active = true;
    const target = document.createElement('div');
    host.append(target);
    const timeout = window.setTimeout(() => { if (active) setFailed(true); }, 20000);
    void loadPlayerApi().then(api => {
      if (!active) return;
      youtubePlayer.current = new api.Player(target, {
        width: '100%', height: '100%', videoId: youtube,
        playerVars: { origin: window.location.origin, playsinline: 1, rel: 0, start: Math.floor(requestedStart.current) },
        events: {
          onReady: () => {
            if (!active) return;
            window.clearTimeout(timeout);
            setFailed(false);
            setReady(true);
          },
          onError: () => {
            if (!active) return;
            window.clearTimeout(timeout);
            setFailed(true);
            setReady(false);
            setPlaying(false);
          },
          onStateChange: ({ data }: { data: number }) => { if (active) setPlaying(data === 1); },
        },
      });
    }).catch(() => { if (active) { window.clearTimeout(timeout); setFailed(true); } });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      youtubePlayer.current?.destroy();
      youtubePlayer.current = null;
      host.replaceChildren();
    };
  }, [youtube, sourceKey, retry]);

  function readTime() {
    return video.current?.currentTime ?? youtubePlayer.current?.getCurrentTime();
  }

  function pause() {
    playUntil.current = null;
    video.current?.pause();
    youtubePlayer.current?.pauseVideo();
  }

  useEffect(() => {
    if (!ready || !playing && !youtube) return;
    let lastPosition = readTime();
    const interval = window.setInterval(() => {
      const position = readTime();
      if (position === undefined) return;
      if (playing && playUntil.current !== null && position >= playUntil.current) {
        const end = playUntil.current;
        pause();
        if (video.current) video.current.currentTime = end;
        else youtubePlayer.current?.seekTo(end, true);
        setTime(end);
      } else if (position !== lastPosition) setTime(position);
      lastPosition = position;
    }, youtube ? 75 : 16);
    return () => window.clearInterval(interval);
  }, [playing, ready, youtube]);

  function seek(position: number) {
    setTime(position);
    if (!ready) return;
    if (video.current) video.current.currentTime = position;
    else if (youtubePlayer.current) {
      const wasPlaying = youtubePlayer.current.getPlayerState() === 1;
      youtubePlayer.current.seekTo(position, true);
      if (!wasPlaying) youtubePlayer.current.pauseVideo();
    }
  }

  function toggle(start: number, end: number, restart = false) {
    if (playing) { pause(); return; }
    if (!ready) return;
    const from = !restart && time >= start && time < end - 0.05 ? time : start;
    seek(from);
    playUntil.current = end;
    if (video.current) void video.current.play().catch(() => { playUntil.current = null; setFailed(true); });
    else youtubePlayer.current?.playVideo();
  }

  return {
    mount, video, time, playing, ready, failed, seek, toggle, pause, retry,
    reload: () => setRetry(value => value + 1),
    videoEvents: {
      onLoadedMetadata: () => { if (video.current) video.current.currentTime = requestedStart.current; setReady(true); },
      onPlaying: () => setPlaying(true),
      onPause: () => { if (video.current) setTime(video.current.currentTime); setPlaying(false); },
      onEnded: () => setPlaying(false),
      onSeeked: () => { if (video.current) setTime(video.current.currentTime); },
      onError: () => { setFailed(true); setReady(false); setPlaying(false); },
    },
  };
}
