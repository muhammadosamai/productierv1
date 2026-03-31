import { eq, inArray, or, sql } from 'drizzle-orm'
import { deliveries, initiativeMembers, initiativeTeams, initiatives, stories, tasks } from '../db/schema'

function teamArraySql(teamIds: string[]) {
  return sql`ARRAY[${sql.join(teamIds.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`
}

export function taskSelfViewCondition(userId: string, teamIds: string[] = []) {
  const conditions: any[] = [
    eq(tasks.ownerUserId, userId),
    eq(tasks.createdByUserId, userId),
    sql`${userId}::uuid = any(${tasks.assigneeUserIds})`,
    sql`${userId}::uuid = any(${tasks.reviewerUserIds})`,
  ]

  if (teamIds.length > 0) {
    const teamArray = teamArraySql(teamIds)
    conditions.push(inArray(tasks.ownerTeamId, teamIds))
    conditions.push(sql`${tasks.assigneeTeamIds} && ${teamArray}`)
    conditions.push(sql`${tasks.reviewerTeamIds} && ${teamArray}`)
  }

  return or(...conditions)!
}

export function storySelfViewCondition(userId: string) {
  return eq(stories.ownerUserId, userId)
}

export function initiativeSelfViewCondition(userId: string, teamIds: string[] = []) {
  const conditions: any[] = [
    eq(initiatives.leaderUserId, userId),
    sql`exists (
      select 1
      from ${initiativeMembers}
      where ${initiativeMembers.initiativeId} = ${initiatives.id}
        and ${initiativeMembers.userId} = ${userId}::uuid
    )`,
  ]

  if (teamIds.length > 0) {
    const teamArray = teamArraySql(teamIds)
    conditions.push(sql`exists (
      select 1
      from ${initiativeTeams}
      where ${initiativeTeams.initiativeId} = ${initiatives.id}
        and ${initiativeTeams.organizationTeamId} = any(${teamArray})
    )`)
  }

  return or(...conditions)!
}

export function deliverySelfViewCondition(userId: string) {
  return eq(deliveries.createdByUserId, userId)
}

export function isTaskSelfVisible(
  userId: string,
  task: {
    ownerUserId: string | null
    ownerTeamId: string | null
    createdByUserId: string | null
    assigneeUserIds: string[] | null
    assigneeTeamIds: string[] | null
    reviewerUserIds: string[] | null
    reviewerTeamIds: string[] | null
  },
  teamIds: string[] = []
) {
  const teamSet = new Set(teamIds)
  if (task.ownerUserId === userId) return true
  if (task.ownerTeamId && teamSet.has(task.ownerTeamId)) return true
  if (task.createdByUserId === userId) return true
  if ((task.assigneeUserIds || []).includes(userId)) return true
  if ((task.assigneeTeamIds || []).some((teamId) => teamSet.has(teamId))) return true
  if ((task.reviewerUserIds || []).includes(userId)) return true
  if ((task.reviewerTeamIds || []).some((teamId) => teamSet.has(teamId))) return true
  return false
}

export function isStorySelfVisible(userId: string, story: { ownerUserId: string | null }) {
  return story.ownerUserId === userId
}

export function isInitiativeSelfVisible(
  userId: string,
  initiative: {
    leaderUserId: string | null
    members?: Array<{ userId: string | null }> | null
    teams?: Array<{ organizationTeamId: string | null }> | null
  },
  teamIds: string[] = [],
) {
  if (initiative.leaderUserId === userId) return true
  if ((initiative.members || []).some((member) => member.userId === userId)) return true
  if (teamIds.length > 0) {
    const teamSet = new Set(teamIds)
    if ((initiative.teams || []).some((team) => team.organizationTeamId && teamSet.has(team.organizationTeamId))) {
      return true
    }
  }
  return false
}

export function isDeliverySelfVisible(userId: string, delivery: { createdByUserId: string | null }) {
  return delivery.createdByUserId === userId
}
