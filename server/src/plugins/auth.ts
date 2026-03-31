import { Elysia } from 'elysia'
import { SignJWT, decodeProtectedHeader, importPKCS8, importSPKI, jwtVerify } from 'jose'
import { getAuthConfig } from '../config/auth'

const authConfig = getAuthConfig()

type JwtPayload = {
  userId: string
  role: string
  [key: string]: unknown
}

type ImportedPrivateKey = Awaited<ReturnType<typeof importPKCS8>>
type ImportedPublicKey = Awaited<ReturnType<typeof importSPKI>>

interface JwtService {
  sign(payload: JwtPayload): Promise<string>
  verify(token: string): Promise<(JwtPayload & { exp?: number; iat?: number }) | false>
}

function createJwtService(): JwtService {
  let importedKeysPromise: Promise<{
    privateKey: ImportedPrivateKey
    publicKeysByKid: Map<string, ImportedPublicKey>
  }> | null = null

  const importKeys = async () => {
    if (importedKeysPromise) return importedKeysPromise

    importedKeysPromise = (async () => {
      const privateKey = await importPKCS8(
        authConfig.jwtActivePrivateKeyPem,
        authConfig.jwtAlgorithm,
      )

      const publicKeysByKid = new Map<string, ImportedPublicKey>()
      for (const [kid, publicKeyPem] of Object.entries(authConfig.jwtPublicKeysByKid)) {
        const key = await importSPKI(publicKeyPem, authConfig.jwtAlgorithm)
        publicKeysByKid.set(kid, key)
      }

      return { privateKey, publicKeysByKid }
    })()

    return importedKeysPromise
  }

  return {
    async sign(payload) {
      const { privateKey } = await importKeys()
      return await new SignJWT(payload)
        .setProtectedHeader({
          alg: authConfig.jwtAlgorithm,
          kid: authConfig.jwtActiveKid,
          typ: 'JWT',
        })
        .setIssuer(authConfig.jwtIssuer)
        .setAudience(authConfig.jwtAudience)
        .setIssuedAt()
        .setExpirationTime(authConfig.jwtAccessTtl)
        .sign(privateKey)
    },

    async verify(token) {
      if (!token || typeof token !== 'string') return false

      let kid: string
      try {
        const protectedHeader = decodeProtectedHeader(token)
        if (protectedHeader.alg !== authConfig.jwtAlgorithm) return false
        if (typeof protectedHeader.kid !== 'string' || !protectedHeader.kid.trim()) return false
        kid = protectedHeader.kid
      } catch {
        return false
      }

      const { publicKeysByKid } = await importKeys()
      const verificationKey = publicKeysByKid.get(kid)
      if (!verificationKey) return false

      try {
        const { payload } = await jwtVerify(token, verificationKey, {
          algorithms: [authConfig.jwtAlgorithm],
          issuer: authConfig.jwtIssuer,
          audience: authConfig.jwtAudience,
        })
        return payload as JwtPayload & { exp?: number; iat?: number }
      } catch {
        return false
      }
    },
  }
}

export const authPlugin = new Elysia({ name: 'auth-plugin' })
  .decorate('jwt', createJwtService())
