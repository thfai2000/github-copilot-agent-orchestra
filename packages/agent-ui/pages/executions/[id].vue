<template>
  <div>
    <NuxtLink to="/executions" class="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Back to Executions</NuxtLink>

    <div v-if="execution" class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Execution {{ execution.id.substring(0, 8) }}…</h1>
        <span :class="{
          'text-green-600': execution.status === 'completed',
          'text-red-600': execution.status === 'failed',
          'text-yellow-600': execution.status === 'running',
          'text-gray-500': execution.status === 'pending' || execution.status === 'cancelled',
        }" class="text-sm font-semibold uppercase px-3 py-1 rounded-full border border-current">
          {{ execution.status }}
        </span>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="p-3 rounded border border-border bg-card">
          <p class="text-xs text-muted-foreground">Triggered By</p>
          <p class="font-medium">{{ execution.triggeredBy }}</p>
        </div>
        <div class="p-3 rounded border border-border bg-card">
          <p class="text-xs text-muted-foreground">Started</p>
          <p class="font-medium text-sm">{{ execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '—' }}</p>
        </div>
        <div class="p-3 rounded border border-border bg-card">
          <p class="text-xs text-muted-foreground">Completed</p>
          <p class="font-medium text-sm">{{ execution.completedAt ? new Date(execution.completedAt).toLocaleString() : '—' }}</p>
        </div>
        <div class="p-3 rounded border border-border bg-card">
          <p class="text-xs text-muted-foreground">Steps</p>
          <p class="font-medium">{{ steps.length }}</p>
        </div>
      </div>

      <div v-if="workflow" class="p-3 rounded border border-border bg-card">
        <p class="text-xs text-muted-foreground">Workflow</p>
        <p class="font-medium">{{ workflow.name }}</p>
      </div>

      <div v-if="execution.errorMessage" class="p-4 rounded-lg border border-destructive bg-destructive/10">
        <p class="font-medium text-destructive">Error</p>
        <p class="text-sm mt-1">{{ execution.errorMessage }}</p>
      </div>

      <h2 class="text-xl font-bold">Step Execution Trace</h2>
      <div class="space-y-4">
        <div v-for="(step, idx) in steps" :key="step.id"
          class="rounded-lg border border-border bg-card overflow-hidden">
          <!-- Step header -->
          <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
            @click="toggleStep(step.id)">
            <div class="flex items-center gap-3">
              <span class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                :class="{
                  'bg-green-100 text-green-700': step.status === 'completed',
                  'bg-red-100 text-red-700': step.status === 'failed',
                  'bg-yellow-100 text-yellow-700': step.status === 'running',
                  'bg-gray-100 text-gray-500': step.status === 'pending' || step.status === 'skipped',
                }">{{ idx + 1 }}</span>
              <div>
                <p class="font-semibold">Step {{ step.stepOrder }}</p>
                <p class="text-xs text-muted-foreground">{{ step.id.substring(0, 8) }}…</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <span v-if="step.startedAt && step.completedAt" class="text-xs text-muted-foreground">
                {{ ((new Date(step.completedAt).getTime() - new Date(step.startedAt).getTime()) / 1000).toFixed(1) }}s
              </span>
              <span :class="{
                'text-green-600': step.status === 'completed',
                'text-red-600': step.status === 'failed',
                'text-yellow-600': step.status === 'running',
                'text-gray-500': step.status === 'pending' || step.status === 'skipped',
              }" class="text-xs font-semibold uppercase">{{ step.status }}</span>
              <span class="text-muted-foreground text-xs">{{ expandedSteps.has(step.id) ? '▼' : '▶' }}</span>
            </div>
          </div>

          <!-- Step details (collapsible) -->
          <div v-if="expandedSteps.has(step.id)" class="border-t border-border p-4 space-y-3">
            <div v-if="step.inputPrompt">
              <p class="text-xs font-medium text-muted-foreground mb-1">Input Prompt</p>
              <pre class="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{{ step.inputPrompt }}</pre>
            </div>

            <div v-if="step.output">
              <p class="text-xs font-medium text-muted-foreground mb-1">Output</p>
              <pre class="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{{ step.output }}</pre>
            </div>

            <div v-if="step.reasoning">
              <p class="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
              <pre class="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-48 overflow-y-auto">{{ step.reasoning }}</pre>
            </div>

            <!-- Reasoning Trace (JSONB) -->
            <div v-if="step.reasoningTrace">
              <p class="text-xs font-medium text-muted-foreground mb-1">Reasoning Trace</p>
              <div class="space-y-2">
                <!-- Tool calls -->
                <div v-if="getTraceToolCalls(step.reasoningTrace).length" class="space-y-2">
                  <p class="text-xs font-medium text-blue-600">Tool Calls</p>
                  <div v-for="(call, i) in getTraceToolCalls(step.reasoningTrace)" :key="i"
                    class="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 rounded text-xs">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="font-mono font-bold text-blue-700 dark:text-blue-300">{{ call.tool || call.name || 'unknown' }}</span>
                      <span v-if="call.duration" class="text-muted-foreground">({{ call.duration }}ms)</span>
                    </div>
                    <div v-if="call.input || call.arguments || call.params" class="mt-1">
                      <span class="text-muted-foreground">Input:</span>
                      <pre class="mt-1 whitespace-pre-wrap text-[11px]">{{ JSON.stringify(call.input || call.arguments || call.params, null, 2) }}</pre>
                    </div>
                    <div v-if="call.output || call.result" class="mt-1">
                      <span class="text-muted-foreground">Output:</span>
                      <pre class="mt-1 whitespace-pre-wrap text-[11px] max-h-32 overflow-y-auto">{{ JSON.stringify(call.output || call.result, null, 2) }}</pre>
                    </div>
                  </div>
                </div>
                <!-- Raw trace fallback -->
                <div v-else>
                  <pre class="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-64 overflow-y-auto">{{ JSON.stringify(step.reasoningTrace, null, 2) }}</pre>
                </div>
              </div>
            </div>

            <div v-if="step.errorMessage" class="p-3 rounded border border-destructive bg-destructive/10">
              <p class="text-xs text-destructive">{{ step.errorMessage }}</p>
            </div>

            <div class="flex gap-4 text-xs text-muted-foreground">
              <span v-if="step.startedAt">Started: {{ new Date(step.startedAt).toLocaleString() }}</span>
              <span v-if="step.completedAt">Completed: {{ new Date(step.completedAt).toLocaleString() }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <p v-else class="text-muted-foreground">Execution not found.</p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const executionId = route.params.id as string;

const { authHeaders } = useAuth();
const headers = authHeaders();

const { data } = await useFetch(`/api/executions/${executionId}`, { headers });

const execution = computed(() => data.value?.execution);
const steps = computed(() => data.value?.steps ?? []);
const workflow = computed(() => data.value?.workflow);

const expandedSteps = ref(new Set<string>());

function toggleStep(id: string) {
  if (expandedSteps.value.has(id)) {
    expandedSteps.value.delete(id);
  } else {
    expandedSteps.value.add(id);
  }
}

function getTraceToolCalls(trace: unknown): Array<Record<string, unknown>> {
  if (!trace) return [];
  if (Array.isArray(trace)) return trace;
  if (typeof trace === 'object' && trace !== null) {
    const t = trace as Record<string, unknown>;
    if (Array.isArray(t.toolCalls)) return t.toolCalls;
    if (Array.isArray(t.tool_calls)) return t.tool_calls;
    if (Array.isArray(t.calls)) return t.calls;
  }
  return [];
}
</script>
