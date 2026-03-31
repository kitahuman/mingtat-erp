import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Quotation } from './quotation.entity';
import { QuotationItem } from './quotation-item.entity';
import { QuotationSequence } from './quotation-sequence.entity';
import { Company } from '../companies/company.entity';
import { Partner } from '../partners/partner.entity';
import { Project } from '../projects/project.entity';
import { ProjectSequence } from '../projects/project-sequence.entity';
import { RateCard } from '../rate-cards/rate-card.entity';
import { FleetRateCard } from '../fleet-rate-cards/fleet-rate-card.entity';
import { SubconRateCard } from '../subcon-rate-cards/subcon-rate-card.entity';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quotation, QuotationItem, QuotationSequence,
      Company, Partner,
      Project, ProjectSequence,
      RateCard, FleetRateCard, SubconRateCard,
    ]),
  ],
  providers: [QuotationsService],
  controllers: [QuotationsController],
  exports: [QuotationsService],
})
export class QuotationsModule {}
