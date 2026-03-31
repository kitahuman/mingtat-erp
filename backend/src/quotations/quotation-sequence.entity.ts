import { Entity, PrimaryGeneratedColumn, Column, Unique } from 'typeorm';

@Entity('quotation_sequences')
@Unique(['prefix', 'year_month'])
export class QuotationSequence {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  prefix: string; // e.g. "DTCQWH", "DCLQ"

  @Column()
  year_month: string; // e.g. "2603"

  @Column({ type: 'int', default: 0 })
  last_seq: number; // 最後使用的流水號
}
