import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '用戶名或電話號碼' })
  @IsString()
  @IsNotEmpty({ message: '用戶名不能為空' })
  username!: string;

  @ApiProperty({ description: '密碼' })
  @IsString()
  @IsNotEmpty({ message: '密碼不能為空' })
  password!: string;
}
