/**
 * Verification and reset links carry their secret in the URL fragment (`#token=...`). Fragments
 * are never sent to servers, proxies or access logs. Read it once, then scrub it from the
 * address bar and history so it cannot leak through screenshots, referrers or shared URLs.
 */
export function takeTokenFromLocation(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const token = params.get('token');
  if (token)
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search,
    );
  return token;
}
