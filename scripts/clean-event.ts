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

  console.log('\nIniciando deleção no banco de dados...');

  // 1. Deletar as orders do evento (isso deletará tickets e cancellationRequests em cascata)
  const deletedOrders = await prisma.order.deleteMany({
    where: { eventId },
  });
  console.log(`-> ${deletedOrders.count} pedido(s) deletado(s) em cascata.`);

  // 2. Deletar o evento (isso deletará lotes e ticketTypes em cascata)
  await prisma.event.delete({
    where: { id: eventId },
  });
  console.log(`-> Evento "${event.title}" e seus lotes deletados com sucesso.`);
}

main()
  .catch((e) => {
    console.error('Erro na execução do script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
