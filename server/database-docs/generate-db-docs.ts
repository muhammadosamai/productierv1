import { writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { getDatabaseConfig } from '../src/config/database'

type TableMeta = {
  table_schema: string
  table_name: string
  table_comment: string | null
}

type ColumnMeta = {
  table_schema: string
  table_name: string
  column_name: string
  ordinal_position: number
  data_type: string
  udt_name: string
  is_nullable: 'YES' | 'NO'
  column_default: string | null
  column_comment: string | null
}

type PrimaryKeyRow = {
  table_name: string
  column_name: string
}

type ForeignKeyRow = {
  table_name: string
  column_name: string
  foreign_table_name: string
  foreign_column_name: string
}

type EnumRow = {
  enum_name: string
  enum_value: string
}

type ValueSummary =
  | { mode: 'empty'; values: string[] }
  | { mode: 'unique'; values: string[] }
  | { mode: 'sample'; values: string[] }

const DATABASE_URL = getDatabaseConfig().url

function quoteIdent(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`
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

function toDisplayType(column: ColumnMeta): string {
  if (column.data_type === 'ARRAY') {
    const elementType = column.udt_name.startsWith('_') ? column.udt_name.slice(1) : column.udt_name
    return `${elementType}[]`
  }
  if (column.data_type === 'USER-DEFINED') {
    return column.udt_name
  }
  return column.data_type
}

function redactDatabaseUrl(connectionString: string): string {
  try {
    const parsed = new URL(connectionString)
    const dbName = parsed.pathname.replace(/^\//, '') || '(unknown_db)'
    const port = parsed.port || '(default)'
    return `${parsed.protocol}//${parsed.hostname}:${port}/${dbName}`
  } catch {
    return 'unparseable DATABASE_URL'
  }
}

function formatDefault(value: string | null): string | null {
  if (!value) return null
  return truncate(cleanWhitespace(value), 80)
}

function inferTableDescription(tableName: string, tableComment: string | null): string {
  if (tableComment && tableComment.trim().length > 0) return cleanWhitespace(tableComment)
  return `Stores ${humanize(tableName)} records used by the application.`
}

function inferColumnDescription(
  column: ColumnMeta,
  isPrimaryKey: boolean,
  foreignKeys: ForeignKeyRow[],
  enumValues: string[],
): string {
  if (column.column_comment && column.column_comment.trim().length > 0) {
    return cleanWhitespace(column.column_comment)
  }

  const parts: string[] = []
  const name = column.column_name

  if (isPrimaryKey) {
    parts.push('Primary key for this table.')
  } else if (foreignKeys.length > 0) {
    const references = foreignKeys
      .map((fk) => `${fk.foreign_table_name}.${fk.foreign_column_name}`)
      .join(', ')
    parts.push(`Foreign key reference to ${references}.`)
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
    parts.push(`Stores ${humanize(name)}.`)
  }

  if (enumValues.length > 0) {
    parts.push(`Allowed enum values: ${enumValues.join(', ')}.`)
  }

  parts.push(column.is_nullable === 'NO' ? 'Required field.' : 'Optional field.')

  const defaultValue = formatDefault(column.column_default)
  if (defaultValue) {
    parts.push(`Default: ${defaultValue}.`)
  }

  return parts.join(' ')
}

async function getValueSummary(
  sql: postgres.Sql,
  tableSchema: string,
  tableName: string,
  columnName: string,
): Promise<ValueSummary> {
  const qualifiedTable = `${quoteIdent(tableSchema)}.${quoteIdent(tableName)}`
  const quotedColumn = quoteIdent(columnName)

  try {
    const distinct = await sql.unsafe<{ value: string | null }[]>(`
      SELECT DISTINCT ${quotedColumn}::text AS value
      FROM ${qualifiedTable}
      WHERE ${quotedColumn} IS NOT NULL
      LIMIT 6
    `)

    const distinctValues = distinct
      .map((row) => row.value)
      .filter((value): value is string => value !== null)
      .map((value) => truncate(cleanWhitespace(value)))

    if (distinctValues.length === 0) {
      return { mode: 'empty', values: [] }
    }

    if (distinctValues.length <= 5) {
      return { mode: 'unique', values: distinctValues }
    }

    const sampleRows = await sql.unsafe<{ value: string | null }[]>(`
      SELECT ${quotedColumn}::text AS value
      FROM ${qualifiedTable}
      WHERE ${quotedColumn} IS NOT NULL
      LIMIT 5
    `)

    const samples = sampleRows
      .map((row) => row.value)
      .filter((value): value is string => value !== null)
      .map((value) => truncate(cleanWhitespace(value)))

    return { mode: 'sample', values: samples }
  } catch {
    return { mode: 'sample', values: ['(unavailable)'] }
  }
}

function formatValueSummary(summary: ValueSummary): string {
  if (summary.mode === 'empty') {
    return 'No non-null data yet'
  }

  if (summary.mode === 'unique') {
    return `Unique values (${summary.values.length}): ${summary.values.join(', ')}`
  }

  if (summary.values.length === 0) {
    return 'Sample unavailable'
  }

  return `Sample values: ${summary.values.join(', ')}`
}

async function getRowCount(sql: postgres.Sql, tableSchema: string, tableName: string): Promise<number> {
  const qualifiedTable = `${quoteIdent(tableSchema)}.${quoteIdent(tableName)}`
  const result = await sql.unsafe<{ count: string }[]>(`SELECT COUNT(*)::text AS count FROM ${qualifiedTable}`)
  return Number(result[0]?.count ?? '0')
}

async function main(): Promise<void> {
  const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  })

  try {
    const tables = await sql<TableMeta[]>`
      SELECT
        t.table_schema,
        t.table_name,
        obj_description(format('%I.%I', t.table_schema, t.table_name)::regclass, 'pg_class') AS table_comment
      FROM information_schema.tables t
      WHERE t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `

    const columns = await sql<ColumnMeta[]>`
      SELECT
        c.table_schema,
        c.table_name,
        c.column_name,
        c.ordinal_position,
        c.data_type,
        c.udt_name,
        c.is_nullable,
        c.column_default,
        col_description(format('%I.%I', c.table_schema, c.table_name)::regclass::oid, c.ordinal_position) AS column_comment
      FROM information_schema.columns c
      WHERE c.table_schema = 'public'
      ORDER BY c.table_name, c.ordinal_position
    `

    const primaryKeys = await sql<PrimaryKeyRow[]>`
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
    `

    const foreignKeys = await sql<ForeignKeyRow[]>`
      SELECT
        tc.table_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.column_name
    `

    const enums = await sql<EnumRow[]>`
      SELECT
        t.typname AS enum_name,
        e.enumlabel AS enum_value
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `

    const columnsByTable = new Map<string, ColumnMeta[]>()
    for (const column of columns) {
      const key = `${column.table_schema}.${column.table_name}`
      const list = columnsByTable.get(key) ?? []
      list.push(column)
      columnsByTable.set(key, list)
    }

    const primaryKeySet = new Set(primaryKeys.map((pk) => `${pk.table_name}.${pk.column_name}`))

    const foreignKeyMap = new Map<string, ForeignKeyRow[]>()
    for (const fk of foreignKeys) {
      const key = `${fk.table_name}.${fk.column_name}`
      const list = foreignKeyMap.get(key) ?? []
      list.push(fk)
      foreignKeyMap.set(key, list)
    }

    const enumMap = new Map<string, string[]>()
    for (const row of enums) {
      const existing = enumMap.get(row.enum_name) ?? []
      existing.push(row.enum_value)
      enumMap.set(row.enum_name, existing)
    }

    const docLines: string[] = []
    docLines.push('# Database Schema Documentation')
    docLines.push('')
    docLines.push(`- Generated: ${new Date().toISOString()}`)
    docLines.push(`- Database target: \`${redactDatabaseUrl(DATABASE_URL)}\``)
    docLines.push(`- Schema: \`public\``)
    docLines.push('')

    for (const table of tables) {
      const tableKey = `${table.table_schema}.${table.table_name}`
      const tableColumns = columnsByTable.get(tableKey) ?? []
      const rowCount = await getRowCount(sql, table.table_schema, table.table_name)

      docLines.push(`## Table: \`${table.table_name}\``)
      docLines.push('')
      docLines.push(`**Description:** ${inferTableDescription(table.table_name, table.table_comment)}`)
      docLines.push('')
      docLines.push(`**Row count:** ${rowCount}`)
      docLines.push('')
      docLines.push('| Column | Schema | Description | Observed values |')
      docLines.push('| --- | --- | --- | --- |')

      for (const column of tableColumns) {
        const pkKey = `${table.table_name}.${column.column_name}`
        const isPrimaryKey = primaryKeySet.has(pkKey)
        const references = foreignKeyMap.get(pkKey) ?? []
        const enumValues = column.data_type === 'USER-DEFINED'
          ? (enumMap.get(column.udt_name) ?? [])
          : []

        const valueSummary = await getValueSummary(
          sql,
          table.table_schema,
          table.table_name,
          column.column_name,
        )

        const schemaParts: string[] = [toDisplayType(column)]
        schemaParts.push(column.is_nullable === 'NO' ? 'NOT NULL' : 'NULLABLE')
        if (isPrimaryKey) schemaParts.push('PRIMARY KEY')
        const defaultValue = formatDefault(column.column_default)
        if (defaultValue) schemaParts.push(`DEFAULT ${defaultValue}`)
        if (references.length > 0) {
          const refs = references
            .map((fk) => `${fk.foreign_table_name}.${fk.foreign_column_name}`)
            .join(', ')
          schemaParts.push(`FK -> ${refs}`)
        }

        const description = inferColumnDescription(column, isPrimaryKey, references, enumValues)
        const observedValues = formatValueSummary(valueSummary)

        docLines.push(
          `| \`${escapeMdCell(column.column_name)}\` | ${escapeMdCell(schemaParts.join(' | '))} | ${escapeMdCell(description)} | ${escapeMdCell(observedValues)} |`,
        )
      }

      docLines.push('')
    }

    const scriptDir = path.dirname(fileURLToPath(import.meta.url))
    const outputPath = path.join(scriptDir, 'database-schema.md')
    writeFileSync(outputPath, `${docLines.join('\n')}\n`, 'utf8')

    console.log(`Database documentation written to: ${outputPath}`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((error) => {
  console.error('Failed to generate database documentation:', error)
  process.exit(1)
})
