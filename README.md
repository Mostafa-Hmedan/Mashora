# Mashora

منصة استشارات طبية عن بُعد (Telemedicine): مستخدم يحجز موعدًا لدى طبيب، يدفع عبر بوابة
دفع، وبعد تأكيد الدفع فقط تُنشأ جلسة فيديو تلقائيًا داخل التطبيق.

## بنية المشروع

```text
Mashora/
├── docker-compose.yml   # PostgreSQL للتطوير المحلي (بورت 5434)
├── backend/             # الـ API — NestJS + Prisma + PostgreSQL
└── frontend/            # (قيد التطوير من طرف آخر)
```

## البدء السريع

```bash
docker compose up -d postgres
cd backend
cp .env.example .env   # عدّل القيم الحقيقية قبل التشغيل
npm install
npx prisma migrate dev
npm run start:dev
```

للتفاصيل الكاملة (الأدوار، آلية الدفع والأمان، دورة حياة الحجز، الوحدات، نقاط الـ API):
راجع **[backend/README.md](backend/README.md)**.
