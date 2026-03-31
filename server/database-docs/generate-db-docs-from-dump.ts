import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

type TableInfo = {
  name: string
  columns: ColumnInfo[]
  rowCount: number
}

type ColumnInfo = {
  name: string
  ordinal: number
  type: string
  nullable: boolean
  defaultValue: string | null
}

type ForeignKeyInfo = {
  table: string
  column: string
  foreignTable: string
  foreignColumn: string
}

type ValueSummary =
  | { mode: 'empty'; values: string[] }
  | { mode: 'unique'; values: string[] }
  | { mode: 'sample'; values: string[] }

function unquoteIdentifier(value: string): string {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"')
  }
  return trimmed
}

function cleanWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function truncate(value: string, max = 90): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function escapeMdCell(value: string): string {
  return value
    .replace(/\|/g, '\\|')
    .replace(/`/g, '\\`')
    .replace(/\r?\n/g, '<br>')
}

function humanize(name: string): string {
  return name.replace(/_/g, ' ')
}

function splitIdentifiers(list: string): string[] {
  return list
    .split(',')
    .map((item) => unquoteIdentifier(item))
    .filter((item) => item.length > 0)
}

function decodeCopyValue(value: string): string {
  return value
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\\\/g, '\\')
}

function parseColumnLine(line: string): { name: string; definition: string } | null {
  const trimmed = line.trim().replace(/,$/, '')
  if (!trimmed || trimmed.startsWith('CONSTRAINT')) return null

  if (trimmed.startsWith('"')) {
    const match = trimmed.match(/^"((?:[^"]|"")+)"\s+(.+)$/)
    if (!match) return null
    return { name: match[1]!.replace(/""/g, '"'), definition: match[2]!.trim() }
  }

  const match = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s+(.+)$/)
  if (!match) return null
  return { name: match[1]!, definition: match[2]!.trim() }
}

function extractType(definition: string): string {
  const marker = definition.search(/\s(?=COLLATE|DEFAULT|NOT NULL|NULL|CONSTRAINT|CHECK|REFERENCES)/i)
  return marker >= 0 ? definition.slice(0, marker).trim() : definition.trim()
}

function extractDefault(definition: string): string | null {
  const match = definition.match(/\bDEFAULT\s+(.+?)(?=\s+(?:NOT NULL|NULL|CONSTRAINT|CHECK|REFERENCES)\b|$)/i)
  if (!match) return null
  return cleanWhitespace(match[1]!)
}

function inferTableDescription(tableName: string): string {
  return `Stores ${humanize(tableName)} records used by the application.`
}

function inferColumnDescription(
  table: string,
  column: ColumnInfo,
  isPrimaryKey: boolean,
  foreignKeys: ForeignKeyInfo[],
  enumValues: string[],
): string {
  const parts: string[] = []
  const name = column.name

  if (isPrimaryKey) {
    parts.push('Primary key for this table.')
  } else if (foreignKeys.length > 0) {
    const refs = foreignKeys.map((fk) => `${fk.foreignTable}.${fk.foreignColumn}`).join(', ')
    parts.push(`Foreign key reference to ${refs}.`)
  } else if (name === 'created_at') {
    parts.push('Timestamp when this row was created.')
  } else if (name === 'updated_at') {
    parts.push('Timestamp when this row was last updated.')
  } else if (name === 'deleted_at') {
    parts.push('Timestamp when this row was soft-deleted.')
  } else if (name.endsWith('_id')) {
    parts.push(`Identifier for related ${humanize(name.replace(/_id$/, ''))}.`)
  } else if (name === 'title') {
    parts.push('Human-readable short title.')
  } else if (name === 'name') {
    parts.push('Display name for this record.')
  } else if (name === 'description') {
    parts.push('Long-form descriptive text.')
  } else if (name === 'status') {
    parts.push('Lifecycle state for this record.')
  } else if (name === 'priority') {
    parts.push('Priority level used for sorting/planning.')
  } else if (name === 'type') {
    parts.push('Category/type classification.')
  } else if (name === 'email') {
    parts.push('Email address value.')
  } else if (name === 'password') {
    parts.push('Password hash value.')
  } else {
    parts.push(`Stores ${humanize(name)} for ${humanize(table)}.`)
  }

  if (enumValues.length > 0) {
    parts.push(`Allowed enum values: ${enumValues.join(', ')}.`)
  }

  parts.push(column.nullable ? 'Optional field.' : 'Required field.')
  if (column.defaultValue) {
    parts.push(`Default: ${truncate(column.defaultValue, 80)}.`)
  }

  return parts.join(' ')
}

function formatValueSummary(summary: ValueSummary): string {
  if (summary.mode === 'empty') return 'No non-null data yet'
  if (summary.mode === 'unique') return `Unique values (${summary.values.length}): ${summary.values.join(', ')}`
  if (summary.values.length === 0) return 'Sample unavailable'
  return `Sample values: ${summary.values.join(', ')}`
}

function main(): void {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const defaultDumpPath = path.resolve(scriptDir, '..', '..', 'productier_export.sql')
  const dumpPath = process.env.SQL_DUMP_PATH
    ? path.resolve(process.cwd(), process.env.SQL_DUMP_PATH)
    : defaultDumpPath

  const dump = readFileSync(dumpPath, 'utf8')
  const lines = dump.split(/\r?\n/)

  const enumMap = new Map<string, string[]>()
  const tables = new Map<string, TableInfo>()
  const valueSets = new Map<string, Set<string>>()
  const valueSamples = new Map<string, string[]>()
  const primaryKeySet = new Set<string>()
  const foreignKeys: ForeignKeyInfo[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!.trim()

    const enumStart = line.match(/^CREATE TYPE public\.("?[\w]+"?) AS ENUM \($/)
    if (enumStart) {
      const enumName = unquoteIdentifier(enumStart[1]!)
      const labels: string[] = []
      i += 1
      while (i < lines.length && lines[i]!.trim() !== ');') {
        const labelLine = lines[i]!.trim().replace(/,$/, '')
        const labelMatch = labelLine.match(/^'(.*)'$/)
        if (labelMatch) {
          labels.push(labelMatch[1]!.replace(/''/g, "'"))
        }
        i += 1
      }
      enumMap.set(enumName, labels)
      continue
    }

    const tableStart = line.match(/^CREATE TABLE public\.("?[\w]+"?) \($/)
    if (tableStart) {
      const tableName = unquoteIdentifier(tableStart[1]!)
      const columns: ColumnInfo[] = []
      let ordinal = 1
      i += 1

      while (i < lines.length && lines[i]!.trim() !== ');') {
        const parsed = parseColumnLine(lines[i]!)
        if (parsed) {
          const type = extractType(parsed.definition).replace(/^public\./, '')
          const defaultValue = extractDefault(parsed.definition)
          const nullable = !/\bNOT NULL\b/i.test(parsed.definition)
          columns.push({
            name: parsed.name,
            ordinal,
            type,
            nullable,
            defaultValue,
          })
          ordinal += 1
        }
        i += 1
      }

      tables.set(tableName, {
        name: tableName,
        columns,
        rowCount: 0,
      })
      continue
    }

    const copyStart = line.match(/^COPY public\.("?[\w]+"?) \((.+)\) FROM stdin;$/)
    if (copyStart) {
      const tableName = unquoteIdentifier(copyStart[1]!)
      const copyColumns = splitIdentifiers(copyStart[2]!)
      const table = tables.get(tableName)

      i += 1
      while (i < lines.length && lines[i]!.trim() !== '\\.') {
        const rawRow = lines[i]!
        const values = rawRow.split('\t')
        if (table) table.rowCount += 1

        for (let index = 0; index < copyColumns.length; index += 1) {
          const columnName = copyColumns[index]!
          const rawValue = values[index]
          if (rawValue === undefined || rawValue === '\\N') continue

          const normalized = truncate(cleanWhitespace(decodeCopyValue(rawValue)))
          if (!normalized) continue

          const key = `${tableName}.${columnName}`
          const uniqueSet = valueSets.get(key) ?? new Set<string>()
          if (uniqueSet.size < 6) uniqueSet.add(normalized)
          valueSets.set(key, uniqueSet)

          const samples = valueSamples.get(key) ?? []
          if (samples.length < 5) samples.push(normalized)
          valueSamples.set(key, samples)
        }

        i += 1
      }
      continue
    }

    const alterTableStart = line.match(/^ALTER TABLE ONLY public\.("?[\w]+"?)$/)
    if (alterTableStart) {
      const tableName = unquoteIdentifier(alterTableStart[1]!)
      let statement = line
      i += 1
      while (i < lines.length) {
        statement += ` ${lines[i]!.trim()}`
        if (lines[i]!.trim().endsWith(';')) break
        i += 1
      }

      const pkMatch = statement.match(/PRIMARY KEY \(([^)]+)\)/i)
      if (pkMatch) {
        const columns = splitIdentifiers(pkMatch[1]!)
        for (const column of columns) {
          primaryKeySet.add(`${tableName}.${column}`)
        }
      }

      const fkMatch = statement.match(/FOREIGN KEY \(([^)]+)\) REFERENCES public\.("?[\w]+"?)\(([^)]+)\)/i)
      if (fkMatch) {
        const localColumns = splitIdentifiers(fkMatch[1]!)
        const foreignTable = unquoteIdentifier(fkMatch[2]!)
        const foreignColumns = splitIdentifiers(fkMatch[3]!)

        const maxLen = Math.min(localColumns.length, foreignColumns.length)
        for (let idx = 0; idx < maxLen; idx += 1) {
          foreignKeys.push({
            table: tableName,
            column: localColumns[idx]!,
            foreignTable,
            foreignColumn: foreignColumns[idx]!,
          })
        }
      }
      continue
    }
  }

  const foreignKeyMap = new Map<string, ForeignKeyInfo[]>()
  for (const fk of foreignKeys) {
    const key = `${fk.table}.${fk.column}`
    const list = foreignKeyMap.get(key) ?? []
    list.push(fk)
    foreignKeyMap.set(key, list)
  }

  const linesOut: string[] = []
  linesOut.push('# Database Schema Documentation')
  linesOut.push('')
  linesOut.push(`- Generated: ${new Date().toISOString()}`)
  linesOut.push(`- Source: SQL dump file \`${dumpPath}\``)
  linesOut.push('- Mode: offline (parsed from dump because DB service was unavailable)')
  linesOut.push('')

  const sortedTables = Array.from(tables.values()).sort((a, b) => a.name.localeCompare(b.name))
  for (const table of sortedTables) {
    linesOut.push(`## Table: \`${table.name}\``)
    linesOut.push('')
    linesOut.push(`**Description:** ${inferTableDescription(table.name)}`)
    linesOut.push('')
    linesOut.push(`**Row count:** ${table.rowCount}`)
    linesOut.push('')
    linesOut.push('| Column | Schema | Description | Observed values |')
    linesOut.push('| --- | --- | --- | --- |')

    const sortedColumns = [...table.columns].sort((a, b) => a.ordinal - b.ordinal)
    for (const column of sortedColumns) {
      const key = `${table.name}.${column.name}`
      const isPrimaryKey = primaryKeySet.has(key)
      const refs = foreignKeyMap.get(key) ?? []
      const enumValues = enumMap.get(column.type) ?? []

      const uniques = Array.from(valueSets.get(key) ?? [])
      const samples = valueSamples.get(key) ?? []
      let summary: ValueSummary
      if (uniques.length === 0) {
        summary = { mode: 'empty', values: [] }
      } else if (uniques.length <= 5) {
        summary = { mode: 'unique', values: uniques }
      } else {
        summary = { mode: 'sample', values: samples.slice(0, 5) }
      }

      const schemaParts: string[] = [column.type]
      schemaParts.push(column.nullable ? 'NULLABLE' : 'NOT NULL')
      if (isPrimaryKey) schemaParts.push('PRIMARY KEY')
      if (column.defaultValue) schemaParts.push(`DEFAULT ${truncate(column.defaultValue, 80)}`)
      if (refs.length > 0) {
        schemaParts.push(
          `FK -> ${refs.map((fk) => `${fk.foreignTable}.${fk.foreignColumn}`).join(', ')}`,
        )
      }

      const description = inferColumnDescription(table.name, column, isPrimaryKey, refs, enumValues)
      linesOut.push(
        `| \`${escapeMdCell(column.name)}\` | ${escapeMdCell(schemaParts.join(' | '))} | ${escapeMdCell(description)} | ${escapeMdCell(formatValueSummary(summary))} |`,
      )
    }

    linesOut.push('')
  }

  const outputPath = path.join(scriptDir, 'database-schema.md')
  writeFileSync(outputPath, `${linesOut.join('\n')}\n`, 'utf8')
  console.log(`Database documentation written to: ${outputPath}`)
}

main()
