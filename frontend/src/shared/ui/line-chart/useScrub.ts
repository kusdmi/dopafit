import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

const MOVE_THRESHOLD = 8; // px до различения скролл/скраб
// Насколько вертикаль должна доминировать над горизонталью, чтобы жест был
// признан скроллом страницы (а не скрабом). >1 прощает лёгкую вертикальную
// составляющую горизонтального скраба, чтобы полоска не сбрасывалась случайно.
const VERT_DOMINANCE = 1.5;
// Press-and-hold: if the finger stays put this long without becoming a vertical
// scroll, show the tooltip (so a stationary hold works, not only a scrub).
const HOLD_DELAY_MS = 130;

interface ScrubOptions {
  /** Узел svg, общий с вызывающим компонентом (он же измеряет по нему ширину). */
  svgRef: RefObject<SVGSVGElement | null>;
  /** Переводит clientX в индекс точки. Читает актуальные размеры узла. */
  indexFromClientX: (clientX: number, node: SVGSVGElement | null) => number;
}

export interface Scrub {
  /** Индекс активной точки, либо null, когда подсказка скрыта. */
  activeIdx: number | null;
  /** ref-колбэк для svg: привязывает non-passive touchmove к живому узлу. */
  setSvgRef: (node: SVGSVGElement | null) => void;
  handlers: {
    onPointerDown: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
}

/**
 * Жест «скраб по графику»: отличает горизонтальное протягивание и удержание
 * (показывают подсказку) от вертикального скролла страницы (отдаётся браузеру).
 *
 * Логика набрана из наблюдений на реальном WebView и держится на порядке
 * операций, а не на декларативном состоянии, — разбирать её на части опасно.
 */
export function useScrub({ svgRef, indexFromClientX }: ScrubOptions): Scrub {
  // Колбэк пересоздаётся каждый рендер (замыкает ширину и даты), а hold-таймер
  // живёт между рендерами — держим последнюю версию в ref, чтобы отложенная
  // активация считала индекс по актуальной геометрии, а не по той, что была на
  // момент pointerdown. Обновляем в эффекте, а не в теле: во время рендера ref
  // трогать нельзя.
  const indexRef = useRef(indexFromClientX);
  useEffect(() => {
    indexRef.current = indexFromClientX;
  }, [indexFromClientX]);
  // Tracks the currently-bound node so the ref callback can unbind the old node
  // and bind the new one whenever the SVG is recreated (e.g. on a tab switch).
  const boundNode = useRef<SVGSVGElement | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  // Отслеживаем начало жеста, чтобы отличить горизонтальный скраб (tooltip)
  // от вертикального скролла страницы. Активируем tooltip только когда палец
  // сдвинулся преимущественно по горизонтали дальше порога MOVE_THRESHOLD.
  const startPt = useRef<{ x: number; y: number } | null>(null);
  const activated = useRef(false);
  // Latest pointer position, so the hold-timer can activate at the finger.
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  // Timer id for the press-and-hold activation (null = none).
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Active pointer id, so activation can capture it (keeps the finger bound to
  // the svg — the browser won't steal it for a vertical scroll, so an activated
  // tooltip survives a vertical scrub instead of getting a pointercancel).
  const pointerId = useRef<number | null>(null);
  // Whether the active pointer is currently captured (idempotency guard).
  const captured = useRef(false);

  // Clear the pending hold-timer on unmount so it can't fire after teardown.
  useEffect(
    () => () => {
      if (holdTimer.current) clearTimeout(holdTimer.current);
    },
    [],
  );

  // Bind the non-passive touchmove listener imperatively PER NODE via a ref
  // callback, not a one-shot useEffect. The analytics page can stay mounted and
  // can recreate this SVG node when the target tab switches; a useEffect([]) would
  // leave the listener bound to a stale node, so scrub scroll-suppression would
  // silently stop working after a tab round-trip. The ref callback runs on every
  // mount of a new node, so the non-passive listener always follows the live node.
  const onTouchMoveNative = useRef((e: TouchEvent) => {
    if (activated.current) e.preventDefault();
  });
  const setSvgRef = useCallback((node: SVGSVGElement | null) => {
    if (boundNode.current) {
      boundNode.current.removeEventListener('touchmove', onTouchMoveNative.current);
      boundNode.current = null;
    }
    svgRef.current = node;
    if (node) {
      node.addEventListener('touchmove', onTouchMoveNative.current, { passive: false });
      boundNode.current = node;
    }
  }, [svgRef]);

  function cancelHold() {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }

  // Capture the pointer so the browser keeps routing its moves to us even if the
  // finger travels vertically — otherwise touch-action: pan-y hands a vertical
  // drag to page scroll and fires pointercancel, dropping the tooltip. MUST run
  // synchronously inside a real pointer event: a capture requested from the async
  // hold-timer doesn't take effect until the next pointer event, so we (re)capture
  // on the first move after activation too — that's why an activated tooltip used
  // to need a small horizontal scrub before vertical scrubs would hold.
  function capturePointer() {
    if (captured.current) return;
    const id = pointerId.current;
    if (id == null) return;
    try {
      svgRef.current?.setPointerCapture(id);
      captured.current = true;
    } catch {
      // setPointerCapture can throw if the pointer is already gone; ignore.
    }
  }

  function activateAt(clientX: number) {
    cancelHold();
    activated.current = true;
    // Suppressing page scroll once activated is done by the non-passive
    // 'touchmove' listener above, which calls preventDefault while
    // activated.current is true. touch-action stays 'pan-y' so vertical
    // scroll works BEFORE activation; preventDefault on a non-passive touchmove
    // is honoured per-event by the compositor, so it stops scroll even mid-
    // gesture — unlike touch-action, which is latched at gesture start.
    capturePointer();
    setActiveIdx(indexRef.current(clientX, svgRef.current));
  }

  function handleDown(e: React.PointerEvent<SVGSVGElement>) {
    startPt.current = { x: e.clientX, y: e.clientY };
    lastPt.current = { x: e.clientX, y: e.clientY };
    pointerId.current = e.pointerId;
    activated.current = false;
    // НЕ показываем tooltip сразу: ждём либо горизонтального скраба, либо
    // удержания HOLD_DELAY_MS на месте — чтобы вертикальный скролл страницы не
    // рисовал подсказку, но press-and-hold всё же её показывал.
    cancelHold();
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      // Активируем, только если жест ещё «живой» (не отдан скроллу) и не активен.
      if (startPt.current && !activated.current) {
        activateAt(lastPt.current?.x ?? startPt.current.x);
      }
    }, HOLD_DELAY_MS);
  }

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    lastPt.current = { x: e.clientX, y: e.clientY };
    if (activated.current) {
      // Скраб уже подтверждён. Capture синхронно ЗДЕСЬ (в реальном move-событии):
      // если активация случилась по hold-таймеру, capture из таймера ещё не
      // закрепился, и первый же скраб — в т.ч. вертикальный — должен его закрепить,
      // чтобы удержать tooltip, не требуя предварительного горизонтального движения.
      capturePointer();
      e.preventDefault();
      setActiveIdx(indexRef.current(e.clientX, svgRef.current));
      return;
    }
    const start = startPt.current;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    // Явный вертикальный жест — это скролл страницы: отдаём его браузеру и больше
    // не претендуем на этот pointer. Требуем не просто dy>dx, а заметное
    // доминирование вертикали (dy > dx*VERT_DOMINANCE) И проход порога, иначе
    // лёгкое вертикальное дрожание на старте горизонтального скраба убивало бы
    // жест (полоска «сбрасывалась» слишком легко).
    if (dy > MOVE_THRESHOLD && dy > dx * VERT_DOMINANCE) {
      cancelHold();
      startPt.current = null;
      return;
    }
    // Горизонталь прошла порог → это скраб. Не требуем dx>dy: небольшую
    // вертикальную составляющую прощаем, чтобы старт был отзывчивым.
    if (dx > MOVE_THRESHOLD) {
      e.preventDefault();
      activateAt(e.clientX);
    }
    // Иначе (оба ниже порога / неоднозначно) — ждём удержания или след. move.
  }

  function clear() {
    cancelHold();
    const id = pointerId.current;
    if (id != null) {
      try {
        svgRef.current?.releasePointerCapture(id);
      } catch {
        // Already released / pointer gone; ignore.
      }
    }
    pointerId.current = null;
    captured.current = false;
    startPt.current = null;
    lastPt.current = null;
    activated.current = false;
    setActiveIdx(null);
  }

  return {
    activeIdx,
    setSvgRef,
    handlers: {
      onPointerDown: handleDown,
      onPointerMove: handleMove,
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}
