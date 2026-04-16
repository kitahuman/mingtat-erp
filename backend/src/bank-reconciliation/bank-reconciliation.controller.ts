import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BankReconciliationService } from './bank-reconciliation.service';

@Controller('bank-reconciliation')
@UseGuards(AuthGuard('jwt'))
export class BankReconciliationController {
  constructor(private readonly service: BankReconciliationService) {}

  @Get('transactions')
  findTransactions(
    @Query('bank_account_id') bank_account_id: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
    @Query('match_status') match_status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.findTransactions({
      bank_account_id: +bank_account_id,
      date_from,
      date_to,
      match_status,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Post('import/:bankAccountId')
  importTransactions(
    @Param('bankAccountId') bankAccountId: string,
    @Body('rows') rows: any[],
  ) {
    return this.service.importTransactions(+bankAccountId, rows);
  }

  @Get('summary/:bankAccountId')
  getSummary(
    @Param('bankAccountId') bankAccountId: string,
    @Query('date_from') date_from?: string,
    @Query('date_to') date_to?: string,
  ) {
    return this.service.getSummary(+bankAccountId, date_from, date_to);
  }

  @Get('candidates/:txId')
  findCandidates(@Param('txId') txId: string) {
    return this.service.findMatchCandidates(+txId);
  }

  @Post('auto-match/:bankAccountId')
  autoMatchAll(@Param('bankAccountId') bankAccountId: string) {
    return this.service.autoMatchAll(+bankAccountId);
  }

  @Post('match/:txId')
  match(
    @Param('txId') txId: string,
    @Body('type') type: 'payment_in' | 'payment_out',
    @Body('matchedId') matchedId: number,
  ) {
    return this.service.applyMatch(+txId, type, matchedId);
  }

  @Post('unmatch/:txId')
  unmatch(@Param('txId') txId: string) {
    return this.service.unmatch(+txId);
  }

  @Post('exclude/:txId')
  exclude(@Param('txId') txId: string, @Body('remarks') remarks?: string) {
    return this.service.exclude(+txId, remarks);
  }
}
