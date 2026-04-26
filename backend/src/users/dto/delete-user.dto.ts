import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Optional query/body parameters for DELETE /api/users/:id.
 *
 * `confirm`: when the target user has historical references the frontend
 * must explicitly set `confirm=true` to acknowledge the warning. Without
 * confirmation the API rejects the delete with HTTP 409.
 */
export class DeleteUserDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true' || value === '1';
    return undefined;
  })
  confirm?: boolean;
}

/** Response payload of DELETE /api/users/:id */
export class DeleteUserResponseDto {
  success!: boolean;
  user_id!: number;
  username!: string;
  /** Number of historical rows whose user reference was nulled before delete. */
  detached!: number;
  /** Detail of detach actions, by table name. */
  detached_by_table!: Record<string, number>;
}
