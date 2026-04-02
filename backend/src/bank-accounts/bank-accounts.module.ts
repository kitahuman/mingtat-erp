import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';

@Module({
  imports: [PrismaModule],
  providers: [BankAccountsService],
  controllers: [BankAccountsController],
  exports: [BankAccountsService],
})
export class BankAccountsModule {}
