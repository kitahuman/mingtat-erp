import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
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
import { DeleteUserDto } from './dto/delete-user.dto';

interface AuthenticatedRequest {
  user: { sub: number; username: string; role: string };
}

interface UsersListQuery {
  role?: string;
  department?: string;
  isActive?: string;
  search?: string;
}

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
  findAll(@Query() query: UsersListQuery) {
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
   * GET /api/users/:id/check-delete
   * Inspect how many historical records reference this user before
   * the admin confirms the delete. Returns row counts grouped by source.
   */
  @Get(':id/check-delete')
  checkDelete(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.checkDelete(id);
  }

  /**
   * POST /api/users
   * Create a new user (Admin only)
   */
  @Post()
  create(
    @Body() dto: CreateUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.create(dto, req.user.sub);
  }

  /**
   * PUT /api/users/:id
   * Update a user (Admin only). When `phone` changes the response payload
   * may include `employee_phone_pending_sync` to inform the UI that a
   * linked employee phone could optionally be synced.
   */
  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
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

  /**
   * DELETE /api/users/:id
   * Hard-delete a user. If the user has any historical references the
   * caller MUST set `confirm=true` (query string) — otherwise the API
   * responds 409 Conflict so the UI can render the warning dialog.
   */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: DeleteUserDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.usersService.remove(id, req.user.sub, query.confirm === true);
  }
}
