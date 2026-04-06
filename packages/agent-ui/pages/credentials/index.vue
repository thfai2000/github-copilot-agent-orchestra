<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-3xl font-bold">Agent Credentials</h1>
        <p class="text-muted-foreground mt-1">
          Encrypted key-value pairs injected into agent Copilot sessions as environment variables.
        </p>
      </div>
      <button @click="showCreate = true"
        class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition">
        + Add Credential
      </button>
    </div>

    <!-- Create Form -->
    <div v-if="showCreate" class="mb-6 p-6 rounded-lg border border-border bg-card">
      <h2 class="text-lg font-semibold mb-4">Add New Credential</h2>
      <div v-if="formError" class="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ formError }}</div>
      <form @submit.prevent="handleCreate" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1.5">Agent *</label>
          <select v-model="form.agentId" required
            class="w-full max-w-md px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="" disabled>Select an agent...</option>
            <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
          </select>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1.5">Key (UPPER_SNAKE_CASE) *</label>
            <input v-model="form.key" type="text" required pattern="^[A-Z_][A-Z0-9_]*$"
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="API_KEY" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Value *</label>
            <input v-model="form.value" type="password" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Secret value (encrypted at rest)" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Description</label>
          <input v-model="form.description" type="text"
            class="w-full max-w-md px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="What is this credential for?" />
        </div>
        <div class="flex gap-3">
          <button type="submit" :disabled="submitting"
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
            {{ submitting ? 'Saving...' : 'Save Credential' }}
          </button>
          <button type="button" @click="showCreate = false"
            class="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition">Cancel</button>
        </div>
      </form>
    </div>

    <!-- Credentials grouped by agent -->
    <div v-for="a in agents" :key="a.id" class="mb-6">
      <h3 v-if="credsByAgent[a.id]?.length" class="text-lg font-semibold mb-3 flex items-center gap-2">
        <span>{{ a.name }}</span>
        <span class="text-xs text-muted-foreground font-normal">{{ credsByAgent[a.id].length }} credential{{ credsByAgent[a.id].length !== 1 ? 's' : '' }}</span>
      </h3>
      <div v-if="credsByAgent[a.id]?.length" class="space-y-2 mb-4">
        <div v-for="cred in credsByAgent[a.id]" :key="cred.id"
          class="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
          <div>
            <p class="font-mono font-semibold">{{ cred.key }}</p>
            <p v-if="cred.description" class="text-xs text-muted-foreground mt-0.5">{{ cred.description }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              Updated {{ new Date(cred.updatedAt || cred.createdAt).toLocaleDateString() }}
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-muted-foreground font-mono">••••••••</span>
            <button @click="handleDelete(cred.id, cred.key)"
              class="text-xs text-destructive hover:underline">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <p v-if="allCredentials.length === 0 && !showCreate" class="text-muted-foreground text-center py-8">
      No credentials stored yet. Click "Add Credential" to get started.
    </p>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

const showCreate = ref(false);
const submitting = ref(false);
const formError = ref('');
const form = reactive({ agentId: '', key: '', value: '', description: '' });

const { data: agentsData } = await useFetch('/api/agents', { headers });
const agents = computed(() => agentsData.value?.agents ?? []);

// Fetch credentials for all agents
const allCredentials = ref<any[]>([]);
const credsByAgent = computed(() => {
  const map: Record<string, any[]> = {};
  for (const c of allCredentials.value) {
    if (!map[c.agentId]) map[c.agentId] = [];
    map[c.agentId].push(c);
  }
  return map;
});

async function fetchAllCredentials() {
  const results: any[] = [];
  for (const a of agents.value) {
    try {
      const data = await $fetch<{ credentials: any[] }>(`/api/credentials?agentId=${a.id}`, { headers });
      results.push(...(data.credentials || []));
    } catch { /* skip */ }
  }
  allCredentials.value = results;
}

// Initial load
await fetchAllCredentials();

async function handleCreate() {
  formError.value = '';
  submitting.value = true;
  try {
    await $fetch('/api/credentials', {
      method: 'POST',
      headers,
      body: { agentId: form.agentId, key: form.key, value: form.value, description: form.description || undefined },
    });
    showCreate.value = false;
    Object.assign(form, { agentId: '', key: '', value: '', description: '' });
    await fetchAllCredentials();
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed to save credential';
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(id: string, key: string) {
  if (!confirm(`Delete credential "${key}"?`)) return;
  try {
    await $fetch(`/api/credentials/${id}`, { method: 'DELETE', headers });
    await fetchAllCredentials();
  } catch {
    alert('Failed to delete credential');
  }
}
</script>
