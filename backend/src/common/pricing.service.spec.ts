import { PricingService } from './pricing.service';

describe('PricingService', () => {
  let service: PricingService;

  beforeEach(() => {
    // PricingService depends on PrismaService, but the pure calculation methods
    // (resolveRate, calculateLineAmounts, buildUnmatchedReason, matchFleetRateCardInMemory,
    //  matchSubconRateCardInMemory) do not use Prisma, so we can pass a mock.
    const mockPrisma = {} as any;
    service = new PricingService(mockPrisma);
  });

  // ════════════════════════════════════════════════════════════
  // resolveRate
  // ════════════════════════════════════════════════════════════
  describe('resolveRate', () => {
    it('should return unified rate when card.rate > 0', () => {
      const card = { rate: 1500, unit: '日', day_rate: 1000, night_rate: 1200 };
      const result = service.resolveRate(card, '日');
      expect(result).toEqual({ rate: 1500, unit: '日' });
    });

    it('should return unified rate regardless of dayNight when card.rate > 0', () => {
      const card = { rate: 1500, unit: '日', day_rate: 1000, night_rate: 1200 };
      const result = service.resolveRate(card, '夜');
      expect(result).toEqual({ rate: 1500, unit: '日' });
    });

    it('should fall back to night_rate when card.rate is 0 and dayNight is 夜', () => {
      const card = { rate: 0, unit: '', day_rate: 1000, night_rate: 1200, night_unit: '夜' };
      const result = service.resolveRate(card, '夜');
      expect(result).toEqual({ rate: 1200, unit: '夜' });
    });

    it('should fall back to mid_shift_rate when dayNight is 中直', () => {
      const card = { rate: 0, unit: '', day_rate: 1000, mid_shift_rate: 1100, mid_shift_unit: '中' };
      const result = service.resolveRate(card, '中直');
      expect(result).toEqual({ rate: 1100, unit: '中' });
    });

    it('should fall back to day_rate for day shift', () => {
      const card = { rate: 0, unit: '', day_rate: 1000, day_unit: '日' };
      const result = service.resolveRate(card, '日');
      expect(result).toEqual({ rate: 1000, unit: '日' });
    });

    it('should fall back to day_rate when dayNight is null', () => {
      const card = { rate: 0, unit: '', day_rate: 800, day_unit: '日' };
      const result = service.resolveRate(card, null);
      expect(result).toEqual({ rate: 800, unit: '日' });
    });

    it('should return 0 rate when no rates are set', () => {
      const card = { rate: 0, unit: '' };
      const result = service.resolveRate(card, '日');
      expect(result).toEqual({ rate: 0, unit: '' });
    });
  });

  // ════════════════════════════════════════════════════════════
  // calculateLineAmounts
  // ════════════════════════════════════════════════════════════
  describe('calculateLineAmounts', () => {
    it('should calculate base amount correctly', () => {
      const card = { rate: 1500, unit: '日', ot_rate: 200, mid_shift_rate: 100 };
      const result = service.calculateLineAmounts(card, '日', 2, 0, false);
      expect(result.baseAmount).toBe(3000);
      expect(result.otAmount).toBe(0);
      expect(result.midShiftAmount).toBe(0);
      expect(result.rate).toBe(1500);
    });

    it('should calculate OT amount correctly', () => {
      const card = { rate: 1500, unit: '日', ot_rate: 200, mid_shift_rate: 100 };
      const result = service.calculateLineAmounts(card, '日', 1, 3, false);
      expect(result.baseAmount).toBe(1500);
      expect(result.otAmount).toBe(600);
      expect(result.otRate).toBe(200);
    });

    it('should calculate mid-shift amount when isMidShift is true', () => {
      const card = { rate: 1500, unit: '日', ot_rate: 200, mid_shift_rate: 100 };
      const result = service.calculateLineAmounts(card, '日', 1, 0, true);
      expect(result.midShiftAmount).toBe(100);
      expect(result.midShiftRate).toBe(100);
    });

    it('should not add mid-shift amount when isMidShift is false', () => {
      const card = { rate: 1500, unit: '日', ot_rate: 200, mid_shift_rate: 100 };
      const result = service.calculateLineAmounts(card, '日', 1, 0, false);
      expect(result.midShiftAmount).toBe(0);
    });

    it('should handle night shift rate fallback', () => {
      const card = { rate: 0, day_rate: 1000, night_rate: 1200, ot_rate: 0, mid_shift_rate: 0 };
      const result = service.calculateLineAmounts(card, '夜', 1, 0, false);
      expect(result.rate).toBe(1200);
      expect(result.baseAmount).toBe(1200);
    });
  });

  // ════════════════════════════════════════════════════════════
  // matchFleetRateCardInMemory
  // ════════════════════════════════════════════════════════════
  describe('matchFleetRateCardInMemory', () => {
    const cards = [
      { id: 1, company_id: 1, client_contract_no: 'C001', service_type: '租機', day_night: '日', tonnage: '20T', machine_type: '挖掘機', origin: 'A', destination: 'B', rate: 1500 },
      { id: 2, company_id: 1, client_contract_no: 'C001', service_type: '租機', day_night: '夜', tonnage: '20T', machine_type: '挖掘機', origin: 'A', destination: 'B', rate: 1800 },
      { id: 3, company_id: 2, client_contract_no: 'C002', service_type: '運輸', day_night: '日', tonnage: '10T', machine_type: '泥頭車', origin: null, destination: null, rate: 800 },
    ];

    it('should match exact card', () => {
      const result = service.matchFleetRateCardInMemory(cards, 1, 'C001', '租機', '日', '20T', '挖掘機', 'A', 'B');
      expect(result.card).toBeDefined();
      expect(result.card!.id).toBe(1);
      expect(result.unmatchedReason).toBe('');
    });

    it('should match night shift card', () => {
      const result = service.matchFleetRateCardInMemory(cards, 1, 'C001', '租機', '夜', '20T', '挖掘機', 'A', 'B');
      expect(result.card).toBeDefined();
      expect(result.card!.id).toBe(2);
    });

    it('should return null when no match found', () => {
      const result = service.matchFleetRateCardInMemory(cards, 1, 'C001', '租機', '日', '30T', '挖掘機', 'A', 'B');
      expect(result.card).toBeNull();
      expect(result.unmatchedReason).toContain('找不到');
    });

    it('should skip null fields in card during matching', () => {
      const result = service.matchFleetRateCardInMemory(cards, 2, 'C002', '運輸', '日', '10T', '泥頭車', null, null);
      expect(result.card).toBeDefined();
      expect(result.card!.id).toBe(3);
    });
  });

  // ════════════════════════════════════════════════════════════
  // matchSubconRateCardInMemory
  // ════════════════════════════════════════════════════════════
  describe('matchSubconRateCardInMemory', () => {
    const subconCards = [
      { id: 10, company_id: 1, client_contract_no: 'SC001', service_type: '租機', day_night: '日', tonnage: '20T', machine_type: '挖掘機', origin: null, destination: null, plate_no: 'AB1234' },
      { id: 11, company_id: 1, client_contract_no: 'SC001', service_type: '租機', day_night: '日', tonnage: '20T', machine_type: '挖掘機', origin: null, destination: null, plate_no: null },
    ];

    it('should match by plate_no when provided', () => {
      const result = service.matchSubconRateCardInMemory(subconCards, 1, 'SC001', '租機', '日', '20T', '挖掘機', null, null, 'AB1234');
      expect(result.card).toBeDefined();
      expect(result.card!.id).toBe(10);
    });

    it('should match without plate_no', () => {
      const result = service.matchSubconRateCardInMemory(subconCards, 1, 'SC001', '租機', '日', '20T', '挖掘機', null, null, null);
      expect(result.card).toBeDefined();
    });

    it('should return null when no match', () => {
      const result = service.matchSubconRateCardInMemory(subconCards, 99, 'SC999', '運輸', '夜', '30T', '泥頭車', null, null, null);
      expect(result.card).toBeNull();
      expect(result.unmatchedReason).toContain('找不到');
    });
  });

  // ════════════════════════════════════════════════════════════
  // buildUnmatchedReason
  // ════════════════════════════════════════════════════════════
  describe('buildUnmatchedReason', () => {
    it('should build reason with all conditions', () => {
      const reason = service.buildUnmatchedReason('車隊價目', 'C001', '日', '20T', '挖掘機', 'A', 'B');
      expect(reason).toContain('找不到符合條件的車隊價目');
      expect(reason).toContain('合約 C001');
      expect(reason).toContain('20T');
      expect(reason).toContain('挖掘機');
      expect(reason).toContain('起點: A');
      expect(reason).toContain('終點: B');
    });

    it('should handle null conditions', () => {
      const reason = service.buildUnmatchedReason('客戶價目', null, null, null, null, null, null);
      expect(reason).toContain('找不到符合條件的客戶價目');
      expect(reason).toContain('無條件');
    });

    it('should only include non-null conditions', () => {
      const reason = service.buildUnmatchedReason('車隊價目', null, '夜', '10T', null, null, null);
      expect(reason).toContain('夜間');
      expect(reason).toContain('10T');
      expect(reason).not.toContain('合約');
      expect(reason).not.toContain('起點');
    });
  });
});
