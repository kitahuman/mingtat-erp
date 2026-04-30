import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export interface FrontendErrorItem {
  type: 'js_error' | 'api_error' | 'unhandled_rejection';
  timestamp: string;
  message: string;
  url?: string;
  method?: string;
  status?: number;
  stack?: string;
  response?: any;
  request_body?: any;
}

export class CreateIssueReportDto {
  @IsString()
  @IsNotEmpty({ message: '請填寫問題描述' })
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  user_agent?: string;

  @IsOptional()
  frontend_errors?: FrontendErrorItem[];
}
