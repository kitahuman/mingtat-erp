import { SetMetadata } from '@nestjs/common';
import { UserRole } from './user.entity';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify the minimum roles allowed to access an endpoint.
 * Usage: @Roles(UserRole.ADMIN, UserRole.MANAGER)
 */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
