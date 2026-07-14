import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';
import { parseEventsCsv } from '@/lib/csv-woo-import';
import { downloadAndStoreEventImage } from '@/lib/import-download-image';

/**
 * POST multipart: file (CSV) + action=preview|import + replace=0|1 + download_images=0|1
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const form = await req.formData();
  const action = String(form.get('action') || 'preview');
  const replace = String(form.get('replace') || '0') === '1';
  const downloadImages = String(form.get('download_images') || '1') !== '0';
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo CSV' }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseEventsCsv(text);

  if (action === 'preview') {
    const withImg = parsed.rows.filter((r) => r.image_url && /^https?:\/\//i.test(r.image_url));
    return NextResponse.json({
      ok: true,
      type: 'events',
      fileName: file.name,
      total: parsed.rows.length,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
      withImageUrl: withImg.length,
      rows: parsed.rows,
    });
  }

  if (action !== 'import') {
    return NextResponse.json({ error: 'action inválida' }, { status: 400 });
  }

  const valid = parsed.rows.filter((r) => r._errors.length === 0);
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let imagesOk = 0;
  let imagesFail = 0;
  const errors: { row: number; msg: string }[] = [];

  for (const r of valid) {
    try {
      const existingByMeta = await prisma.event.findFirst({
        where: {
          OR: [
            { slug: `woo-${r.external_id}` },
            { description: { contains: `[woo:event:${r.external_id}]` } },
          ],
        },
      });

      if (existingByMeta && !replace) {
        skipped += 1;
        continue;
      }

      const date = new Date(r.date.includes('T') ? r.date : r.date.replace(' ', 'T') + '-03:00');
      const openTime =
        r.open_time || (r.date.length >= 16 ? r.date.slice(11, 16) : '20:00');
      const description = `${r.description || ''}\n\n[woo:event:${r.external_id}]`.trim();

      let imageUrl: string | null = existingByMeta?.imageUrl || null;
      if (downloadImages && r.image_url && /^https?:\/\//i.test(r.image_url)) {
        const dl = await downloadAndStoreEventImage(r.image_url);
        if ('url' in dl) {
          imageUrl = dl.url;
          imagesOk += 1;
        } else {
          imagesFail += 1;
          // fallback: URL original se download falhar
          if (!imageUrl) imageUrl = r.image_url;
        }
      } else if (r.image_url && /^https?:\/\//i.test(r.image_url)) {
        imageUrl = r.image_url;
      }

      if (existingByMeta && replace) {
        await prisma.event.update({
          where: { id: existingByMeta.id },
          data: {
            title: r.title.slice(0, 500),
            date: Number.isFinite(date.getTime()) ? date : existingByMeta.date,
            openTime,
            address: (r.address || existingByMeta.address).slice(0, 500),
            description,
            imageUrl,
          },
        });
        updated += 1;
        continue;
      }

      const slug = `woo-${r.external_id}`;
      let n = 0;
      let trySlug = slug;
      while (await prisma.event.findUnique({ where: { slug: trySlug } })) {
        n += 1;
        trySlug = `${slug}-${n}`;
      }

      await prisma.event.create({
        data: {
          title: r.title.slice(0, 500),
          slug: trySlug,
          date: Number.isFinite(date.getTime()) ? date : new Date(),
          openTime,
          address: (r.address || 'Lorde Nelson Rest Pub — Maceió/AL').slice(0, 500),
          description,
          imageUrl,
          allowCancel: true,
        },
      });
      created += 1;
    } catch (e) {
      errors.push({ row: r._row, msg: (e as Error).message });
    }
  }

  return NextResponse.json({
    ok: true,
    type: 'events',
    created,
    updated,
    skipped,
    imagesOk,
    imagesFail,
    errors,
  });
}
