import { parseSeedArgs } from './seed-config'
import { runLegacySeedWrapper } from './seed-legacy-wrapper'

export async function seedWiki(args = parseSeedArgs()) {
  await runLegacySeedWrapper('seed-wiki.ts', args)
}

if (import.meta.main) {
  seedWiki()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('seed-wiki.ts wrapper failed:', error)
      process.exit(1)
    })
}
