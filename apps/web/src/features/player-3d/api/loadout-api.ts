import type { z } from 'zod';
import {
  appearanceEnvelopeSchema,
  equipResultSchema,
  equipmentEnvelopeSchema,
  inventoryEnvelopeSchema,
  messageSchema,
} from '@the-cricketer/shared-types';
import type {
  EquipmentEntry,
  InventoryItemDto,
  UpdateAppearanceRequest,
  ViewerEvent,
} from '@the-cricketer/shared-types';
import { ApiClientError, request } from '../../../services/api';

/**
 * Inventory, equipment and appearance calls. The viewer never changes authoritative state: it asks
 * the server and then renders whatever the server answers (equipment, appearance).
 */
export interface LoadoutApi {
  getInventory(): Promise<InventoryItemDto[]>;
  getEquipment(): Promise<EquipmentEntry[]>;
  equip(slot: string, inventoryItemId: string): Promise<EquipmentEntry>;
  getAppearance(): Promise<
    z.infer<typeof appearanceEnvelopeSchema>['appearance']
  >;
  updateAppearance(
    patch: UpdateAppearanceRequest,
  ): Promise<z.infer<typeof appearanceEnvelopeSchema>['appearance']>;
  /** Best-effort coarse telemetry; never throws. */
  track(event: ViewerEvent): void;
  /** Development only: grants sample gear so the dressing room has alternatives. */
  grantSampleGear(): Promise<void>;
}

export function createLoadoutApi(
  baseUrl: string | undefined,
  fetcher: typeof fetch = (...args) => fetch(...args),
): LoadoutApi {
  const send = <T extends z.ZodType>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    schema: T,
    body?: unknown,
  ): Promise<z.infer<T>> => {
    if (!baseUrl)
      return Promise.reject(
        new ApiClientError(
          'The API address is not configured',
          'CONFIGURATION_ERROR',
        ),
      );
    return request(baseUrl, `/api/v1${path}`, schema, fetcher, {
      method,
      credentials: 'include',
      ...(method !== 'GET' ? { body: body ?? {} } : {}),
    });
  };
  return {
    async getInventory() {
      return (await send('GET', '/player/inventory', inventoryEnvelopeSchema))
        .items;
    },
    async getEquipment() {
      return (await send('GET', '/player/equipment', equipmentEnvelopeSchema))
        .equipment;
    },
    equip(slot, inventoryItemId) {
      return send(
        'PUT',
        `/player/equipment/${encodeURIComponent(slot)}`,
        equipResultSchema,
        { inventoryItemId },
      );
    },
    async getAppearance() {
      return (await send('GET', '/player/appearance', appearanceEnvelopeSchema))
        .appearance;
    },
    async updateAppearance(patch) {
      return (
        await send(
          'PATCH',
          '/player/appearance',
          appearanceEnvelopeSchema,
          patch,
        )
      ).appearance;
    },
    track(event) {
      void send(
        'POST',
        '/player/viewer/events',
        messageSchema.partial(),
        event,
      ).catch(() => undefined);
    },
    async grantSampleGear() {
      await send(
        'POST',
        '/dev/player/grant-sample-gear',
        messageSchema.partial(),
      );
    },
  };
}

export const loadoutApi: LoadoutApi = createLoadoutApi(
  process.env.NEXT_PUBLIC_API_URL,
);
