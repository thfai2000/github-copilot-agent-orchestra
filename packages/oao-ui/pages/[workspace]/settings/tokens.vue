<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem v-if="!creating"><BreadcrumbPage>Access Tokens</BreadcrumbPage></BreadcrumbItem>
        <template v-else>
          <BreadcrumbItem><BreadcrumbLink href="#" @click.prevent="creating = false">Access Tokens</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>Create Token</BreadcrumbPage></BreadcrumbItem>
        </template>
      </BreadcrumbList>
    </Breadcrumb>

    <!-- ═══ Create Token (in-page) ═══ -->
    <template v-if="creating">
      <div class="mt-4 mb-6">
        <h1 class="text-3xl font-bold">Create Personal Access Token</h1>
        <p class="text-sm text-muted-foreground mt-1">Generate a new token for API and webhook access.</p>
      </div>

      <Card class="max-w-2xl">
        <CardContent class="pt-6">
          <div v-if="createError" class="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ createError }}</div>
          <form @submit.prevent="handleCreate" class="space-y-5">
            <div class="space-y-2">
              <Label>Token Name *</Label>
              <Input v-model="form.name" placeholder="e.g. CI/CD webhook" required class="max-w-md" />
            </div>

            <div class="space-y-2">
              <Label>Scopes *</Label>
              <p class="text-xs text-muted-foreground">Select which permissions this token should have.</p>
              <div class="grid gap-2 mt-1">
                <label v-for="scope in availableScopes" :key="scope.name"
                  class="flex items-start gap-2 text-sm cursor-pointer">
                  <Checkbox
                    :checked="form.scopes.includes(scope.name)"
                    @update:checked="(v: boolean) => toggleScope(scope.name, v)" />
                  <div>
                    <span class="font-mono text-xs">{{ scope.name }}</span>
                    <p class="text-xs text-muted-foreground">{{ scope.description }}</p>
                  </div>
                </label>
              </div>
            </div>

            <div class="space-y-2">
              <Label>Expiration</Label>
              <div class="flex items-center gap-3 flex-wrap">
                <select v-model="form.expiryMode"
                  class="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-48">
                  <option value="days">Preset (days)</option>
                  <option value="custom">Custom date &amp; time</option>
                  <option value="none">No expiration</option>
                </select>
                <select v-if="form.expiryMode === 'days'" v-model="form.expiresInDays"
                  class="px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring w-40">
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                </select>
                <Input v-if="form.expiryMode === 'custom'" v-model="form.expiresAt" type="datetime-local" class="w-64" />
              </div>
            </div>

            <div class="flex gap-3 pt-2">
              <Button type="submit" :disabled="submitting || form.scopes.length === 0">
                {{ submitting ? 'Creating...' : 'Create Token' }}
              </Button>
              <Button variant="outline" type="button" @click="creating = false">Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </template>

    <!-- ═══ Token List ═══ -->
    <template v-else>
      <div class="flex items-center justify-between mt-4 mb-6">
        <div>
          <h1 class="text-3xl font-bold">Personal Access Tokens</h1>
          <p class="text-sm text-muted-foreground mt-1">Manage tokens for webhook triggers and API access.</p>
        </div>
        <Button @click="startCreate">+ Create Token</Button>
      </div>

      <!-- New token banner -->
      <div v-if="newToken" class="mb-6 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
        <p class="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
          Token created successfully. Copy it now — it won't be shown again.
        </p>
        <div class="flex items-center gap-2">
          <code class="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded break-all select-all">{{ newToken }}</code>
          <Button variant="outline" size="sm" @click="copyToken">{{ copied ? 'Copied!' : 'Copy' }}</Button>
        </div>
      </div>

      <Card>
        <CardContent class="pt-4">
          <div v-if="loading" class="text-sm text-muted-foreground py-8 text-center">Loading...</div>
          <div v-else-if="tokens.length === 0" class="text-sm text-muted-foreground py-8 text-center">
            No tokens yet. Create one to get started.
          </div>
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead class="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="t in tokens" :key="t.id" :class="{ 'opacity-50': t.isRevoked }">
                <TableCell class="font-medium">{{ t.name }}</TableCell>
                <TableCell><code class="text-xs font-mono">{{ t.tokenPrefix }}…</code></TableCell>
                <TableCell>
                  <div class="flex flex-wrap gap-1">
                    <Badge v-for="s in t.scopes" :key="s" variant="secondary" class="text-xs">{{ s }}</Badge>
                  </div>
                </TableCell>
                <TableCell class="text-sm">
                  <span v-if="!t.expiresAt">Never</span>
                  <span v-else-if="new Date(t.expiresAt) < new Date()" class="text-destructive">Expired</span>
                  <span v-else>{{ new Date(t.expiresAt).toLocaleDateString() }}</span>
                </TableCell>
                <TableCell class="text-sm text-muted-foreground">
                  {{ t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : 'Never' }}
                </TableCell>
                <TableCell class="text-right">
                  <Button v-if="!t.isRevoked" variant="destructive" size="sm" @click="revokeToken(t.id)">Revoke</Button>
                  <Badge v-else variant="outline" class="text-xs">Revoked</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <!-- Pagination -->
          <div v-if="totalPages > 1" class="flex items-center justify-between mt-4 pt-4 border-t">
            <span class="text-xs text-muted-foreground">Page {{ page }} of {{ totalPages }} ({{ total }} tokens)</span>
            <div class="flex gap-2">
              <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">Previous</Button>
              <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </template>
  </div>
</template>

<script setup lang="ts">
interface PatScope { name: string; description: string }
interface Pat {
  id: string; name: string; tokenPrefix: string; scopes: string[];
  expiresAt: string | null; lastUsedAt: string | null; isRevoked: boolean; createdAt: string;
}

const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const ws = computed(() => (route.params.workspace as string) || 'default');

const creating = ref(false);
const submitting = ref(false);
const createError = ref('');
const newToken = ref('');
const copied = ref(false);
const loading = ref(true);
const tokens = ref<Pat[]>([]);
const total = ref(0);
const page = ref(1);
const limit = 20;
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
const availableScopes = ref<PatScope[]>([]);

const form = reactive({
  name: '',
  scopes: [] as string[],
  expiryMode: 'days' as 'days' | 'custom' | 'none',
  expiresInDays: '90',
  expiresAt: '',
});

function toggleScope(scope: string, checked: boolean) {
  if (checked && !form.scopes.includes(scope)) form.scopes.push(scope);
  if (!checked) form.scopes = form.scopes.filter((s) => s !== scope);
}

function startCreate() {
  creating.value = true;
  createError.value = '';
  form.name = '';
  form.scopes = [];
  form.expiryMode = 'days';
  form.expiresInDays = '90';
  form.expiresAt = '';
}

async function fetchTokens() {
  loading.value = true;
  try {
    const res = await $fetch<{ tokens: Pat[]; total: number }>(`/api/tokens?page=${page.value}&limit=${limit}`, { headers });
    tokens.value = res.tokens;
    total.value = res.total;
  } catch { /* ignore */ } finally { loading.value = false; }
}

async function fetchScopes() {
  try {
    const res = await $fetch<{ scopes: PatScope[] }>('/api/tokens/scopes', { headers });
    availableScopes.value = res.scopes;
  } catch { /* ignore */ }
}

async function handleCreate() {
  createError.value = '';
  submitting.value = true;
  try {
    const body: Record<string, unknown> = { name: form.name, scopes: form.scopes };
    if (form.expiryMode === 'days') {
      body.expiresInDays = parseInt(form.expiresInDays);
    } else if (form.expiryMode === 'custom' && form.expiresAt) {
      body.expiresAt = new Date(form.expiresAt).toISOString();
    } else {
      body.expiresInDays = null;
    }
    const res = await $fetch<{ token: string; pat: Pat }>('/api/tokens', { method: 'POST', headers, body });
    newToken.value = res.token;
    creating.value = false;
    await fetchTokens();
  } catch (err: unknown) {
    const e = err as { data?: { error?: string } };
    createError.value = e.data?.error || 'Failed to create token.';
  } finally { submitting.value = false; }
}

async function revokeToken(id: string) {
  if (!confirm('Revoke this token? This cannot be undone.')) return;
  try {
    await $fetch(`/api/tokens/${id}`, { method: 'DELETE', headers });
    const idx = tokens.value.findIndex((t) => t.id === id);
    if (idx >= 0) tokens.value[idx].isRevoked = true;
  } catch { /* ignore */ }
}

async function copyToken() {
  await navigator.clipboard.writeText(newToken.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

watch(page, () => fetchTokens());
onMounted(() => { fetchTokens(); fetchScopes(); });
</script>
