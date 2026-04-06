<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold">Agents</h1>
      <button @click="showCreate = true"
        class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition">
        + Create Agent
      </button>
    </div>

    <!-- Create/Edit Form -->
    <div v-if="showCreate" class="mb-6 p-6 rounded-lg border border-border bg-card">
      <h2 class="text-lg font-semibold mb-4">{{ editingId ? 'Edit Agent' : 'Create New Agent' }}</h2>
      <div v-if="formError" class="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ formError }}</div>
      <form @submit.prevent="handleSubmit" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1.5">Name *</label>
            <input v-model="form.name" type="text" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="My Trading Agent" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Git Repository URL *</label>
            <input v-model="form.gitRepoUrl" type="url" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="https://github.com/user/repo" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Git Branch</label>
            <input v-model="form.gitBranch" type="text"
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="main" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Agent File Path *</label>
            <input v-model="form.agentFilePath" type="text" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder=".github/agents/trading.md" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Description</label>
          <textarea v-model="form.description" rows="2"
            class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="What does this agent do?" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">GitHub Token (optional, encrypted)</label>
          <input v-model="form.githubToken" type="password"
            class="w-full max-w-md px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="ghp_..." />
        </div>
        <div class="flex gap-3 pt-2">
          <button type="submit" :disabled="submitting"
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
            {{ submitting ? 'Saving...' : editingId ? 'Update Agent' : 'Create Agent' }}
          </button>
          <button type="button" @click="cancelForm"
            class="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition">
            Cancel
          </button>
        </div>
      </form>
    </div>

    <!-- Agents List -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div v-for="agent in agents" :key="agent.id"
        class="p-4 rounded-lg border border-border bg-card">
        <div class="flex items-center justify-between mb-2">
          <h3 class="font-semibold text-lg">{{ agent.name }}</h3>
          <span :class="{
            'text-green-600': agent.status === 'active',
            'text-yellow-600': agent.status === 'paused',
            'text-red-600': agent.status === 'error',
            'text-gray-500': agent.status === 'inactive',
          }" class="text-xs font-medium uppercase">{{ agent.status }}</span>
        </div>
        <p v-if="agent.description" class="text-sm text-muted-foreground mb-2">{{ agent.description }}</p>
        <div class="flex items-center gap-4 text-xs text-muted-foreground">
          <span v-if="agent.gitRepoUrl" class="truncate max-w-[200px]">{{ agent.gitRepoUrl }}</span>
          <div class="flex gap-2 ml-auto">
            <NuxtLink :to="`/agents/${agent.id}`" class="text-primary hover:underline">View →</NuxtLink>
            <button @click="startEdit(agent)" class="text-muted-foreground hover:text-foreground">Edit</button>
            <button @click="handleDelete(agent.id, agent.name)" class="text-destructive hover:underline">Delete</button>
          </div>
        </div>
      </div>
    </div>
    <p v-if="agents.length === 0 && !showCreate" class="text-muted-foreground text-center py-8">
      No agents registered yet. Click "Create Agent" to get started.
    </p>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

const showCreate = ref(false);
const editingId = ref<string | null>(null);
const submitting = ref(false);
const formError = ref('');
const form = reactive({
  name: '',
  description: '',
  gitRepoUrl: '',
  gitBranch: 'main',
  agentFilePath: '',
  githubToken: '',
});

const { data, refresh } = await useFetch('/api/agents', { headers });
const agents = computed(() => data.value?.agents ?? []);

function cancelForm() {
  showCreate.value = false;
  editingId.value = null;
  Object.assign(form, { name: '', description: '', gitRepoUrl: '', gitBranch: 'main', agentFilePath: '', githubToken: '' });
}

function startEdit(agent: any) {
  editingId.value = agent.id;
  Object.assign(form, {
    name: agent.name,
    description: agent.description || '',
    gitRepoUrl: agent.gitRepoUrl || '',
    gitBranch: agent.gitBranch || 'main',
    agentFilePath: agent.agentFilePath || '',
    githubToken: '',
  });
  showCreate.value = true;
}

async function handleSubmit() {
  formError.value = '';
  submitting.value = true;
  try {
    const body: Record<string, unknown> = {
      name: form.name,
      description: form.description || undefined,
      gitRepoUrl: form.gitRepoUrl,
      gitBranch: form.gitBranch,
      agentFilePath: form.agentFilePath,
    };
    if (form.githubToken) body.githubToken = form.githubToken;

    if (editingId.value) {
      await $fetch(`/api/agents/${editingId.value}`, { method: 'PUT', headers, body });
    } else {
      await $fetch('/api/agents', { method: 'POST', headers, body });
    }
    cancelForm();
    await refresh();
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed to save agent';
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(id: string, name: string) {
  if (!confirm(`Delete agent "${name}"? This will also remove its workflows and credentials.`)) return;
  try {
    await $fetch(`/api/agents/${id}`, { method: 'DELETE', headers });
    await refresh();
  } catch {
    alert('Failed to delete agent');
  }
}

// Auto-refresh agent status every 30 seconds
const refreshInterval = ref<ReturnType<typeof setInterval>>();
onMounted(() => {
  refreshInterval.value = setInterval(() => refresh(), 30_000);
});
onUnmounted(() => {
  if (refreshInterval.value) clearInterval(refreshInterval.value);
});
</script>
