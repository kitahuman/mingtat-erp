import { SetMetadata } from '@nestjs/common';

export const DIRECTOR_WRITABLE_KEY = 'director_writable';

/**
 * Decorator to mark an endpoint as writable for the DIRECTOR role.
 * By default, DIRECTOR is read-only (GET only). Use this decorator
 * to selectively allow POST/PUT/PATCH/DELETE for specific endpoints.
 *
 * Usage: @DirectorWritable()
 *
 * This provides extensibility — when you need to grant a director
 * write access to a specific endpoint, simply add this decorator.
 */
export const DirectorWritable = () => SetMetadata(DIRECTOR_WRITABLE_KEY, true);
