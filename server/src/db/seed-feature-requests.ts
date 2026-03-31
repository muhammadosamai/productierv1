import { parseSeedArgs } from './seed-config'
import { runLegacySeedWrapper } from './seed-legacy-wrapper'

export async function seed(args = parseSeedArgs()) {
  await runLegacySeedWrapper('seed-feature-requests.ts', args)
}

if (import.meta.main) {
  seed()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('seed-feature-requests.ts wrapper failed:', error)
      process.exit(1)
    })
}
