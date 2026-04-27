import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../database/index.js';
import { users, userGroups, userGroupMembers, adGroupMappings, authProviders } from '../database/schema.js';
import { authMiddleware, uuidSchema } from '@oao/shared';

const rbacRouter = new Hono();
rbacRouter.use('/*', authMiddleware);

async function requireWorkspaceAdmin(c: Context, next: Next): Promise<Response | void> {
  const user = c.get('user');
  if (user.role !== 'workspace_admin' && user.role !== 'super_admin') {
    return c.json({ error: 'Workspace admin access required' }, 403);
  }
  if (!user.workspaceId) {
    return c.json({ error: 'No workspace context' }, 403);
  }
  await next();
}
rbacRouter.use('/*', requireWorkspaceAdmin);

const ROLES = ['super_admin', 'workspace_admin', 'creator_user', 'view_user'] as const;
const roleEnum = z.enum(ROLES);

const ROLE_DESCRIPTIONS: Record<(typeof ROLES)[number], string> = {
  super_admin: 'Platform-wide access. Can create/delete workspaces and move users between them.',
  workspace_admin: 'Full control over agents, workflows, users, models and settings within their assigned workspace.',
  creator_user: 'Create and manage own agents and workflows. Read access to workspace-scoped resources.',
  view_user: 'Read-only access to agents, workflows and executions in the workspace.',
};

/**
 * GET /summary — for the workspace, returns one bucket per role with:
 *  - users        : direct holders of that role (users.role)
 *  - groups       : user-groups currently flagged as "assigned to" that role
 *                   (because every member of that group has the role) — purely
 *                   a derived hint shown in the UI for at-a-glance grouping
 *  - adGroupDns   : AD groups mapped to this role for any LDAP provider
 *
 * The data model intentionally keeps `users.role` as the source of truth.
 * Groups don't grant roles by themselves; they're a bulk-edit shortcut and
 * an organizational concept. AD-group mappings only set the role JIT for
 * brand-new LDAP users on first login (existing users keep their role).
 */
rbacRouter.get('/summary', async (c) => {
  const user = c.get('user');
  const workspaceId = user.workspaceId!;

  // 1) All users in this workspace, grouped by role.
  const wsUsers = await db.query.users.findMany({
    where: eq(users.workspaceId, workspaceId),
    columns: { id: true, email: true, name: true, role: true, authProvider: true },
  });
  const usersByRole: Record<string, typeof wsUsers> = Object.fromEntries(ROLES.map((r) => [r, [] as typeof wsUsers]));
  for (const u of wsUsers) usersByRole[u.role].push(u);

  // 2) User groups in this workspace + members. We mark a group as "assigned to" a role
  //    when ALL of its members currently have that role. Empty groups are not assigned.
  const groups = await db.query.userGroups.findMany({
    where: eq(userGroups.workspaceId, workspaceId),
  });
  const groupIds = groups.map((g) => g.id);
  const memberRows = groupIds.length
    ? await db.query.userGroupMembers.findMany({
        where: inArray(userGroupMembers.groupId, groupIds),
      })
    : [];
  const userById = new Map(wsUsers.map((u) => [u.id, u]));
  const groupsByRole: Record<string, Array<{ id: string; name: string; description: string | null; memberCount: number }>> = Object.fromEntries(
    ROLES.map((r) => [r, []]),
  );
  for (const g of groups) {
    const members = memberRows.filter((m) => m.groupId === g.id).map((m) => userById.get(m.userId)).filter(Boolean) as typeof wsUsers;
    if (members.length === 0) continue;
    const roles = new Set(members.map((m) => m.role));
    if (roles.size === 1) {
      const role = [...roles][0];
      groupsByRole[role].push({ id: g.id, name: g.name, description: g.description, memberCount: members.length });
    }
  }

  // 3) AD-group → role mappings, grouped by role, joined with provider name.
  const adRows = await db.query.adGroupMappings.findMany({
    where: eq(adGroupMappings.workspaceId, workspaceId),
  });
  const providersList = await db.query.authProviders.findMany({
    where: eq(authProviders.workspaceId, workspaceId),
    columns: { id: true, name: true, providerType: true },
  });
  const providerById = new Map(providersList.map((p) => [p.id, p]));
  const adByRole: Record<string, Array<{ id: string; adGroupDn: string; description: string | null; providerName: string | null }>> = Object.fromEntries(
    ROLES.map((r) => [r, []]),
  );
  for (const m of adRows) {
    adByRole[m.role].push({
      id: m.id,
      adGroupDn: m.adGroupDn,
      description: m.description,
      providerName: providerById.get(m.authProviderId)?.name ?? null,
    });
  }

  // Detect if the workspace has any LDAP provider — UI uses this to hide AD-group UI when irrelevant.
  const hasLdap = providersList.some((p) => p.providerType === 'ldap');

  return c.json({
    hasLdap,
    roles: ROLES.map((role) => ({
      role,
      description: ROLE_DESCRIPTIONS[role],
      userCount: usersByRole[role].length,
      users: usersByRole[role],
      groups: groupsByRole[role],
      adGroups: adByRole[role],
    })),
  });
});

/**
 * POST /assign — bulk-set the role for a list of users (direct) or expand
 * group members. This is the canonical way to "add a user/group to a role".
 *
 * Body:
 *   { role, userIds?: string[], groupIds?: string[] }
 *
 * - userIds: each listed user has its `users.role` set to `role`.
 * - groupIds: every member of each listed group has its `users.role` set to `role`.
 *
 * Note: only super_admin can grant `super_admin`. Workspace admins can only manage
 * users in their own workspace and cannot promote anyone to super_admin.
 */
const assignSchema = z.object({
  role: roleEnum,
  userIds: z.array(uuidSchema).optional().default([]),
  groupIds: z.array(uuidSchema).optional().default([]),
});
rbacRouter.post('/assign', async (c) => {
  const user = c.get('user');
  const body = assignSchema.parse(await c.req.json());
  if (body.role === 'super_admin' && user.role !== 'super_admin') {
    return c.json({ error: 'Only super_admin can grant super_admin role' }, 403);
  }
  if (!body.userIds.length && !body.groupIds.length) {
    return c.json({ error: 'At least one userId or groupId is required' }, 400);
  }

  // Resolve target users — direct list + expand groups, all scoped to our workspace.
  const directUsers = body.userIds.length
    ? await db.query.users.findMany({ where: inArray(users.id, body.userIds), columns: { id: true, workspaceId: true } })
    : [];

  const groupMembersList = body.groupIds.length
    ? await db.query.userGroupMembers.findMany({ where: inArray(userGroupMembers.groupId, body.groupIds), columns: { userId: true, groupId: true } })
    : [];
  // Verify each group is in our workspace.
  if (body.groupIds.length) {
    const ourGroups = await db.query.userGroups.findMany({
      where: inArray(userGroups.id, body.groupIds),
      columns: { id: true, workspaceId: true },
    });
    for (const g of ourGroups) {
      if (g.workspaceId !== user.workspaceId) return c.json({ error: 'Group not found in this workspace' }, 404);
    }
  }
  const allUserIds = new Set<string>();
  for (const u of directUsers) {
    if (u.workspaceId !== user.workspaceId && user.role !== 'super_admin') {
      return c.json({ error: 'Cannot modify users outside your workspace' }, 403);
    }
    allUserIds.add(u.id);
  }
  for (const m of groupMembersList) allUserIds.add(m.userId);
  if (allUserIds.size === 0) return c.json({ updated: 0 });

  await db.update(users).set({ role: body.role, updatedAt: new Date() }).where(inArray(users.id, [...allUserIds]));
  return c.json({ updated: allUserIds.size, role: body.role });
});

export default rbacRouter;
