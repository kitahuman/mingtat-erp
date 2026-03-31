import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldOption } from './field-option.entity';
import { FieldOptionsService } from './field-options.service';
import { FieldOptionsController } from './field-options.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FieldOption])],
  providers: [FieldOptionsService],
  controllers: [FieldOptionsController],
  exports: [FieldOptionsService],
})
export class FieldOptionsModule implements OnModuleInit {
  constructor(private readonly service: FieldOptionsService) {}

  async onModuleInit() {
    await this.service.seedDefaults();
  }
}
