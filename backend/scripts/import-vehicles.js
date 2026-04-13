/**
 * Vehicle Import Script
 * Reads Excel file and imports/updates vehicle data via Prisma
 */
const ExcelJS = require('exceljs');
const { PrismaClient } = require('@prisma/client');

if (!process.env.DATABASE_URL) {
  console.error('[ERROR] DATABASE_URL environment variable is not set. Aborting.');
  process.exit(1);
}
const prisma = new PrismaClient();

// Company name -> id mapping
const COMPANY_MAP = {
  '明達運輸有限公司': 5,
  '明創運輸有限公司': 4,
  '卓嵐發展有限公司': 3,
  '明達建築有限公司': 2,
  '興豐': 6,
  '陳圖明': 7,
  'FONG SIU FAN': 8,
};

// Plates to exclude
const EXCLUDE_PLATES = ['MM7710', 'WT517'];

/**
 * Parse a date value from Excel cell.
 */
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return val;
  }
  if (typeof val === 'number') {
    const epoch = new Date(1899, 11, 30);
    const d = new Date(epoch.getTime() + val * 86400000);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  if (typeof val === 'string') {
    const s = val.trim();
    if (!s) return null;
    const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const d = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      if (!isNaN(d.getTime())) return d;
    }
    const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (dmyMatch) {
      let year = parseInt(dmyMatch[3]);
      if (year < 100) year += 2000;
      const d = new Date(year, parseInt(dmyMatch[2]) - 1, parseInt(dmyMatch[1]));
      if (!isNaN(d.getTime())) return d;
    }
    const cnMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (cnMatch) {
      const d = new Date(parseInt(cnMatch[1]), parseInt(cnMatch[2]) - 1, parseInt(cnMatch[3]));
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Parse inspection column: may contain date + notes mixed
 */
function parseInspection(val) {
  if (!val) return { date: null, notes: null };
  const raw = String(val).trim();
  if (!raw) return { date: null, notes: null };
  if (val instanceof Date && !isNaN(val.getTime())) {
    return { date: val, notes: null };
  }
  let date = null;
  const dmMatch = raw.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (dmMatch) {
    let year = dmMatch[3] ? parseInt(dmMatch[3]) : new Date().getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, parseInt(dmMatch[2]) - 1, parseInt(dmMatch[1]));
    if (!isNaN(d.getTime())) date = d;
  }
  if (!date) {
    const cnMatch = raw.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (cnMatch) {
      let yr = parseInt(cnMatch[1]);
      if (yr > 2100) yr = yr - 480;
      const d = new Date(yr, parseInt(cnMatch[2]) - 1, parseInt(cnMatch[3]));
      if (!isNaN(d.getTime())) date = d;
    }
  }
  if (!date) {
    const fullMatch = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (fullMatch) {
      const d = new Date(parseInt(fullMatch[3]), parseInt(fullMatch[2]) - 1, parseInt(fullMatch[1]));
      if (!isNaN(d.getTime())) date = d;
    }
  }
  return { date, notes: raw };
}

/**
 * Parse insurance_expiry column: may be a date or text with date
 */
function parseInsuranceExpiry(val) {
  if (!val) return null;
  if (val instanceof Date && !isNaN(val.getTime())) return val;
  const s = String(val).trim();
  if (!s) return null;
  const d = parseDate(val);
  if (d) return d;
  const cnMatch = s.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (cnMatch) {
    const d = new Date(parseInt(cnMatch[1]), parseInt(cnMatch[2]) - 1, parseInt(cnMatch[3]));
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function getCellValue(row, col) {
  const cell = row.getCell(col);
  if (!cell || cell.value === null || cell.value === undefined) return null;
  if (cell.value && typeof cell.value === 'object' && cell.value.richText) {
    return cell.value.richText.map(rt => rt.text).join('');
  }
  if (cell.value && typeof cell.value === 'object' && 'result' in cell.value) {
    return cell.value.result;
  }
  return cell.value;
}

function getCellText(row, col) {
  const val = getCellValue(row, col);
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val;
  return String(val).trim() || null;
}

async function main() {
  console.log('Loading Excel file...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('/home/ubuntu/mingtat-erp/backend/import_vehicles.xlsx');
  const sheet = workbook.worksheets[0];
  console.log(`Sheet: ${sheet.name}, rows: ${sheet.rowCount}`);
  
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  console.log('Companies in DB:', companies.map(c => `${c.id}:${c.name}`).join(', '));
  
  let created = 0, updated = 0, skipped = 0, errors = 0;
  
  for (let rowNum = 3; rowNum <= sheet.rowCount; rowNum++) {
    const row = sheet.getRow(rowNum);
    const plateRaw = getCellText(row, 2);
    if (!plateRaw || typeof plateRaw !== 'string') { skipped++; continue; }
    const plateNumber = plateRaw.replace(/\s+/g, '').trim();
    if (!plateNumber) { skipped++; continue; }
    if (/^[\u4e00-\u9fff]/.test(plateNumber)) { skipped++; continue; }
    
    // Skip rows without company (maintenance/note rows)
    const companyCheck = getCellText(row, 8);
    if (!companyCheck) { skipped++; continue; }
    
    if (EXCLUDE_PLATES.includes(plateNumber)) {
      console.log(`Excluded: ${plateNumber}`);
      skipped++;
      continue;
    }
    
    try {
      const machineType = getCellText(row, 3);
      let brand = getCellText(row, 4);
      if (brand && typeof brand === 'string') brand = brand.replace(/\n/g, ' ').trim();
      
      const firstRegDate = parseDate(getCellValue(row, 5));
      const chassisNo = getCellText(row, 6);
      
      let tonnage = null;
      const tonnageRaw = getCellValue(row, 7);
      if (tonnageRaw !== null && tonnageRaw !== undefined && tonnageRaw !== '-' && tonnageRaw !== '') {
        const num = parseFloat(String(tonnageRaw));
        if (!isNaN(num)) tonnage = num;
      }
      
      const companyName = getCellText(row, 8);
      let ownerCompanyId = null;
      if (companyName && typeof companyName === 'string') {
        ownerCompanyId = COMPANY_MAP[companyName.trim()] || null;
        if (!ownerCompanyId) console.warn(`  WARNING: Unknown company "${companyName}" for plate ${plateNumber}`);
      }
      
      const permitExpiry = parseDate(getCellValue(row, 9));
      const electronicComm = getCellText(row, 10);
      const autotollCollected = getCellText(row, 11);
      const autotoll = getCellText(row, 12);
      const inspectionRaw = getCellValue(row, 13);
      const inspection = parseInspection(inspectionRaw);
      const insuranceExpiry = parseInsuranceExpiry(getCellValue(row, 14));
      const insuranceAgent = getCellText(row, 15);
      const insuranceCompany = getCellText(row, 16);
      
      const gpsRaw = getCellText(row, 17);
      let hasGps = null;
      if (gpsRaw && typeof gpsRaw === 'string') {
        hasGps = gpsRaw.trim() === '有' ? true : null;
      }
      
      const mudTailExpiry = parseDate(getCellValue(row, 18));
      const originalPlate = getCellText(row, 19);
      
      const vehicleData = {
        plate_number: plateNumber,
        machine_type: machineType ? String(machineType).replace(/\n/g, ' ').trim() : null,
        brand: brand || null,
        tonnage: tonnage,
        vehicle_first_reg_date: firstRegDate,
        vehicle_chassis_no: chassisNo ? String(chassisNo) : null,
        vehicle_electronic_comm: electronicComm ? String(electronicComm) : null,
        vehicle_autotoll_collected: autotollCollected ? String(autotollCollected) : null,
        vehicle_autotoll: autotoll ? String(autotoll).replace(/\n/g, ' ').trim() : null,
        vehicle_inspection_notes: inspection.notes || null,
        vehicle_insurance_agent: insuranceAgent ? String(insuranceAgent) : null,
        vehicle_insurance_company: insuranceCompany ? String(insuranceCompany) : null,
        vehicle_has_gps: hasGps,
        vehicle_mud_tail_expiry: mudTailExpiry,
        vehicle_original_plate: originalPlate ? String(originalPlate) : null,
        permit_fee_expiry: permitExpiry,
        license_expiry: permitExpiry,
        inspection_date: inspection.date,
        insurance_expiry: insuranceExpiry,
      };
      
      if (ownerCompanyId) vehicleData.owner_company_id = ownerCompanyId;
      
      const existing = await prisma.vehicle.findFirst({ where: { plate_number: plateNumber } });
      
      if (existing) {
        await prisma.vehicle.update({ where: { id: existing.id }, data: vehicleData });
        console.log(`Updated: ${plateNumber} (id=${existing.id})`);
        updated++;
      } else {
        if (!ownerCompanyId) {
          console.error(`  ERROR: Cannot create ${plateNumber} - no company mapping`);
          errors++;
          continue;
        }
        await prisma.vehicle.create({ data: vehicleData });
        console.log(`Created: ${plateNumber}`);
        created++;
      }
    } catch (err) {
      console.error(`  ERROR processing row ${rowNum} (${plateRaw}):`, err.message);
      errors++;
    }
  }
  
  console.log(`\n=== Import Summary ===`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors:  ${errors}`);
  
  await prisma.$disconnect();
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
