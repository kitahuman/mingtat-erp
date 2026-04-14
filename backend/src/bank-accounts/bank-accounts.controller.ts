import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/create-bank-account.dto';

@Controller('bank-accounts')
@UseGuards(AuthGuard('jwt'))
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('simple')
  simple() {
    return this.service.simple();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Post()
  create(@Body() body: CreateBankAccountDto) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateBankAccountDto) {
    return this.service.update(+id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
