import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, User, Employee } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  UserDeleteCheckResponseDto,
  UserDeleteRelatedCounts,
} from './dto/delete-check.dto';
import { DeleteUserResponseDto } from './dto/delete-user.dto';

type UserWithEmployee = User & {
  employee?: Pick<
    Employee,
    'id' | 'name_zh' | 'name_en' | 'emp_code' | 'role' | 'company_id' | 'phone'
  > | null;
};

type SanitizedUser = Omit<UserWithEmployee, 'password'>;

export interface UpdateUserResult {
  user: SanitizedUser;
  /**
   * Filled when the request modified phone but the linked employee phone
   * was kept (sync_employee_phone === false). The frontend uses this to
   * surface a follow-up "do you also want to update employee phone?" prompt.
   * When sync_employee_phone === true, this is null because the sync was
   * already performed.
   */
  employee_phone_pending_sync: {
    employee_id: number;
    employee_name: string;
    old_phone: string | null;
    new_phone: string | null;
  } | null;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: {
    role?: string;
    department?: string;
    isActive?: string;
    search?: string;
  }): Promise<SanitizedUser[]> {
    const where: Prisma.UserWhereInput = {};

    if (query.role) where.role = query.role;
    if (query.department) where.department = query.department;
    if (query.isActive !== undefined && query.isActive !== '') {
      where.isActive = query.isActive === 'true';
    }
    if (query.search) {
      where.OR = [
        { username: { contains: query.search, mode: 'insensitive' } },
        { displayName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            emp_code: true,
            role: true,
            company_id: true,
            phone: true,
          },
        },
      },
    });

    // Sort by role priority first, then alphabetically by English name.
    // Priority: admin/superadmin (0) > manager (1) > clerk (2) > driver/worker (3) > others (4)
    const ROLE_PRIORITY: Record<string, number> = {
      superadmin: 0,
      admin: 0,
      director: 0,
      manager: 1,
      clerk: 2,
      driver: 3,
      worker: 3,
    };

    const getRolePriority = (role: string): number =>
      ROLE_PRIORITY[role] !== undefined ? ROLE_PRIORITY[role] : 4;

    const getSortName = (u: UserWithEmployee): string =>
      (u.employee?.name_en || u.displayName || '').toLowerCase();

    users.sort((a, b) => {
      const roleDiff = getRolePriority(a.role) - getRolePriority(b.role);
      if (roleDiff !== 0) return roleDiff;
      return getSortName(a).localeCompare(getSortName(b), 'en', {
        sensitivity: 'base',
      });
    });

    return users.map((u) => this.sanitizeUser(u));
  }

  async findOne(id: number): Promise<SanitizedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            emp_code: true,
            role: true,
            company_id: true,
            phone: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('用戶不存在');
    return this.sanitizeUser(user);
  }

  async create(dto: CreateUserDto, createdById: number): Promise<SanitizedUser> {
    const existing = await this.prisma.user.findUnique({
      where: { username: dto.username },
    });
    if (existing) {
      throw new ConflictException('用戶名已存在');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const saved = await this.prisma.user.create({
      data: {
        username: dto.username,
        password: hashedPassword,
        displayName: dto.displayName,
        role: dto.role,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        department: dto.department ?? null,
        isActive: dto.isActive !== undefined ? dto.isActive : true,
        user_can_company_clock: dto.user_can_company_clock ?? false,
        can_approve_mid_shift: dto.can_approve_mid_shift ?? false,
        can_daily_report: dto.can_daily_report ?? false,
        can_acceptance_report: dto.can_acceptance_report ?? false,
        createdBy: createdById,
      },
    });
    return this.sanitizeUser(saved);
  }

  /**
   * Update a user. Returns the updated user plus an optional follow-up
   * notification when the caller asked to keep the linked employee phone
   * unchanged (so the UI can offer to sync it in a separate step).
   */
  async update(id: number, dto: UpdateUserDto): Promise<UpdateUserResult> {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            phone: true,
          },
        },
      },
    });
    if (!existing) throw new NotFoundException('用戶不存在');

    // ── Username conflict check ──────────────────────────────────
    if (dto.username !== undefined && dto.username !== existing.username) {
      const trimmed = dto.username.trim();
      if (!trimmed) {
        throw new BadRequestException('用戶名不能為空');
      }
      const conflict = await this.prisma.user.findFirst({
        where: { username: trimmed, NOT: { id } },
      });
      if (conflict) {
        throw new ConflictException('用戶名已存在');
      }
    }

    const data: Prisma.UserUpdateInput = {};
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.username !== undefined) data.username = dto.username.trim();
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.email !== undefined) data.email = dto.email ?? null;
    if (dto.phone !== undefined) data.phone = dto.phone ?? null;
    if (dto.department !== undefined) data.department = dto.department ?? null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.employee_id !== undefined) {
      // Use unchecked-style relation update through the FK column
      (data as Prisma.UserUncheckedUpdateInput).employee_id =
        dto.employee_id ?? null;
    }
    if (dto.user_can_company_clock !== undefined)
      data.user_can_company_clock = dto.user_can_company_clock;
    if (dto.can_approve_mid_shift !== undefined)
      data.can_approve_mid_shift = dto.can_approve_mid_shift;
    if (dto.can_daily_report !== undefined)
      data.can_daily_report = dto.can_daily_report;
    if (dto.can_acceptance_report !== undefined)
      data.can_acceptance_report = dto.can_acceptance_report;
    if (dto.page_permissions !== undefined) {
      data.page_permissions =
        dto.page_permissions === null
          ? Prisma.DbNull
          : (dto.page_permissions as unknown as Prisma.InputJsonValue);
    }

    // ── Employee phone sync logic ────────────────────────────────
    const phoneChanged =
      dto.phone !== undefined && (dto.phone ?? null) !== (existing.phone ?? null);
    const linkedEmployee = existing.employee;
    let employeePhoneSyncDone = false;

    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data,
        include: {
          employee: {
            select: {
              id: true,
              name_zh: true,
              name_en: true,
              emp_code: true,
              role: true,
              company_id: true,
              phone: true,
            },
          },
        },
      });

      if (phoneChanged && linkedEmployee && dto.sync_employee_phone === true) {
        await tx.employee.update({
          where: { id: linkedEmployee.id },
          data: { phone: dto.phone ?? null },
        });
        employeePhoneSyncDone = true;
      }

      return u;
    });

    let employeePhonePendingSync: UpdateUserResult['employee_phone_pending_sync'] =
      null;
    if (
      phoneChanged &&
      linkedEmployee &&
      !employeePhoneSyncDone &&
      dto.sync_employee_phone !== true
    ) {
      // Only surface the "still need to sync?" hint when:
      //   - phone really changed, AND
      //   - an employee is linked, AND
      //   - the caller did NOT explicitly opt-in to sync (handled above)
      // We surface it both when the caller explicitly opted out (false)
      // and when the legacy update did not include the flag (undefined).
      const employeeName =
        linkedEmployee.name_zh ||
        linkedEmployee.name_en ||
        `Employee #${linkedEmployee.id}`;
      employeePhonePendingSync = {
        employee_id: linkedEmployee.id,
        employee_name: employeeName,
        old_phone: linkedEmployee.phone ?? null,
        new_phone: dto.phone ?? null,
      };
    }

    // Re-fetch with sync result baked in so the response phone fields are
    // accurate after the optional employee update.
    const refreshed = employeePhoneSyncDone
      ? await this.prisma.user.findUniqueOrThrow({
          where: { id },
          include: {
            employee: {
              select: {
                id: true,
                name_zh: true,
                name_en: true,
                emp_code: true,
                role: true,
                company_id: true,
                phone: true,
              },
            },
          },
        })
      : updated;

    return {
      user: this.sanitizeUser(refreshed),
      employee_phone_pending_sync: employeePhonePendingSync,
    };
  }

  async toggleActive(id: number): Promise<SanitizedUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    const saved = await this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
    return this.sanitizeUser(saved);
  }

  // ─────────────────────────────────────────────────────────────
  // Delete-related helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Counts how many historical rows reference this user across the system.
   * Used by GET /api/users/:id/check-delete to decide whether to show
   * a confirmation warning before hard-deleting.
   */
  async checkDelete(id: number): Promise<UserDeleteCheckResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        employee: {
          select: {
            id: true,
            name_zh: true,
            name_en: true,
            emp_code: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('用戶不存在');

    const counts = await this.countRelations(id);
    const total = (Object.keys(counts) as Array<keyof UserDeleteRelatedCounts>)
      .reduce((sum, key) => sum + (counts[key] ?? 0), 0);

    const response: UserDeleteCheckResponseDto = {
      user_id: user.id,
      username: user.username,
      display_name: user.displayName,
      related: counts,
      total,
      can_hard_delete: total === 0,
      linked_employee: user.employee
        ? {
            id: user.employee.id,
            name_zh: user.employee.name_zh,
            name_en: user.employee.name_en ?? null,
            emp_code: user.employee.emp_code ?? null,
          }
        : null,
    };
    return response;
  }

  /**
   * Hard-delete a user. If the user has any historical references the
   * caller must pass `confirm=true`; otherwise an HTTP 409 is thrown so
   * the UI can show a warning.
   *
   * Steps when deleting a user with history:
   *   1. Snapshot the user display name into the *_name columns of
   *      tables that lacked one (work_logs, daily_reports,
   *      acceptance_reports, verification_confirmations).
   *   2. Null out every Int FK / Int column that points at this user
   *      (covers tables where the DB-level FK is NO ACTION or where the
   *      column is a plain Int without a Prisma relation).
   *   3. Hard-delete the user. Cascading FKs (audit_logs,
   *      web_push_subscriptions) are removed automatically by the DB.
   */
  async remove(
    id: number,
    requesterId: number,
    confirm: boolean,
  ): Promise<DeleteUserResponseDto> {
    if (id === requesterId) {
      throw new ForbiddenException('不能刪除自己的帳號');
    }
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('用戶不存在');

    const counts = await this.countRelations(id);
    const total = (Object.keys(counts) as Array<keyof UserDeleteRelatedCounts>)
      .reduce((sum, key) => sum + (counts[key] ?? 0), 0);

    if (total > 0 && !confirm) {
      throw new ConflictException({
        message: '此用戶有關聯的歷史記錄，請確認後再刪除',
        related: counts,
        total,
      });
    }

    const detachedByTable: Record<string, number> = {};
    const userDisplayName = user.displayName || user.username;

    await this.prisma.$transaction(async (tx) => {
      // ── 1. Snapshot user name into the *_name columns ───────────
      // work_logs.publisher_id -> publisher_name
      const updatedWorkLogs = await tx.workLog.updateMany({
        where: { publisher_id: id },
        data: { publisher_name: userDisplayName, publisher_id: null },
      });
      detachedByTable['work_logs.publisher_id'] = updatedWorkLogs.count;

      // daily_reports.daily_report_created_by -> daily_report_created_by_name
      const updatedDailyReports = await tx.dailyReport.updateMany({
        where: { daily_report_created_by: id },
        data: {
          daily_report_created_by_name: userDisplayName,
          daily_report_created_by: null,
        },
      });
      detachedByTable['daily_reports.daily_report_created_by'] =
        updatedDailyReports.count;

      // acceptance_reports.acceptance_report_created_by -> *_name
      const updatedAcceptanceReports = await tx.acceptanceReport.updateMany({
        where: { acceptance_report_created_by: id },
        data: {
          acceptance_report_created_by_name: userDisplayName,
          acceptance_report_created_by: null,
        },
      });
      detachedByTable['acceptance_reports.acceptance_report_created_by'] =
        updatedAcceptanceReports.count;

      // verification_confirmations.confirmed_by -> confirmed_by_name
      const updatedVerifConfirms = await tx.verificationConfirmation.updateMany({
        where: { confirmed_by: id },
        data: { confirmed_by_name: userDisplayName, confirmed_by: null },
      });
      detachedByTable['verification_confirmations.confirmed_by'] =
        updatedVerifConfirms.count;

      // ── 2. Null out remaining user references ───────────────────
      // employee_attendances.user_id (Int, no FK)
      const eaUserIdRaw = await tx.$executeRaw<number>`
        UPDATE "employee_attendances" SET "user_id" = NULL WHERE "user_id" = ${id}
      `;
      detachedByTable['employee_attendances.user_id'] = Number(eaUserIdRaw);

      // employee_attendances.attendance_operator_user_id
      const eaOpRaw = await tx.$executeRaw<number>`
        UPDATE "employee_attendances" SET "attendance_operator_user_id" = NULL
         WHERE "attendance_operator_user_id" = ${id}
      `;
      detachedByTable['employee_attendances.attendance_operator_user_id'] =
        Number(eaOpRaw);

      // employee_attendances.mid_shift_approved_by (FK to employees, but
      // also exposed as an Int — clear if it accidentally references a
      // user-style id via the workflow). The current schema relates this
      // column to Employee, so we no-op it for users.

      // employee_leaves.user_id and employee_leaves.approved_by
      const elUserRaw = await tx.$executeRaw<number>`
        UPDATE "employee_leaves" SET "user_id" = NULL WHERE "user_id" = ${id}
      `;
      detachedByTable['employee_leaves.user_id'] = Number(elUserRaw);
      const elApprovedRaw = await tx.$executeRaw<number>`
        UPDATE "employee_leaves" SET "approved_by" = NULL WHERE "approved_by" = ${id}
      `;
      detachedByTable['employee_leaves.approved_by'] = Number(elApprovedRaw);

      // attendance_anomalies.anomaly_resolved_by has SetNull at FK level,
      // but the FK is NO ACTION in older databases — clear defensively.
      const aaResolvedRaw = await tx.$executeRaw<number>`
        UPDATE "attendance_anomalies" SET "anomaly_resolved_by" = NULL
         WHERE "anomaly_resolved_by" = ${id}
      `;
      detachedByTable['attendance_anomalies.anomaly_resolved_by'] =
        Number(aaResolvedRaw);

      // *_deleted_by columns (companies / employees / vehicles / machinery
      // / partners / contracts / projects / quotations / rate_cards /
      // expenses / invoices / work_logs / daily_reports). All NO ACTION
      // FK or plain Int — clear them so the user delete is not blocked.
      const deletedByTables = [
        'companies',
        'employees',
        'vehicles',
        'machinery',
        'partners',
        'contracts',
        'projects',
        'quotations',
        'rate_cards',
        'expenses',
        'invoices',
        'work_logs',
      ];
      for (const t of deletedByTables) {
        const raw = await tx.$executeRawUnsafe<number>(
          `UPDATE "${t}" SET "deleted_by" = NULL WHERE "deleted_by" = $1`,
          id,
        );
        const n = Number(raw);
        if (n > 0) detachedByTable[`${t}.deleted_by`] = n;
      }
      const drDeletedByRaw = await tx.$executeRaw<number>`
        UPDATE "daily_reports" SET "daily_report_deleted_by" = NULL
         WHERE "daily_report_deleted_by" = ${id}
      `;
      const drDeletedBy = Number(drDeletedByRaw);
      if (drDeletedBy > 0) {
        detachedByTable['daily_reports.daily_report_deleted_by'] = drDeletedBy;
      }

      // batch_upload_user_id (csv batch import)
      const batchUploadRaw = await tx.$executeRaw<number>`
        UPDATE "payroll_batches" SET "batch_upload_user_id" = NULL
         WHERE "batch_upload_user_id" = ${id}
      `.catch(() => 0); // table may not exist in older schemas
      const batchUpload = Number(batchUploadRaw);
      if (batchUpload > 0) {
        detachedByTable['payroll_batches.batch_upload_user_id'] = batchUpload;
      }

      // Verification action logs
      const valRaw = await tx.$executeRaw<number>`
        UPDATE "verification_action_logs" SET "log_user_id" = 0,
               "log_user_name" = COALESCE("log_user_name", ${userDisplayName})
         WHERE "log_user_id" = ${id}
      `.catch(() => 0);
      const val = Number(valRaw);
      if (val > 0) {
        detachedByTable['verification_action_logs.log_user_id'] = val;
      }

      // Error logs (already snapshot username)
      const errLogRaw = await tx.$executeRaw<number>`
        UPDATE "error_logs" SET "error_log_user_id" = NULL
         WHERE "error_log_user_id" = ${id}
      `;
      const errLog = Number(errLogRaw);
      if (errLog > 0) {
        detachedByTable['error_logs.error_log_user_id'] = errLog;
      }

      // ── 3. Hard delete the user ─────────────────────────────────
      await tx.user.delete({ where: { id } });
    });

    const detachedTotal = Object.values(detachedByTable).reduce(
      (sum, n) => sum + n,
      0,
    );

    return {
      success: true,
      user_id: id,
      username: user.username,
      detached: detachedTotal,
      detached_by_table: detachedByTable,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────

  /**
   * Run the count queries used by both checkDelete and remove. Each query
   * is independent so we can fan them out in parallel.
   */
  private async countRelations(
    id: number,
  ): Promise<UserDeleteRelatedCounts> {
    const [
      workLogsPublished,
      dailyReportsCreated,
      acceptanceReportsCreated,
      auditLogs,
      verificationConfirmations,
      webPushSubscriptions,
      employeeAttendancesUser,
      employeeAttendancesOperator,
      employeeLeavesUser,
      employeeLeavesApproved,
      payrolls,
      expenses,
      paymentIns,
      paymentOuts,
      midShiftApprovals,
      deletedRecordMarks,
    ] = await Promise.all([
      this.prisma.workLog.count({ where: { publisher_id: id } }),
      this.prisma.dailyReport.count({
        where: { daily_report_created_by: id },
      }),
      this.prisma.acceptanceReport.count({
        where: { acceptance_report_created_by: id },
      }),
      this.prisma.auditLog.count({ where: { audit_user_id: id } }),
      this.prisma.verificationConfirmation.count({
        where: { confirmed_by: id },
      }),
      this.prisma.webPushSubscription.count({ where: { user_id: id } }),
      this.prisma
        .$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "employee_attendances" WHERE "user_id" = ${id}`
        .then((rows) => Number(rows[0]?.c ?? 0)),
      this.prisma
        .$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "employee_attendances" WHERE "attendance_operator_user_id" = ${id}`
        .then((rows) => Number(rows[0]?.c ?? 0)),
      this.prisma
        .$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "employee_leaves" WHERE "user_id" = ${id}`
        .then((rows) => Number(rows[0]?.c ?? 0)),
      this.prisma
        .$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "employee_leaves" WHERE "approved_by" = ${id}`
        .then((rows) => Number(rows[0]?.c ?? 0)),
      // Payroll / Expense / PaymentIn / PaymentOut: the schema does not
      // currently store a user FK on these rows directly, but historical
      // data may have been created by this user. We surface any logical
      // links via existing audit_logs by counting per-table audit entries.
      this.prisma.auditLog.count({
        where: { audit_user_id: id, audit_target_table: 'payrolls' },
      }),
      this.prisma.auditLog.count({
        where: { audit_user_id: id, audit_target_table: 'expenses' },
      }),
      this.prisma.auditLog.count({
        where: { audit_user_id: id, audit_target_table: 'payment_ins' },
      }),
      this.prisma.auditLog.count({
        where: { audit_user_id: id, audit_target_table: 'payment_outs' },
      }),
      // mid_shift approvals stored in employee_attendances by approver
      // user id; the column relates to Employee in the schema, so for
      // user accounts it is generally 0. Counted for completeness.
      this.prisma
        .$queryRaw<{ c: bigint }[]>`SELECT COUNT(*)::bigint AS c FROM "employee_attendances" WHERE "mid_shift_approved_by" = ${id}`
        .then((rows) => Number(rows[0]?.c ?? 0)),
      // Aggregate count of "deleted_by = userId" rows across all
      // soft-delete tables — purely informational so the UI can warn
      // when an account participated in past deletions.
      this.countDeletedByMarks(id),
    ]);

    return {
      work_logs_published: workLogsPublished,
      payrolls,
      expenses,
      payment_ins: paymentIns,
      payment_outs: paymentOuts,
      daily_reports_created: dailyReportsCreated,
      acceptance_reports_created: acceptanceReportsCreated,
      audit_logs: auditLogs,
      verification_confirmations: verificationConfirmations,
      employee_attendances: employeeAttendancesUser,
      employee_attendance_operator: employeeAttendancesOperator,
      mid_shift_approvals: midShiftApprovals,
      employee_leaves_submitted: employeeLeavesUser,
      employee_leaves_approved: employeeLeavesApproved,
      web_push_subscriptions: webPushSubscriptions,
      deleted_record_marks: deletedRecordMarks,
    };
  }

  private async countDeletedByMarks(id: number): Promise<number> {
    const tables = [
      'companies',
      'employees',
      'vehicles',
      'machinery',
      'partners',
      'contracts',
      'projects',
      'quotations',
      'rate_cards',
      'expenses',
      'invoices',
      'work_logs',
    ];
    let total = 0;
    for (const t of tables) {
      const rows = await this.prisma.$queryRawUnsafe<{ c: bigint }[]>(
        `SELECT COUNT(*)::bigint AS c FROM "${t}" WHERE "deleted_by" = $1`,
        id,
      );
      total += Number(rows[0]?.c ?? 0);
    }
    const drRows = await this.prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM "daily_reports" WHERE "daily_report_deleted_by" = ${id}
    `;
    total += Number(drRows[0]?.c ?? 0);
    return total;
  }

  private sanitizeUser(user: UserWithEmployee): SanitizedUser {
    const { password: _password, ...result } = user;
    void _password;
    return result;
  }
}
