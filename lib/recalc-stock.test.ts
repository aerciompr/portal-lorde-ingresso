import { describe, expect, it } from 'vitest';
import { matchTicketTypeToLote, productIdFromLoteNome } from './lote-match';

describe('matchTicketTypeToLote', () => {
  const types = [
    {
      id: 'tt1',
      description: '[woo:product:62517] capacity=30',
      priceCents: 3000,
      sold: 30,
      totalQty: 30,
    },
    {
      id: 'tt2',
      description: '[woo:product:62902] capacity=40',
      priceCents: 3500,
      sold: 12,
      totalQty: 40,
    },
  ];

  it('extracts product id from lote name', () => {
    expect(productIdFromLoteNome('Lote 1 (#62902)')).toBe('62902');
  });

  it('matches active lote to its ticket type not the first sold-out type', () => {
    const matched = matchTicketTypeToLote(
      { nome: 'Lote 1 (#62902)', precoCents: 3500 },
      types
    );
    expect(matched?.id).toBe('tt2');
  });
});
