import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** يعلّم مسارًا كعام لا يتطلب JWT (مثل تسجيل الدخول أو webhook الدفع). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
