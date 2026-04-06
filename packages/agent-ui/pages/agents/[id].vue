<template>
  <div>
    <NuxtLink to="/agents" class="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Back to Agents</NuxtLink>

    <div v-if="agent" class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">{{ agent.name }}</h1>
          <p v-if="agent.description" class="text-muted-foreground mt-1">{{ agent.description }}</p>
        </div>
        <div class="flex items-center gap-3">
          <button @click="toggleStatus"
            :class="agent.status === 'active' ? 'border-yellow-500 text-yellow-600' : 'border-green-500 text-green-600'"
            class="px-3 py-1.5 rounded-md border text-sm font-medium hover:opacity-80 transition">
            {{ agent.status === 'active' ? 'Pause' : 'Activate' }}
          </button>
          <button @click="handleDelete"
            class="px-3 py-1.5 rounded-md border border-destructive text-destructive text-sm font-medium hover:bg-destructive hover:text-destructive-foreground transition">
            Delete
          </button>
          <span :class="{
            'text-green-600': agent.status === 'active',
            'text-yellow-600': agent.status === 'paused',
            'text-red-600': agent.status === 'error',
            'text-gray-500': agent.status === 'inactive',
          }" class="text-sm font-semibold uppercase px-3 py-1 rounded-full border border-current">
            {{ agent.status }}
          </span>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div class="p-4 rounded-lg border border-border bg-card">
          <h3 class="font-medium mb-2">Configuration</h3>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Git Repo</dt>
              <dd class="font-mono text-xs truncate max-w-[200px]">{{ agent.gitRepoUrl || '—' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Branch</dt>
              <dd class="font-mono text-xs">{{ agent.gitBranch || 'main' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Agent File</dt>
              <dd class="font-mono text-xs">{{ agent.agentFilePath || '—' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Copilot Model</dt>
              <dd>{{ agent.copilotModel || 'default' }}</dd>
            </div>
          </dl>
        </div>
        <div class="p-4 rounded-lg border border-border bg-card">
          <h3 class="font-medium mb-2">Quota Usage</h3>
          <dl class="space-y-1 text-sm">
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Daily Limit</dt>
              <dd>{{ agent.dailyQuotaLimit ?? 50 }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Monthly Limit</dt>
              <dd>{{ agent.monthlyQuotaLimit ?? 1000 }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-muted-foreground">Created</dt>
              <dd>{{ new Date(agent.createdAt).toLocaleDateString() }}</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Agent Credentials Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-bold">Credentials</h2>
          <button @click="showCredForm = true"
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
            + Add Credential
          </button>
        </div>

        <div v-if="showCredForm" class="mb-4 p-4 rounded-lg border border-border bg-card">
          <div v-if="credError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ credError }}</div>
          <form @submit.prevent="handleAddCred" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Key (UPPER_SNAKE_CASE) *</label>
                <input v-model="credForm.key" type="text" required pattern="^[A-Z_][A-Z0-9_]*$"
                  class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="API_KEY" />
              </div>
              <div>
                <label class="block text-xs font-medium mb-1">Value *</label>
                <input v-model="credForm.value" type="password" required
                  class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Secret value (encrypted at rest)" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium mb-1">Description</label>
              <input v-model="credForm.description" type="text"
                class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="What is this credential for?" />
            </div>
            <div class="flex gap-2">
              <button type="submit" :disabled="savingCred"
                class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                {{ savingCred ? 'Saving...' : 'Save Credential' }}
              </button>
              <button type="button" @click="showCredForm = false"
                class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition">Cancel</button>
            </div>
          </form>
        </div>

        <div class="space-y-2">
          <div v-for="cred in agentCredentials" :key="cred.id"
            class="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
            <div>
              <p class="font-mono font-semibold text-sm">{{ cred.key }}</p>
              <p v-if="cred.description" class="text-xs text-muted-foreground">{{ cred.description }}</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted-foreground font-mono">••••••••</span>
              <button @click="handleDeleteCred(cred.id, cred.key)"
                class="text-xs text-destructive hover:underline">Delete</button>
            </div>
          </div>
          <p v-if="agentCredentials.length === 0 && !showCredForm" class="text-muted-foreground text-sm">
            No credentials stored. Add credentials that will be injected into agent sessions.
          </p>
        </div>
      </div>

      <!-- Workflows Section -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-bold">Workflows</h2>
          <NuxtLink :to="`/workflows?agentId=${agentId}`"
            class="text-sm text-primary hover:underline">Manage Workflows →</NuxtLink>
        </div>
        <div v-for="wf in workflows" :key="wf.id"
          class="p-4 rounded-lg border border-border bg-card mb-3">
          <div class="flex items-center justify-between">
            <NuxtLink :to="`/workflows/${wf.id}`" class="font-semibold hover:text-primary">{{ wf.name }}</NuxtLink>
            <span class="text-xs text-muted-foreground">{{ wf.isActive ? 'Active' : 'Inactive' }}</span>
          </div>
          <p v-if="wf.description" class="text-sm text-muted-foreground mt-1">{{ wf.description }}</p>
        </div>
        <p v-if="workflows.length === 0" class="text-muted-foreground text-sm">No workflows for this agent.</p>
      </div>
    </div>
    <p v-else class="text-muted-foreground">Agent not found.</p>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const router = useRouter();
const agentId = route.params.id as string;

const { data: agentData, refresh: refreshAgent } = await useFetch(`/api/agents/${agentId}`, { headers });
const { data: wfData } = await useFetch(`/api/workflows?agentId=${agentId}`, { headers });
const { data: credData, refresh: refreshCreds } = await useFetch(`/api/credentials?agentId=${agentId}`, { headers });

const agent = computed(() => agentData.value?.agent);
const workflows = computed(() => wfData.value?.workflows ?? []);
const agentCredentials = computed(() => credData.value?.credentials ?? []);

// Status toggle
async function toggleStatus() {
  const newStatus = agent.value?.status === 'active' ? 'paused' : 'active';
  try {
    await $fetch(`/api/agents/${agentId}`, { method: 'PUT', headers, body: { status: newStatus } });
    await refreshAgent();
  } catch {
    alert('Failed to update agent status');
  }
}

// Delete agent
async function handleDelete() {
  if (!confirm(`Delete agent "${agent.value?.name}"? This cannot be undone.`)) return;
  try {
    await $fetch(`/api/agents/${agentId}`, { method: 'DELETE', headers });
    router.push('/agents');
  } catch {
    alert('Failed to delete agent');
  }
}

// Credential management
const showCredForm = ref(false);
const savingCred = ref(false);
const credError = ref('');
const credForm = reactive({ key: '', value: '', description: '' });

async function handleAddCred() {
  credError.value = '';
  savingCred.value = true;
  try {
    await $fetch('/api/credentials', {
      method: 'POST',
      headers,
      body: { agentId, key: credForm.key, value: credForm.value, description: credForm.description || undefined },
    });
    showCredForm.value = false;
    Object.assign(credForm, { key: '', value: '', description: '' });
    await refreshCreds();
  } catch (e: any) {
    credError.value = e?.data?.error || 'Failed to save credential';
  } finally {
    savingCred.value = false;
  }
}

async function handleDeleteCred(id: string, key: string) {
  if (!confirm(`Delete credential "${key}"?`)) return;
  try {
    await $fetch(`/api/credentials/${id}`, { method: 'DELETE', headers });
    await refreshCreds();
  } catch {
    alert('Failed to delete credential');
  }
}
</script>
