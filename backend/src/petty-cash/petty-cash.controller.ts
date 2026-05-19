import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PettyCashService } from './petty-cash.service';
import { PettyCashAdjustDto, PettyCashQueryDto, PettyCashTopupDto } from './dto/petty-cash.dto';

@Controller('petty-cash')
@UseGuards(AuthGuard('jwt'))
export class PettyCashController {
  constructor(private readonly service: PettyCashService) {}

  @Get('payroll/:payrollId')
  getPayrollSettlement(@Param('payrollId', ParseIntPipe) payrollId: number) {
    return this.service.getPayrollSettlement(payrollId);
  }

  @Get(':employeeId')
  getRecords(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Query() query: PettyCashQueryDto,
  ) {
    return this.service.getRecords(employeeId, query);
  }

  @Get(':employeeId/balance')
  getBalance(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.service.getBalance(employeeId);
  }

  @Post('topup')
  topup(@Body() dto: PettyCashTopupDto) {
    return this.service.topup(dto);
  }

  @Post('adjust')
  adjust(@Body() dto: PettyCashAdjustDto) {
    return this.service.adjust(dto);
  }
}
