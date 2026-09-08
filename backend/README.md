# Mashora — Backend (NestJS)

منصة استشارات طبية عن بُعد: مستخدم يحجز موعدًا لدى طبيب، يدفع عبر بوابة دفع، وبعد
تأكيد الدفع فقط تُنشأ غرفة فيديو (Daily.co) تلقائيًا. بعد اكتمال الجلسة يكتب الطبيب
تقريرًا طبيًا يُصدَّر PDF ويصل للمريض، ويمكنه تقييم الطبيب.

## الأدوار (Roles)

- **USER**: يبحث عن طبيب، يشوف الفترات المتاحة، يحجز ويدفع، يدخل جلسة الفيديو،
  يستلم تقريره الطبي (PDF)، يقيّم الطبيب بعد الجلسة.
- **DOCTOR**: يسجّل (يبقى `PENDING` حتى يوافق الأدمن)، يدير فترات توفره
  (availability slots)، يشوف حجوزاته، يدير جلسة الفيديو (يبدأها/ينهيها)، يكتب
  التقرير الطبي بعد الجلسة.
- **ADMIN**: يوافق/يرفض/يوقف الأطباء، يشوف كل المستخدمين والحجوزات، يفعّل/يعطّل حسابات.

## آلية منع الالتفاف على الدفع (الجزء الأهم)

1. المستخدم يختار `AvailabilitySlot` مفتوحة (`OPEN`) ويطلب حجزها.
2. الباك-إند، داخل transaction واحدة:
   - يحدّث الـ slot إلى `HELD` **فقط إذا كانت لا تزال `OPEN`** (يمنع اثنين من حجز نفس
     الفترة في نفس اللحظة).
   - ينشئ `Booking` بحالة `PENDING_PAYMENT`.
   - ينشئ عملية دفع لدى البوابة (`Payment` بحالة `CREATED`) ويرجع للمستخدم رابط الدفع.
3. المستخدم يدفع على صفحة البوابة نفسها (خارج تطبيقنا تمامًا).
4. **البوابة فقط** ترسل webhook موقّعًا (HMAC) لمسار `POST /payments/webhook`.
5. الباك-إند يتحقق من التوقيع بمقارنة زمن ثابت (`timingSafeEqual`) — أي فشل في
   التحقق يُرفض فورًا ويُسجَّل في `WebhookEvent` للتدقيق، ولا يغيّر أي حالة.
6. عند نجاح التحقق ونجاح الدفع: تحديث `Payment → PAID`، `Booking → CONFIRMED`،
   `AvailabilitySlot → BOOKED` كلها ضمن transaction واحدة، ثم إنشاء غرفة فيديو
   Daily.co، ثم إرسال إشعار Push للمريض والطبيب.
7. **لا يوجد أي مسار API آخر** يمكنه تحويل حجز إلى `CONFIRMED` أو إنشاء غرفة فيديو —
   حتى الأدمن لا يملك زر "تأكيد يدوي". مصدر الحقيقة الوحيد هو webhook البوابة الموقّع.
8. فترات `HELD` التي لا تُدفع خلال `BOOKING_HOLD_MINUTES` (افتراضيًا 15 دقيقة) تُحرَّر
   تلقائيًا عبر مهمة cron كل دقيقة (`BookingsCleanupTask`).
9. كل الـ webhooks (حتى غير الصالحة) تُسجَّل في جدول `WebhookEvent` لأغراض التدقيق
   الأمني، ومعالجة كل حدث دفع مُطبَّقة بشكل idempotent (لا يُعاد إنشاء غرفة فيديو أو
   تكرار تأكيد دفعة سبق تأكيدها).

## دورة حياة الحجز والجلسة

```text
PENDING_PAYMENT → CONFIRMED → IN_SESSION → COMPLETED
                     │
                     ├──(إلغاء ضمن 24 ساعة)──→ CANCELLED (+ استرداد تلقائي)
                     │
              (انتهت مهلة الدفع)──→ EXPIRED
```

- **CONFIRMED → IN_SESSION**: يحدث تلقائيًا عند أول دخول فعلي لغرفة الفيديو
  (`POST /bookings/:id/video/token`).
- **IN_SESSION → COMPLETED**: الطبيب فقط يُنهي الجلسة صراحة
  (`POST /bookings/:id/video/end`).
- **سياسة الإلغاء**: قبل الدفع (لا تزال `PENDING_PAYMENT`) إلغاء حر فوري. بعد
  التأكيد (`CONFIRMED`) يُسمح بالإلغاء فقط إذا تبقّى 24 ساعة فأكثر على الموعد، ويتم
  استرداد المبلغ تلقائيًا عبر `PaymentProviderAdapter.refund()`. لا إلغاء ممكن أثناء
  أو بعد الجلسة.

## الوحدات (Modules) وأدوارها

| الموديول | الدور |
|---|---|
| `auth` | تسجيل/دخول/JWT (access + refresh + rotation) |
| `users`, `doctors` | ملفات المستخدمين والأطباء، موافقة الأدمن على الأطباء |
| `availability` | فترات توفر الطبيب (slots) |
| `bookings` | إنشاء/إلغاء الحجز، حالاته، cron التنظيف والتذكير |
| `payments` | إنشاء عملية الدفع + استقبال والتحقق من webhook (مصدر الحقيقة الوحيد) |
| `video` | غرف فيديو Daily.co — تُنشأ فقط بعد تأكيد الدفع؛ توليد meeting token آمن |
| `medical-records` | كتابة تقرير الجلسة، توليد PDF (`pdf-lib`)، تخزين محلي، تحميل محمي |
| `reviews` | تقييم المريض للطبيب بعد اكتمال الجلسة، تحديث متوسط التقييم تراكميًا |
| `notifications` | تسجيل أجهزة FCM، إرسال إشعارات Push (best-effort، لا يكسر أي تدفق أساسي) |
| `admin` | إدارة الأطباء/المستخدمين/الحجوزات |

## تبديل بوابة الدفع

`src/payments/providers/payment-provider.interface.ts` يعرّف واجهة موحّدة
(`createCheckout` + `verifyWebhook` + `refund`). أضف مزوّدًا جديدًا (مثل
`PayTabsProvider`) يطبّق نفس الواجهة، وسجّله في `payments.module.ts` ضمن الـ factory
حسب متغيّر البيئة `PAYMENT_PROVIDER` — بدون أي تعديل على `BookingsService` أو
`PaymentsService`.

## التشغيل محليًا

```bash
# من جذر المشروع: تشغيل PostgreSQL عبر Docker (بورت 5434 لتفادي تعارض مع أي postgres محلي آخر)
docker compose up -d postgres

cd backend
cp .env.example .env   # ثم عدّل القيم الحقيقية (JWT secrets, DAILY_API_KEY, Firebase, بوابة الدفع)
npm install
npx prisma migrate dev   # يطبّق الـ migrations الموجودة، لا يحتاج --name لأنها موجودة أصلاً
npm run start:dev
```

### متغيرات بيئة تحتاج قيمًا حقيقية قبل الإنتاج

- `PAYMENT_API_KEY`, `PAYMENT_WEBHOOK_SECRET` — من لوحة تحكم Moyasar (أو البوابة المختارة)
- `DAILY_API_KEY` — من [daily.co](https://daily.co)
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` — من Firebase
  Service Account JSON. بدونها، الإشعارات تُسجَّل فقط في اللوق (simulated) ولا يفشل أي شيء.

## نقاط API الرئيسية

| Method | Path | من يستخدمه |
|---|---|---|
| POST | /auth/register | الجميع (role: USER أو DOCTOR) |
| POST | /auth/login | الجميع |
| POST | /auth/refresh | الجميع |
| GET | /doctors | عام — تصفح الأطباء المعتمدين |
| GET | /doctors/:doctorId/availability | عام — الفترات المتاحة |
| GET | /doctors/:doctorId/reviews | عام — تقييمات طبيب |
| POST | /availability | DOCTOR — إنشاء فترة توفر |
| POST | /bookings | USER — حجز فترة + بدء الدفع |
| POST | /payments/webhook | بوابة الدفع فقط (public + توقيع HMAC) |
| GET | /bookings/me | USER |
| GET | /bookings/doctor/me | DOCTOR |
| DELETE | /bookings/:id | USER — إلغاء (ضمن سياسة الإلغاء) |
| POST | /bookings/:id/video/token | USER/DOCTOR — دخول غرفة الفيديو |
| POST | /bookings/:id/video/end | DOCTOR — إنهاء الجلسة |
| POST | /bookings/:id/medical-record | DOCTOR — كتابة التقرير الطبي |
| GET | /bookings/:id/medical-record/pdf | USER/DOCTOR — تحميل PDF |
| POST | /bookings/:id/review | USER — تقييم الطبيب |
| POST | /notifications/devices | الجميع — تسجيل جهاز لإشعارات Push |
| GET | /admin/doctors/pending | ADMIN |
| PATCH | /admin/doctors/:id/approve | ADMIN |
| GET | /admin/bookings | ADMIN |
