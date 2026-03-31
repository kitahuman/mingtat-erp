import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationSequence } from './quotation-sequence.entity';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Quotation, QuotationItem, QuotationSequence, Company, Partner]),
  ],
  providers: [QuotationsService],
  controllers: [QuotationsController],
  exports: [QuotationsService],
})
export class QuotationsModule {}
