import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug?: string[] }> }
) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Build the file path inside public/uploads
  const filePath = path.join(process.cwd(), 'public', 'uploads', ...slug);

  try {
    const fileBuffer = await readFile(filePath);

    // Determine content type based on extension
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'application/octet-stream';
    if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.webp') contentType = 'image/webp';
    else if (ext === '.ico') contentType = 'image/x-icon';

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    // File not found or other error
    return NextResponse.json({ error: 'Image not found' }, { status: 404 });
  }
}
