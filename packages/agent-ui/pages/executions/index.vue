<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">Workflow Executions</h1>

    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-border">
            <th class="text-left py-3 px-4 font-medium">Execution ID</th>
            <th class="text-left py-3 px-4 font-medium">Workflow</th>
            <th class="text-left py-3 px-4 font-medium">Trigger</th>
            <th class="text-center py-3 px-4 font-medium">Status</th>
            <th class="text-left py-3 px-4 font-medium">Started</th>
            <th class="text-left py-3 px-4 font-medium">Completed</th>
            <th class="text-left py-3 px-4 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="exec in executions" :key="exec.id" class="border-b border-border hover:bg-muted/50">
            <td class="py-3 px-4 font-mono text-xs">{{ exec.id.substring(0, 8) }}…</td>
            <td class="py-3 px-4">{{ exec.workflowId?.substring(0, 8) }}…</td>
            <td class="py-3 px-4 text-muted-foreground">{{ exec.triggeredBy }}</td>
            <td class="py-3 px-4 text-center">
              <span :class="{
                'text-green-600': exec.status === 'completed',
                'text-red-600': exec.status === 'failed',
                'text-yellow-600': exec.status === 'running',
                'text-gray-500': exec.status === 'pending' || exec.status === 'cancelled',
              }" class="text-xs font-semibold uppercase">{{ exec.status }}</span>
            </td>
            <td class="py-3 px-4 text-muted-foreground text-xs">
              {{ exec.startedAt ? new Date(exec.startedAt).toLocaleString() : '—' }}
            </td>
            <td class="py-3 px-4 text-muted-foreground text-xs">
              {{ exec.completedAt ? new Date(exec.completedAt).toLocaleString() : '—' }}
            </td>
            <td class="py-3 px-4">
              <NuxtLink :to="`/executions/${exec.id}`" class="text-primary hover:underline text-xs">Detail →</NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="executions.length === 0" class="text-center text-muted-foreground py-8">No executions yet.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

const { data } = await useFetch('/api/executions?limit=50', { headers });
const executions = computed(() => data.value?.executions ?? []);
</script>
