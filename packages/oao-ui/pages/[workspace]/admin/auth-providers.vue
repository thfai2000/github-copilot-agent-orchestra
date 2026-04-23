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
        <p class="text-muted-foreground text-sm mt-1">Configure authentication providers for this workspace</p>
      </div>
      <Button label="Add Provider" icon="pi pi-plus" @click="showCreate = true" />
    </div>

    <DataTable :value="providers" stripedRows dataKey="id" :loading="pending">
      <template #empty><div class="text-center py-8 text-surface-400">No auth providers configured.</div></template>
      <Column header="Name" style="min-width: 150px">
        <template #body="{ data }"><span class="font-medium">{{ data.name }}</span></template>
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
      <Column header="" style="width: 150px">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button v-if="data.providerType === 'ldap'" label="Test" icon="pi pi-bolt" text size="small" @click="testConnection(data.id)" />
            <Button icon="pi pi-pencil" text rounded size="small" @click="startEdit(data)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="handleDelete(data.id)" />
          </div>
        </template>
      </Column>
    </DataTable>

    <Dialog v-model:visible="showCreate" :header="editId ? 'Edit Provider' : 'Add Provider'" :style="{ width: '550px' }" modal>
      <Message v-if="formError" severity="error" :closable="false" class="mb-3">{{ formError }}</Message>
      <div class="flex flex-col gap-3">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Name *</label>
          <InputText v-model="form.name" placeholder="e.g. Corporate LDAP, Local Database" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Type *</label>
          <Select v-model="form.providerType" :options="providerTypes" optionLabel="label" optionValue="value" />
        </div>
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium">Priority</label>
          <InputNumber v-model="form.priority" :min="0" :max="100" />
          <small class="text-surface-400">Higher priority = tried first during login (0–100)</small>
        </div>

        <!-- LDAP-specific config -->
        <template v-if="form.providerType === 'ldap'">
          <Divider />
          <p class="text-sm font-semibold text-surface-600">LDAP Configuration</p>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-url">Server URL *</label><input id="ldap-url" v-model="ldapConfig.url" type="text" class="p-inputtext p-component w-full" placeholder="ldap://ldap.example.com:389" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-bind-dn">Bind DN</label><input id="ldap-bind-dn" v-model="ldapConfig.bindDn" type="text" class="p-inputtext p-component w-full" placeholder="cn=admin,dc=example,dc=com" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium">Bind Password</label><Password v-model="ldapConfig.bindCredential" toggleMask :feedback="false" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-search-base">Search Base *</label><input id="ldap-search-base" v-model="ldapConfig.searchBase" type="text" class="p-inputtext p-component w-full" placeholder="dc=example,dc=com" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-search-filter">Search Filter</label><input id="ldap-search-filter" v-model="ldapConfig.searchFilter" type="text" class="p-inputtext p-component w-full" placeholder="(uid={{username}})" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-username-attribute">Username Attribute</label><input id="ldap-username-attribute" v-model="ldapConfig.usernameAttribute" type="text" class="p-inputtext p-component w-full" placeholder="uid" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-email-attribute">Email Attribute</label><input id="ldap-email-attribute" v-model="ldapConfig.emailAttribute" type="text" class="p-inputtext p-component w-full" placeholder="mail" /></div>
          <div class="flex flex-col gap-2"><label class="text-sm font-medium" for="ldap-name-attribute">Name Attribute</label><input id="ldap-name-attribute" v-model="ldapConfig.nameAttribute" type="text" class="p-inputtext p-component w-full" placeholder="cn" /></div>
          <div class="flex items-center gap-2"><Checkbox v-model="ldapConfig.startTls" :binary="true" inputId="startTls" /><label for="startTls" class="text-sm">Use StartTLS</label></div>
          <div class="flex items-center gap-2"><Checkbox v-model="ldapConfig.tlsRejectUnauthorized" :binary="true" inputId="tlsRejectUnauthorized" /><label for="tlsRejectUnauthorized" class="text-sm">Verify TLS Certificates</label></div>
        </template>

        <Divider />
        <div class="flex items-center gap-2"><Checkbox v-model="form.isEnabled" :binary="true" inputId="pEnabled" /><label for="pEnabled" class="text-sm">Enabled</label></div>
      </div>
      <template #footer>
        <Button label="Cancel" severity="secondary" @click="closeDialog" />
        <Button :label="editId ? 'Save' : 'Create'" icon="pi pi-check" :loading="saving" @click="handleSubmit" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const ws = computed(() => (route.params.workspace as string) || 'default');

const showCreate = ref(false);
const saving = ref(false);
const formError = ref('');
const editId = ref<string | null>(null);

const providerTypes = [
  { label: 'Database (Local)', value: 'database' },
  { label: 'LDAP', value: 'ldap' },
];

function emptyConfig() {
  return {
    url: '',
    bindDn: '',
    bindCredential: '',
    searchBase: '',
    searchFilter: '',
    usernameAttribute: '',
    emailAttribute: '',
    nameAttribute: '',
    startTls: false,
    tlsRejectUnauthorized: true,
  };
}

const form = reactive({
  name: '',
  providerType: 'database',
  isEnabled: true,
  priority: 0,
});

const ldapConfig = reactive(emptyConfig());

const { data, pending, refresh } = await useFetch('/api/auth-providers', { headers });
const providers = computed(() => (data.value as any)?.providers ?? []);

function typeLabel(t: string) {
  return { database: 'Database', ldap: 'LDAP' }[t] || t;
}

function startEdit(p: any) {
  editId.value = p.id;
  const cfg = p.config || {};
  Object.assign(form, {
    name: p.name,
    providerType: p.providerType,
    isEnabled: p.isEnabled,
    priority: p.priority ?? 0,
  });
  Object.assign(ldapConfig, { ...emptyConfig(), ...cfg, bindCredential: '' });
  showCreate.value = true;
}

function closeDialog() {
  showCreate.value = false;
  editId.value = null;
  Object.assign(form, { name: '', providerType: 'database', isEnabled: true, priority: 0 });
  Object.assign(ldapConfig, emptyConfig());
  formError.value = '';
}

async function handleSubmit() {
  formError.value = '';
  saving.value = true;
  try {
    await nextTick();
    const body: any = { name: form.name, providerType: form.providerType, isEnabled: form.isEnabled, priority: form.priority };
    if (form.providerType === 'ldap') {
      const configSnapshot = JSON.parse(JSON.stringify(ldapConfig)) as ReturnType<typeof emptyConfig>;

      // Only send non-empty config fields
      const cfg: Record<string, unknown> = {};
      if (configSnapshot.url) cfg.url = configSnapshot.url;
      if (configSnapshot.bindDn) cfg.bindDn = configSnapshot.bindDn;
      if (configSnapshot.bindCredential) cfg.bindCredential = configSnapshot.bindCredential;
      if (configSnapshot.searchBase) cfg.searchBase = configSnapshot.searchBase;
      if (configSnapshot.searchFilter) cfg.searchFilter = configSnapshot.searchFilter;
      if (configSnapshot.usernameAttribute) cfg.usernameAttribute = configSnapshot.usernameAttribute;
      if (configSnapshot.emailAttribute) cfg.emailAttribute = configSnapshot.emailAttribute;
      if (configSnapshot.nameAttribute) cfg.nameAttribute = configSnapshot.nameAttribute;
      if (configSnapshot.startTls) cfg.startTls = true;
      if (configSnapshot.tlsRejectUnauthorized === false) cfg.tlsRejectUnauthorized = false;
      body.config = cfg;
    } else {
      body.config = {};
    }

    if (editId.value) {
      await $fetch(`/api/auth-providers/${editId.value}`, { method: 'PUT', headers, body });
    } else {
      await $fetch('/api/auth-providers', { method: 'POST', headers, body });
    }
    toast.add({ severity: 'success', summary: editId.value ? 'Updated' : 'Created', life: 3000 });
    closeDialog();
    await refresh();
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed';
  } finally {
    saving.value = false;
  }
}

function handleDelete(id: string) {
  confirm.require({
    message: 'Delete this provider?', header: 'Confirm', icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary' }, acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      await $fetch(`/api/auth-providers/${id}`, { method: 'DELETE', headers });
      toast.add({ severity: 'success', summary: 'Deleted', life: 3000 });
      await refresh();
    },
  });
}

async function testConnection(id: string) {
  try {
    const res = await $fetch<any>('/api/auth-providers/test-connection', { method: 'POST', headers, body: { providerId: id } });
    toast.add({ severity: res.success ? 'success' : 'error', summary: res.success ? 'Connection OK' : 'Connection Failed', detail: res.message, life: 5000 });
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Test failed', detail: e?.data?.error || 'Error', life: 5000 });
  }
}
</script>
