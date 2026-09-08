# Mashora — Backend (NestJS)

منصة حجز مواعيد طبية أونلاين: مستخدم يحجز موعدًا لدى طبيب، يدفع عبر بوابة دفع، وبعد
تأكيد الدفع فقط يُنشأ اجتماع Google Meet تلقائيًا.

## الأدوار (Roles)

- **USER**: يبحث عن طبيب، يشوف الفترات المتاحة، يحجز ويدفع، يشوف حجوزاته ورابط الاجتماع.
- **DOCTOR**: يسجّل (يبقى `PENDING` حتى يوافق الأدمن)، يدير فترات توفره (availability slots)،
  يشوف حجوزاته.
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
   `AvailabilitySlot → BOOKED` كلها ضمن transaction واحدة، ثم توليد اجتماع Google Meet.
7. **لا يوجد أي مسار API آخر** يمكنه تحويل حجز إلى `CONFIRMED` أو توليد رابط Meet —
   حتى الأدمن لا يملك زر "تأكيد يدوي". مصدر الحقيقة الوحيد هو webhook البوابة الموقّع.
8. فترات `HELD` التي لا تُدفع خلال `BOOKING_HOLD_MINUTES` (افتراضيًا 15 دقيقة) تُحرَّر
   تلقائيًا عبر مهمة cron كل دقيقة (`BookingsCleanupTask`).
9. كل الـ webhooks (حتى غير الصالحة) تُسجَّل في جدول `WebhookEvent` لأغراض التدقيق
   الأمني، ومعالجة كل حدث دفع مُطبَّقة بشكل idempotent (لا يُعاد إنشاء اجتماع أو تكرار
   تأكيد دفعة سبق تأكيدها).

## تبديل بوابة الدفع

`src/payments/providers/payment-provider.interface.ts` يعرّف واجهة موحّدة
(`createCheckout` + `verifyWebhook`). أضف مزوّدًا جديدًا (مثل `PayTabsProvider`)
يطبّق نفس الواجهة، وسجّله في `payments.module.ts` ضمن الـ factory حسب متغيّر البيئة
`PAYMENT_PROVIDER` — بدون أي تعديل على `BookingsService` أو `PaymentsService`.

## التشغيل محليًا

```bash
cp .env.example .env   # ثم عدّل القيم الحقيقية
npm install
npx prisma migrate dev --name init
npm run start:dev
```

## نقاط API الرئيسية

| Method | Path | من يستخدمه |
|---|---|---|
| POST | /auth/register | الجميع (role: USER أو DOCTOR) |
| POST | /auth/login | الجميع |
| POST | /auth/refresh | الجميع |
| GET | /doctors | عام — تصفح الأطباء المعتمدين |
| GET | /doctors/:doctorId/availability | عام — الفترات المتاحة |
| POST | /availability | DOCTOR — إنشاء فترة توفر |
| POST | /bookings | USER — حجز فترة + بدء الدفع |
| POST | /payments/webhook | بوابة الدفع فقط (public + توقيع HMAC) |
| GET | /bookings/me | USER |
| GET | /bookings/doctor/me | DOCTOR |
| GET | /admin/doctors/pending | ADMIN |
| PATCH | /admin/doctors/:id/approve | ADMIN |
| GET | /admin/bookings | ADMIN |
