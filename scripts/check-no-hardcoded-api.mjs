import { readdir, readFile, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SRC_DIR = join(ROOT, 'src')

const ALLOWED_PATHS = new Set([
  `src${sep}lib${sep}apiClient.ts`,
])

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.vue'])

const directApiFetch = /fetch\s*\(\s*(['"`])\/api\//g
const directApiConstant = /const\s+[A-Z0-9_]+\s*=\s*(['"`])\/api\b/g

function extname(filePath) {
  const idx = filePath.lastIndexOf('.')
  return idx >= 0 ? filePath.slice(idx) : ''
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await walk(full)))
    } else if (entry.isFile()) {
      files.push(full)
    }
  }
  return files
}

function isAllowed(relPath) {
  return ALLOWED_PATHS.has(relPath)
}

function findLine(content, index) {
  const before = content.slice(0, index)
  return before.split('\n').length
}

async function main() {
  const srcStat = await stat(SRC_DIR).catch(() => null)
  if (!srcStat?.isDirectory()) {
    console.error('Could not find src/ directory.')
    process.exit(1)
  }

  const files = await walk(SRC_DIR)
  const violations = []

  for (const filePath of files) {
    if (!CODE_EXTENSIONS.has(extname(filePath))) continue

    const rel = relative(ROOT, filePath)
    if (isAllowed(rel)) continue

    const content = await readFile(filePath, 'utf8')

    for (const pattern of [directApiFetch, directApiConstant]) {
      pattern.lastIndex = 0
      let match
      while ((match = pattern.exec(content)) !== null) {
        violations.push({
          file: rel,
          line: findLine(content, match.index),
          snippet: match[0],
        })
      }
    }
  }

  if (violations.length === 0) {
    console.log('No hardcoded /api fetch usage found.')
    return
  }

  console.error('Hardcoded /api usage detected outside apiClient:')
  for (const violation of violations) {
    console.error(`- ${violation.file}:${violation.line} -> ${violation.snippet}`)
  }
  process.exit(1)
}

await main()
