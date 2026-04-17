import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from './user-role.enum';
import { DIRECTOR_WRITABLE_KEY } from './director-writable.decorator';

/**
 * DirectorReadOnlyGuard
 *
 * Enforces read-only access for DIRECTOR role:
 * - GET / HEAD / OPTIONS requests are always allowed
 * - POST / PUT / PATCH / DELETE are blocked unless the endpoint is explicitly
 *   marked with @DirectorWritable()
 *
 * This guard should be applied globally (APP_GUARD) so it covers all endpoints.
 * It only affects users with role === 'director'; all other roles pass through.
 */
@Injectable()
export class DirectorReadOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Only restrict director role
    if (!user || user.role !== UserRole.DIRECTOR) {
      return true;
    }

    const method = request.method?.toUpperCase();

    // Read-only methods are always allowed
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // Check if endpoint is explicitly marked as writable for director
    const isWritable = this.reflector.getAllAndOverride<boolean>(DIRECTOR_WRITABLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isWritable) {
      return true;
    }

    throw new ForbiddenException('董事角色僅有唯讀權限，無法執行此操作');
  }
}
