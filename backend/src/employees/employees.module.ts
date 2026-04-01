import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';

@Module({
  imports: [PrismaModule],
  providers: [EmployeesService],
  controllers: [EmployeesController],
  exports: [EmployeesService],
})
export class EmployeesModule {}
