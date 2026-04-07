import { Module, Global } from '@nestjs/common';
import { GeoService } from './geo.service';

/**
 * GeoModule — 全域地理編碼模組
 * 標記為 @Global 讓所有模組都能注入 GeoService
 */
@Global()
@Module({
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
