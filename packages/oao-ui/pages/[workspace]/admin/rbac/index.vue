<template>
  <div>
    <Breadcrumb :model="breadcrumbs" class="mb-4 -ml-1">
      <template #item="{ item }">
        <NuxtLink v-if="item.route" :to="item.route" class="text-primary hover:underline">{{ item.label }}</NuxtLink>
        <span v-else>{{ item.label }}</span>
      </template>
    </Breadcrumb>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Roles &amp; Access (RBAC)</h1>
        <p class="text-muted-foreground text-sm mt-1">
          OAO ships with four built-in roles. The role on the user record is the source of truth — assign users (directly or via
          <NuxtLink :to="`/${ws}/admin/user-groups`" class="underline">User Groups</NuxtLink>) here, or via
          <span v-if="hasLdap">AD-group mappings (LDAP, applied JIT on first login)</span>
          <span v-else>AD-group mappings (configure an LDAP <NuxtLink :to="`/${ws}/admin/auth-providers`" class="underline">Auth Provider</NuxtLink> first)</span>.
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <Card v-for="r in roles" :key="r.role">
        <template #title>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2">
              <Tag :value="formatRole(r.role)" :severity="roleSeverity(r.role)" />
              <span class="text-sm text-surface-400 font-normal">· {{ r.userCount }} user{{ r.userCount === 1 ? '' : 's' }}</span>
            </span>
            <Button label="Assign" icon="pi pi-user-plus" size="small" outlined @click="openAssign(r.role)" />
          </div>
        </template>
        <template #content>
          <p class="text-sm text-surface-400 mb-3">{{ r.description }}</p>

          <div class="mb-3">
            <h4 class="text-xs font-semibold uppercase text-surface-500 mb-2">Users ({{ r.users.length }})</h4>
            <div v-if="r.users.length === 0" class="text-xs text-surface-500">None</div>
            <div v-else class="flex flex-wrap gap-1">
              <Tag v-for="u in r.users.slice(0, 12)" :key="u.id" :value="u.name || u.email" severity="secondary" />
              <span v-if="r.users.length > 12" class="text-xs text-surface-500 self-center">+{{ r.users.length - 12 }} more</span>
            </div>
          </div>

          <div v-if="r.groups.length" class="mb-3">
            <h4 class="text-xs font-semibold uppercase text-surface-500 mb-2">Groups (all members at this role)</h4>
            <div class="flex flex-wrap gap-1">
              <Tag v-for="g in r.groups" :key="g.id" :value="`${g.name} · ${g.memberCount}`" severity="info" />
            </div>
          </div>

          <div v-if="hasLdap">
            <h4 class="text-xs font-semibold uppercase text-surface-500 mb-2">AD groups ({{ r.adGroups.length }})</h4>
            <div v-if="r.adGroups.length === 0" class="text-xs text-surface-500">None mapped to this role</div>
            <ul v-else class="text-xs text-surface-400 list-disc ml-4">
              <li v-for="g in r.adGroups" :key="g.id" class="font-mono break-all">
                {{ g.adGroupDn }}
                <span v-if="g.providerName" class="text-surface-500">— via {{ g.providerName }}</span>
              </li>
            </ul>
          </div>
        </template>
      </Card>
    </div>

    <Card>
      <template #title>
        <div class="flex items-center justify-between">
          <span>AD Group → Role Mappings</span>
          <Button label="Add Mapping" icon="pi pi-plus" size="small" :disabled="!hasLdap" @click="openAddMapping" />
        </div>
      </template>
      <template #content>
        <p class="text-sm text-surface-400 mb-3">
          When a user logs in via LDAP, OAO reads their <span class="font-mono">memberOf</span> attribute. The mapping with the
          highest-power matching role is applied to brand-new users (existing users keep their role).
        </p>
        <div v-if="!hasLdap" class="text-sm text-surface-500">
          No LDAP auth provider is configured. Add one under
          <NuxtLink :to="`/${ws}/admin/auth-providers`" class="underline">Admin → Auth Providers</NuxtLink> to enable AD group mappings.
        </div>
        <DataTable v-else :value="mappings" stripedRows dataKey="id">
          <template #empty><div class="py-6 text-center text-surface-400">No mappings yet.</div></template>
          <Column header="AD Group DN" style="min-width: 280px">
            <template #body="{ data }"><span class="font-mono text-xs break-all">{{ data.adGroupDn }}</span></template>
          </Column>
          <Column header="Role" style="width: 140px">
            <template #body="{ data }"><Tag :value="formatRole(data.role)" :severity="roleSeverity(data.role)" /></template>
          </Column>
          <Column header="Provider" style="width: 160px">
            <template #body="{ data }">{{ data.providerName || '—' }}</template>
          </Column>
          <Column header="Description" style="min-width: 200px">
            <template #body="{ data }"><span class="text-xs text-surface-500">{{ data.description || '—' }}</span></template>
          </Column>
          <Column header="" style="width: 60px">
            <template #body="{ data }">
              <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="deleteMapping(data.id)" />
            </template>
          </Column>
        </DataTable>
      </template>
    </Card>

    <!-- Assign role dialog -->
    <Dialog v-model:visible="assignDialogVisible" :header="`Assign role: ${formatRole(assignRole)}`" :style="{ width: '36rem' }" modal>
      <div class="flex flex-col gap-3">
        <label class="text-sm font-medium">Users</label>
        <MultiSelect
          v-model="assignUserIds"
          :options="userOptions"
          option-label="label"
          option-value="id"
          placeholder="Select users to grant this role"
          filter
        />
        <label class="text-sm font-medium mt-2">Groups (every member receives this role)</label>
        <MultiSelect
          v-model="assignGroupIds"
          :options="groupOptions"
          option-label="label"
          option-value="id"
          placeholder="Select groups"
          filter
        />
        <p class="text-xs text-surface-500">
          The user record's role is updated immediately. Removing a user from a role here means re-assigning them to a different role.
        </p>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="assignDialogVisible = false" />
        <Button label="Apply" icon="pi pi-check" :loading="assigning" @click="submitAssign" />
      </template>
    </Dialog>

    <!-- Add AD group mapping dialog -->
    <Dialog v-model:visible="mappingDialogVisible" header="Map AD group to role" :style="{ width: '36rem' }" modal>
      <div class="flex flex-col gap-3">
        <label class="text-sm font-medium">LDAP Auth Provider</label>
        <Select
          v-model="newMapping.authProviderId"
          :options="ldapProviders"
          option-label="name"
          option-value="id"
          placeholder="Pick a provider"
        />
        <label class="text-sm font-medium mt-2">AD Group DN</label>
        <InputText v-model="newMapping.adGroupDn" placeholder="CN=Engineers,OU=Groups,DC=corp,DC=example,DC=com" />
        <label class="text-sm font-medium mt-2">Role to grant</label>
        <Select
          v-model="newMapping.role"
          :options="roleOptions"
          option-label="label"
          option-value="value"
          placeholder="Pick a role"
        />
        <label class="text-sm font-medium mt-2">Description (optional)</label>
        <InputText v-model="newMapping.description" />
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="mappingDialogVisible = false" />
        <Button label="Add Mapping" icon="pi pi-check" :loading="mappingSaving" @click="submitMapping" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const toast = useToast();
const ws = computed(() => (route.params.workspace as string) || 'default');

const breadcrumbs = computed(() => [
  { label: 'Home', route: `/${ws.value}` },
  { label: 'Admin' },
  { label: 'Roles & Access' },
]);

const { data: summaryData, refresh: refreshSummary } = await useFetch('/api/rbac/summary', { headers });
const roles = computed<any[]>(() => (summaryData.value as any)?.roles ?? []);
const hasLdap = computed(() => Boolean((summaryData.value as any)?.hasLdap));

const { data: mappingsData, refresh: refreshMappings } = await useFetch('/api/ad-group-mappings', { headers });
const mappings = computed<any[]>(() => (mappingsData.value as any)?.mappings ?? []);

const { data: groupsData } = await useFetch('/api/user-groups', { headers });
const allGroups = computed<any[]>(() => (groupsData.value as any)?.groups ?? []);

const { data: usersData } = await useFetch('/api/admin/users?limit=200', { headers });
const allUsers = computed<any[]>(() => (usersData.value as any)?.users ?? []);

const { data: providersData } = await useFetch('/api/auth-providers', { headers });
const ldapProviders = computed<any[]>(() => ((providersData.value as any)?.providers ?? []).filter((p: any) => p.providerType === 'ldap'));

const userOptions = computed(() => allUsers.value.map((u) => ({ id: u.id, label: `${u.name || u.email} <${u.email}>` })));
const groupOptions = computed(() => allGroups.value.map((g) => ({ id: g.id, label: `${g.name} (${g.memberCount})` })));
const roleOptions = [
  { value: 'super_admin', label: 'Super Admin' },
  { value: 'workspace_admin', label: 'Workspace Admin' },
  { value: 'creator_user', label: 'Creator' },
  { value: 'view_user', label: 'Viewer' },
];

const assignDialogVisible = ref(false);
const assigning = ref(false);
const assignRole = ref('');
const assignUserIds = ref<string[]>([]);
const assignGroupIds = ref<string[]>([]);

function openAssign(role: string) {
  assignRole.value = role;
  assignUserIds.value = [];
  assignGroupIds.value = [];
  assignDialogVisible.value = true;
}

async function submitAssign() {
  if (!assignUserIds.value.length && !assignGroupIds.value.length) {
    toast.add({ severity: 'warn', summary: 'Nothing selected', life: 2500 });
    return;
  }
  assigning.value = true;
  try {
    const res = await $fetch<{ updated: number }>('/api/rbac/assign', {
      method: 'POST',
      headers,
      body: { role: assignRole.value, userIds: assignUserIds.value, groupIds: assignGroupIds.value },
    });
    toast.add({ severity: 'success', summary: `Updated ${res.updated} user${res.updated === 1 ? '' : 's'}`, life: 2500 });
    assignDialogVisible.value = false;
    await refreshSummary();
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Assign failed', detail: e?.data?.error || 'Error', life: 4000 });
  } finally {
    assigning.value = false;
  }
}

const mappingDialogVisible = ref(false);
const mappingSaving = ref(false);
const newMapping = reactive({ authProviderId: '', adGroupDn: '', role: 'creator_user', description: '' });

function openAddMapping() {
  newMapping.authProviderId = ldapProviders.value[0]?.id || '';
  newMapping.adGroupDn = '';
  newMapping.role = 'creator_user';
  newMapping.description = '';
  mappingDialogVisible.value = true;
}

async function submitMapping() {
  if (!newMapping.authProviderId || !newMapping.adGroupDn.trim() || !newMapping.role) return;
  mappingSaving.value = true;
  try {
    await $fetch('/api/ad-group-mappings', {
      method: 'POST',
      headers,
      body: {
        authProviderId: newMapping.authProviderId,
        adGroupDn: newMapping.adGroupDn.trim(),
        role: newMapping.role,
        description: newMapping.description.trim() || undefined,
      },
    });
    toast.add({ severity: 'success', summary: 'Mapping added', life: 2500 });
    mappingDialogVisible.value = false;
    await Promise.all([refreshMappings(), refreshSummary()]);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Failed', detail: e?.data?.error || 'Error', life: 4000 });
  } finally {
    mappingSaving.value = false;
  }
}

async function deleteMapping(id: string) {
  try {
    await $fetch(`/api/ad-group-mappings/${id}`, { method: 'DELETE', headers });
    toast.add({ severity: 'success', summary: 'Deleted', life: 2000 });
    await Promise.all([refreshMappings(), refreshSummary()]);
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Delete failed', detail: e?.data?.error || 'Error', life: 4000 });
  }
}

function formatRole(role: string) {
  return { super_admin: 'Super Admin', workspace_admin: 'Workspace Admin', creator_user: 'Creator', view_user: 'Viewer' }[role] || role;
}
function roleSeverity(role: string) {
  return { super_admin: 'danger', workspace_admin: 'warn', creator_user: 'info', view_user: 'secondary' }[role] || 'secondary';
}
</script>
