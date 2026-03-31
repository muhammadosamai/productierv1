import { parseSeedArgs } from './seed-config'
import { runLegacySeedWrapper } from './seed-legacy-wrapper'

export async function seed(args = parseSeedArgs()) {
  await runLegacySeedWrapper('db:seed', args)
}

if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('db:seed wrapper failed:', error)
      process.exit(1)
    })
}
