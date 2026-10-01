/** JSON-domain copy, without requiring browser or Node ambient types. */
export function clone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => clone(v)) as T;
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, clone(v)]),
    ) as T;
  return value;
}

/** PostgreSQL JSONB reorders object keys; equality must not depend on insertion order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return '[' + value.map(canonicalJson).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonicalJson(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
