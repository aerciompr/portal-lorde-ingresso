import { prisma } from '../lib/prisma';
import { addDays, setHours, setMinutes } from 'date-fns';
import bcrypt from 'bcryptjs';

async function main() {
  console.log('🌱 Seeding Lorde Nelson events from live site...');

  // Clear existing for clean dev seed
  await prisma.ticket.deleteMany();
  await prisma.order.deleteMany();
  await prisma.ticketType.deleteMany();
  await prisma.event.deleteMany();

  // Current live events cloned from www.lordenelson.com.br
  // Event 1: COPA DO MUNDO 2026 – 24/06
  const copa = await prisma.event.create({
    data: {
      slug: 'copa-do-mundo-2026-24-06',
      title: 'COPA DO MUNDO 2026 – 24/06',
      description: 'Brasil e Escócia\nDj Zenny\n\nA casa abre às 18 horas.\nOs ingressos serão vendidos até o dia 24/06/2026 às 17:30 ou enquanto durarem os estoques.',
      date: new Date('2026-06-24T18:00:00-03:00'),
      openTime: '18:00',
      salesDeadline: new Date('2026-06-24T17:30:00-03:00'),
      allowCancel: true,
      cancelHoursBefore: 4,
      cancelFeePercent: 20,
      imageUrl: 'https://www.lordenelson.com.br/wp-content/uploads/2026/05/dia-03.png', // from live site for COPA
      address: 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
      ticketTypes: {
        create: [
          {
            name: 'Ingresso Padrão',
            description: 'Entrada geral - Jogo da Copa + atração',
            priceCents: 3500,
            totalQty: 150,
            sold: 8,
            salesEndAt: new Date('2026-06-24T17:30:00-03:00'),
          },
        ],
      },
    },
  });

  // Event 2: Especial Magníficos - 03/07
  await prisma.event.create({
    data: {
      slug: 'especial-magnificos',
      title: 'Especial Magníficos',
      description: 'Especial Magníficos\nAbertura: Cézar Fera\nBanda: Gravidade Nordestina\n\nA casa abre às 20 horas.\nOs ingressos serão vendidos até o dia 03/07/2026 às 19:30 ou enquanto durarem os estoques.',
      date: new Date('2026-07-03T20:00:00-03:00'),
      openTime: '20:00',
      salesDeadline: new Date('2026-07-03T19:30:00-03:00'),
      allowCancel: true,
      cancelHoursBefore: 12,
      cancelFeePercent: 10,
      imageUrl: 'https://www.lordenelson.com.br/wp-content/uploads/2026/06/magnificos.png', // placeholder, use live if available
      address: 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
      ticketTypes: {
        create: [
          {
            name: 'Ingresso Padrão',
            description: 'Entrada geral',
            priceCents: 3000,
            totalQty: 200,
            sold: 0,
            salesEndAt: new Date('2026-07-03T19:30:00-03:00'),
          },
        ],
      },
    },
  });

  // Event 3: Especial Beatles - 11/07
  await prisma.event.create({
    data: {
      slug: 'especial-beatles',
      title: 'Especial Beatles',
      description: 'Especial Beatles\nBanda: Mundo Beatle Mcz\n\nA casa abre às 20 horas.\nOs ingressos serão vendidos até o dia 11/07/2026 às 19:30 ou enquanto durarem os estoques.',
      date: new Date('2026-07-11T20:00:00-03:00'),
      openTime: '20:00',
      salesDeadline: new Date('2026-07-11T19:30:00-03:00'),
      allowCancel: true,
      cancelHoursBefore: 12,
      cancelFeePercent: 10,
      imageUrl: 'https://www.lordenelson.com.br/wp-content/uploads/2026/06/beatles.png', // placeholder
      address: 'Rua Silvério Jorge, 241, Jaraguá, Maceió - AL, 57022-110',
      ticketTypes: {
        create: [
          {
            name: 'Ingresso Padrão',
            description: 'Entrada geral',
            priceCents: 3000,
            totalQty: 200,
            sold: 0,
            salesEndAt: new Date('2026-07-11T19:30:00-03:00'),
          },
        ],
      },
    },
  });

  // Example past order for testing
  const copaTicketType = await prisma.ticketType.findFirst({ where: { eventId: copa.id } });
  if (copaTicketType) {
    await prisma.order.create({
      data: {
        eventId: copa.id,
        buyerName: 'João Silva',
        buyerEmail: 'joao@exemplo.com',
        buyerCpf: '12345678909',
        buyerPasswordHash: await bcrypt.hash('teste123', 10),
        totalCents: 3500,
        status: 'paid',
        paymentGateway: 'mercadopago',
        paymentMethod: 'pix',
        paidAt: new Date(),
        tickets: {
          create: [
            {
              ticketTypeId: copaTicketType.id,
              uniqueCode: 'LN-DEMO01',
              qrPayload: 'LN-DEMO01',
              status: 'valid',
            },
          ],
        },
      },
    });
  }

  console.log('✅ Seeded current live events from www.lordenelson.com.br');
  console.log('Events: copa-do-mundo-2026-24-06, especial-magnificos, especial-beatles');
  console.log('Sample customer login: joao@exemplo.com or CPF 123.456.789-09 with senha teste123 (or use code)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
