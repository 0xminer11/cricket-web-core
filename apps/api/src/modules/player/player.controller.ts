import type { FastifyRequest } from 'fastify';
import { ValidationError } from '@the-cricketer/server-kit';
import type { ApiResponse } from '@the-cricketer/shared-types';
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_KEY_PATTERN,
  createPlayerRequestSchema,
  creationEventSchema,
  equipItemRequestSchema,
  updateAppearanceRequestSchema,
  viewerEventSchema,
} from '@the-cricketer/shared-types';
import { AuthRequiredError } from '../auth/auth.errors';
import { buildCreationOptions } from './creation-options';
import type { PlayerCreationService } from './player-creation.service';
import type { EquipmentService } from './equipment.service';
import type { PlayerTelemetry } from './player.events';
import type { PlayerReadModel } from './player.read-model';

const ok = <T>(data: T): ApiResponse<T> => ({ success: true, data });

/** HTTP adapter only: parse, call the service, wrap the envelope. No rules here. */
export class PlayerController {
  private readonly options = buildCreationOptions();

  constructor(
    private readonly creation: PlayerCreationService,
    private readonly readModel: PlayerReadModel,
    private readonly telemetry: PlayerTelemetry,
    private readonly equipment: EquipmentService,
  ) {}

  private scope(request: FastifyRequest) {
    if (!request.player) throw new AuthRequiredError();
    return request.player;
  }

  private user(request: FastifyRequest) {
    if (!request.auth) throw new AuthRequiredError();
    return request.auth;
  }

  creationOptions = async () => ok({ options: this.options });

  create = async (
    request: FastifyRequest,
    reply: { status(code: number): unknown },
  ) => {
    const auth = this.user(request);
    const parsed = createPlayerRequestSchema.safeParse(request.body);
    // Unknown or mistyped fields (e.g. a smuggled `power`, `coins` or `userId`) are rejected.
    if (!parsed.success) throw new ValidationError();
    const header = request.headers[IDEMPOTENCY_KEY_HEADER];
    const key = typeof header === 'string' ? header : null;
    if (
      header !== undefined &&
      (key === null || !IDEMPOTENCY_KEY_PATTERN.test(key))
    )
      throw new ValidationError();
    const outcome = await this.creation.create(
      {
        userId: auth.userId,
        accountType: auth.accountType,
        requestId: request.id,
        log: request.log,
      },
      parsed.data,
      key,
    );
    reply.status(outcome.created ? 201 : 200);
    return ok(outcome);
  };

  me = async (request: FastifyRequest) => {
    if (!request.player) throw new AuthRequiredError();
    return ok({
      player: await this.readModel.profile(request.player.playerId),
    });
  };

  /** Best-effort funnel analytics. Always 200; invalid events are ignored, never trusted. */
  event = async (request: FastifyRequest) => {
    const auth = this.user(request);
    const parsed = creationEventSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError();
    const e = parsed.data;
    if (e.event === 'started')
      this.telemetry.track('cricketer_creation_started', {
        userId: auth.userId,
      });
    else if (e.event === 'step_completed')
      this.telemetry.track('cricketer_creation_step_completed', {
        userId: auth.userId,
        step: e.step,
      });
    else
      this.telemetry.track('cricketer_creation_role_selected', {
        userId: auth.userId,
        role: e.role,
      });
    return ok({});
  };

  // ---- Module 5 ------------------------------------------------------------------------------
  inventory = async (request: FastifyRequest) =>
    ok({ items: await this.equipment.inventory(this.scope(request)) });

  equipmentList = async (request: FastifyRequest) =>
    ok({ equipment: await this.equipment.equipment(this.scope(request)) });

  equip = async (request: FastifyRequest) => {
    const scope = this.scope(request);
    const params = request.params as { slot?: unknown };
    const parsed = equipItemRequestSchema.safeParse(request.body);
    if (!parsed.success || typeof params.slot !== 'string')
      throw new ValidationError();
    return ok(
      await this.equipment.equip(
        scope,
        params.slot,
        parsed.data.inventoryItemId,
      ),
    );
  };

  appearance = async (request: FastifyRequest) =>
    ok({ appearance: await this.equipment.appearance(this.scope(request)) });

  updateAppearance = async (request: FastifyRequest) => {
    const scope = this.scope(request);
    const parsed = updateAppearanceRequestSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError();
    return ok({
      appearance: await this.equipment.updateAppearance(scope, parsed.data),
    });
  };

  /** Coarse viewer telemetry (opened/loaded/failed/previewed). Best effort, validated, no PII. */
  viewerEvent = async (request: FastifyRequest) => {
    const auth = this.user(request);
    const parsed = viewerEventSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError();
    const e = parsed.data;
    const userId = auth.userId;
    if (e.event === 'viewer_opened')
      this.telemetry.track('viewer_opened', {
        userId,
        ...(e.quality ? { quality: e.quality } : {}),
      });
    else if (e.event === 'viewer_loaded')
      this.telemetry.track('viewer_loaded', {
        userId,
        durationMs: e.durationMs,
        ...(e.bytes !== undefined ? { bytes: e.bytes } : {}),
      });
    else if (e.event === 'viewer_load_failed')
      this.telemetry.track('viewer_load_failed', { userId, reason: e.reason });
    else this.telemetry.track('equipment_previewed', { userId, slot: e.slot });
    return ok({});
  };
}
