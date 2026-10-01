import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthEnvironment } from '@the-cricketer/config';

type CookieConfig = AuthEnvironment['cookie'];

/**
 * The one place that knows how the session cookie looks. Set and clear share the same
 * attributes: browsers only delete a cookie when path/domain/secure match the original.
 *
 *  - HttpOnly: page scripts (and so XSS) can never read the token.
 *  - Secure: HTTPS only (required in staging/production by config validation).
 *  - SameSite=Lax by default: the cookie is not sent on cross-site POSTs; Origin validation
 *    (auth.middleware.ts) is the second CSRF layer.
 *  - Path=/ and no Domain: host-only, which also qualifies for the `__Host-` prefix.
 */
export class SessionCookie {
  constructor(private readonly config: CookieConfig) {}

  get name(): string {
    return this.config.name;
  }

  private attributes() {
    return {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: this.config.sameSite,
      path: '/',
      ...('domain' in this.config && this.config.domain
        ? { domain: this.config.domain }
        : {}),
    } as const;
  }

  read(request: FastifyRequest): string | undefined {
    return request.cookies[this.config.name];
  }
  set(reply: FastifyReply, token: string, maxAgeSeconds: number): void {
    void reply.setCookie(this.config.name, token, {
      ...this.attributes(),
      maxAge: maxAgeSeconds,
    });
  }
  clear(reply: FastifyReply): void {
    void reply.clearCookie(this.config.name, this.attributes());
  }
}
