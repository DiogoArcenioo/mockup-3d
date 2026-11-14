'use client';
import { useEffect, useRef } from 'react';
export function LegacyFrame({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    const receive = (event: MessageEvent) => { if (event.origin === location.origin && event.source === frame.current?.contentWindow && event.data === 'forma:session-expired') window.location.replace('/login'); };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, []);
  return <iframe ref={frame} className="module-frame" src={src} title={title} />;
}
