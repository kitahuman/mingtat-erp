import { PartialType } from '@nestjs/swagger';
import { CreateKnowledgeEntryDto } from './create-knowledge-entry.dto';

export class UpdateKnowledgeEntryDto extends PartialType(CreateKnowledgeEntryDto) {}
