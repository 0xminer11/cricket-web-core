export interface Vec3 {
  readonly u: number;
  readonly v: number;
  readonly z: number;
}
export const vec = (u: number, v: number, z: number): Vec3 => ({ u, v, z });
export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;
export const clamp = (n: number, min = 0, max = 1): number =>
  Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min;
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  u: lerp(a.u, b.u, t),
  v: lerp(a.v, b.v, t),
  z: lerp(a.z, b.z, t),
});
export const add3 = (a: Vec3, b: Vec3): Vec3 => ({
  u: a.u + b.u,
  v: a.v + b.v,
  z: a.z + b.z,
});
export const smoothstep = (t: number): number => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const easeOut = (t: number): number => 1 - (1 - clamp(t)) ** 3;
export const easeInOut = (t: number): number => smoothstep(t);
