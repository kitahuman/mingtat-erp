const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({ datasources: { db: { url: '***REDACTED_DATABASE_URL***' } } });

async function main() {
  // Clear emp_code for all inactive employees
  const result = await prisma.employee.updateMany({
    where: { status: 'inactive' },
    data: { emp_code: null },
  });
  console.log(`Cleared emp_code for ${result.count} inactive employees`);

  // Verify
  const active = await prisma.employee.findMany({
    where: { status: 'active', emp_code: { not: null } },
    orderBy: { emp_code: 'asc' },
  });
  console.log(`Active employees with emp_code: ${active.length}`);
  console.log(`First: ${active[0]?.emp_code} ${active[0]?.name_zh}`);
  console.log(`Last: ${active[active.length-1]?.emp_code} ${active[active.length-1]?.name_zh}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
