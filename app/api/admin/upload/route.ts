import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Apenas imagens são permitidas' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = path.join(process.cwd(), 'public/uploads');
    await mkdir(uploadDir, { recursive: true });

    // Sanitize filename and add timestamp
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${Date.now()}-${safeName}`;
    const filepath = path.join(uploadDir, filename);

    await writeFile(filepath, buffer);

    return NextResponse.json({ 
      success: true, 
      url: `/uploads/${filename}`,
      originalName: file.name 
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Falha no upload' }, { status: 500 });
  }
}
