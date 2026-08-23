import { SetMetadata } from '@nestjs/common';

export const PUBLIC_KEY = 'ffms:public';

/**
 * Marks a controller or handler as reachable without a bearer token, exempting it from the
 * global {@link AuthenticatedGuard}.
 *
 * Every use is a deliberate decision to expose an endpoint to the internet — the default is
 * authenticated. Applies to exactly three kinds of route:
 *  - pre-session auth endpoints (`/auth/*`), which mint the token in the first place;
 *  - infrastructure endpoints with no user concept (`/health`, `/calendar/convert`);
 *  - endpoints that authenticate by a *non-user* credential and carry their own guard
 *    (`/devices/{deviceId}/readings`, via `DeviceKeyGuard`).
 */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
