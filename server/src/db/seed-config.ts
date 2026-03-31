import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { readEnv, readRequiredEnv } from '../config/env'
import { readPublicEnv } from '../config/publicRuntimeConfig'
import { db } from './index'
import { products, userRoleEnum } from './schema'

export type SeedUserRole = (typeof userRoleEnum.enumValues)[number]

export type SeedUserProfile = {
  name: string
  email: string
  role: SeedUserRole
  avatar: string
}

export type SeedProductProfile = {
  name: string
  description?: string
  logo?: string
}

export type SeedProfilePack = {
  users?: SeedUserProfile[]
  product?: SeedProductProfile
  products?: SeedProductProfile[]
}

type SeedProfileRequirement = 'users' | 'product' | 'products'

export type LoadedSeedProfilePack = {
  profile: SeedProfilePack
  resolvedPath: string
  source: 'default' | 'override'
}

export type ParsedSeedArgs = {
  values: Map<string, string | true>
}

export type ProductSelector = {
  productId?: string
  productName?: string
}

const ROLE_SET = new Set<string>(userRoleEnum.enumValues)
const OVERRIDE_PROFILE_KEYS = ['profile', 'profile-path', 'pack', 'pack-path']
const PRODUCT_ID_KEYS = ['product-id']
const PRODUCT_NAME_KEYS = ['product-name', 'product']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function requireStringField(value: unknown, label: string): string {
  const normalized = normalizeOptionalString(value)
  if (!normalized) {
    throw new Error(`Seed profile is invalid: "${label}" must be a non-empty string.`)
  }
  return normalized
}

function resolvePath(input: string): string {
  return path.isAbsolute(input) ? input : path.resolve(process.cwd(), input)
}

function getArgValue(args: ParsedSeedArgs, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = args.values.get(key)
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }
  return undefined
}

export function parseSeedArgs(argv: readonly string[] = process.argv.slice(2)): ParsedSeedArgs {
  const values = new Map<string, string | true>()

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] ?? ''
    if (!token.startsWith('--')) continue

    const body = token.slice(2).trim()
    if (!body) continue

    const equalIndex = body.indexOf('=')
    if (equalIndex >= 0) {
      const key = body.slice(0, equalIndex).trim()
      const value = body.slice(equalIndex + 1).trim()
      if (key) values.set(key, value)
      continue
    }

    const key = body
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      values.set(key, next.trim())
      i += 1
      continue
    }

    values.set(key, true)
  }

  return { values }
}

function validateUsers(rawUsers: unknown): SeedUserProfile[] {
  if (!Array.isArray(rawUsers)) {
    throw new Error('Seed profile is invalid: "users" must be an array.')
  }
  if (rawUsers.length === 0) {
    throw new Error('Seed profile is invalid: "users" cannot be empty.')
  }

  const seenEmails = new Set<string>()
  const users = rawUsers.map((rawUser, index) => {
    if (!isPlainObject(rawUser)) {
      throw new Error(`Seed profile is invalid: users[${index}] must be an object.`)
    }

    const name = requireStringField(rawUser.name, `users[${index}].name`)
    const email = requireStringField(rawUser.email, `users[${index}].email`).toLowerCase()
    const role = requireStringField(rawUser.role, `users[${index}].role`)
    const avatar = requireStringField(rawUser.avatar, `users[${index}].avatar`)

    if (!ROLE_SET.has(role)) {
      throw new Error(
        `Seed profile is invalid: users[${index}].role "${role}" is not supported. Allowed roles: ${userRoleEnum.enumValues.join(', ')}.`,
      )
    }
    if (seenEmails.has(email)) {
      throw new Error(`Seed profile is invalid: duplicate user email "${email}".`)
    }

    seenEmails.add(email)
    return { name, email, role: role as SeedUserRole, avatar }
  })

  return users
}

function validateProduct(rawProduct: unknown): SeedProductProfile {
  if (!isPlainObject(rawProduct)) {
    throw new Error('Seed profile is invalid: "product" must be an object.')
  }
  const name = requireStringField(rawProduct.name, 'product.name')
  const description = normalizeOptionalString(rawProduct.description)
  const logo = normalizeOptionalString(rawProduct.logo)
  return { name, description, logo }
}

function validateProducts(rawProducts: unknown): SeedProductProfile[] {
  if (!Array.isArray(rawProducts)) {
    throw new Error('Seed profile is invalid: "products" must be an array.')
  }
  if (rawProducts.length === 0) {
    throw new Error('Seed profile is invalid: "products" cannot be empty.')
  }

  const seenNames = new Set<string>()
  return rawProducts.map((rawProduct, index) => {
    const validated = validateProduct(rawProduct)
    const normalizedName = validated.name.toLowerCase()
    if (seenNames.has(normalizedName)) {
      throw new Error(`Seed profile is invalid: duplicate product name "${validated.name}".`)
    }
    seenNames.add(normalizedName)
    return validated
  })
}

function validateSeedProfile(
  rawProfile: unknown,
  requiredSections: readonly SeedProfileRequirement[],
): SeedProfilePack {
  if (!isPlainObject(rawProfile)) {
    throw new Error('Seed profile is invalid: root must be a JSON object.')
  }

  const hasUsers = Object.prototype.hasOwnProperty.call(rawProfile, 'users')
  const hasProduct = Object.prototype.hasOwnProperty.call(rawProfile, 'product')
  const hasProducts = Object.prototype.hasOwnProperty.call(rawProfile, 'products')

  if (requiredSections.includes('users') && !hasUsers) {
    throw new Error('Seed profile is invalid: missing required "users" section.')
  }
  if (requiredSections.includes('product') && !hasProduct && !hasProducts) {
    throw new Error('Seed profile is invalid: missing required "product" or "products" section.')
  }
  if (requiredSections.includes('products') && !hasProducts) {
    throw new Error('Seed profile is invalid: missing required "products" section.')
  }

  const profile: SeedProfilePack = {}
  if (hasUsers) profile.users = validateUsers(rawProfile.users)
  if (hasProduct) profile.product = validateProduct(rawProfile.product)
  if (hasProducts) profile.products = validateProducts(rawProfile.products)
  return profile
}

export function resolveRequiredSeedPassword(): string {
  const password = readRequiredEnv(
    'SEED_DEMO_PASSWORD',
    'required for demo seed scripts (set this in server/.env or shell env)',
  )
  const normalized = password.trim()
  if (!normalized) {
    throw new Error('SEED_DEMO_PASSWORD cannot be empty.')
  }
  return normalized
}

export function resolveEndpointTestSeedPassword(): string {
  const endpointTestPassword = readEnv('SEED_ENDPOINT_TEST_PASSWORD')
  const normalized = endpointTestPassword?.trim()
  if (normalized) {
    return normalized
  }
  return resolveRequiredSeedPassword()
}

export function resolveSeedProfileOverridePath(
  args: ParsedSeedArgs,
  envNames: readonly string[] = ['SEED_PROFILE_PATH'],
): string | undefined {
  const fromArgs = getArgValue(args, OVERRIDE_PROFILE_KEYS)
  if (fromArgs) return resolvePath(fromArgs)

  for (const envName of envNames) {
    const value = (
      envName === 'SEED_PROFILE_PATH'
      || envName === 'SEED_FULL_PACK_PATH'
      || envName === 'SEED_USERS_PACK_PATH'
    )
      ? readPublicEnv(envName)
      : readEnv(envName)
    if (value) return resolvePath(value)
  }
  return undefined
}

export async function loadSeedProfilePack(options: {
  defaultPath: string
  args?: ParsedSeedArgs
  envNames?: readonly string[]
  requiredSections?: readonly SeedProfileRequirement[]
}): Promise<LoadedSeedProfilePack> {
  const args = options.args ?? parseSeedArgs()
  const envNames = options.envNames ?? ['SEED_PROFILE_PATH']
  const requiredSections = options.requiredSections ?? []
  const defaultPath = resolvePath(options.defaultPath)
  const overridePath = resolveSeedProfileOverridePath(args, envNames)
  const resolvedPath = overridePath ?? defaultPath
  const source: LoadedSeedProfilePack['source'] = overridePath ? 'override' : 'default'

  const rawContent = await readFile(resolvedPath, 'utf8')
  let parsed: unknown
  try {
    parsed = JSON.parse(rawContent)
  } catch (error) {
    throw new Error(
      `Could not parse seed profile JSON at "${resolvedPath}": ${(error as Error).message}`,
      { cause: error },
    )
  }

  const profile = validateSeedProfile(parsed, requiredSections)
  return { profile, resolvedPath, source }
}

export function resolveProductSelector(
  args: ParsedSeedArgs,
  options?: {
    productIdEnvName?: string
    productNameEnvName?: string
    requireExplicit?: boolean
  },
): ProductSelector {
  const productIdEnv = options?.productIdEnvName ?? 'SEED_PRODUCT_ID'
  const productNameEnv = options?.productNameEnvName ?? 'SEED_PRODUCT_NAME'
  const requireExplicit = options?.requireExplicit ?? false

  const productId = getArgValue(args, PRODUCT_ID_KEYS) ?? normalizeOptionalString(readEnv(productIdEnv))
  const productName = getArgValue(args, PRODUCT_NAME_KEYS) ?? normalizeOptionalString(readEnv(productNameEnv))

  if (requireExplicit && !productId && !productName) {
    throw new Error(
      `Missing explicit product selector. Provide --product-id/--product-name or set ${productIdEnv}/${productNameEnv}.`,
    )
  }

  return { productId, productName }
}

export async function resolveProductId(options: {
  selector: ProductSelector
  requireExplicit?: boolean
}): Promise<string> {
  const requireExplicit = options.requireExplicit ?? false
  const selector = options.selector

  if (selector.productId) {
    const byId = await db.query.products.findFirst({
      where: eq(products.id, selector.productId),
      columns: { id: true, name: true },
    })
    if (!byId) {
      throw new Error(`No product found for --product-id "${selector.productId}".`)
    }
    if (selector.productName && byId.name !== selector.productName) {
      throw new Error(
        `Product selector mismatch: --product-id resolved "${byId.name}", but --product-name is "${selector.productName}".`,
      )
    }
    return byId.id
  }

  if (selector.productName) {
    const byName = await db.query.products.findFirst({
      where: eq(products.name, selector.productName),
      columns: { id: true },
    })
    if (!byName) {
      throw new Error(`No product found for --product-name "${selector.productName}".`)
    }
    return byName.id
  }

  if (requireExplicit) {
    throw new Error('Missing explicit product selector.')
  }

  const [firstProduct] = await db
    .select({ id: products.id })
    .from(products)
    .limit(1)

  if (!firstProduct) {
    throw new Error('No products found in database. Seed a product first or provide explicit product input.')
  }

  return firstProduct.id
}

