import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const args = process.argv.slice(2);
  const eventId = args[0];

  if (!eventId) {
    console.log('=== Eventos Cadastrados no Banco ===');
    const events = await prisma.event.findMany({
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    if (events.length === 0) {
      console.log('Nenhum evento encontrado no banco.');
      return;
    }

    events.forEach((e) => {
      console.log(
        `ID: ${e.id} | Slug: ${e.slug} | Pedidos: ${e._count.orders} | Título: ${e.title}`
      );
    });
    console.log('\nUso: npx tsx scripts/clean-event.ts <ID_DO_EVENTO>');
    return;
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      _count: {
        select: { orders: true },
      },
    },
  });

  if (!event) {
    console.error(`Erro: Evento com ID "${eventId}" não encontrado.`);
    return;
  }

  console.log(`\n========================================`);
  console.log(`ATENÇÃO: Você está prestes a excluir o evento:`);
  console.log(`ID: ${event.id}`);
  console.log(`Título: ${event.title}`);
  console.log(`Slug: ${event.slug}`);
  console.log(`Pedidos associados: ${event._count.orders}`);
  console.log(`========================================`);
  console.log(
    `Esta operação é irreversível e irá DELETAR todos os pedidos, ingressos (tickets),`
  );
  console.log(`lotes, tipos de ingressos e solicitações de cancelamento vinculados a ele.`);

  const confirmed = args.includes('--confirm');

  if (!confirmed) {
    console.log('\nPara confirmar a exclusão definitiva, execute novamente com o argumento --confirm:');
    console.log(`npx tsx scripts/clean-event.ts ${eventId} --confirm`);
    return;
  }

  console.log('\nIniciando deleção manual de dados para contornar restrições do banco...');

  // Buscar todas as orders do evento para obter os IDs
  const orders = await prisma.order.findMany({
    where: { eventId },
    select: { id: true },
  });
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length > 0) {
    // 1. Deletar os tickets vinculados a essas orders
    const deletedTickets = await prisma.ticket.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    console.log(`-> ${deletedTickets.count} ingresso(s) (tickets) deletado(s).`);

    // 2. Deletar solicitações de cancelamento vinculadas a essas orders
    const deletedCancellations = await prisma.cancellationRequest.deleteMany({
      where: { orderId: { in: orderIds } },
    });
    console.log(`-> ${deletedCancellations.count} solicitação(ões) de cancelamento deletada(s).`);

    // 3. Deletar as orders do evento
    const deletedOrders = await prisma.order.deleteMany({
      where: { eventId },
    });
    console.log(`-> ${deletedOrders.count} pedido(s) deletado(s).`);
  } else {
    console.log('-> Nenhum pedido associado para deletar.');
  }

  // 4. Deletar lotes do evento
  const deletedLotes = await prisma.lote.deleteMany({
    where: { eventId },
  });
  console.log(`-> ${deletedLotes.count} lote(s) deletado(s).`);

  // 5. Deletar ticketTypes do evento
  const deletedTicketTypes = await prisma.ticketType.deleteMany({
    where: { eventId },
  });
  console.log(`-> ${deletedTicketTypes.count} tipo(s) de ingresso deletado(s).`);

  // 6. Deletar o evento
  await prisma.event.delete({
    where: { id: eventId },
  });
  console.log(`-> Evento "${event.title}" deletado com sucesso.`);
}

main()
  .catch((e) => {
    console.error('Erro na execução do script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
