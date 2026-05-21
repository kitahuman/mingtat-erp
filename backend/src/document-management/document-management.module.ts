import { Module } from '@nestjs/common';
import { DocumentManagementController } from './document-management.controller';
import { DocumentManagementService } from './document-management.service';

@Module({
  controllers: [DocumentManagementController],
  providers: [DocumentManagementService],
})
export class DocumentManagementModule {}
