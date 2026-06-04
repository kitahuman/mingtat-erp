import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DocumentFoldersController } from './document-folders.controller';
import { DocumentFoldersService } from './document-folders.service';

@Module({
  imports: [PrismaModule],
  controllers: [DocumentFoldersController],
  providers: [DocumentFoldersService],
  exports: [DocumentFoldersService],
})
export class DocumentFoldersModule {}
