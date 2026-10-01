'use client';

import { useState } from 'react';
import type { ViewerSession } from '../renderer/viewer-session';

type Axis = 0 | 1 | 2;
/**
 * DEVELOPMENT ONLY. Nudge an attachment's position/rotation live and copy the result as config for
 * `character/visuals.ts`. Players never see this: it is rendered only in non-production builds and
 * changes nothing that is saved.
 */
export function DevAttachmentTuner({
  getSession,
}: {
  getSession: () => ViewerSession | null;
}) {
  const [slot, setSlot] = useState<'bat' | 'helmet'>('bat');
  const [bones, setBones] = useState(false);
  const [text, setText] = useState('');
  const holder = () => getSession()?.controller?.holderOf(`equipment:${slot}`);
  const read = () => {
    const h = holder();
    return {
      position: h?.position.toArray() ?? [0, 0, 0],
      rotation: [h?.rotation.x ?? 0, h?.rotation.y ?? 0, h?.rotation.z ?? 0],
    };
  };
  const [, force] = useState(0);
  const set = (kind: 'position' | 'rotation', axis: Axis, value: number) => {
    const h = holder();
    if (!h) return;
    if (kind === 'position') {
      const p = h.position.toArray();
      p[axis] = value;
      h.position.fromArray(p);
    } else {
      const r = [h.rotation.x, h.rotation.y, h.rotation.z];
      r[axis] = value;
      h.rotation.set(r[0] as number, r[1] as number, r[2] as number);
    }
    getSession()?.requestRender();
    force((n) => n + 1);
  };
  const { position, rotation } = read();
  return (
    <details className="dev-tuner">
      <summary>Dev: attachment tuner</summary>
      <label>
        Item{' '}
        <select
          value={slot}
          onChange={(e) => setSlot(e.target.value as 'bat' | 'helmet')}
        >
          <option value="bat">Bat</option>
          <option value="helmet">Helmet</option>
        </select>
      </label>
      <label>
        <input
          type="checkbox"
          checked={bones}
          onChange={(e) => {
            setBones(e.target.checked);
            getSession()?.setBoneDebug(e.target.checked);
          }}
        />{' '}
        Show bones
      </label>
      {(['position', 'rotation'] as const).map((kind) =>
        ([0, 1, 2] as const).map((axis) => (
          <label key={kind + axis} className="tuner-row">
            {kind} {'xyz'[axis]}
            <input
              type="range"
              min={kind === 'position' ? -0.3 : -Math.PI}
              max={kind === 'position' ? 0.3 : Math.PI}
              step={0.005}
              value={(kind === 'position' ? position : rotation)[axis] ?? 0}
              onChange={(e) => set(kind, axis, Number(e.target.value))}
            />
            <output>
              {((kind === 'position' ? position : rotation)[axis] ?? 0).toFixed(
                3,
              )}
            </output>
          </label>
        )),
      )}
      <button
        type="button"
        className="button"
        onClick={() =>
          setText(
            JSON.stringify({
              slot,
              position: position.map((n) => Number(n.toFixed(3))),
              rotation: rotation.map((n) => Number(n.toFixed(3))),
            }),
          )
        }
      >
        Export config
      </button>
      {text ? (
        <textarea
          readOnly
          value={text}
          rows={3}
          onFocus={(e) => e.currentTarget.select()}
        />
      ) : null}
    </details>
  );
}
