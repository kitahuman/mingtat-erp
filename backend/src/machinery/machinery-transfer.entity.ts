import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Machinery } from './machinery.entity';
import { Company } from '../companies/company.entity';

@Entity('machinery_transfers')
export class MachineryTransfer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  machinery_id: number;

  @ManyToOne(() => Machinery, (m) => m.transfers)
  @JoinColumn({ name: 'machinery_id' })
  machinery: Machinery;

  @Column({ type: 'int' })
  from_company_id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'from_company_id' })
  from_company: Company;

  @Column({ type: 'int' })
  to_company_id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'to_company_id' })
  to_company: Company;

  @Column({ type: 'date' })
  transfer_date: string;

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
