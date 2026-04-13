<template>
  <div class="max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Personal Access Tokens</h1>
        <p class="text-sm text-muted-foreground mt-1">
          Create tokens for webhook triggers and API access. Tokens are shown only once on creation.
        </p>
      </div>
      <Dialog v-model:open="showCreate">
        <DialogTrigger as-child>
          <Button>Create Token</Button>
        </DialogTrigger>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Personal Access Token</DialogTitle>
          </DialogHeader>
          <form @submit.prevent="createToken" class="space-y-4 mt-2">
            <div class="space-y-2">
              <Label>Name</Label>
              <Input v-model="form.name" placeholder="e.g. CI/CD webhook" required />
            </div>

            <div class="space-y-2">
              <Label>Scopes</Label>
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
              <Select v-model="form.expiresInDays">
                <SelectTrigger><SelectValue placeholder="Select expiration" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="none">No expiration</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p v-if="createError" class="text-sm text-destructive">{{ createError }}</p>

            <Button type="submit" :disabled="creating || form.scopes.length === 0" class="w-full">
              {{ creating ? 'Creating...' : 'Create Token' }}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    <!-- New token display (shown once after creation) -->
    <div v-if="newToken" class="mb-6 rounded-lg border border-green-500/30 bg-green-500/5 p-4">
      <p class="text-sm font-medium text-green-700 dark:text-green-400 mb-2">
        Token created successfully. Copy it now — it won't be shown again.
      </p>
      <div class="flex items-center gap-2">
        <code class="flex-1 text-sm font-mono bg-muted px-3 py-2 rounded break-all select-all">{{ newToken }}</code>
        <Button variant="outline" size="sm" @click="copyToken">
          {{ copied ? 'Copied!' : 'Copy' }}
        </Button>
      </div>
    </div>

    <!-- Token list -->
    <div v-if="loading" class="text-sm text-muted-foreground">Loading...</div>
    <div v-else-if="tokens.length === 0" class="text-sm text-muted-foreground">
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
          <TableCell>
            <code class="text-xs font-mono">{{ t.tokenPrefix }}…</code>
          </TableCell>
          <TableCell>
            <div class="flex flex-wrap gap-1">
              <Badge v-for="s in t.scopes" :key="s" variant="secondary" class="text-xs">
                {{ s }}
              </Badge>
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
            <Button v-if="!t.isRevoked" variant="destructive" size="sm" @click="revokeToken(t.id)">
              Revoke
            </Button>
            <Badge v-else variant="outline" class="text-xs">Revoked</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>

<script setup lang="ts">
interface PatScope { name: string; description: string }
interface Pat {
  id: string;
  name: string;
  tokenPrefix: string;
  scopes: string[];
  expiresAt: string | null;
  lastUsedAt: string | null;
  isRevoked: boolean;
  createdAt: string;
}

const { authHeaders } = useAuth();

const showCreate = ref(false);
const creating = ref(false);
const createError = ref('');
const newToken = ref('');
const copied = ref(false);
const loading = ref(true);
const tokens = ref<Pat[]>([]);
const availableScopes = ref<PatScope[]>([]);

const form = reactive({
  name: '',
  scopes: [] as string[],
  expiresInDays: '90',
});

function toggleScope(scope: string, checked: boolean) {
  if (checked && !form.scopes.includes(scope)) form.scopes.push(scope);
  if (!checked) form.scopes = form.scopes.filter((s) => s !== scope);
}

async function fetchTokens() {
  loading.value = true;
  try {
    const res = await $fetch<{ tokens: Pat[] }>('/api/tokens', { headers: authHeaders() });
    tokens.value = res.tokens;
  } catch { /* ignore */ } finally {
    loading.value = false;
  }
}

async function fetchScopes() {
  try {
    const res = await $fetch<{ scopes: PatScope[] }>('/api/tokens/scopes', { headers: authHeaders() });
    availableScopes.value = res.scopes;
  } catch { /* ignore */ }
}

async function createToken() {
  createError.value = '';
  creating.value = true;
  try {
    const expiresInDays = form.expiresInDays === 'none' ? null : parseInt(form.expiresInDays);
    const res = await $fetch<{ token: string; pat: Pat }>('/api/tokens', {
      method: 'POST',
      headers: authHeaders(),
      body: { name: form.name, scopes: form.scopes, expiresInDays },
    });
    newToken.value = res.token;
    tokens.value.unshift(res.pat);
    showCreate.value = false;
    form.name = '';
    form.scopes = [];
    form.expiresInDays = '90';
  } catch (err: unknown) {
    const e = err as { data?: { error?: string } };
    createError.value = e.data?.error || 'Failed to create token.';
  } finally {
    creating.value = false;
  }
}

async function revokeToken(id: string) {
  if (!confirm('Revoke this token? This cannot be undone.')) return;
  try {
    await $fetch(`/api/tokens/${id}`, { method: 'DELETE', headers: authHeaders() });
    const idx = tokens.value.findIndex((t) => t.id === id);
    if (idx >= 0) tokens.value[idx].isRevoked = true;
  } catch { /* ignore */ }
}

async function copyToken() {
  await navigator.clipboard.writeText(newToken.value);
  copied.value = true;
  setTimeout(() => { copied.value = false; }, 2000);
}

onMounted(() => {
  fetchTokens();
  fetchScopes();
});
</script>
