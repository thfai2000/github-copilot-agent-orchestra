<template>
  <div>
    <h1 class="text-3xl font-bold mb-8">Agent Dashboard</h1>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
      <div class="p-4 rounded-lg border border-border bg-card">
        <p class="text-sm text-muted-foreground">Total Agents</p>
        <p class="text-2xl font-bold">{{ agents.length }}</p>
      </div>
      <div class="p-4 rounded-lg border border-border bg-card">
        <p class="text-sm text-muted-foreground">Active Workflows</p>
        <p class="text-2xl font-bold">{{ workflows.length }}</p>
      </div>
      <div class="p-4 rounded-lg border border-border bg-card">
        <p class="text-sm text-muted-foreground">Recent Executions</p>
        <p class="text-2xl font-bold">{{ executions.length }}</p>
      </div>
    </div>

    <h2 class="text-xl font-bold mb-4">Recent Executions</h2>
    <div class="space-y-3">
      <div v-for="exec in executions" :key="exec.id"
        class="p-4 rounded-lg border border-border bg-card flex items-center justify-between">
        <div>
          <p class="font-semibold">{{ exec.workflowId?.substring(0, 8) }}…</p>
          <p class="text-sm text-muted-foreground">
            Started {{ new Date(exec.startedAt || exec.createdAt).toLocaleString() }}
          </p>
        </div>
        <span :class="{
          'text-green-600': exec.status === 'completed',
          'text-red-600': exec.status === 'failed',
          'text-yellow-600': exec.status === 'running',
          'text-gray-500': exec.status === 'pending' || exec.status === 'cancelled',
        }" class="text-sm font-semibold uppercase">{{ exec.status }}</span>
      </div>
      <p v-if="executions.length === 0" class="text-muted-foreground">No executions yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

const { data: agentsData } = await useFetch('/api/agents', { headers });
const { data: workflowsData } = await useFetch('/api/workflows', { headers });
const { data: execData } = await useFetch('/api/executions?limit=10', { headers });

const agents = computed(() => agentsData.value?.agents ?? []);
const workflows = computed(() => workflowsData.value?.workflows ?? []);
const executions = computed(() => execData.value?.executions ?? []);
</script>
