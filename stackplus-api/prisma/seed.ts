import { prisma } from '../src/lib/prisma'
import * as bcrypt from 'bcryptjs'

async function main() {
  console.log('🌱 Seeding database...')

  // Clean up
  await prisma.transaction.deleteMany()
  await prisma.playerSessionState.deleteMany()
  await prisma.session.deleteMany()
  await prisma.homeGameMember.deleteMany()
  await prisma.homeGame.deleteMany()
  await prisma.user.deleteMany()

  // Create users
  const password = await bcrypt.hash('123456', 10)

  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@test.com',
      passwordHash: password,
      role: 'ADMIN',
    },
  })

  const host = await prisma.user.create({
    data: {
      name: 'Host User',
      email: 'host@test.com',
      passwordHash: password,
      role: 'HOST',
    },
  })

  const player1 = await prisma.user.create({
    data: {
      name: 'João Silva',
      email: 'joao@test.com',
      passwordHash: password,
      role: 'PLAYER',
    },
  })

  const player2 = await prisma.user.create({
    data: {
      name: 'Maria Santos',
      email: 'maria@test.com',
      passwordHash: password,
      role: 'PLAYER',
    },
  })

  const cashier = await prisma.user.create({
    data: {
      name: 'Cashier User',
      email: 'cashier@test.com',
      passwordHash: password,
      role: 'CASHIER',
    },
  })

  // Create home game
  const homeGame = await prisma.homeGame.create({
    data: {
      name: 'Mesa de Texas Hold\'em',
      gameType: 'CASH_GAME',
      address: 'Rua das Flores, 123',
      dayOfWeek: 'Friday',
      startTime: '20:00',
      chipValue: 0.5,
      hostId: host.id,
      joinCode: 'MESA123',
    },
  })

  // Add members
  await prisma.homeGameMember.createMany({
    data: [
      { homeGameId: homeGame.id, userId: player1.id },
      { homeGameId: homeGame.id, userId: player2.id },
      { homeGameId: homeGame.id, userId: cashier.id },
    ],
  })

  console.log('✅ Seed completed!')
  console.log('\n📝 Test Accounts:')
  console.log('Admin: admin@test.com / 123456')
  console.log('Host: host@test.com / 123456')
  console.log('Player 1: joao@test.com / 123456')
  console.log('Player 2: maria@test.com / 123456')
  console.log('Cashier: cashier@test.com / 123456')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
