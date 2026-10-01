'use client';

import { useEffect, useState } from 'react';
import type { ViewerSession } from '../renderer/viewer-session';

/** DEVELOPMENT ONLY (the parent renders it only in non-production builds): FPS, draw calls, memory. */
export function DevStatsOverlay({
  getSession,
}: {
  getSession: () => ViewerSession | null;
}) {
  const [stats, setStats] = useState<ViewerSession['stats'] | null>(null);
  useEffect(() => {
    const id = setInterval(() => setStats(getSession()?.stats ?? null), 500);
    return () => clearInterval(id);
  }, [getSession]);
  const s = stats as Record<string, unknown> | null;
  if (!s) return null;
  const cache = s.cache as { entries: number; inUse: number; bytes: number };
  return (
    <dl className="dev-overlay" aria-label="Development statistics">
      <div>
        <dt>FPS</dt>
        <dd>{String(s.fps)}</dd>
      </div>
      <div>
        <dt>Frame</dt>
        <dd>{String(s.frameMs)} ms</dd>
      </div>
      <div>
        <dt>Draw calls</dt>
        <dd>{String(s.drawCalls)}</dd>
      </div>
      <div>
        <dt>Triangles</dt>
        <dd>{String(s.triangles)}</dd>
      </div>
      <div>
        <dt>Geometries</dt>
        <dd>{String(s.geometries)}</dd>
      </div>
      <div>
        <dt>Textures</dt>
        <dd>{String(s.textures)}</dd>
      </div>
      <div>
        <dt>Materials</dt>
        <dd>{String(s.materials)}</dd>
      </div>
      <div>
        <dt>Pixel ratio</dt>
        <dd>{String(s.pixelRatio)}</dd>
      </div>
      <div>
        <dt>Assets cached</dt>
        <dd>
          {cache.entries} ({(cache.bytes / 1024).toFixed(0)} KB, {cache.inUse}{' '}
          in use)
        </dd>
      </div>
    </dl>
  );
}
