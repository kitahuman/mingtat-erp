import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AuthService } from './auth/auth.service';
import { PrismaService } from './prisma/prisma.service';
import { ExpenseCategoriesService } from './expense-categories/expense-categories.service';

async function seed() {
  const app = await NestFactory.createApplicationContext(AppModule);

  // Seed admin user
  const authService = app.get(AuthService);
  await authService.seedAdmin();

  const prisma = app.get(PrismaService);

  // Check if already seeded
  const existingCompanies = await prisma.company.count();
  if (existingCompanies > 0) {
    console.log('Data already seeded, skipping...');
    await app.close();
    return;
  }

  // Seed companies
  const companyData = [
    { name: '明達運輸公司', name_en: 'DTC Transport Co.', company_type: 'internal', internal_prefix: 'DTC', description: '對外承接工程', status: 'active' },
    { name: '明達建築有限公司', name_en: 'DCL Construction Ltd.', company_type: 'internal', internal_prefix: 'DCL', description: '承包工程、持有機械', status: 'active' },
    { name: '卓嵐發展有限公司', name_en: 'CNL Development Ltd.', company_type: 'internal', internal_prefix: 'CNL', description: '聘請員工', status: 'active' },
    { name: '明創運輸有限公司', name_en: 'MCL Transport Ltd.', company_type: 'internal', internal_prefix: 'MCL', description: '持有車輛', status: 'active' },
    { name: '明達運輸有限公司', name_en: 'DTL Transport Ltd.', company_type: 'internal', internal_prefix: 'DTL', description: '持有車輛', status: 'active' },
  ];

  const companies: any[] = [];
  for (const c of companyData) {
    const saved = await prisma.company.create({ data: c });
    companies.push(saved);
  }
  console.log(`Seeded ${companies.length} companies`);

  const cnl = companies.find((c: any) => c.internal_prefix === 'CNL')!;
  const mcl = companies.find((c: any) => c.internal_prefix === 'MCL')!;
  const dtl = companies.find((c: any) => c.internal_prefix === 'DTL')!;
  const dcl = companies.find((c: any) => c.internal_prefix === 'DCL')!;

  // Seed employees (under CNL)
  const employeeData = [
    { name_zh: '陳圖明', role: 'admin', emp_code: 'E001' },
    { name_zh: '張志濤', role: 'admin', emp_code: 'E002' },
    { name_zh: '陳宗岳', role: 'admin', emp_code: 'E003' },
    { name_zh: '鄧傑仁', role: 'admin', emp_code: 'E004' },
    { name_zh: '侯永強', role: 'admin', emp_code: 'E005' },
    { name_zh: '區國翔', role: 'driver', emp_code: 'E006' },
    { name_zh: '朱偉業', role: 'driver', emp_code: 'E007' },
    { name_zh: '馮回生', role: 'driver', emp_code: 'E008' },
    { name_zh: '林頌棋', role: 'driver', emp_code: 'E009' },
    { name_zh: '吳子旋', role: 'driver', emp_code: 'E010' },
    { name_zh: '吳偉泰', role: 'driver', emp_code: 'E011' },
    { name_zh: '白志強', role: 'driver', emp_code: 'E012' },
    { name_zh: '蘇啟泰', role: 'driver', emp_code: 'E013' },
    { name_zh: '盧光耀', role: 'driver', emp_code: 'E014' },
    { name_zh: '陳圖光', role: 'operator', emp_code: 'E015' },
    { name_zh: '張文傑', role: 'operator', emp_code: 'E016' },
    { name_zh: '鍾子明', role: 'operator', emp_code: 'E017' },
    { name_zh: '高永強', role: 'operator', emp_code: 'E018' },
    { name_zh: '石坤泉', role: 'operator', emp_code: 'E019' },
    { name_zh: '蘇金平', role: 'operator', emp_code: 'E020' },
    { name_zh: '黃文麟', role: 'operator', emp_code: 'E021' },
    { name_zh: '黃柏洪', role: 'operator', emp_code: 'E022' },
    { name_zh: '郭新健', role: 'worker', emp_code: 'E023' },
    { name_zh: '郭梓峰', role: 'worker', emp_code: 'E024' },
    { name_zh: '蘇志雄', role: 'worker', emp_code: 'E025' },
    { name_zh: '翁長寬', role: 'worker', emp_code: 'E026' },
    { name_zh: '周子青', role: 'worker', emp_code: 'E027' },
    { name_zh: '陳嘉善', role: 'worker', emp_code: 'E028' },
    { name_zh: 'Hussain Babar', name_en: 'Hussain Babar', role: 'worker', emp_code: 'E029' },
    { name_zh: '黃輝', role: 'worker', emp_code: 'E030' },
    { name_zh: '徐海霖', role: 'worker', emp_code: 'E031' },
    { name_zh: '李敏區', role: 'worker', emp_code: 'E032' },
  ];

  const employees: any[] = [];
  for (const e of employeeData) {
    const saved = await prisma.employee.create({
      data: { ...e, company_id: cnl.id, status: 'active', join_date: '2024-01-01' },
    });
    employees.push(saved);
  }
  console.log(`Seeded ${employees.length} employees`);

  // Seed salary settings for all employees
  for (const e of employees) {
    await prisma.employeeSalarySetting.create({
      data: {
        employee_id: e.id,
        effective_date: '2024-01-01',
        base_salary: e.role === 'admin' ? 25000 : e.role === 'driver' ? 18000 : e.role === 'operator' ? 16000 : 14000,
        salary_type: 'monthly',
        allowance_night: 200,
        allowance_rent: e.role === 'driver' ? 500 : 0,
        allowance_3runway: 0,
        ot_rate_standard: e.role === 'admin' ? 150 : e.role === 'driver' ? 120 : 100,
      },
    });
  }
  console.log(`Seeded ${employees.length} salary settings`);

  // Seed MCL vehicles
  const mclVehicles = [
    { plate_number: 'MC2600', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'MV897', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'TF3306', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'VE987', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'WY8724', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'XW1778', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'YB6268', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'ZY4778', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'XH8301', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'YA987', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'PJ165', vehicle_type: '夾車' },
    { plate_number: 'WG1750', vehicle_type: '勾斗車' },
    { plate_number: 'NZ1886', vehicle_type: '吊車' },
    { plate_number: '54450T', vehicle_type: '拖架' },
    { plate_number: 'LT3318', vehicle_type: '拖頭' },
    { plate_number: 'XB6673', vehicle_type: '輕型貨車' },
  ];

  const dtlVehicles = [
    { plate_number: 'EM987', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'JR981', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'PR971', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'WC987', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'WD190', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'YE6679', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'YT6383', vehicle_type: '泥頭車', tonnage: 30 },
    { plate_number: 'UH1883', vehicle_type: '夾車' },
    { plate_number: 'KP440', vehicle_type: '領航車' },
    { plate_number: 'YU940', vehicle_type: '領航車' },
    { plate_number: 'TN8808', vehicle_type: '領航車' },
  ];

  const allVehicleData = [
    ...mclVehicles.map(v => ({ ...v, owner_company_id: mcl.id, status: 'active' })),
    ...dtlVehicles.map(v => ({ ...v, owner_company_id: dtl.id, status: 'active' })),
  ];

  let vehicleCount = 0;
  for (const v of allVehicleData) {
    await prisma.vehicle.create({ data: v as any });
    vehicleCount++;
  }
  console.log(`Seeded ${vehicleCount} vehicles`);

  // Seed machinery (under DCL)
  const machineryData = [
    { machine_code: 'DC01', machine_type: '挖掘機', brand: '洋馬', model: '洋馬仔', tonnage: 3 },
    { machine_code: 'DC02', machine_type: '挖掘機', brand: 'Kubota', model: 'U-30-6', tonnage: 3 },
    { machine_code: 'DC03', machine_type: '挖掘機', brand: 'Kato', model: '308', tonnage: 8 },
    { machine_code: 'DC04', machine_type: '挖掘機', brand: 'Kobelco', model: 'SK75', tonnage: 7 },
    { machine_code: 'DC05', machine_type: '挖掘機', brand: 'Sumitomo', model: 'SH135X', tonnage: 13 },
    { machine_code: 'DC06', machine_type: '挖掘機', brand: 'Kobelco', model: 'SK135', tonnage: 13 },
    { machine_code: 'DC07', machine_type: '挖掘機', brand: 'Kobelco', model: 'SK135', tonnage: 13 },
    { machine_code: 'DC08', machine_type: '挖掘機', brand: 'Kato', model: '820', tonnage: 20 },
    { machine_code: 'DC09', machine_type: '挖掘機', brand: 'Kobelco', model: 'SK225', tonnage: 22 },
    { machine_code: 'DC10', machine_type: '挖掘機', brand: '日立', model: '330', tonnage: 33 },
    { machine_code: 'DC11', machine_type: '挖掘機', brand: '日立', model: '350', tonnage: 35 },
    { machine_code: 'DC12', machine_type: '挖掘機', brand: '日立', model: '350', tonnage: 35 },
    { machine_code: 'DC13', machine_type: '挖掘機', brand: 'Hitachi', model: 'Ex490', tonnage: 49 },
    { machine_code: 'DC14', machine_type: '挖掘機', brand: '日立', model: '350', tonnage: 35 },
    { machine_code: 'DC15', machine_type: '挖掘機', brand: 'Kato', model: '513', tonnage: 13 },
    { machine_code: 'DC16', machine_type: '挖掘機', brand: '洋馬', model: '洋馬仔', tonnage: 3 },
    { machine_code: 'DC17', machine_type: '挖掘機', brand: 'Kato', model: '308', tonnage: 8 },
    { machine_code: 'DC18', machine_type: '挖掘機', brand: '日立', model: '350', tonnage: 35 },
    { machine_code: 'DC19', machine_type: '挖掘機', brand: '日立', model: '225', tonnage: 22 },
    { machine_code: 'DC20', machine_type: '挖掘機', brand: '小松', model: 'PC228', tonnage: 22 },
    { machine_code: 'DC21', machine_type: '鉸接式自卸卡車', brand: 'BELL', model: 'B45E', tonnage: 41 },
    { machine_code: 'DC22', machine_type: '履帶式裝載機', brand: 'Canycom', model: 'S160', tonnage: 0.6 },
  ];

  let machineryCount = 0;
  for (const m of machineryData) {
    await prisma.machinery.create({
      data: { ...m, owner_company_id: dcl.id, status: 'active' } as any,
    });
    machineryCount++;
  }
  console.log(`Seeded ${machineryCount} machinery`);

  // Seed expense categories
  const expenseCategoriesService = app.get(ExpenseCategoriesService);
  await expenseCategoriesService.seedDefaults();

  console.log('Seed completed!');
  await app.close();
}

seed().catch(console.error);
