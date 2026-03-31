import {
  Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
} from 'typeorm';
import { RateCard } from './rate-card.entity';

@Entity('rate_card_ot_rates')
export class RateCardOtRate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  rate_card_id: number;

  @ManyToOne(() => RateCard, (rc) => rc.ot_rates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rate_card_id' })
  rate_card: RateCard;

  @Column()
  time_slot: string; // e.g. "1800-1900", "1900-2000", "0600-0700", "0700-0800"

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  rate: number;

  @Column({ nullable: true })
  unit: string;
}
