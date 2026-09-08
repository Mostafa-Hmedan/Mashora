import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';
import { Role } from '../../common/enums/role.enum';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  // المستخدم يختار فقط بين USER أو DOCTOR عند التسجيل؛ ADMIN لا يُنشأ إلا يدويًا/بواسطة أدمن آخر
  @IsOptional()
  @IsEnum([Role.USER, Role.DOCTOR], { message: 'الدور المسموح به عند التسجيل: USER أو DOCTOR فقط' })
  role?: Role.USER | Role.DOCTOR;

  // مطلوبة فقط عند role = DOCTOR
  @IsOptional()
  @IsString()
  specialty?: string;

  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  consultFeeCents?: number;
}
