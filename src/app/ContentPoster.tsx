import { useEffect, useRef, useState } from 'react';

export function ContentPoster({ src, eager = false, priority = false }: { src: string; eager?: boolean; priority?: boolean }) {
  const image = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (visible || !image.current) return;
    if (eager) { setVisible(true); return; }
    // Native lazy loading fetches several screens ahead, competing with video.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '100px' });
    observer.observe(image.current);
    return () => observer.disconnect();
  }, [eager, visible]);
  return <img ref={image} src={eager || visible ? src : undefined} alt="" fetchPriority={priority ? 'high' : 'low'} decoding="async" />;
}
