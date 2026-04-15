<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem v-if="mode === 'list'"><BreadcrumbPage>Auth Providers</BreadcrumbPage></BreadcrumbItem>
        <template v-else>
          <BreadcrumbItem><BreadcrumbLink href="#" @click.prevent="mode = 'list'">Auth Providers</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{{ editing ? `Edit: ${editing.name}` : 'Add Provider' }}</BreadcrumbPage></BreadcrumbItem>
        </template>
      </BreadcrumbList>
    </Breadcrumb>

    <!-- Add / Edit Form (in-page) -->
    <template v-if="mode === 'form'">
      <div class="mt-4 mb-6">
        <h1 class="text-3xl font-bold">{{ editing ? 'Edit' : 'Add' }} Auth Provider</h1>
        <p class="text-muted-foreground text-sm mt-1">{{ editing ? 'Update the provider configuration.' : 'Configure a new authentication provider.' }}</p>
      </div>
      <Card class="max-w-2xl">
        <CardContent class="pt-6">
          <div v-if="formError" class="p-2 rounded-md bg-destructive/10 text-destructive text-sm mb-4">{{ formError }}</div>
          <form @submit.prevent="handleSave" class="space-y-4">
            <div class="space-y-1.5">
              <Label>Provider Type *</Label>
              <select v-model="form.providerType" :disabled="!!editing"
                class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="database">Database (Username & Password)</option>
                <option value="ldap">LDAP / Active Directory</option>
              </select>
            </div>
            <div class="space-y-1.5">
              <Label>Name *</Label>
              <Input v-model="form.name" required placeholder="e.g. Corporate LDAP" />
            </div>
            <div class="flex items-center gap-2">
              <input type="checkbox" id="isEnabled" v-model="form.isEnabled"
                class="w-4 h-4 rounded border-input" />
              <Label for="isEnabled">Enabled</Label>
            </div>
            <div class="space-y-1.5">
              <Label>Priority</Label>
              <Input v-model.number="form.priority" type="number" min="0" max="100" placeholder="0 (lower = higher priority)" />
            </div>

            <!-- LDAP-specific config -->
            <template v-if="form.providerType === 'ldap'">
              <div class="border-t pt-4 mt-4">
                <p class="text-sm font-medium mb-3 text-muted-foreground">LDAP Configuration</p>
              </div>
              <div class="space-y-1.5">
                <Label>Server URL *</Label>
                <Input v-model="form.config.url" required placeholder="ldap://ldap.example.com:389" />
              </div>
              <div class="space-y-1.5">
                <Label>Bind DN *</Label>
                <Input v-model="form.config.bindDn" required placeholder="cn=admin,dc=example,dc=com" />
              </div>
              <div class="space-y-1.5">
                <Label>Bind Password {{ editing ? '(leave blank to keep existing)' : '*' }}</Label>
                <Input v-model="form.config.bindCredential" type="password" :required="!editing" placeholder="Service account password" />
              </div>
              <div class="space-y-1.5">
                <Label>Search Base *</Label>
                <Input v-model="form.config.searchBase" required placeholder="ou=users,dc=example,dc=com" />
              </div>
              <div class="space-y-1.5">
                <Label>Search Filter</Label>
                <Input v-model="form.config.searchFilter" placeholder="(uid={{username}})" />
                <p class="text-xs text-muted-foreground">Use <code v-pre>{{username}}</code> as placeholder. Default: <code v-pre>(uid={{username}})</code></p>
              </div>
              <div class="grid grid-cols-3 gap-2">
                <div class="space-y-1.5">
                  <Label>Username Attr</Label>
                  <Input v-model="form.config.usernameAttribute" placeholder="uid" />
                </div>
                <div class="space-y-1.5">
                  <Label>Email Attr</Label>
                  <Input v-model="form.config.emailAttribute" placeholder="mail" />
                </div>
                <div class="space-y-1.5">
                  <Label>Name Attr</Label>
                  <Input v-model="form.config.nameAttribute" placeholder="cn" />
                </div>
              </div>
              <div class="flex items-center gap-4 pt-1">
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="startTls" v-model="form.config.startTls" class="w-4 h-4 rounded border-input" />
                  <Label for="startTls">Start TLS</Label>
                </div>
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="tlsReject" v-model="form.config.tlsRejectUnauthorized" class="w-4 h-4 rounded border-input" />
                  <Label for="tlsReject">Verify TLS Certificates</Label>
                </div>
              </div>
            </template>

            <div class="flex gap-2 pt-2">
              <Button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save' }}</Button>
              <Button variant="outline" type="button" @click="mode = 'list'">Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </template>

    <!-- Provider List -->
    <template v-if="mode === 'list'">
      <div class="flex items-center justify-between mt-4 mb-6">
        <h1 class="text-3xl font-bold">Authentication Providers</h1>
        <Button @click="openAddForm">+ Add Provider</Button>
      </div>

      <!-- Delete Confirmation (keep as dialog — it's minimal) -->
      <Dialog v-model:open="showDeleteDialog">
        <DialogContent class="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Provider</DialogTitle>
            <DialogDescription>Are you sure you want to delete "{{ deletingProvider?.name }}"? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div v-if="deleteError" class="p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ deleteError }}</div>
          <div class="flex justify-end gap-2 pt-2">
            <Button variant="outline" @click="showDeleteDialog = false">Cancel</Button>
            <Button variant="destructive" :disabled="deleting" @click="handleDelete">{{ deleting ? 'Deleting...' : 'Delete' }}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <!-- Test Connection Result (keep as dialog) -->
      <Dialog v-model:open="showTestDialog">
        <DialogContent class="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Connection Test</DialogTitle>
          </DialogHeader>
          <div :class="testResult?.success ? 'text-green-600 dark:text-green-400' : 'text-destructive'" class="text-sm">
            {{ testResult?.message || 'Testing...' }}
          </div>
          <div class="flex justify-end pt-2">
            <Button variant="outline" @click="showTestDialog = false">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle>Configured Providers</CardTitle>
          <CardDescription>Authentication providers available for this workspace. Users will see enabled providers on the login page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead class="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="p in providerList" :key="p.id">
                <TableCell class="font-medium">{{ p.name }}</TableCell>
                <TableCell>
                  <Badge :variant="p.providerType === 'ldap' ? 'default' : 'secondary'">
                    {{ p.providerType === 'ldap' ? 'LDAP' : 'Database' }}
                  </Badge>
                </TableCell>
                <TableCell class="text-muted-foreground">{{ p.priority }}</TableCell>
                <TableCell>
                  <Badge :variant="p.isEnabled ? 'default' : 'outline'" :class="p.isEnabled ? 'bg-green-600' : ''">
                    {{ p.isEnabled ? 'Enabled' : 'Disabled' }}
                  </Badge>
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">{{ new Date(p.createdAt).toLocaleDateString() }}</TableCell>
                <TableCell class="text-right space-x-1">
                  <Button v-if="p.providerType === 'ldap'" variant="ghost" size="sm" @click="testConnection(p)">Test</Button>
                  <Button variant="ghost" size="sm" @click="openEditForm(p)">Edit</Button>
                  <Button variant="ghost" size="sm" class="text-destructive" @click="confirmDelete(p)">Delete</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <p v-if="providerList.length === 0" class="text-muted-foreground py-4 text-center">No auth providers configured. The default database login is always available.</p>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
interface ProviderConfig {
  url?: string;
  bindDn?: string;
  bindCredential?: string;
  bindCredentialEncrypted?: string;
  searchBase?: string;
  searchFilter?: string;
  usernameAttribute?: string;
  emailAttribute?: string;
  nameAttribute?: string;
  startTls?: boolean;
  tlsRejectUnauthorized?: boolean;
}

interface Provider {
  id: string;
  providerType: string;
  name: string;
  isEnabled: boolean;
  priority: number;
  config: ProviderConfig;
  createdAt: string;
}

const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const ws = computed(() => (route.params.workspace as string) || 'default');

const { data: providersData, refresh } = await useFetch('/api/auth-providers', { headers });
const providerList = computed(() => (providersData.value as { providers: Provider[] })?.providers ?? []);

// ── Mode & Form State ────────────────────────────────────────────
const mode = ref<'list' | 'form'>('list');
const saving = ref(false);
const formError = ref('');
const editing = ref<Provider | null>(null);

const defaultConfig: ProviderConfig = {
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

const form = reactive({
  providerType: 'ldap' as string,
  name: '',
  isEnabled: true,
  priority: 0,
  config: { ...defaultConfig },
});

function resetForm() {
  form.providerType = 'ldap';
  form.name = '';
  form.isEnabled = true;
  form.priority = 0;
  Object.assign(form.config, { ...defaultConfig });
}

function openAddForm() {
  editing.value = null;
  formError.value = '';
  resetForm();
  mode.value = 'form';
}

function openEditForm(p: Provider) {
  editing.value = p;
  formError.value = '';
  form.providerType = p.providerType;
  form.name = p.name;
  form.isEnabled = p.isEnabled;
  form.priority = p.priority;
  Object.assign(form.config, {
    ...defaultConfig,
    ...p.config,
    bindCredential: '',
  });
  mode.value = 'form';
}

async function handleSave() {
  formError.value = '';
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      providerType: form.providerType,
      name: form.name,
      isEnabled: form.isEnabled,
      priority: form.priority,
    };

    if (form.providerType === 'ldap') {
      const config: Record<string, unknown> = { ...form.config };
      if (editing.value && !config.bindCredential) {
        delete config.bindCredential;
      }
      body.config = config;
    } else {
      body.config = {};
    }

    if (editing.value) {
      await $fetch(`/api/auth-providers/${editing.value.id}`, {
        method: 'PUT', headers, body,
      });
    } else {
      await $fetch('/api/auth-providers', {
        method: 'POST', headers, body,
      });
    }

    mode.value = 'list';
    await refresh();
  } catch (e: unknown) {
    const fetchErr = e as { data?: { error?: string } };
    formError.value = fetchErr.data?.error || 'Failed to save provider.';
  } finally {
    saving.value = false;
  }
}

// ── Delete ───────────────────────────────────────────────────────
const showDeleteDialog = ref(false);
const deleting = ref(false);
const deleteError = ref('');
const deletingProvider = ref<Provider | null>(null);

function confirmDelete(p: Provider) {
  deletingProvider.value = p;
  deleteError.value = '';
  showDeleteDialog.value = true;
}

async function handleDelete() {
  if (!deletingProvider.value) return;
  deleting.value = true;
  deleteError.value = '';
  try {
    await $fetch(`/api/auth-providers/${deletingProvider.value.id}`, {
      method: 'DELETE', headers,
    });
    showDeleteDialog.value = false;
    await refresh();
  } catch (e: unknown) {
    const fetchErr = e as { data?: { error?: string } };
    deleteError.value = fetchErr.data?.error || 'Failed to delete provider.';
  } finally {
    deleting.value = false;
  }
}

// ── Test Connection ──────────────────────────────────────────────
const showTestDialog = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

async function testConnection(p: Provider) {
  testResult.value = null;
  showTestDialog.value = true;

  try {
    const res = await $fetch<{ success: boolean; message: string }>('/api/auth-providers/test-connection', {
      method: 'POST',
      headers,
      body: {
        url: p.config.url,
        bindDn: p.config.bindDn,
        bindCredential: '_USE_STORED_',
        searchBase: p.config.searchBase,
        startTls: p.config.startTls,
        tlsRejectUnauthorized: p.config.tlsRejectUnauthorized,
      },
    });
    testResult.value = res;
  } catch (e: unknown) {
    const fetchErr = e as { data?: { success?: boolean; message?: string; error?: string } };
    testResult.value = {
      success: false,
      message: fetchErr.data?.message || fetchErr.data?.error || 'Connection test failed.',
    };
  }
}
</script>
