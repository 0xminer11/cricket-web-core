'use client';

import { useEffect, useRef } from 'react';
import type { MatchGameplayController } from '../core/gameplay-controller';

/**
 * The execution meter. The cursor position is written straight to the DOM from a frame loop (no
 * React render per frame). The green band is the bowler's own "perfect" window, so it grows as
 * Accuracy, Control and Consistency are trained. In assisted mode the meter is shown as auto-timed.
 */
export function TimingMeter({
  controller,
  active,
  assist,
  halfWindow,
}: {
  controller: MatchGameplayController;
  active: boolean;
  assist: boolean;
  halfWindow: number;
}) {
  const cursor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const tick = () => {
      const node = cursor.current;
      if (node)
        node.style.left = `${(assist ? 0.5 : controller.meterCursor()) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [controller, active, assist]);
  return (
    <div
      className={`timing-meter${assist ? ' is-assist' : ''}`}
      role="img"
      aria-label={
        assist
          ? 'Timing is assisted: it is set for you.'
          : 'Timing meter. Press Bowl when the marker is inside the highlighted window.'
      }
    >
      <span
        className="timing-window"
        style={{
          left: `${(0.5 - halfWindow) * 100}%`,
          width: `${halfWindow * 200}%`,
        }}
      />
      <span className="timing-cursor" ref={cursor} />
      <span className="timing-label" aria-hidden="true">
        {assist ? 'AUTO' : 'TIMING'}
      </span>
    </div>
  );
}
