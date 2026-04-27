<template>
  <div>
    <Breadcrumb :model="[{ label: 'Home', route: `/${ws}` }, { label: 'Admin' }, { label: 'Auth Providers' }]" class="mb-4 -ml-1">
      <template #item="{ item }">
        <NuxtLink v-if="item.route" :to="item.route" class="text-primary hover:underline">{{ item.label }}</NuxtLink>
        <span v-else>{{ item.label }}</span>
      </template>
    </Breadcrumb>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Authentication Providers</h1>
        <p class="text-muted-foreground text-sm mt-1">Configure authentication providers for this workspace. One of each type is allowed.</p>
      </div>
      <NuxtLink :to="`/${ws}/admin/auth-providers/new`">
        <Button label="Add Provider" icon="pi pi-plus" :disabled="!canAddMore" />
      </NuxtLink>
    </div>

    <DataTable :value="providers" stripedRows dataKey="id" :loading="pending"
      :rowClass="() => 'cursor-pointer'"
      @rowClick="(e) => goTo(e.data?.id)">
      <template #empty><div class="text-center py-8 text-surface-400">No auth providers configured.</div></template>
      <Column header="Name" style="min-width: 150px">
        <template #body="{ data }">
          <NuxtLink :to="`/${ws}/admin/auth-providers/${data.id}`" class="font-medium text-primary hover:underline">{{ data.name }}</NuxtLink>
        </template>
      </Column>
      <Column header="Type" style="width: 120px">
        <template #body="{ data }"><Tag :value="typeLabel(data.providerType)" :severity="data.providerType === 'database' ? 'info' : 'warn'" /></template>
      </Column>
      <Column header="Priority" style="width: 90px">
        <template #body="{ data }"><span class="text-sm font-mono">{{ data.priority ?? 0 }}</span></template>
      </Column>
      <Column header="Status" style="width: 110px">
        <template #body="{ data }"><Tag :value="data.isEnabled ? 'Enabled' : 'Disabled'" :severity="data.isEnabled ? 'success' : 'secondary'" /></template>
      </Column>
      <Column header="" style="width: 80px">
        <template #body="{ data }">
          <NuxtLink :to="`/${ws}/admin/auth-providers/${data.id}`" @click.stop>
            <Button icon="pi pi-pencil" text rounded size="small" />
          </NuxtLink>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const router = useRouter();
const ws = computed(() => (route.params.workspace as string) || 'default');

const { data, pending } = await useFetch('/api/auth-providers', { headers });
const providers = computed(() => (data.value)?.providers ?? []);

const canAddMore = computed(() => {
  const existing = new Set(providers.value.map((p) => p.providerType));
  return !(existing.has('database') && existing.has('ldap'));
});

function typeLabel(t) {
  return { database: 'Database', ldap: 'LDAP' }[t] || t;
}

function goTo(id) {
  if (id) router.push(`/${ws.value}/admin/auth-providers/${id}`);
}
</script>
