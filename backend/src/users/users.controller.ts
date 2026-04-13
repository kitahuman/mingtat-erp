import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Request,
  ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('users')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private usersService: UsersService) {}

  /**
   * GET /api/users
   * List all users (Admin and Manager can read)
   * Manager needs this to populate user dropdowns in work-logs and other pages.
   */
  @Get()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findAll(
    @Query() query: { role?: string; department?: string; isActive?: string; search?: string },
  ) {
    return this.usersService.findAll(query);
  }

  /**
   * GET /api/users/:id
   * Get a single user by ID (Admin and Manager can read)
   */
  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  /**
   * POST /api/users
   * Create a new user (Admin only)
   */
  @Post()
  create(@Body() dto: CreateUserDto, @Request() req: any) {
    return this.usersService.create(dto, req.user.sub);
  }

  /**
   * PUT /api/users/:id
   * Update a user (Admin only)
   */
  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  /**
   * PATCH /api/users/:id/toggle-active
   * Toggle user active status (Admin only)
   */
  @Patch(':id/toggle-active')
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.toggleActive(id);
  }
}
