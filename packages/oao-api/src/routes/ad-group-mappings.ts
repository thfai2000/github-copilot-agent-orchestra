import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { db } from '../database/index.js';
import { adGroupMappings, authProviders } from '../database/schema.js';
import { authMiddleware, uuidSchema } from '@oao/shared';

const adGroupMappingsRouter = new Hono();
adGroupMappingsRouter.use('/*', authMiddleware);

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
adGroupMappingsRouter.use('/*', requireWorkspaceAdmin);

const roleEnum = z.enum(['super_admin', 'workspace_admin', 'creator_user', 'view_user']);

const createSchema = z.object({
  authProviderId: uuidSchema,
  adGroupDn: z.string().trim().min(3).max(500),
  role: roleEnum,
  description: z.string().trim().max(2000).optional().nullable(),
});

const updateSchema = z.object({
  adGroupDn: z.string().trim().min(3).max(500).optional(),
  role: roleEnum.optional(),
  description: z.string().trim().max(2000).optional().nullable(),
});

// GET / — list all AD-group mappings in workspace, joined with provider name
adGroupMappingsRouter.get('/', async (c) => {
  const user = c.get('user');
  const rows = await db.query.adGroupMappings.findMany({
    where: eq(adGroupMappings.workspaceId, user.workspaceId!),
    orderBy: (m, { asc }) => [asc(m.adGroupDn)],
  });
  const providersList = await db.query.authProviders.findMany({
    where: eq(authProviders.workspaceId, user.workspaceId!),
    columns: { id: true, name: true, providerType: true },
  });
  const providerById = new Map(providersList.map((p) => [p.id, p]));
  return c.json({
    mappings: rows.map((m) => ({
      ...m,
      providerName: providerById.get(m.authProviderId)?.name ?? null,
      providerType: providerById.get(m.authProviderId)?.providerType ?? null,
    })),
  });
});

// POST / — create
adGroupMappingsRouter.post('/', async (c) => {
  const user = c.get('user');
  const body = createSchema.parse(await c.req.json());
  // Provider must be an LDAP provider in the same workspace.
  const provider = await db.query.authProviders.findFirst({ where: eq(authProviders.id, body.authProviderId) });
  if (!provider || provider.workspaceId !== user.workspaceId) {
    return c.json({ error: 'Auth provider not found in this workspace' }, 404);
  }
  if (provider.providerType !== 'ldap') {
    return c.json({ error: 'AD group mappings require an LDAP auth provider' }, 400);
  }
  // Reject duplicates upfront (unique index would also catch it but we want a clean error).
  const dup = await db.query.adGroupMappings.findFirst({
    where: and(
      eq(adGroupMappings.authProviderId, body.authProviderId),
      eq(adGroupMappings.adGroupDn, body.adGroupDn),
    ),
  });
  if (dup) return c.json({ error: 'Mapping already exists for this DN' }, 409);
  const [created] = await db
    .insert(adGroupMappings)
    .values({
      workspaceId: user.workspaceId!,
      authProviderId: body.authProviderId,
      adGroupDn: body.adGroupDn,
      role: body.role,
      description: body.description ?? null,
    })
    .returning();
  return c.json({ mapping: created }, 201);
});

// PUT /:id
adGroupMappingsRouter.put('/:id', async (c) => {
  const user = c.get('user');
  const id = uuidSchema.parse(c.req.param('id'));
  const body = updateSchema.parse(await c.req.json());
  const existing = await db.query.adGroupMappings.findFirst({ where: eq(adGroupMappings.id, id) });
  if (!existing || existing.workspaceId !== user.workspaceId) return c.json({ error: 'Mapping not found' }, 404);
  const [updated] = await db
    .update(adGroupMappings)
    .set({
      adGroupDn: body.adGroupDn ?? existing.adGroupDn,
      role: body.role ?? existing.role,
      description: body.description === undefined ? existing.description : body.description,
      updatedAt: new Date(),
    })
    .where(eq(adGroupMappings.id, id))
    .returning();
  return c.json({ mapping: updated });
});

// DELETE /:id
adGroupMappingsRouter.delete('/:id', async (c) => {
  const user = c.get('user');
  const id = uuidSchema.parse(c.req.param('id'));
  const existing = await db.query.adGroupMappings.findFirst({ where: eq(adGroupMappings.id, id) });
  if (!existing || existing.workspaceId !== user.workspaceId) return c.json({ error: 'Mapping not found' }, 404);
  await db.delete(adGroupMappings).where(eq(adGroupMappings.id, id));
  return c.json({ ok: true });
});

export default adGroupMappingsRouter;
