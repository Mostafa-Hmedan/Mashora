import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile } from 'fs/promises';
import { resolve, extname } from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * تخزين صور محلي عام (uploads/<subDir>/) — يُستخدم لصور QR الخاصة بحسابات الأطباء
 * ولصور إثبات التحويل اليدوي (شام كاش). نفس نمط PdfGeneratorService: نخزّن مسارًا نسبيًا
 * في القاعدة (بفواصل / دائمًا، بغض النظر عن نظام التشغيل)، قابل للاستبدال لاحقًا بـ
 * S3/Firebase Storage دون لمس منطق الخدمات المستدعية.
 */
@Injectable()
export class ImageUploadService {
  constructor(private readonly config: ConfigService) {}

  /**
   * resolve() (لا join) يضمن دائمًا مسارًا مطلقًا حتى لو كانت UPLOADS_ROOT في .env نسبية
   * (مثل "./uploads") — express.sendFile يشترط مسارًا مطلقًا وإلا يرمي خطأ 500.
   */
  private get uploadsRoot() {
    return resolve(this.config.get<string>('UPLOADS_ROOT') ?? 'uploads');
  }

  async saveImage(file: Express.Multer.File, subDir: string): Promise<string> {
    if (!file) throw new BadRequestException('لم يتم إرفاق ملف');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('صيغة الصورة غير مدعومة (PNG, JPG, WEBP فقط)');
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('حجم الصورة يتجاوز الحد المسموح (5 ميجابايت)');
    }

    const dir = resolve(this.uploadsRoot, subDir);
    await mkdir(dir, { recursive: true });

    const fileName = `${randomUUID()}${extname(file.originalname) || '.png'}`;
    await writeFile(resolve(dir, fileName), file.buffer);

    // مسار نسبي بفواصل / صريحة (وليس path.join المعتمد على نظام التشغيل) ليبقى ثابتًا
    // ومحمولاً بين ويندوز ولينكس عند تخزينه في قاعدة البيانات
    return `${subDir}/${fileName}`;
  }

  resolveAbsolutePath(relativePath: string): string {
    return resolve(this.uploadsRoot, relativePath);
  }
}
