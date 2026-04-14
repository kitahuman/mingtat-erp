/**
 * Unit tests for matching utility methods extracted from:
 * - WhatsappService.findMatchingItems (item matching by vehicle/driver/machine/contract)
 * - MatchingService.computeMatchStatus (match status determination)
 * - MatchingService.normalizeVehicle (plate number normalization)
 * - MatchingService.nameMatch (name/nickname fuzzy matching)
 *
 * These are pure functions extracted for testability.
 */

// ════════════════════════════════════════════════════════════
// Extracted pure functions (replicated from service code)
// ════════════════════════════════════════════════════════════

interface AiModification {
  target_vehicle_no?: string;
  target_driver_nickname?: string;
  target_machine_code?: string;
  target_contract_no?: string;
}

function findMatchingItems(items: any[], mod: AiModification): any[] {
  return items.filter((item) => {
    if (mod.target_vehicle_no && item.wa_item_vehicle_no) {
      const normalizedTarget = mod.target_vehicle_no.replace(/\s/g, '').toUpperCase();
      const normalizedItem = item.wa_item_vehicle_no.replace(/\s/g, '').toUpperCase();
      if (normalizedTarget === normalizedItem) return true;
    }
    if (mod.target_driver_nickname && item.wa_item_driver_nickname) {
      const targetNick = mod.target_driver_nickname.trim().toLowerCase();
      const itemNick = item.wa_item_driver_nickname.trim().toLowerCase();
      if (targetNick === itemNick || itemNick.includes(targetNick) || targetNick.includes(itemNick)) return true;
    }
    if (mod.target_machine_code && item.wa_item_machine_code) {
      const normalizedTarget = mod.target_machine_code.replace(/\s/g, '').toUpperCase();
      const normalizedItem = item.wa_item_machine_code.replace(/\s/g, '').toUpperCase();
      if (normalizedTarget === normalizedItem) return true;
    }
    if (mod.target_contract_no && item.wa_item_contract_no) {
      const normalizedTarget = mod.target_contract_no.replace(/\s/g, '').toUpperCase();
      const normalizedItem = item.wa_item_contract_no.replace(/\s/g, '').toUpperCase();
      if (normalizedTarget === normalizedItem) return true;
    }
    return false;
  });
}

interface SourceData {
  source: string;
  status: 'found' | 'missing';
  match_score: number;
  field_scores: any[];
  details: any[];
}

function computeMatchStatus(sources: Record<string, SourceData>): {
  matchStatus: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  avgScore: number;
} {
  const nonWorkSources = ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'];
  const foundSources = nonWorkSources.filter((s) => sources[s]?.status === 'found');
  const foundCount = foundSources.length;
  const avgScore = foundCount > 0
    ? Math.round(foundSources.reduce((sum, s) => sum + (sources[s]?.match_score || 0), 0) / foundCount)
    : 0;
  let matchStatus: 'full_match' | 'partial_match' | 'conflict' | 'missing_source';
  if (foundCount === 0) {
    matchStatus = 'missing_source';
  } else if (foundCount >= 4 && avgScore >= 60) {
    matchStatus = 'full_match';
  } else if (foundCount >= 2 && avgScore >= 40) {
    matchStatus = 'partial_match';
  } else if (foundCount >= 2 && avgScore < 40) {
    matchStatus = 'conflict';
  } else {
    matchStatus = 'missing_source';
  }
  return { matchStatus, avgScore };
}

function normalizeVehicle(plate: string | null | undefined): string {
  if (!plate) return '';
  return plate.toUpperCase().replace(/[\s\-]/g, '');
}

function nameMatch(
  name1: string | null | undefined,
  name2: string,
  nickname: string,
): boolean {
  if (!name1) return false;
  const n1 = name1.trim().toLowerCase();
  if (!n1) return false;
  if (name2 && name2.toLowerCase().includes(n1)) return true;
  if (nickname && nickname.toLowerCase().includes(n1)) return true;
  if (name2 && n1.includes(name2.toLowerCase())) return true;
  if (nickname && n1.includes(nickname.toLowerCase())) return true;
  return false;
}

// ════════════════════════════════════════════════════════════
// Tests
// ════════════════════════════════════════════════════════════

describe('WhatsApp findMatchingItems', () => {
  const items = [
    { id: 1, wa_item_vehicle_no: 'AB 1234', wa_item_driver_nickname: '阿明', wa_item_machine_code: 'DC07', wa_item_contract_no: 'T24W022' },
    { id: 2, wa_item_vehicle_no: 'CD5678', wa_item_driver_nickname: '大飛', wa_item_machine_code: 'DC14', wa_item_contract_no: 'PA13114' },
    { id: 3, wa_item_vehicle_no: null, wa_item_driver_nickname: '肥仔麟', wa_item_machine_code: 'DC02', wa_item_contract_no: '3802' },
  ];

  describe('match by vehicle_no', () => {
    it('should match vehicle with normalized spaces', () => {
      const result = findMatchingItems(items, { target_vehicle_no: 'AB1234' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should match vehicle case-insensitively', () => {
      const result = findMatchingItems(items, { target_vehicle_no: 'ab 1234' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should not match non-existent vehicle', () => {
      const result = findMatchingItems(items, { target_vehicle_no: 'XY9999' });
      expect(result).toHaveLength(0);
    });
  });

  describe('match by driver_nickname', () => {
    it('should match exact nickname', () => {
      const result = findMatchingItems(items, { target_driver_nickname: '大飛' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });

    it('should match partial nickname (target includes item)', () => {
      const result = findMatchingItems(items, { target_driver_nickname: '肥仔麟' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(3);
    });

    it('should match partial nickname (item includes target)', () => {
      const result = findMatchingItems(items, { target_driver_nickname: '肥仔' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(3);
    });
  });

  describe('match by machine_code', () => {
    it('should match machine code with normalized spaces', () => {
      const result = findMatchingItems(items, { target_machine_code: 'D C 07' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should match machine code case-insensitively', () => {
      const result = findMatchingItems(items, { target_machine_code: 'dc14' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(2);
    });
  });

  describe('match by contract_no', () => {
    it('should match contract number', () => {
      const result = findMatchingItems(items, { target_contract_no: 'T24W022' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });

    it('should match contract number case-insensitively', () => {
      const result = findMatchingItems(items, { target_contract_no: 't24w022' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });

  describe('no match', () => {
    it('should return empty when mod has no matching fields', () => {
      const result = findMatchingItems(items, {});
      expect(result).toHaveLength(0);
    });
  });
});

describe('MatchingService computeMatchStatus', () => {
  const makeSources = (found: string[], scores: Record<string, number>): Record<string, SourceData> => {
    const sources: Record<string, SourceData> = {};
    for (const s of ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order']) {
      sources[s] = {
        source: s,
        status: found.includes(s) ? 'found' : 'missing',
        match_score: scores[s] || 0,
        field_scores: [],
        details: [],
      };
    }
    return sources;
  };

  it('should return full_match when 4+ sources found with avg score >= 60', () => {
    const sources = makeSources(
      ['chit', 'delivery_note', 'gps', 'attendance'],
      { chit: 80, delivery_note: 70, gps: 60, attendance: 65 }
    );
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('full_match');
    expect(result.avgScore).toBeGreaterThanOrEqual(60);
  });

  it('should return partial_match when 2-3 sources found with avg score >= 40', () => {
    const sources = makeSources(
      ['chit', 'gps'],
      { chit: 50, gps: 45 }
    );
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('partial_match');
  });

  it('should return conflict when 2+ sources found with avg score < 40', () => {
    const sources = makeSources(
      ['chit', 'delivery_note'],
      { chit: 20, delivery_note: 30 }
    );
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('conflict');
  });

  it('should return missing_source when no sources found', () => {
    const sources = makeSources([], {});
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('missing_source');
    expect(result.avgScore).toBe(0);
  });

  it('should return missing_source when only 1 source found', () => {
    const sources = makeSources(['chit'], { chit: 80 });
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('missing_source');
  });

  it('should return full_match when all 5 sources found with high scores', () => {
    const sources = makeSources(
      ['chit', 'delivery_note', 'gps', 'attendance', 'whatsapp_order'],
      { chit: 90, delivery_note: 85, gps: 80, attendance: 75, whatsapp_order: 95 }
    );
    const result = computeMatchStatus(sources);
    expect(result.matchStatus).toBe('full_match');
    expect(result.avgScore).toBe(85);
  });
});

describe('MatchingService normalizeVehicle', () => {
  it('should uppercase and remove spaces/hyphens', () => {
    expect(normalizeVehicle('ab-12 34')).toBe('AB1234');
  });

  it('should handle null/undefined', () => {
    expect(normalizeVehicle(null)).toBe('');
    expect(normalizeVehicle(undefined)).toBe('');
  });

  it('should handle already normalized plate', () => {
    expect(normalizeVehicle('AB1234')).toBe('AB1234');
  });
});

describe('MatchingService nameMatch', () => {
  it('should match when name1 is substring of name2', () => {
    expect(nameMatch('明', '阿明', '')).toBe(true);
  });

  it('should match when name1 is substring of nickname', () => {
    expect(nameMatch('飛', '', '大飛')).toBe(true);
  });

  it('should match when name2 is substring of name1', () => {
    expect(nameMatch('阿明哥', '明', '')).toBe(true);
  });

  it('should match case-insensitively', () => {
    expect(nameMatch('John', 'john doe', '')).toBe(true);
  });

  it('should return false for null name1', () => {
    expect(nameMatch(null, '阿明', '大飛')).toBe(false);
  });

  it('should return false for empty name1', () => {
    expect(nameMatch('', '阿明', '大飛')).toBe(false);
  });

  it('should return false when no match', () => {
    expect(nameMatch('王', '阿明', '大飛')).toBe(false);
  });
});
