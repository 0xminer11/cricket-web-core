import type { FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { ValidationError } from '@the-cricketer/server-kit';
import type { ApiResponse } from '@the-cricketer/shared-types';
import {
  changePasswordRequestSchema,
  emptyRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  PASSWORD_MAX_LENGTH,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from '@the-cricketer/shared-types';
import type { SessionCookie } from './auth.cookies';
import {
  AuthRequiredError,
  InvalidCredentialsError,
  InvalidEmailError,
  WeakPasswordError,
} from './auth.errors';
import type { AuthService, AuthResult } from './auth.service';
import type { AuthContext, RequestMeta } from './auth.types';

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });

/**
 * HTTP adapter only: parse input, call the service, translate the outcome into cookies and the
 * response envelope. No business rules here.
 */
export class AuthController {
  private readonly register_;
  private readonly reset_;
  private readonly change_;

  constructor(
    private readonly service: AuthService,
    private readonly cookie: SessionCookie,
    private readonly passwordMinLength: number,
  ) {
    this.register_ = registerRequestSchema(passwordMinLength);
    this.reset_ = resetPasswordRequestSchema(passwordMinLength);
    this.change_ = changePasswordRequestSchema(passwordMinLength);
  }

  private meta(request: FastifyRequest): RequestMeta {
    return {
      requestId: request.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      log: request.log,
    };
  }

  /** Validate a body. Field-level failures become stable codes; nothing else is echoed back. */
  private parse<T extends z.ZodType>(
    schema: T,
    body: unknown,
    mode: 'default' | 'login' = 'default',
  ): z.infer<T> {
    const result = schema.safeParse(body ?? {});
    if (result.success) return result.data;
    const issue = result.error.issues[0];
    const field = issue?.path[0];
    if (mode === 'login' && (field === 'email' || field === 'password'))
      throw new InvalidCredentialsError();
    if (field === 'email') throw new InvalidEmailError();
    if (
      (field === 'password' || field === 'newPassword') &&
      (issue?.code === 'too_small' || issue?.code === 'too_big')
    )
      throw new WeakPasswordError(
        `Password must be ${this.passwordMinLength} to ${PASSWORD_MAX_LENGTH} characters.`,
      );
    throw new ValidationError();
  }

  private issue(reply: FastifyReply, result: AuthResult): void {
    if (result.session)
      this.cookie.set(
        reply,
        result.session.token,
        result.session.maxAgeSeconds,
      );
  }
  private static required(request: FastifyRequest): AuthContext {
    if (!request.auth) throw new AuthRequiredError();
    return request.auth;
  }

  guest = async (request: FastifyRequest, reply: FastifyReply) => {
    this.parse(emptyRequestSchema, request.body);
    const result = await this.service.createGuest(
      this.meta(request),
      request.auth,
    );
    this.issue(reply, result);
    void reply.status(result.session ? 201 : 200);
    return ok({ user: result.user });
  };

  register = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = this.parse(this.register_, request.body);
    const result = await this.service.register(
      this.meta(request),
      request.auth,
      input,
    );
    this.issue(reply, result);
    void reply.status(201);
    return ok({ user: result.user });
  };

  login = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = this.parse(loginRequestSchema, request.body, 'login');
    const result = await this.service.login(
      this.meta(request),
      request.auth,
      input,
    );
    this.issue(reply, result);
    return ok({ user: result.user });
  };

  logout = async (request: FastifyRequest, reply: FastifyReply) => {
    this.parse(emptyRequestSchema, request.body);
    await this.service.logout(this.meta(request), request.auth);
    this.cookie.clear(reply);
    return ok({ message: 'Signed out.' });
  };

  logoutAll = async (request: FastifyRequest, reply: FastifyReply) => {
    this.parse(emptyRequestSchema, request.body);
    const count = await this.service.logoutAll(
      this.meta(request),
      AuthController.required(request),
    );
    this.cookie.clear(reply);
    return ok({
      message: 'Signed out of all devices.',
      revokedSessions: count,
    });
  };

  me = async (request: FastifyRequest) => {
    const user = await this.service.currentUser(
      AuthController.required(request).userId,
    );
    return ok({ user });
  };

  sessions = async (request: FastifyRequest) =>
    ok({
      sessions: await this.service.listSessions(
        AuthController.required(request),
      ),
    });

  requestVerification = async (request: FastifyRequest) => {
    this.parse(emptyRequestSchema, request.body);
    await this.service.requestEmailVerification(
      this.meta(request),
      AuthController.required(request),
    );
    return ok({
      message: 'If your email still needs verifying, a link has been sent.',
    });
  };

  verifyEmail = async (request: FastifyRequest) => {
    const input = this.parse(verifyEmailRequestSchema, request.body);
    return ok(await this.service.verifyEmail(this.meta(request), input));
  };

  forgotPassword = async (request: FastifyRequest) => {
    const input = this.parse(forgotPasswordRequestSchema, request.body);
    return ok({
      message: await this.service.forgotPassword(this.meta(request), input),
    });
  };

  resetPassword = async (request: FastifyRequest) => {
    const input = this.parse(this.reset_, request.body);
    await this.service.resetPassword(this.meta(request), input);
    return ok({ message: 'Password updated. Sign in with your new password.' });
  };

  changePassword = async (request: FastifyRequest, reply: FastifyReply) => {
    const input = this.parse(this.change_, request.body);
    const result = await this.service.changePassword(
      this.meta(request),
      AuthController.required(request),
      input,
    );
    this.issue(reply, result);
    return ok({ user: result.user });
  };
}
