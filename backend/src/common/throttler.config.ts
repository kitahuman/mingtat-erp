/**
 * Global rate-limiting defaults.
 * These apply to every route unless overridden with @SkipThrottle() or @Throttle().
 *
 * - default: 60 requests per 60 seconds (general API)
 */
export const throttlerConfig = [
  {
    name: 'default',
    ttl: 60_000,   // 60 seconds window
    limit: 60,     // max 60 requests per window
  },
];
