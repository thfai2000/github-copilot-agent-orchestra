<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-3xl font-bold">Workflows</h1>
      <button @click="showCreate = true"
        class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition">
        + Create Workflow
      </button>
    </div>

    <!-- Create Form -->
    <div v-if="showCreate" class="mb-6 p-6 rounded-lg border border-border bg-card">
      <h2 class="text-lg font-semibold mb-4">Create New Workflow</h2>
      <div v-if="formError" class="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ formError }}</div>
      <form @submit.prevent="handleCreate" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1.5">Name *</label>
            <input v-model="form.name" type="text" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Daily Market Analysis" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1.5">Agent *</label>
            <select v-model="form.agentId" required
              class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
              <option value="" disabled>Select an agent...</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1.5">Description</label>
          <textarea v-model="form.description" rows="2"
            class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="What does this workflow do?" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium">Steps *</label>
            <button type="button" @click="addStep"
              class="text-xs text-primary hover:underline">+ Add Step</button>
          </div>
          <div v-for="(step, idx) in form.steps" :key="idx" class="mb-3 p-4 rounded-lg border border-border bg-muted/30">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">Step {{ idx + 1 }}</span>
              <button v-if="form.steps.length > 1" type="button" @click="form.steps.splice(idx, 1)"
                class="text-xs text-destructive hover:underline">Remove</button>
            </div>
            <div class="space-y-2">
              <input v-model="step.name" type="text" required
                class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Step name" />
              <textarea v-model="step.promptTemplate" rows="3" required
                class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder="Prompt template for this step..." />
            </div>
          </div>
        </div>

        <div class="flex gap-3 pt-2">
          <button type="submit" :disabled="submitting"
            class="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition disabled:opacity-50">
            {{ submitting ? 'Creating...' : 'Create Workflow' }}
          </button>
          <button type="button" @click="showCreate = false"
            class="px-4 py-2 rounded-md border border-border text-sm hover:bg-muted transition">Cancel</button>
        </div>
      </form>
    </div>

    <!-- Workflows List -->
    <div class="space-y-3">
      <div v-for="wf in workflows" :key="wf.id"
        class="p-4 rounded-lg border border-border bg-card">
        <div class="flex items-center justify-between mb-2">
          <NuxtLink :to="`/workflows/${wf.id}`" class="font-semibold text-lg hover:text-primary">
            {{ wf.name }}
          </NuxtLink>
          <div class="flex items-center gap-2">
            <span class="text-xs px-2 py-0.5 rounded bg-muted">{{ wf.isActive ? 'Active' : 'Inactive' }}</span>
          </div>
        </div>
        <p v-if="wf.description" class="text-sm text-muted-foreground mb-2">{{ wf.description }}</p>
        <div class="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Agent: {{ agentNameMap[wf.agentId] || wf.agentId?.substring(0, 8) + '…' }}</span>
          <button @click="handleDeleteWorkflow(wf.id, wf.name)" class="text-destructive hover:underline ml-auto">Delete</button>
        </div>
      </div>
      <p v-if="workflows.length === 0 && !showCreate" class="text-muted-foreground text-center py-8">
        No workflows created yet. Click "Create Workflow" to get started.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

const showCreate = ref(false);
const submitting = ref(false);
const formError = ref('');
const form = reactive({
  name: '',
  agentId: '',
  description: '',
  steps: [{ name: '', promptTemplate: '', stepOrder: 1 }] as Array<{ name: string; promptTemplate: string; stepOrder: number }>,
});

const { data, refresh } = await useFetch('/api/workflows', { headers });
const { data: agentsData } = await useFetch('/api/agents', { headers });

const workflows = computed(() => data.value?.workflows ?? []);
const agents = computed(() => agentsData.value?.agents ?? []);

const agentNameMap = computed(() => {
  const map: Record<string, string> = {};
  for (const a of agents.value) map[a.id] = a.name;
  return map;
});

function addStep() {
  form.steps.push({ name: '', promptTemplate: '', stepOrder: form.steps.length + 1 });
}

async function handleCreate() {
  formError.value = '';
  submitting.value = true;
  try {
    await $fetch('/api/workflows', {
      method: 'POST',
      headers,
      body: {
        agentId: form.agentId,
        name: form.name,
        description: form.description || undefined,
        steps: form.steps.map((s, i) => ({ ...s, stepOrder: i + 1 })),
      },
    });
    showCreate.value = false;
    form.name = '';
    form.agentId = '';
    form.description = '';
    form.steps = [{ name: '', promptTemplate: '', stepOrder: 1 }];
    await refresh();
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed to create workflow';
  } finally {
    submitting.value = false;
  }
}

async function handleDeleteWorkflow(id: string, name: string) {
  if (!confirm(`Delete workflow "${name}"?`)) return;
  try {
    await $fetch(`/api/workflows/${id}`, { method: 'DELETE', headers });
    await refresh();
  } catch {
    alert('Failed to delete workflow');
  }
}
</script>
