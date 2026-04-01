import { Controller, Get, Post, Put, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ExpenseCategoriesService } from './expense-categories.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('expense-categories')
@UseGuards(AuthGuard('jwt'))
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('tree')
  findTree() {
    return this.service.findTree();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: { name: string; parent_id?: number }) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: { name?: string; is_active?: boolean; sort_order?: number }) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('reorder')
  reorder(@Body() body: { parent_id: number | null; orderedIds: number[] }) {
    return this.service.reorder(body.parent_id, body.orderedIds);
  }
}
