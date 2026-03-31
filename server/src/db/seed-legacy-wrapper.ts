import { parseSeedArgs } from './seed-config'
import { runFullDemoSeed } from './seed-single-org-full'

function printDeprecation(commandName: string) {
  console.warn(`[DEPRECATED] ${commandName} is retired.`)
  console.warn('[DEPRECATED] Routing to the canonical full seed flow: bun run db:seed:full')
  console.warn('[DEPRECATED] This flow resets seeded tables before recreating demo data.')
}

export async function runLegacySeedWrapper(commandName: string, args = parseSeedArgs()) {
  printDeprecation(commandName)
  await runFullDemoSeed(args)
}

