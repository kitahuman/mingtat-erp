import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';
import { UserRole } from './user-role.enum';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles are specified, allow access (only JWT auth needed)
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    // Direct role match
    if (requiredRoles.includes(user.role)) {
      return true;
    }

    // DIRECTOR inherits ADMIN page-access for read operations,
    // but the actual write restriction is handled by DirectorReadOnlyGuard.
    // Here we grant DIRECTOR access to any endpoint that requires ADMIN or MANAGER,
    // EXCEPT for whatsapp-console which is admin-only.
    if (user.role === UserRole.DIRECTOR) {
      // Block whatsapp-console endpoints for director
      const request = context.switchToHttp().getRequest();
      const path = request.route?.path || request.url || '';
      if (path.includes('whatsapp-console')) {
        return false;
      }

      const hasAdminOrManager = requiredRoles.some(
        r => r === UserRole.ADMIN || r === UserRole.MANAGER,
      );
      return hasAdminOrManager;
    }

    return false;
  }
}
