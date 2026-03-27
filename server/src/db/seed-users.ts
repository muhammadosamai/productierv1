import bcrypt from 'bcryptjs'
import { db } from './index'
import { users } from './schema'
import { eq } from 'drizzle-orm'

const PASSWORD = 'password123'

const seedUsers = [
  {
    name: 'Sarim Alavi',
    email: 'sarim@productier.com',
    role: 'super_admin' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/1.jpg',
  },
  {
    name: 'James Cooper',
    email: 'james@productier.com',
    role: 'admin' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/2.jpg',
  },
  {
    name: 'Emily Chen',
    email: 'emily@productier.com',
    role: 'product_admin' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/3.jpg',
  },
  {
    name: 'Michael Torres',
    email: 'michael@productier.com',
    role: 'product_manager' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/4.jpg',
  },
  {
    name: 'Olivia Park',
    email: 'olivia@productier.com',
    role: 'business_analyst' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/5.jpg',
  },
  {
    name: 'Daniel Kim',
    email: 'daniel@productier.com',
    role: 'developer' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/6.jpg',
  },
  {
    name: 'Lisa Wang',
    email: 'lisa@productier.com',
    role: 'viewer' as const,
    avatar: 'https://mockmind-api.uifaces.co/content/human/7.jpg',
  },
]

async function seed() {
  console.log('Seeding users...')

  const hashedPassword = await bcrypt.hash(PASSWORD, 10)

  // Remove old super admin if email changed
  await db.delete(users).where(eq(users.email, 'sarah@productier.com'))

  for (const user of seedUsers) {
    try {
      await db.insert(users).values({
        ...user,
        password: hashedPassword,
      }).onConflictDoUpdate({
        target: users.email,
        set: { name: user.name, role: user.role, avatar: user.avatar },
      })

      console.log(`  ✓ ${user.name} (${user.role}) — ${user.email}`)
    } catch (e) {
      console.log(`  ✗ ${user.name} — error: ${(e as Error).message}`)
    }
  }

  console.log('\nDone! All users have password: password123')
  process.exit(0)
}

seed()
