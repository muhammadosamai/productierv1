import bcrypt from 'bcryptjs'
import { db } from './index'
import { users } from './schema'
import { loadSeedProfilePack, parseSeedArgs, resolveRequiredSeedPassword } from './seed-config'

const DEFAULT_USERS_PROFILE_PATH = 'src/db/seed-profiles/users-default.json'

export async function seedUsers(args = parseSeedArgs()) {
  console.log('Seeding users...')

  const password = resolveRequiredSeedPassword()
  const loadedProfile = await loadSeedProfilePack({
    defaultPath: DEFAULT_USERS_PROFILE_PATH,
    args,
    envNames: ['SEED_USERS_PACK_PATH', 'SEED_PROFILE_PATH'],
    requiredSections: ['users'],
  })
  const seedUsers = loadedProfile.profile.users ?? []
  const hashedPassword = await bcrypt.hash(password, 10)

  console.log(`Loaded ${seedUsers.length} users from ${loadedProfile.source} profile: ${loadedProfile.resolvedPath}`)

  for (const user of seedUsers) {
    try {
      await db.insert(users).values({
        ...user,
        password: hashedPassword,
      }).onConflictDoUpdate({
        target: users.email,
        set: {
          name: user.name,
          role: user.role,
          avatar: user.avatar,
          password: hashedPassword,
        },
      })

      console.log(`  [OK] ${user.name} (${user.role}) - ${user.email}`)
    } catch (error) {
      console.log(`  [ERR] ${user.name} - error: ${(error as Error).message}`)
    }
  }

  console.log('\nDone. Users seeded with password from SEED_DEMO_PASSWORD.')
}

if (import.meta.main) {
  seedUsers()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('User seed failed:', error)
      process.exit(1)
    })
}
