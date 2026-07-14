import { describe, expect, it } from 'vitest';
import { parseCsv, parseEventsCsv } from './csv-woo-import';

describe('parseCsv multiline', () => {
  it('keeps newlines inside quoted fields as one row', () => {
    const csv = [
      '"external_id","title","slug","date","open_time","address","description","image_url"',
      '"62515","Noite Mundial do Rock","noite-mundial-do-rock","2026-07-17 20:00:00","20:00","Lorde Nelson","<br> Noite',
      'Bandas: <br />',
      '- Hit Parade","https://example.com/a.png"',
      '"62723","Lorde Fora da Casinha","slug-2","2026-07-18 20:00:00","20:00","Lorde","desc curta","https://example.com/b.png"',
    ].join('\n');

    const table = parseCsv(csv);
    expect(table.length).toBe(3); // header + 2 events
    expect(table[1][0]).toBe('62515');
    expect(table[1][1]).toBe('Noite Mundial do Rock');
    expect(table[1][6]).toContain('Bandas');
    expect(table[1][7]).toContain('example.com/a.png');
    expect(table[2][0]).toBe('62723');
  });

  it('parseEventsCsv marks both events valid', () => {
    const csv = [
      '"external_id","title","slug","date","open_time","address","description","image_url"',
      '"62515","Noite Mundial do Rock","n","2026-07-17 20:00:00","20:00","Addr","line1',
      'line2","https://x.com/a.png"',
      '"62723","Outro","o","2026-07-18 20:00:00","20:00","Addr","ok","https://x.com/b.png"',
    ].join('\n');

    const r = parseEventsCsv(csv);
    expect(r.validCount).toBe(2);
    expect(r.errorCount).toBe(0);
    expect(r.rows[0].description).toContain('line2');
  });
});
