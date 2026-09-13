import { Prisma, PrismaClient } from '@prisma/client';

/**
 * حماية شاملة: passwordHash يُحذف تلقائيًا من نتيجة أي استعلام على موديل User، سواء
 * استُعلم عنه مباشرة (user.findMany) أو تداخل ضمن موديل آخر (booking.include.user).
 * هذا يمنع نهائيًا فئة الأخطاء المكتشفة سابقًا (تسريب passwordHash عبر include: user: true
 * في عدة موديولز) دون الاعتماد على انضباط كل استعلام يدويًا.
 *
 * ⚠️ الاستثناء الوحيد: AuthService.login يحتاج passwordHash فعليًا لمقارنته عند تسجيل
 * الدخول — يتجاوز هذا الامتداد صراحة عبر findUserWithPasswordHash (استعلام SQL خام)
 * بدل query builder العادي.
 *
 * تقنيًا: Prisma 6 أزالت $use (middleware الكلاسيكي)، والبديل الوحيد المتبقي $extends
 * يُرجع نوعًا جديدًا (لا class تقليدي) — لذلك PrismaService هنا export type وليس export
 * class، ويُصنع عبر factory في PrismaModule بدل `new PrismaService()` مباشرة. الاستخدام
 * في كل مكان آخر بالمشروع (constructor(private readonly prisma: PrismaService)) لا يتغيّر.
 */
function deepStripPasswordHash<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepStripPasswordHash(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('passwordHash' in obj) {
      delete obj.passwordHash;
    }
    for (const key of Object.keys(obj)) {
      obj[key] = deepStripPasswordHash(obj[key]);
    }
  }
  return value;
}

export function createPrismaService() {
  const client = new PrismaClient();

  return client.$extends({
    name: 'strip-password-hash',
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const result = await query(args);
          return deepStripPasswordHash(result);
        },
      },
    },
  });
}

// نوع الخدمة الممتدة — يُستخدم كنوع الحقن في كل موديول بالمشروع، بنفس الاسم القديم
export type PrismaService = ReturnType<typeof createPrismaService>;

/**
 * المسار الوحيد المسموح به لجلب passwordHash فعليًا — يُستخدم حصرًا من AuthService.login.
 * دالة مستقلة (لا method على PrismaService) لأن $extends يُرجع كائنًا لا يقبل إضافة methods
 * مخصصة عليه مباشرة بسهولة؛ تستقبل نفس عميل Prisma وتنفّذ استعلام SQL خام يتجاوز
 * $allOperations أعلاه (الذي لا يمر عليه $queryRaw أصلًا).
 */
export async function findUserWithPasswordHash(prisma: PrismaService, email: string) {
  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      email: string;
      passwordHash: string;
      fullName: string;
      role: string;
      isActive: boolean;
    }>
  >(Prisma.sql`SELECT id, email, "passwordHash", "fullName", role, "isActive" FROM users WHERE email = ${email} LIMIT 1`);
  return rows[0] ?? null;
}
