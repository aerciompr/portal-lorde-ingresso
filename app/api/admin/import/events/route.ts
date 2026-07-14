import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAdminMutation } from '@/lib/request-security';
import { parseEventsCsv, slugify } from '@/lib/csv-woo-import';

/**
 * POST multipart: file (CSV) + action=preview|import + replace=0|1
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdminMutation(req);
  if (gate !== true) return gate;

  const form = await req.formData();
  const action = String(form.get('action') || 'preview');
  const replace = String(form.get('replace') || '0') === '1';
  const file = form.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Envie um arquivo CSV' }, { status: 400 });
  }

  const text = await file.text();
  const parsed = parseEventsCsv(text);

  if (action === 'preview') {
    return NextResponse.json({
      ok: true,
      type: 'events',
      fileName: file.name,
      total: parsed.rows.length,
      validCount: parsed.validCount,
      errorCount: parsed.errorCount,
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
  const errors: { row: number; msg: string }[] = [];

  for (const r of valid) {
    try {
      const externalKey = `woo-event-${r.external_id}`;
      // slug estável preferindo external
      let slug = slugify(r.slug || r.title);
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
        r.open_time ||
        (r.date.length >= 16 ? r.date.slice(11, 16) : '20:00');
      const description =
        (r.description || '') + `\n\n[woo:event:${r.external_id}]`;

      if (existingByMeta && replace) {
        await prisma.event.update({
          where: { id: existingByMeta.id },
          data: {
            title: r.title.slice(0, 500),
            date: Number.isFinite(date.getTime()) ? date : existingByMeta.date,
            openTime,
            address: (r.address || existingByMeta.address).slice(0, 500),
            description,
          },
        });
        updated += 1;
        continue;
      }

      // garantir slug único
      slug = `woo-${r.external_id}`;
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
          allowCancel: true,
        },
      });
      created += 1;
      void externalKey;
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
    errors,
  });
}
