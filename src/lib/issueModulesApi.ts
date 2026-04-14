/**
 * Distinct module names for issues in a product (for autocomplete).
 */
export async function fetchDistinctIssueModules(
  product: string,
  token: string | null,
): Promise<string[]> {
  const params = new URLSearchParams({ product })
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`/api/issues/distinct-modules?${params}`, { headers })
  if (!res.ok) return []
  const data = await res.json()
  return Array.isArray(data) ? (data as string[]) : []
}
