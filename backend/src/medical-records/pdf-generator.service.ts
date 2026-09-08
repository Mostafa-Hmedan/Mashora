import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

interface MedicationInput {
  name: string;
  dosage: string;
  duration: string;
}

interface GeneratePdfParams {
  recordId: string;
  patientName: string;
  doctorName: string;
  diagnosis: string;
  medications: MedicationInput[];
  followUpNotes?: string;
  followUpDate?: Date;
  sessionDate: Date;
}

/**
 * يولّد ملف PDF لتقرير الجلسة الطبية ويخزّنه محليًا على قرص السيرفر.
 * التخزين محلي الآن (uploads/medical-records/) — قابل للاستبدال لاحقًا بـ S3/Firebase Storage
 * بدون أي تغيير في MedicalRecordsService (فقط هذا الملف يتغيّر).
 */
@Injectable()
export class PdfGeneratorService {
  constructor(private readonly config: ConfigService) {}

  private get storageDir() {
    return this.config.get<string>('MEDICAL_RECORDS_STORAGE_DIR') ?? join(process.cwd(), 'uploads', 'medical-records');
  }

  async generateMedicalRecordPdf(params: GeneratePdfParams): Promise<string> {
    const doc = await PDFDocument.create();
    const page = doc.addPage([595, 842]); // A4
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    let y = 800;
    const left = 50;
    const lineGap = 22;

    const drawLine = (text: string, useBold = false, size = 12) => {
      page.drawText(text, { x: left, y, size, font: useBold ? bold : font, color: rgb(0, 0, 0) });
      y -= lineGap;
    };

    drawLine('Medical Consultation Report', true, 18);
    y -= 6;
    drawLine(`Report ID: ${params.recordId}`);
    drawLine(`Session Date: ${params.sessionDate.toISOString().slice(0, 10)}`);
    drawLine(`Patient: ${params.patientName}`);
    drawLine(`Doctor: ${params.doctorName}`);
    y -= 10;

    drawLine('Diagnosis:', true, 14);
    drawLine(params.diagnosis);
    y -= 10;

    drawLine('Medications:', true, 14);
    if (params.medications.length === 0) {
      drawLine('None prescribed.');
    } else {
      for (const med of params.medications) {
        drawLine(`- ${med.name} — ${med.dosage} — ${med.duration}`);
      }
    }
    y -= 10;

    if (params.followUpNotes) {
      drawLine('Follow-up Notes:', true, 14);
      drawLine(params.followUpNotes);
      y -= 10;
    }
    if (params.followUpDate) {
      drawLine(`Follow-up Date: ${params.followUpDate.toISOString().slice(0, 10)}`, true);
    }

    const pdfBytes = await doc.save();

    await mkdir(this.storageDir, { recursive: true });
    const fileName = `${params.recordId}.pdf`;
    const fullPath = join(this.storageDir, fileName);
    await writeFile(fullPath, pdfBytes);

    // نخزّن مسارًا نسبيًا في القاعدة (وليس المسار المطلق على القرص) ليبقى محمولاً بين البيئات
    return join('medical-records', fileName);
  }

  resolveAbsolutePath(relativePath: string): string {
    return join(this.config.get<string>('UPLOADS_ROOT') ?? join(process.cwd(), 'uploads'), relativePath);
  }
}
