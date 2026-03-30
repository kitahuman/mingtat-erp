import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { Company } from '../companies/company.entity';
import { MachineryTransfer } from './machinery-transfer.entity';

@Entity('machinery')
export class Machinery {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  machine_code: string; // DC02-DC22

  @Column({ nullable: true })
  machine_type: string; // 挖掘機, 裝載機, 自卸卡車

  @Column({ nullable: true })
  brand: string;

  @Column({ nullable: true })
  model: string;

  @Column({ type: 'decimal', precision: 5, scale: 1, nullable: true })
  tonnage: number;

  @Column({ nullable: true })
  serial_number: string;

  @Column({ type: 'int' })
  owner_company_id: number;

  @ManyToOne(() => Company, (c) => c.machinery)
  @JoinColumn({ name: 'owner_company_id' })
  owner_company: Company;

  @Column({ nullable: true, type: 'date' })
  inspection_cert_expiry: string; // 驗機紙到期日

  @Column({ default: 'active' })
  status: string; // active, inactive, maintenance

  @Column({ nullable: true, type: 'text' })
  notes: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => MachineryTransfer, (t) => t.machinery)
  transfers: MachineryTransfer[];
}
