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
        <h1 class="text-3xl font-bold">Model Registry</h1>
        <p class="text-muted-foreground text-sm mt-1">Configure available AI models, provider routing, and credit costs</p>
      </div>
      <div class="flex gap-2">
        <Button v-if="formMode === 'list'" label="Create Model" icon="pi pi-plus" @click="startCreate" />
        <Button v-else label="Back to Models" severity="secondary" icon="pi pi-arrow-left" @click="closeForm" />
      </div>
    </div>

    <Card v-if="formMode !== 'list'" class="mb-6">
      <template #title>{{ formMode === 'edit' ? 'Edit Model' : 'Create Model' }}</template>
      <template #content>
        <Message v-if="formError" severity="error" :closable="false" class="mb-4">{{ formError }}</Message>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Model Name *</label>
            <InputText v-model="form.name" placeholder="gpt-4.1" />
            <small class="text-surface-400">Sent as the `model` value when OAO starts a Copilot session.</small>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Provider Mode *</label>
            <Select v-model="form.providerType" :options="providerModeOptions" optionLabel="label" optionValue="value" />
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Provider Label</label>
            <InputText v-model="form.provider" placeholder="github" />
            <small class="text-surface-400">Display label for tables, reporting, and audit trails.</small>
          </div>
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium">Credit Cost per Step</label>
            <InputText v-model="form.creditCost" placeholder="1.00" />
            <small class="text-surface-400">Credits consumed per agent step using this model.</small>
          </div>
          <div class="flex flex-col gap-2 md:col-span-2">
            <label class="text-sm font-medium">Description</label>
            <Textarea v-model="form.description" rows="3" placeholder="Optional notes for operators" />
          </div>

          <template v-if="isCustomProvider">
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium">Custom Provider Type *</label>
              <Select v-model="form.customProviderType" :options="customProviderTypeOptions" optionLabel="label" optionValue="value" placeholder="Select provider" />
            </div>
            <div class="flex flex-col gap-2">
              <label class="text-sm font-medium">Authentication Mode *</label>
              <Select v-model="form.customAuthType" :options="customAuthTypeOptions" optionLabel="label" optionValue="value" />
              <small class="text-surface-400">Controls whether OAO passes the selected agent secret as `apiKey` or `bearerToken`.</small>
            </div>
            <div class="flex flex-col gap-2 md:col-span-2">
              <label class="text-sm font-medium">Base URL *</label>
              <InputText v-model="form.customBaseUrl" placeholder="https://api.openai.com/v1" />
            </div>
            <div v-if="showWireApiField" class="flex flex-col gap-2">
              <label class="text-sm font-medium">Wire API</label>
              <Select v-model="form.customWireApi" :options="customWireApiOptions" optionLabel="label" optionValue="value" placeholder="Provider default" showClear />
            </div>
            <div v-if="requiresAzureApiVersion" class="flex flex-col gap-2">
              <label class="text-sm font-medium">Azure API Version *</label>
              <InputText v-model="form.customAzureApiVersion" placeholder="2024-10-21" />
            </div>
          </template>
        </div>

        <div class="flex items-center gap-2 mt-4">
          <Checkbox v-model="form.isActive" :binary="true" inputId="model-active" />
          <label for="model-active" class="text-sm">Active</label>
        </div>

        <div class="flex justify-end gap-2 mt-6">
          <Button label="Cancel" severity="secondary" @click="closeForm" />
          <Button :label="formMode === 'edit' ? 'Save Model' : 'Create Model'" icon="pi pi-check" :loading="saving" @click="handleSubmit" />
        </div>
      </template>
    </Card>

    <DataTable v-if="formMode === 'list'" :value="models" stripedRows dataKey="id" :loading="pending">
      <template #empty><div class="text-center py-8 text-surface-400">No models configured.</div></template>
      <Column header="Model" style="min-width: 220px">
        <template #body="{ data }">
          <div>
            <div class="font-medium">{{ data.name }}</div>
            <div v-if="data.description" class="text-xs text-surface-400 mt-1">{{ data.description }}</div>
          </div>
        </template>
      </Column>
      <Column header="Provider" style="min-width: 220px">
        <template #body="{ data }">
          <div class="flex flex-col gap-1">
            <div class="flex flex-wrap items-center gap-2">
              <Tag :value="data.provider || '—'" />
              <Tag :value="data.providerType === 'custom' ? 'Custom' : 'GitHub'" :severity="data.providerType === 'custom' ? 'warn' : 'info'" />
            </div>
            <div v-if="data.providerType === 'custom'" class="text-xs text-surface-400">
              {{ data.customProviderType || 'custom' }} · {{ data.customAuthType || 'none' }}
            </div>
          </div>
        </template>
      </Column>
      <Column header="Endpoint" style="min-width: 220px">
        <template #body="{ data }">
          <span class="text-sm text-surface-500 break-all">{{ data.customBaseUrl || 'GitHub-managed' }}</span>
        </template>
      </Column>
      <Column header="Status" style="width: 100px">
        <template #body="{ data }"><Tag :value="data.isActive ? 'Active' : 'Inactive'" :severity="data.isActive ? 'success' : 'secondary'" /></template>
      </Column>
      <Column header="Credit Cost / Step" style="width: 160px">
        <template #body="{ data }"><span class="text-sm font-mono">{{ data.creditCost ?? '—' }}</span></template>
      </Column>
      <Column header="" style="width: 100px">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button icon="pi pi-pencil" text rounded size="small" @click="startEdit(data)" />
            <Button icon="pi pi-trash" text rounded size="small" severity="danger" @click="handleDelete(data.id)" />
          </div>
        </template>
      </Column>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const toast = useToast();
const confirm = useConfirm();
const ws = computed(() => (route.params.workspace as string) || 'default');

type FormMode = 'list' | 'create' | 'edit';

const providerModeOptions = [
  { label: 'GitHub Provider', value: 'github' },
  { label: 'Custom Provider', value: 'custom' },
];
const customProviderTypeOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Azure OpenAI', value: 'azure' },
  { label: 'Anthropic', value: 'anthropic' },
];
const customAuthTypeOptions = [
  { label: 'None', value: 'none' },
  { label: 'API Key', value: 'api_key' },
  { label: 'Bearer Token', value: 'bearer_token' },
];
const customWireApiOptions = [
  { label: 'Completions', value: 'completions' },
  { label: 'Responses', value: 'responses' },
];

const formMode = ref<FormMode>('list');
const saving = ref(false);
const formError = ref('');
const editId = ref<string | null>(null);

const form = reactive({
  name: '',
  provider: 'github',
  providerType: 'github' as 'github' | 'custom',
  customProviderType: null as 'openai' | 'azure' | 'anthropic' | null,
  customBaseUrl: '',
  customAuthType: 'none' as 'none' | 'api_key' | 'bearer_token',
  customWireApi: null as 'completions' | 'responses' | null,
  customAzureApiVersion: '',
  description: '',
  creditCost: '1.00',
  isActive: true,
});

const { data, pending, refresh } = await useFetch('/api/admin/models', { headers });
const models = computed(() => (data.value as any)?.models ?? []);
const isCustomProvider = computed(() => form.providerType === 'custom');
const showWireApiField = computed(() => form.customProviderType === 'openai' || form.customProviderType === 'azure');
const requiresAzureApiVersion = computed(() => form.customProviderType === 'azure');
const breadcrumbItems = computed(() => {
  const items = [{ label: 'Home', route: `/${ws.value}` }, { label: 'Admin' }, { label: 'Models', route: formMode.value === 'list' ? undefined : `/${ws.value}/admin/models` }];
  if (formMode.value === 'create') items.push({ label: 'Create Model' });
  if (formMode.value === 'edit') items.push({ label: 'Edit Model' });
  return items;
});

watch(() => form.providerType, (providerType) => {
  if (providerType === 'custom') {
    if (!form.provider || form.provider === 'github') {
      form.provider = form.customProviderType || 'custom';
    }
    return;
  }

  form.provider = 'github';
  form.customProviderType = null;
  form.customBaseUrl = '';
  form.customAuthType = 'none';
  form.customWireApi = null;
  form.customAzureApiVersion = '';
});

watch(() => form.customProviderType, (providerType) => {
  if (form.providerType === 'custom' && (!form.provider || form.provider === 'github' || form.provider === 'custom')) {
    form.provider = providerType || 'custom';
  }

  if (providerType !== 'azure') {
    form.customAzureApiVersion = '';
  }

  if (providerType !== 'openai' && providerType !== 'azure') {
    form.customWireApi = null;
  }
});

function resetForm() {
  Object.assign(form, {
    name: '',
    provider: 'github',
    providerType: 'github',
    customProviderType: null,
    customBaseUrl: '',
    customAuthType: 'none',
    customWireApi: null,
    customAzureApiVersion: '',
    description: '',
    creditCost: '1.00',
    isActive: true,
  });
}

function startCreate() {
  editId.value = null;
  formMode.value = 'create';
  resetForm();
  formError.value = '';
}

function startEdit(m: any) {
  editId.value = m.id;
  formMode.value = 'edit';
  Object.assign(form, {
    name: m.name,
    provider: m.provider || 'github',
    providerType: m.providerType || 'github',
    customProviderType: m.customProviderType || null,
    customBaseUrl: m.customBaseUrl || '',
    customAuthType: m.customAuthType || 'none',
    customWireApi: m.customWireApi || null,
    customAzureApiVersion: m.customAzureApiVersion || '',
    description: m.description || '',
    creditCost: m.creditCost ?? '1.00',
    isActive: m.isActive !== false,
  });
  formError.value = '';
}

function closeForm() {
  formMode.value = 'list';
  editId.value = null;
  resetForm();
  formError.value = '';
}

function buildPayload() {
  const provider = form.provider.trim() || (form.providerType === 'custom' ? form.customProviderType || 'custom' : 'github');

  return {
    name: form.name.trim(),
    provider,
    providerType: form.providerType,
    customProviderType: form.providerType === 'custom' ? form.customProviderType : null,
    customBaseUrl: form.providerType === 'custom' ? (form.customBaseUrl.trim() || null) : null,
    customAuthType: form.providerType === 'custom' ? form.customAuthType : 'none',
    customWireApi: form.providerType === 'custom' && showWireApiField.value ? form.customWireApi : null,
    customAzureApiVersion: form.providerType === 'custom' && requiresAzureApiVersion.value ? (form.customAzureApiVersion.trim() || null) : null,
    description: form.description.trim() || undefined,
    creditCost: form.creditCost.trim() || '1.00',
    isActive: form.isActive,
  };
}

async function handleSubmit() {
  formError.value = '';
  saving.value = true;
  try {
    const payload = buildPayload();
    if (editId.value) {
      await $fetch(`/api/admin/models/${editId.value}`, { method: 'PUT', headers, body: payload });
    } else {
      await $fetch('/api/admin/models', { method: 'POST', headers, body: payload });
    }
    toast.add({ severity: 'success', summary: editId.value ? 'Updated' : 'Created', life: 3000 });
    closeForm();
    await refresh();
  } catch (e: any) {
    formError.value = e?.data?.details?.[0]?.message || e?.data?.error || 'Failed';
  } finally {
    saving.value = false;
  }
}

function handleDelete(id: string) {
  confirm.require({
    message: 'Delete this model?', header: 'Confirm', icon: 'pi pi-exclamation-triangle',
    rejectProps: { label: 'Cancel', severity: 'secondary' }, acceptProps: { label: 'Delete', severity: 'danger' },
    accept: async () => {
      await $fetch(`/api/admin/models/${id}`, { method: 'DELETE', headers });
      toast.add({ severity: 'success', summary: 'Deleted', life: 3000 });
      await refresh();
    },
  });
}
</script>
