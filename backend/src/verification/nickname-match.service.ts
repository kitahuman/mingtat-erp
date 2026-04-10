import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NicknameMatchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches a given nickname string to an employee ID.
   * Logic:
   * 1. Exact match in verification_nickname_mappings
   * 2. Exact match in employees.nickname or employees.name_zh
   * 3. Strip prefixes like "阿", "肥", "老" and try fuzzy match
   * 4. Substring match
   */
  async matchNickname(rawNickname: string): Promise<number | null> {
    if (!rawNickname || rawNickname.trim().length === 0) return null;
    const nickname = rawNickname.trim();

    // 1. Exact match in mappings
    const exactMapping = await this.prisma.verificationNicknameMapping.findFirst({
      where: {
        nickname_value: nickname,
        nickname_is_active: true,
        nickname_employee_id: { not: null }
      }
    });
    if (exactMapping && exactMapping.nickname_employee_id) {
      return exactMapping.nickname_employee_id;
    }

    // 2. Exact match in employees
    const exactEmployee = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { nickname: nickname },
          { name_zh: nickname }
        ],
        status: 'active'
      }
    });
    if (exactEmployee) {
      return exactEmployee.id;
    }

    // 3. Strip prefixes and fuzzy match
    const prefixes = ['阿', '肥', '老', '大', '細', '小'];
    let strippedNickname = nickname;
    for (const prefix of prefixes) {
      if (nickname.startsWith(prefix) && nickname.length > prefix.length) {
        strippedNickname = nickname.substring(prefix.length);
        break;
      }
    }

    if (strippedNickname !== nickname) {
      const strippedMapping = await this.prisma.verificationNicknameMapping.findFirst({
        where: {
          nickname_value: strippedNickname,
          nickname_is_active: true,
          nickname_employee_id: { not: null }
        }
      });
      if (strippedMapping && strippedMapping.nickname_employee_id) {
        return strippedMapping.nickname_employee_id;
      }

      const strippedEmployee = await this.prisma.employee.findFirst({
        where: {
          OR: [
            { nickname: strippedNickname },
            { name_zh: strippedNickname }
          ],
          status: 'active'
        }
      });
      if (strippedEmployee) {
        return strippedEmployee.id;
      }
    }

    // 4. Substring match (if nickname is > 1 char)
    if (nickname.length > 1) {
      const substringMapping = await this.prisma.verificationNicknameMapping.findFirst({
        where: {
          nickname_value: { contains: nickname },
          nickname_is_active: true,
          nickname_employee_id: { not: null }
        }
      });
      if (substringMapping && substringMapping.nickname_employee_id) {
        return substringMapping.nickname_employee_id;
      }

      const substringEmployee = await this.prisma.employee.findFirst({
        where: {
          OR: [
            { nickname: { contains: nickname } },
            { name_zh: { contains: nickname } }
          ],
          status: 'active'
        }
      });
      if (substringEmployee) {
        return substringEmployee.id;
      }
    }

    return null;
  }

  /**
   * Matches an array of nicknames and returns a map of nickname -> employee_id
   */
  async matchNicknames(nicknames: string[]): Promise<Record<string, number | null>> {
    const result: Record<string, number | null> = {};
    for (const nickname of nicknames) {
      if (!result[nickname]) {
        result[nickname] = await this.matchNickname(nickname);
      }
    }
    return result;
  }
}
