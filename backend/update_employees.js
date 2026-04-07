const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: '***REDACTED_DATABASE_URL***' } } });

// Excel data - mapped to system fields
const excelData = [
  { name_zh: '陳嘉善', name_en: 'Ashiq Hussain', id_number: 'P083791(5)', join_date: '2025-09-04', nickname: '家善', role: '雜工', mpf_plan: '東亞', date_of_birth: '1974-04-10', phone: '93445525', emergency_contact: '93432171(女兒)', address: 'FLAT B, 22/F BLOCK A EASEFUL COURT, TSING YI' },
  { name_zh: '區國翔', name_en: 'Au Kwok Cheung', id_number: 'C290444(4)', join_date: '2023-04-01', nickname: null, role: '司機', mpf_plan: '宏利', date_of_birth: '1961-10-07', phone: '93430553', emergency_contact: '65821502(太太)吳明麗', address: '東涌迎東邨迎悅樓2615室' },
  { name_zh: '陳圖光', name_en: 'Chan To Kwong', id_number: 'G805218(1)', join_date: '2023-04-01', nickname: '光仔', role: '雜工機手', mpf_plan: '宏利', date_of_birth: '1970-05-25', phone: '93785178', emergency_contact: null, address: '黄大仙下邨（二區）龍輝樓928室' },
  { name_zh: '陳圖明', name_en: 'Chan To Ming', id_number: 'G669987(0)', join_date: '2023-04-01', nickname: '可樂', role: '董事', mpf_plan: '宏利', date_of_birth: '1968-08-30', phone: '95153909', emergency_contact: null, address: '將軍澳寶琳' },
  { name_zh: '陳泳淇', name_en: 'Chan Wing Ki, Cherry', id_number: 'Y474961(6)', join_date: null, nickname: null, role: '員工', mpf_plan: '宏利', date_of_birth: '1994-01-15', phone: '62366968', emergency_contact: null, address: null },
  { name_zh: '陳泳嵐', name_en: 'Chan Wing Lam', id_number: 'Y859919(8)', join_date: null, nickname: null, role: '員工', mpf_plan: '宏利', date_of_birth: '2001-10-08', phone: '90889609', emergency_contact: null, address: null },
  { name_zh: '陳宗岳', name_en: 'Chen Zongyue', id_number: 'M377264(6)', join_date: '2023-04-01', nickname: null, role: '科文', mpf_plan: '東亞', date_of_birth: '1980-05-14', phone: '52205158', emergency_contact: null, address: '粉嶺皇后山邨皇澄樓608室' },
  { name_zh: '張志濤', name_en: 'Cheung Chi To', id_number: 'Z509421(7)', join_date: '2023-04-01', nickname: null, role: '管工', mpf_plan: '宏利', date_of_birth: '1980-12-22', phone: '56683283', emergency_contact: null, address: '上水天平邨天明樓20樓2005室' },
  { name_zh: '張文傑', name_en: 'Cheung Man Kit', id_number: 'Z554579(0)', join_date: '2023-09-11', nickname: '傑仔', role: '機手', mpf_plan: '宏利', date_of_birth: '1983-10-29', phone: '60522566', emergency_contact: null, address: 'NO. 361 CHUEN LUNG VILLAGE, WANG LUNG, TSUEN WAN' },
  { name_zh: '朱偉業', name_en: 'Chu Wai Yip', id_number: 'G403758(7)', join_date: '2023-04-01', nickname: '偉仔', role: '司機', mpf_plan: 'AIA', date_of_birth: '1969-04-10', phone: '92162925', emergency_contact: '96572125(太太)許淑賢', address: '將軍澳廣明苑廣昌閣2樓13室' },
  { name_zh: '鍾子明', name_en: 'Chung Tsz Ming', id_number: 'K025010(4)', join_date: '2023-04-01', nickname: '穿頭', role: '機手', mpf_plan: '宏利', date_of_birth: '1972-05-13', phone: '53281230', emergency_contact: null, address: '元朗錦田錦慶圍錦慶花園25號三樓' },
  { name_zh: '方少輝', name_en: 'Fong Siu Fai', id_number: null, join_date: null, nickname: null, role: '員工', mpf_plan: '宏利', date_of_birth: null, phone: null, emergency_contact: null, address: null },
  { name_zh: '方少芬', name_en: 'Fong Siu Fun', id_number: 'C472872(4)', join_date: null, nickname: null, role: '員工', mpf_plan: '宏利', date_of_birth: '1966-09-25', phone: '60841108', emergency_contact: null, address: null },
  { name_zh: '馮回生', name_en: 'Fung Wui Sang', id_number: 'C249475(0)', join_date: '2024-01-18', nickname: '豬頭', role: '司機', mpf_plan: '過65歲, 不需供', date_of_birth: '1955-08-05', phone: '68000651', emergency_contact: '68000652(太太)唐英', address: '天水圍天恒邨恒欣樓I803室' },
  { name_zh: '侯永強', name_en: 'How Wing Keung', id_number: 'P192807(8)', join_date: null, nickname: null, role: 'T1, T3 安全督導員', mpf_plan: null, date_of_birth: '1968-10-15', phone: '98345009', emergency_contact: '93212039侯奮強(兄弟)', address: '將軍澳煜明苑熹明閣2108室' },
  { name_zh: 'Hussain Babar', name_en: 'Hussain Babar', id_number: 'M612603(6)', join_date: '2025-09-04', nickname: '高佬', role: '雜工', mpf_plan: '東亞', date_of_birth: '1983-07-28', phone: '65776410', emergency_contact: '93908314(仔)', address: 'FLAT A5 9/F BLOCK A FOK MIN BUILDING, 21 BAKER COURT, HUNG HON, KLN' },
  { name_zh: '葉偉聰', name_en: 'Ip, Wai Chung Calvin', id_number: 'K303327(9)', join_date: null, nickname: '聰', role: '散工司機', mpf_plan: null, date_of_birth: '1974-08-04', phone: null, emergency_contact: null, address: null },
  { name_zh: 'KHAN Adil', name_en: 'KHAN Adil', id_number: 'F865782(A)', join_date: '2026-03-02', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '2004-06-16', phone: '91277125', emergency_contact: '65776410(UNCLE:BABARUSSAIN)', address: 'FLAT 225, 2/F, HO CHUEN HOUSE, SHUI CHUEN O, SHATIN, N.T.' },
  { name_zh: '簡優博', name_en: 'KHAN Mohamed Ayub', id_number: 'P874935(7)', join_date: '2026-03-02', nickname: '大飛', role: '雜工', mpf_plan: '東亞', date_of_birth: '1972-04-12', phone: '92178602', emergency_contact: '54045927(SON）', address: 'FLAT 1105, KWONG HIN HOUSE, KWONG TIN ESTATE, LAM TIN, KLN, H.K.' },
  { name_zh: '高永強', name_en: 'Ko Wing Keung', id_number: 'Z128312(0)', join_date: null, nickname: null, role: '機手', mpf_plan: '宏利', date_of_birth: '1983-03-22', phone: '93885649', emergency_contact: null, address: '將軍澳怡明邨怡晴樓0418室' },
  { name_zh: '郭新健', name_en: 'Kwok Sun Kin', id_number: 'D557415(4)', join_date: '2024-02-23', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1967-07-25', phone: '90641717', emergency_contact: null, address: '大嶼山白芒村45號' },
  { name_zh: '郭梓峰', name_en: 'Kwok Tsz Fung', id_number: 'Y557716(9)', join_date: '2023-04-01', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1996-02-10', phone: '60722905', emergency_contact: null, address: '大嶼山白芒村45號' },
  { name_zh: '林頌棋', name_en: 'Lam Chung Ki', id_number: 'Z463470(6)', join_date: '2023-04-01', nickname: null, role: '司機', mpf_plan: 'AIA', date_of_birth: '1981-07-05', phone: '98611864', emergency_contact: '66324601(母親)梅姐', address: '東涌裕東苑向東閣2813室' },
  { name_zh: '李敏區', name_en: 'Li Minqu', id_number: 'F810231(3)', join_date: '2025-12-01', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1986-07-11', phone: '95523448', emergency_contact: '63713337(李彩霞)', address: '新界元朗區天晴邨晴喜樓1801室' },
  { name_zh: '盧光耀', name_en: 'Lo Kwong Yiu', id_number: 'G287616(6)', join_date: null, nickname: '沙僧', role: '司機', mpf_plan: 'AIA', date_of_birth: '1960-12-15', phone: '94576166', emergency_contact: '東涌逸東邨勤逸樓1304室', address: '日薪$800, 租車津貼$100, 津貼$100' },
  { name_zh: '吳子旋', name_en: 'Ng Chi Suen Ken', id_number: 'K277962(5)', join_date: '2024-09-09', nickname: null, role: '司機', mpf_plan: 'AIA', date_of_birth: '1974-05-04', phone: '60983666', emergency_contact: null, address: 'FLAT 10 FLOOR 35 WING LUN HOUSE, SIU LUN COURT , 3 SIU HING LANE, TUEN MUN , N.T.' },
  { name_zh: '吳偉泰', name_en: 'Ng Wai Tai', id_number: 'Z739780(2)', join_date: '2023-04-01', nickname: '泰仔', role: '司機', mpf_plan: 'AIA', date_of_birth: '1986-06-20', phone: '62003030', emergency_contact: '64627722(太太)何寶華', address: '屯門和日邨和麗樓1樓122室' },
  { name_zh: '白志強', name_en: 'Pak Chi Keung', id_number: 'C501990(5)', join_date: '2023-12-27', nickname: null, role: '司機', mpf_plan: 'AIA', date_of_birth: '1964-04-10', phone: '92632207', emergency_contact: null, address: '屯門湖翠路201號兆禧苑雅禧閣(D座)32樓(31/F)2室' },
  { name_zh: '石坤泉', name_en: 'Shi Kunquan', id_number: 'M062276(7)', join_date: '2024-03-13', nickname: null, role: '機手', mpf_plan: '宏利', date_of_birth: '1969-09-10', phone: '66446386', emergency_contact: null, address: '大嶼山東涌怡東路8號裕雅苑雅榮閣C座26樓1室' },
  { name_zh: '岑健權', name_en: 'Shum Kin Kuen', id_number: null, join_date: null, nickname: null, role: '員工', mpf_plan: '宏利(建築)', date_of_birth: null, phone: null, emergency_contact: null, address: null },
  { name_zh: '蘇志雄', name_en: 'So Chi Hung', id_number: 'M347774(1)', join_date: '2023-06-13', nickname: '啤啤雄', role: '雜工', mpf_plan: '東亞', date_of_birth: '1975-07-04', phone: '62349058', emergency_contact: null, address: '華富邨華光樓3字樓316室' },
  { name_zh: '蘇啟泰', name_en: 'So Kai Tai', id_number: 'E731736(4)', join_date: '2023-10-21', nickname: '老泰', role: '司機', mpf_plan: 'AIA', date_of_birth: '1962-04-02', phone: '68920523', emergency_contact: null, address: '天水圍嘉湖山莊景湖居三座28樓C室' },
  { name_zh: '蘇金平', name_en: 'So Kam Ping', id_number: 'R068001(9)', join_date: null, nickname: '平', role: '機手', mpf_plan: '宏利', date_of_birth: '1980-12-29', phone: '67096826', emergency_contact: null, address: '天水圍天恩邨恩頤樓1410室' },
  { name_zh: '鄧傑仁', name_en: 'Tang Kit Yan', id_number: 'K189753(5)', join_date: '2024-04-09', nickname: null, role: '安全督導員', mpf_plan: 'AIA', date_of_birth: '1973-09-04', phone: '96994591', emergency_contact: null, address: 'Flat C, 3/F, Block 1, 25 Sha Tseng Road, Marbella Gardens, Yuen Long, N.T.' },
  { name_zh: '謝文業', name_en: 'Tse Man Yip', id_number: 'C656367(6)', join_date: '2025-02-01', nickname: null, role: '員工', mpf_plan: '宏利(建築)轉宏利(CNL)', date_of_birth: '1971-07-08', phone: '95299860', emergency_contact: null, address: '粉嶺山麗苑梨山閣1011室' },
  { name_zh: '翁長寬', name_en: 'Weng Changkuan', id_number: 'M154574(A)', join_date: '2023-04-01', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1971-06-14', phone: '59384682', emergency_contact: null, address: '新界大埔區仁興街4-10號嘉賢閣4F/B室' },
  { name_zh: '黃輝', name_en: 'Wong Fai', id_number: 'H105231(6)', join_date: '2025-09-09', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1961-06-01', phone: '96399833', emergency_contact: '91631039( 太太)', address: '九龍秀茂坪秀康樓3110室' },
  { name_zh: '黃文麟', name_en: 'Wong Man Lun', id_number: 'Y068231(2)', join_date: '2023-04-01', nickname: null, role: '雜工機手', mpf_plan: '宏利', date_of_birth: '1990-07-29', phone: '63551337', emergency_contact: null, address: '屯門田景邨田裕樓2215室' },
  { name_zh: '黃柏洪', name_en: 'Wong Pak Hung', id_number: 'G174773(7)', join_date: '2023-04-01', nickname: '肥貓', role: '雜工機手', mpf_plan: '宏利', date_of_birth: '1962-08-25', phone: '91464334', emergency_contact: null, address: '梨木樹村樂樹樓1013室' },
  { name_zh: '徐海霖', name_en: 'Xu Hailin', id_number: 'F195757(7)', join_date: '2023-04-01', nickname: '林仔', role: '雜工', mpf_plan: '東亞', date_of_birth: '1987-01-04', phone: '55486345', emergency_contact: null, address: '九龍油麻地文苑街文輝樓中座37號3/F四樓A室' },
  { name_zh: '袁佩芬', name_en: 'Yuen Pui Fan', id_number: 'G283278(9)', join_date: '2023-05-02', nickname: null, role: '員工', mpf_plan: '宏利(建築)', date_of_birth: '1967-06-20', phone: '60260767', emergency_contact: null, address: '西貢宜春街14號3樓(2/F)' },
  { name_zh: '周子青', name_en: 'Zhou Ziqing', id_number: 'M874221(4)', join_date: '2023-04-01', nickname: null, role: '雜工', mpf_plan: '東亞', date_of_birth: '1972-04-16', phone: '52230783', emergency_contact: null, address: '大埔頌雅苑頌真閣2324室' },
  { name_zh: '邱惠文', name_en: null, id_number: null, join_date: null, nickname: null, role: '散工司機', mpf_plan: null, date_of_birth: null, phone: null, emergency_contact: null, address: null },
  { name_zh: '陳敏枝', name_en: null, id_number: null, join_date: null, nickname: null, role: '散工司機', mpf_plan: null, date_of_birth: null, phone: null, emergency_contact: null, address: null },
];

// Role mapping from Chinese to system role codes
const roleMap = {
  '董事': 'director',
  '管工': '管工',
  '科文': '管工',
  '司機': 'driver',
  '機手': 'operator',
  '雜工': 'worker',
  '雜工機手': 'operator',
  '員工': 'worker',
  '安全督導員': '安全督導員',
  'T1, T3 安全督導員': 'T1',
  '散工司機': 'casual_driver',
};

async function main() {
  let updated = 0;
  let notFound = [];
  let errors = [];

  for (const emp of excelData) {
    try {
      // Find employee by name_zh
      const existing = await prisma.employee.findFirst({
        where: { name_zh: emp.name_zh },
      });

      if (!existing) {
        notFound.push(emp.name_zh);
        continue;
      }

      // Build update data - only update fields that have values in Excel
      const updateData = {};

      if (emp.name_en) updateData.name_en = emp.name_en.trim();
      if (emp.id_number) updateData.id_number = emp.id_number;
      if (emp.join_date) updateData.join_date = new Date(emp.join_date);
      if (emp.nickname) updateData.nickname = emp.nickname;
      if (emp.date_of_birth) updateData.date_of_birth = new Date(emp.date_of_birth);
      if (emp.phone) updateData.phone = emp.phone;
      if (emp.emergency_contact) updateData.emergency_contact = emp.emergency_contact;
      if (emp.address) updateData.address = emp.address;
      if (emp.mpf_plan) updateData.mpf_plan = emp.mpf_plan;
      
      // Map role
      if (emp.role) {
        const mappedRole = roleMap[emp.role] || emp.role;
        updateData.role = mappedRole;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.employee.update({
          where: { id: existing.id },
          data: updateData,
        });
        updated++;
        console.log(`✅ Updated: ${emp.name_zh} (id=${existing.id}) - fields: ${Object.keys(updateData).join(', ')}`);
      }
    } catch (e) {
      errors.push({ name: emp.name_zh, error: e.message });
      console.error(`❌ Error updating ${emp.name_zh}:`, e.message);
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound.length}`, notFound);
  console.log(`Errors: ${errors.length}`, errors);

  // Now reassign emp_code based on join_date
  console.log('\n--- Reassigning emp_code based on join_date ---');
  
  // Get ALL active employees (including those not in Excel)
  const allEmployees = await prisma.employee.findMany({
    where: { status: 'active' },
    orderBy: [
      { join_date: 'asc' },
      { id: 'asc' },
    ],
  });

  // Separate into: has join_date vs no join_date
  const withDate = allEmployees.filter(e => e.join_date !== null);
  const withoutDate = allEmployees.filter(e => e.join_date === null);

  // Sort withDate by join_date, then by id for same date
  withDate.sort((a, b) => {
    const da = a.join_date.getTime();
    const db = b.join_date.getTime();
    if (da !== db) return da - db;
    return a.id - b.id;
  });

  // Combine: with date first, then without date
  const sorted = [...withDate, ...withoutDate];

  let codeNum = 1;
  for (const emp of sorted) {
    const newCode = `E${String(codeNum).padStart(3, '0')}`;
    if (emp.emp_code !== newCode) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { emp_code: newCode },
      });
      console.log(`🔄 ${emp.name_zh}: ${emp.emp_code || 'null'} → ${newCode} (join: ${emp.join_date ? emp.join_date.toISOString().slice(0,10) : 'none'})`);
    }
    codeNum++;
  }

  console.log(`\nTotal active employees with emp_code: ${sorted.length}`);
  
  // Also handle inactive employees
  const inactiveEmployees = await prisma.employee.findMany({
    where: { status: 'inactive' },
    orderBy: { id: 'asc' },
  });
  
  for (const emp of inactiveEmployees) {
    const newCode = `E${String(codeNum).padStart(3, '0')}`;
    if (emp.emp_code !== newCode) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: { emp_code: newCode },
      });
    }
    codeNum++;
  }
  
  console.log(`Total inactive employees with emp_code: ${inactiveEmployees.length}`);
  console.log(`Total emp_codes assigned: ${codeNum - 1}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
