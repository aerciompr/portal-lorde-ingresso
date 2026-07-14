import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Sincronizando lotes ativos ===');
  // Busca todos os eventos
  const events = await prisma.event.findMany({
    include: {
      lotes: {
        where: { ativo: true },
        orderBy: { ordem: 'asc' },
      },
    },
  });

  let updatedCount = 0;

  for (const event of events) {
    if (event.activeLoteId) {
      console.log(
        `Evento "${event.title}" já possui o lote ativo associado (ID: ${event.activeLoteId}).`
      );
      continue;
    }

    // Pega o primeiro lote marcado como ativo
    const activeLote = event.lotes[0];

    if (activeLote) {
      await prisma.event.update({
        where: { id: event.id },
        data: { activeLoteId: activeLote.id },
      });
      console.log(
        `-> Sincronizado: Evento "${event.title}" -> Lote Ativo: "${activeLote.nome}" (Preço: R$ ${activeLote.precoCents / 100})`
      );
      updatedCount++;
    } else {
      console.log(`Evento "${event.title}" não possui nenhum lote ativo cadastrado.`);
    }
  }

  console.log(`\nSincronização concluída. ${updatedCount} evento(s) atualizado(s).`);
}

main()
  .catch((e) => {
    console.error('Erro na execução do script:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
