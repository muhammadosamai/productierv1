import type { SearchCandidate, SearchMatchKind, SearchResultItem } from './searchTypes'

function keyForCandidate(candidate: Pick<SearchCandidate, 'entityType' | 'id'>): string {
  return `${candidate.entityType}:${candidate.id}`
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

function recencyBoost(updatedAt: string | null): number {
  if (!updatedAt) return 0
  const timestamp = Date.parse(updatedAt)
  if (!Number.isFinite(timestamp)) return 0
  const ageMs = Date.now() - timestamp
  if (ageMs <= 0) return 0.08
  const ageDays = ageMs / (24 * 60 * 60 * 1000)
  if (ageDays >= 45) return 0
  return Number((Math.exp(-ageDays / 14) * 0.08).toFixed(6))
}

function matchKindFor(candidate: SearchCandidate): SearchMatchKind {
  if (candidate.lexicalScore > 0 && candidate.semanticScore > 0) return 'hybrid'
  if (candidate.semanticScore > 0) return 'semantic'
  return 'lexical'
}

export interface SearchRankingProfile {
  queryLength: number
  tokenCount: number
  hasQuotedPhrase: boolean
}

function combinedScore(candidate: SearchCandidate, profile?: SearchRankingProfile): number {
  const lexical = clampScore(candidate.lexicalScore)
  const semantic = clampScore(candidate.semanticScore)
  const shortQueryBias = (profile?.queryLength ?? 0) <= 18 && (profile?.tokenCount ?? 0) <= 3
  let lexicalWeight = shortQueryBias ? 0.76 : 0.62
  if (profile?.hasQuotedPhrase) lexicalWeight = Math.min(0.85, lexicalWeight + 0.06)
  if (candidate.exactTitleMatch) lexicalWeight = Math.min(0.9, lexicalWeight + 0.08)
  const semanticWeight = 1 - lexicalWeight
  const blended = (lexical * lexicalWeight) + (semantic * semanticWeight)
  return Number((blended + recencyBoost(candidate.updatedAt)).toFixed(6))
}

export function mergeCandidates(
  lexicalCandidates: SearchCandidate[],
  semanticCandidates: SearchCandidate[],
  profile?: SearchRankingProfile,
): SearchCandidate[] {
  const merged = new Map<string, SearchCandidate>()

  for (const candidate of lexicalCandidates) {
    const key = keyForCandidate(candidate)
    merged.set(key, {
      ...candidate,
      lexicalScore: clampScore(candidate.lexicalScore),
      semanticScore: clampScore(candidate.semanticScore),
    })
  }

  for (const candidate of semanticCandidates) {
    const key = keyForCandidate(candidate)
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, {
        ...candidate,
        lexicalScore: clampScore(candidate.lexicalScore),
        semanticScore: clampScore(candidate.semanticScore),
      })
      continue
    }
    merged.set(key, {
      ...existing,
      title: existing.title || candidate.title,
      subtitle: existing.subtitle || candidate.subtitle,
      descriptionSnippet: existing.descriptionSnippet || candidate.descriptionSnippet,
      routePath: existing.routePath || candidate.routePath,
      metadata: existing.metadata || candidate.metadata,
      lexicalScore: Math.max(existing.lexicalScore, candidate.lexicalScore),
      semanticScore: Math.max(existing.semanticScore, candidate.semanticScore),
      updatedAt: existing.updatedAt || candidate.updatedAt,
      exactTitleMatch: Boolean(existing.exactTitleMatch || candidate.exactTitleMatch),
      prefixTitleMatch: Boolean(existing.prefixTitleMatch || candidate.prefixTitleMatch),
    })
  }

  return Array.from(merged.values())
    .sort((left, right) => {
      const byScore = combinedScore(right, profile) - combinedScore(left, profile)
      if (Math.abs(byScore) > 0.000001) return byScore
      if (Boolean(right.exactTitleMatch) !== Boolean(left.exactTitleMatch)) {
        return Number(Boolean(right.exactTitleMatch)) - Number(Boolean(left.exactTitleMatch))
      }
      if (Boolean(right.prefixTitleMatch) !== Boolean(left.prefixTitleMatch)) {
        return Number(Boolean(right.prefixTitleMatch)) - Number(Boolean(left.prefixTitleMatch))
      }
      const lexicalTieBreak = clampScore(right.lexicalScore) - clampScore(left.lexicalScore)
      if (Math.abs(lexicalTieBreak) > 0.000001) return lexicalTieBreak
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0
      return rightTime - leftTime
    })
}

export function toResultItem(candidate: SearchCandidate, profile?: SearchRankingProfile): SearchResultItem {
  return {
    id: candidate.id,
    entityType: candidate.entityType,
    title: candidate.title,
    subtitle: candidate.subtitle,
    descriptionSnippet: candidate.descriptionSnippet,
    productId: candidate.productId,
    score: combinedScore(candidate, profile),
    matchedBy: matchKindFor(candidate),
    routePath: candidate.routePath,
    metadata: candidate.metadata,
  }
}
