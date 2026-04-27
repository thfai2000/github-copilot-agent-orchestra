<template>
  <div>
    <Breadcrumb :model="breadcrumbItems" class="mb-4 -ml-1">
      <template #item="{ item }">
        <NuxtLink v-if="item.route" :to="item.route" class="text-primary hover:underline">{{ item.label }}</NuxtLink>
        <span v-else>{{ item.label }}</span>
      </template>
    </Breadcrumb>

    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">{{ isNew ? 'Add Authentication Provider' : (form.name || 'Edit Provider') }}</h1>
        <p class="text-muted-foreground text-sm mt-1">Configure how users authenticate with this workspace</p>
      </div>
      <NuxtLink :to="`/${ws}/admin/auth-providers`">
        <Button label="Back to Providers" severity="secondary" icon="pi pi-arrow-left" />
      </NuxtLink>
    </div>

    <Message v-if="loadError" severity="error" :closable="false" class="mb-4">{{ loadError }}</Message>

    <Card v-if="!loadError">
      <template #content>
        <Message v-if="formError" severity="error" :closable="false" class="mb-4">{{ formError }}</Message>
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Name *</label>
            <InputText v-model="form.name" placeholder="e.g. Corporate LDAP, Local Database" />
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Type *</label>
            <Select v-model="form.providerType" :options="availableProviderTypes" optionLabel="label" optionValue="value" :disabled="!isNew" />
            <small v-if="isNew && availableProviderTypes.length === 0" class="text-amber-600">All provider types are already configured. Edit or delete an existing provider.</small>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Priority</label>
            <InputText v-model.number="form.priority" type="number" />
            <small class="text-surface-400">Lower numbers are tried first when authenticating.</small>
          </div>

          <template v-if="form.providerType === 'ldap'">
            <Divider><span class="text-xs uppercase text-surface-400">LDAP Configuration</span></Divider>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Server URL *</label><InputText v-model="ldapConfig.url" placeholder="ldap://ldap.example.com:389" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Bind DN</label><InputText v-model="ldapConfig.bindDn" placeholder="cn=admin,dc=example,dc=com" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Bind Password</label><Password v-model="ldapConfig.bindCredential" toggleMask :feedback="false" fluid /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Search Base *</label><InputText v-model="ldapConfig.searchBase" placeholder="dc=example,dc=com" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Search Filter</label><InputText v-model="ldapConfig.searchFilter" placeholder="(uid={{username}})" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Username Attribute</label><InputText v-model="ldapConfig.usernameAttribute" placeholder="uid" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Email Attribute</label><InputText v-model="ldapConfig.emailAttribute" placeholder="mail" /></div>
            <div class="flex flex-col gap-2"><label class="text-sm font-medium">Name Attribute</label><InputText v-model="ldapConfig.nameAttribute" placeholder="cn" /></div>
            <div class="flex items-center gap-2"><Checkbox v-model="ldapConfig.startTls" :binary="true" inputId="startTls" /><label for="startTls" class="text-sm">Use StartTLS</label></div>
            <div class="flex items-center gap-2"><Checkbox v-model="ldapConfig.tlsRejectUnauthorized" :binary="true" inputId="tlsRejectUnauthorized" /><label for="tlsRejectUnauthorized" class="text-sm">Verify TLS Certificates</label></div>
          </template>

          <Divider />
          <div class="flex items-center gap-2"><Checkbox v-model="form.isEnabled" :binary="true" inputId="pEnabled" /><label for="pEnabled" class="text-sm">Enabled</label></div>
        </div>

        <div class="flex justify-between gap-2 mt-6">
          <div class="flex gap-2">
            <Button v-if="!isNew" label="Delete" severity="danger" outlined icon="pi pi-trash" @click="confirmDelete" />
            <Button v-if="!isNew && form.providerType === 'ldap'" label="Test Connection" icon="pi pi-bolt" severity="secondary" @click="testConnection" />
          </div>
          <div class="flex gap-2">
            <NuxtLink :to="`/${ws}/admin/auth-providers`"><Button label="Cancel" severity="secondary" /></NuxtLink>
            <Button :label="isNew ? 'Create' : 'Save Changes'" icon="pi pi-check" :loading="saving" @click="handleSubmit" :disabled="isNew && availableProviderTypes.length === 0" />
          </div>
        </div>
      </template>
    </Card>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const ws = computed(() => (route.params.workspace as string) || 'default');
const providerId = computed(() => route.params.id as string);
const isNew = computed(() => providerId.value === 'new');

const providerTypes = [
  { label: 'Database (Local)', value: 'database' },
  { label: 'LDAP', value: 'ldap' },
];

function emptyConfig() {
  return {
    url: '', bindDn: '', bindCredential: '',
    searchBase: '', searchFilter: '', usernameAttribute: '',
    emailAttribute: '', nameAttribute: '',
    startTls: false, tlsRejectUnauthorized: true,
  };
}

const form = reactive({
  name: '', providerType: 'database' as 'database' | 'ldap',
  isEnabled: true, priority: 0,
});
const ldapConfig = reactive(emptyConfig());

const saving = ref(false);
const formError = ref('');
const loadError = ref('');

const allProviders = ref<any[]>([]);
const availableProviderTypes = computed(() => {
  const existingTypes = new Set(allProviders.value
    .filter((p) => p.id !== providerId.value)
    .map((p) => p.providerType));
  return providerTypes.filter((opt) => !existingTypes.has(opt.value));
});

const breadcrumbItems = computed(() => [
  { label: 'Home', route: `/${ws.value}` },
  { label: 'Admin' },
  { label: 'Auth Providers', route: `/${ws.value}/admin/auth-providers` },
  { label: isNew.value ? 'Add Provider' : (form.name || 'Edit') },
]);

async function loadAll() {
  try {
    const res = await $fetch<{ providers: any[] }>('/api/auth-providers', { headers });
    allProviders.value = res.providers || [];
  } catch (e: any) {
    loadError.value = e?.data?.error || 'Failed to load providers';
  }
}

async function loadProvider() {
  if (isNew.value) return;
  try {
    const res = await $fetch<{ provider: any }>(`/api/auth-providers/${providerId.value}`, { headers });
    const p = res.provider;
    Object.assign(form, {
      name: p.name, providerType: p.providerType,
      isEnabled: p.isEnabled, priority: p.priority ?? 0,
    });
    Object.assign(ldapConfig, { ...emptyConfig(), ...(p.config || {}), bindCredential: '' });
  } catch (e: any) {
    loadError.value = e?.data?.error || 'Provider not found';
  }
}

await Promise.all([loadAll(), loadProvider()]);

async function handleSubmit() {
  formError.value = '';
  saving.value = true;
  try {
    const body: any = {
      name: form.name, providerType: form.providerType,
      isEnabled: form.isEnabled, priority: form.priority,
    };
    if (form.providerType === 'ldap') {
      const cfg: Record<string, unknown> = {};
      if (ldapConfig.url) cfg.url = ldapConfig.url;
      if (ldapConfig.bindDn) cfg.bindDn = ldapConfig.bindDn;
      if (ldapConfig.bindCredential) cfg.bindCredential = ldapConfig.bindCredential;
      if (ldapConfig.searchBase) cfg.searchBase = ldapConfig.searchBase;
      if (ldapConfig.searchFilter) cfg.searchFilter = ldapConfig.searchFilter;
      if (ldapConfig.usernameAttribute) cfg.usernameAttribute = ldapConfig.usernameAttribute;
      if (ldapConfig.emailAttribute) cfg.emailAttribute = ldapConfig.emailAttribute;
      if (ldapConfig.nameAttribute) cfg.nameAttribute = ldapConfig.nameAttribute;
      if (ldapConfig.startTls) cfg.startTls = true;
      if (ldapConfig.tlsRejectUnauthorized === false) cfg.tlsRejectUnauthorized = false;
      body.config = cfg;
    } else {
      body.config = {};
    }

    if (isNew.value) {
      const created = await $fetch<{ provider: any }>('/api/auth-providers', { method: 'POST', headers, body });
      toast.add({ severity: 'success', summary: 'Created', life: 3000 });
      router.push(`/${ws.value}/admin/auth-providers/${created.provider.id}`);
    } else {
      await $fetch(`/api/auth-providers/${providerId.value}`, { method: 'PUT', headers, body });
      toast.add({ severity: 'success', summary: 'Saved', life: 3000 });
    }
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed';
  } finally {
    saving.value = false;
  }
}

function confirmDelete() {
  confirm.require({
    message: `Delete provider "${form.name}"?`,
    header: 'Confirm Delete', icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary' },
    acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      try {
        await $fetch(`/api/auth-providers/${providerId.value}`, { method: 'DELETE', headers });
        toast.add({ severity: 'success', summary: 'Deleted', life: 3000 });
        router.push(`/${ws.value}/admin/auth-providers`);
      } catch (e: any) {
        toast.add({ severity: 'error', summary: 'Delete Failed', detail: e?.data?.error || 'Error', life: 4000 });
      }
    },
  });
}

async function testConnection() {
  try {
    const res = await $fetch<{ success: boolean; message?: string }>(`/api/auth-providers/test-connection`, { method: 'POST', headers, body: { providerId: providerId.value } });
    if (res.success) toast.add({ severity: 'success', summary: 'Connection OK', detail: res.message, life: 3000 });
    else toast.add({ severity: 'error', summary: 'Connection Failed', detail: res.message || 'Unknown', life: 5000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Test Failed', detail: e?.data?.error || e?.data?.message || 'Error', life: 5000 });
  }
}
</script>
