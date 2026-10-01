/**
 * Reference-counted LRU cache for parsed assets. Re-entering the viewer (or switching items back
 * and forth) never re-downloads a file that is still cached, and the cache is bounded: entries
 * nobody is using are evicted (and disposed) oldest-first once the entry or byte budget is exceeded.
 * In-flight loads are shared, so ten requests for one GLB cause one download.
 */
export interface AssetCacheOptions<T> {
  readonly maxEntries: number;
  readonly maxBytes: number;
  /** Free GPU/CPU resources held by an evicted value (geometries, textures...). */
  readonly dispose: (value: T) => void;
}
interface Entry<T> {
  value: T;
  bytes: number;
  refs: number;
  lastUsed: number;
}

export class AssetCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  private tick = 0;

  constructor(private readonly options: AssetCacheOptions<T>) {}

  /** Get (loading if needed) and take a reference. Pair every successful call with `release`. */
  async acquire(
    key: string,
    load: () => Promise<{ value: T; bytes: number }>,
  ): Promise<T> {
    const hit = this.entries.get(key);
    if (hit) {
      hit.refs += 1;
      hit.lastUsed = ++this.tick;
      return hit.value;
    }
    let pending = this.inflight.get(key);
    if (!pending) {
      pending = load().then(({ value, bytes }) => {
        this.entries.set(key, { value, bytes, refs: 0, lastUsed: ++this.tick });
        return value;
      });
      this.inflight.set(key, pending);
      const clear = () => this.inflight.delete(key);
      pending.then(clear, clear);
    }
    const value = await pending;
    const entry = this.entries.get(key);
    if (entry) {
      entry.refs += 1;
      entry.lastUsed = ++this.tick;
    }
    this.evict();
    return value;
  }

  release(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    entry.refs = Math.max(0, entry.refs - 1);
    this.evict();
  }

  private evict(): void {
    const over = () =>
      this.entries.size > this.options.maxEntries ||
      this.totalBytes() > this.options.maxBytes;
    while (over()) {
      let victim: [string, Entry<T>] | undefined;
      for (const candidate of this.entries) {
        if (candidate[1].refs > 0) continue;
        if (!victim || candidate[1].lastUsed < victim[1].lastUsed)
          victim = candidate;
      }
      if (!victim) return; // everything is in use; never evict a live asset
      this.options.dispose(victim[1].value);
      this.entries.delete(victim[0]);
    }
  }

  private totalBytes(): number {
    let total = 0;
    for (const e of this.entries.values()) total += e.bytes;
    return total;
  }

  stats() {
    let inUse = 0;
    for (const e of this.entries.values()) if (e.refs > 0) inUse += 1;
    return {
      entries: this.entries.size,
      inUse,
      bytes: this.totalBytes(),
      loading: this.inflight.size,
    };
  }

  /** Dispose everything not in use (route teardown / low-memory response). */
  trim(): void {
    for (const [key, entry] of [...this.entries]) {
      if (entry.refs > 0) continue;
      this.options.dispose(entry.value);
      this.entries.delete(key);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }
}
