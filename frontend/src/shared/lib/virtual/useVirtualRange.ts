import { useLayoutEffect, useRef, useState } from 'react';

/** Fixed-height rows in either PageContent or a scrollable popup. */
export function useVirtualRange(count: number, rowHeight: number) {
  const ref = useRef<HTMLUListElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600 });
  useLayoutEffect(() => {
    const list = ref.current;
    const scroller = list?.closest<HTMLElement>('[data-scroll-container]');
    if (!list || !scroller) return;
    let frame = 0;
    const measure = () => {
      const top = Math.max(
        0,
        scroller.getBoundingClientRect().top - list.getBoundingClientRect().top,
      );
      const height = scroller.clientHeight || 600;
      setViewport((old) => (old.top === top && old.height === height ? old : { top, height }));
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(scroller);
    observer?.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      scroller.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, []);
  const start = Math.min(
    Math.max(0, count - 1),
    Math.max(0, Math.floor(viewport.top / rowHeight) - 4),
  );
  const end = Math.min(count, Math.ceil((viewport.top + viewport.height) / rowHeight) + 4);
  return {
    ref,
    start,
    end: Math.max(start, end),
    indices: Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i),
  };
}
