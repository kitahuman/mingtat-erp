import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CLERK = 'clerk',
  WORKER = 'worker',
}

export enum Department {
  ENGINEERING = '工程部',
  STREET_VEHICLE = '街車',
  TRANSPORT = '運輸部',
  OFFICE = '辦公室',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar' })
  password: string;

  @Column({ type: 'varchar', name: 'display_name', default: '' })
  displayName: string;

  @Column({ type: 'varchar', default: UserRole.WORKER })
  role: UserRole;

  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', nullable: true })
  department: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'int', name: 'created_by', nullable: true })
  createdBy: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
