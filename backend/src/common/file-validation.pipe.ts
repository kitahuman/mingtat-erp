import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';

/**
 * Allowed MIME types grouped by category.
 * Used by FileValidationPipe to restrict uploads to safe file types.
 */
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  image: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'image/bmp',
  ],
  document: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  spreadsheet: [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ],
};

/** Flatten all allowed MIME types into a single array */
export const ALL_ALLOWED_MIME_TYPES = Object.values(ALLOWED_MIME_TYPES).flat();

/** Maximum file size in bytes (20 MB) */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** Maximum file size for verification uploads (50 MB) */
export const MAX_VERIFICATION_FILE_SIZE = 50 * 1024 * 1024;

/** Dangerous file extensions that must always be blocked */
const BLOCKED_EXTENSIONS = [
  '.exe', '.bat', '.cmd', '.com', '.msi', '.scr', '.pif',
  '.vbs', '.vbe', '.js', '.jse', '.ws', '.wsf', '.wsc', '.wsh',
  '.ps1', '.ps1xml', '.ps2', '.ps2xml', '.psc1', '.psc2',
  '.reg', '.inf', '.lnk', '.sh', '.bash', '.csh',
  '.dll', '.sys', '.drv', '.ocx',
  '.php', '.asp', '.aspx', '.jsp', '.cgi',
];

interface FileValidationOptions {
  /** Allowed MIME types (defaults to ALL_ALLOWED_MIME_TYPES) */
  allowedMimeTypes?: string[];
  /** Maximum file size in bytes (defaults to MAX_FILE_SIZE = 20 MB) */
  maxSize?: number;
  /** Whether the file is required (defaults to true) */
  required?: boolean;
}

@Injectable()
export class FileValidationPipe implements PipeTransform {
  private readonly allowedMimeTypes: string[];
  private readonly maxSize: number;
  private readonly required: boolean;

  constructor(options: FileValidationOptions = {}) {
    this.allowedMimeTypes = options.allowedMimeTypes ?? ALL_ALLOWED_MIME_TYPES;
    this.maxSize = options.maxSize ?? MAX_FILE_SIZE;
    this.required = options.required ?? true;
  }

  transform(file: Express.Multer.File | undefined) {
    if (!file) {
      if (this.required) {
        throw new BadRequestException('File is required');
      }
      return file;
    }

    // Check file size
    if (file.size > this.maxSize) {
      throw new BadRequestException(
        `File size ${(file.size / 1024 / 1024).toFixed(1)} MB exceeds the maximum allowed size of ${(this.maxSize / 1024 / 1024).toFixed(0)} MB`,
      );
    }

    // Check for blocked extensions
    const originalName = file.originalname?.toLowerCase() ?? '';
    const hasBlockedExt = BLOCKED_EXTENSIONS.some((ext) =>
      originalName.endsWith(ext),
    );
    if (hasBlockedExt) {
      throw new BadRequestException(
        `File type is not allowed: ${originalName}`,
      );
    }

    // Check MIME type
    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File MIME type "${file.mimetype}" is not allowed. Allowed types: ${this.allowedMimeTypes.join(', ')}`,
      );
    }

    return file;
  }
}

/**
 * Validation pipe for multiple files (FilesInterceptor).
 */
@Injectable()
export class FilesValidationPipe implements PipeTransform {
  private readonly singlePipe: FileValidationPipe;

  constructor(options: FileValidationOptions = {}) {
    this.singlePipe = new FileValidationPipe({ ...options, required: false });
  }

  transform(files: Express.Multer.File[] | undefined) {
    if (!files || files.length === 0) {
      return files;
    }
    return files.map((file) => this.singlePipe.transform(file));
  }
}
