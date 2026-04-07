import { Injectable, Logger } from '@nestjs/common';

interface ReverseGeocodeResult {
  address: string | null;
  displayName: string | null;
  raw?: any;
}

/**
 * GeoService — 封裝地理編碼服務
 * 目前使用 OpenStreetMap Nominatim API（免費，無需 API key）
 * 設計為獨立服務層，方便之後切換到 Google Maps API
 *
 * 注意事項：
 * - Nominatim 使用限制：每秒最多 1 次請求
 * - 內建簡易 cache 避免重複查詢
 * - 反查失敗不應阻擋打卡流程（graceful fallback）
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  // Simple in-memory cache: key = "lat,lng" (rounded to 4 decimals), value = address
  private cache = new Map<string, string>();
  private readonly CACHE_MAX_SIZE = 1000;

  // Rate limiting: track last request time
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 1100; // slightly over 1 second

  /**
   * Reverse geocode: convert latitude/longitude to a human-readable address
   * Returns null if geocoding fails (caller should handle gracefully)
   */
  async reverseGeocode(
    latitude: number,
    longitude: number,
  ): Promise<ReverseGeocodeResult> {
    try {
      // Round to 4 decimal places for cache key (~11m precision)
      const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;

      // Check cache first
      const cached = this.cache.get(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for ${cacheKey}`);
        return { address: cached, displayName: cached };
      }

      // Rate limiting: wait if needed
      await this.waitForRateLimit();

      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1&accept-language=zh-TW,zh,en`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'MingtatERP/1.0 (attendance-system)',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        this.logger.warn(`Nominatim returned ${response.status}`);
        return { address: null, displayName: null };
      }

      const data = await response.json();

      if (data.error) {
        this.logger.warn(`Nominatim error: ${data.error}`);
        return { address: null, displayName: null };
      }

      // Build a concise Chinese address from the address components
      const address = this.buildAddress(data);
      const displayName = data.display_name || null;

      // Store in cache
      if (address) {
        if (this.cache.size >= this.CACHE_MAX_SIZE) {
          // Evict oldest entries (first 100)
          const keys = Array.from(this.cache.keys()).slice(0, 100);
          keys.forEach((k) => this.cache.delete(k));
        }
        this.cache.set(cacheKey, address);
      }

      return { address, displayName, raw: data };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        this.logger.warn('Nominatim request timed out');
      } else {
        this.logger.warn(`Reverse geocode failed: ${error.message}`);
      }
      return { address: null, displayName: null };
    }
  }

  /**
   * Build a concise address string from Nominatim response
   * Prioritizes Chinese address components
   */
  private buildAddress(data: any): string | null {
    if (!data) return null;

    const addr = data.address;
    if (!addr) return data.display_name || null;

    // Build address from components (Hong Kong / Taiwan / China style)
    const parts: string[] = [];

    // Country / State / City level
    if (addr.country && addr.country !== addr.state) {
      // Skip country for brevity if we have more specific info
    }
    if (addr.state) parts.push(addr.state);
    if (addr.city && addr.city !== addr.state) parts.push(addr.city);
    if (addr.county && addr.county !== addr.city) parts.push(addr.county);
    if (addr.suburb) parts.push(addr.suburb);
    if (addr.neighbourhood) parts.push(addr.neighbourhood);
    if (addr.road) parts.push(addr.road);
    if (addr.house_number) parts.push(addr.house_number);

    // If we have building/amenity info, prepend it
    const poi = addr.building || addr.amenity || addr.shop || addr.office || '';

    let result = parts.join('');
    if (poi && !result.includes(poi)) {
      result = result ? `${result} (${poi})` : poi;
    }

    // Fallback to display_name if our build is empty
    return result || data.display_name || null;
  }

  /**
   * Rate limiter: ensures minimum interval between Nominatim requests
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      const waitTime = this.MIN_INTERVAL_MS - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }
}
