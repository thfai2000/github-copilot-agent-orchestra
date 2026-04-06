<template>
  <div>
    <NuxtLink to="/workflows" class="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">← Back to Workflows</NuxtLink>

    <div v-if="workflow" class="space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-3xl font-bold">{{ workflow.name }}</h1>
        <div class="flex items-center gap-3">
          <button @click="handleManualTrigger" :disabled="triggering"
            class="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition disabled:opacity-50">
            {{ triggering ? 'Triggering...' : '▶ Run Now' }}
          </button>
          <button @click="toggleActive"
            :class="workflow.isActive ? 'border-yellow-500 text-yellow-600' : 'border-green-500 text-green-600'"
            class="px-3 py-1.5 rounded-md border text-sm font-medium hover:opacity-80 transition">
            {{ workflow.isActive ? 'Deactivate' : 'Activate' }}
          </button>
          <span class="text-xs px-2 py-1 rounded-full border"
            :class="workflow.isActive ? 'text-green-600 border-green-600' : 'text-gray-500 border-gray-400'">
            {{ workflow.isActive ? 'Active' : 'Inactive' }}
          </span>
        </div>
      </div>
      <p v-if="workflow.description" class="text-muted-foreground">{{ workflow.description }}</p>

      <div v-if="triggerResult" class="p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
        Workflow triggered! Execution ID: {{ triggerResult.id?.substring(0, 8) }}…
        <NuxtLink :to="`/executions/${triggerResult.id}`" class="text-primary hover:underline ml-2">View →</NuxtLink>
      </div>

      <!-- Steps -->
      <div>
        <h2 class="text-xl font-bold mb-3">Steps</h2>
        <div class="space-y-3">
          <div v-for="(step, idx) in steps" :key="step.id"
            class="p-4 rounded-lg border border-border bg-card">
            <div class="flex items-center gap-3 mb-2">
              <span class="text-xl font-bold text-muted-foreground">{{ idx + 1 }}</span>
              <h3 class="font-semibold">{{ step.name }}</h3>
              <span v-if="step.timeoutSeconds" class="text-xs text-muted-foreground ml-auto">
                Timeout: {{ step.timeoutSeconds }}s
              </span>
            </div>
            <p v-if="step.description" class="text-sm text-muted-foreground mb-2">{{ step.description }}</p>
            <div class="bg-muted p-3 rounded text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{{ step.promptTemplate }}</div>
            <div v-if="step.toolNames?.length" class="mt-2 flex flex-wrap gap-1">
              <span v-for="tool in step.toolNames" :key="tool"
                class="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">{{ tool }}</span>
            </div>
          </div>
        </div>
        <p v-if="steps.length === 0" class="text-muted-foreground">No steps defined.</p>
      </div>

      <!-- Triggers -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-bold">Triggers</h2>
          <button @click="showTriggerForm = true"
            class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition">
            + Add Trigger
          </button>
        </div>

        <div v-if="showTriggerForm" class="mb-4 p-4 rounded-lg border border-border bg-card">
          <div v-if="triggerError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ triggerError }}</div>
          <form @submit.prevent="handleAddTrigger" class="space-y-3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium mb-1">Trigger Type *</label>
                <select v-model="triggerForm.triggerType" required
                  class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="time_schedule">Time Schedule (Cron)</option>
                  <option value="webhook">Webhook</option>
                  <option value="event">Event</option>
                  <option value="manual">Manual Only</option>
                </select>
              </div>
              <div v-if="triggerForm.triggerType === 'time_schedule'">
                <label class="block text-xs font-medium mb-1">Cron Expression *</label>
                <input v-model="triggerForm.cron" type="text"
                  class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="0 9 * * 1-5" />
                <p class="text-xs text-muted-foreground mt-1">e.g. "0 9 * * 1-5" = 9 AM weekdays</p>
              </div>
              <div v-if="triggerForm.triggerType === 'event'">
                <label class="block text-xs font-medium mb-1">Event Type *</label>
                <input v-model="triggerForm.eventType" type="text"
                  class="w-full px-3 py-2 rounded-md border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="price_alert" />
              </div>
            </div>
            <div class="flex gap-2">
              <button type="submit" :disabled="savingTrigger"
                class="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition disabled:opacity-50">
                {{ savingTrigger ? 'Saving...' : 'Add Trigger' }}
              </button>
              <button type="button" @click="showTriggerForm = false"
                class="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-muted transition">Cancel</button>
            </div>
          </form>
        </div>

        <div class="space-y-2">
          <div v-for="trigger in triggers" :key="trigger.id"
            class="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="text-xs font-medium uppercase px-2 py-0.5 rounded bg-muted">{{ trigger.triggerType || trigger.type }}</span>
              <span class="text-sm font-mono">{{ trigger.configuration?.cron || trigger.configuration?.eventType || trigger.config?.cron || trigger.config?.eventType || 'manual' }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span :class="trigger.isActive ? 'text-green-600' : 'text-gray-500'" class="text-xs">
                {{ trigger.isActive ? 'Enabled' : 'Disabled' }}
              </span>
              <button @click="handleDeleteTrigger(trigger.id)" class="text-xs text-destructive hover:underline">Delete</button>
            </div>
          </div>
          <p v-if="triggers.length === 0 && !showTriggerForm" class="text-muted-foreground text-sm">No triggers configured.</p>
        </div>
      </div>
    </div>
    <p v-else class="text-muted-foreground">Workflow not found.</p>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const workflowId = route.params.id as string;

const { authHeaders } = useAuth();
const headers = authHeaders();

const { data: wfData, refresh: refreshWf } = await useFetch(`/api/workflows/${workflowId}`, { headers });
const { data: trigData, refresh: refreshTriggers } = await useFetch(`/api/triggers?workflowId=${workflowId}`, { headers });

const workflow = computed(() => wfData.value?.workflow);
const steps = computed(() => wfData.value?.steps ?? []);
const triggers = computed(() => trigData.value?.triggers ?? []);

// Manual trigger
const triggering = ref(false);
const triggerResult = ref<any>(null);

async function handleManualTrigger() {
  triggering.value = true;
  triggerResult.value = null;
  try {
    const res = await $fetch<{ execution: any }>(`/api/workflows/${workflowId}/trigger`, {
      method: 'POST',
      headers,
    });
    triggerResult.value = res.execution;
  } catch (e: any) {
    alert(e?.data?.error || 'Failed to trigger workflow');
  } finally {
    triggering.value = false;
  }
}

// Toggle active state
async function toggleActive() {
  try {
    await $fetch(`/api/workflows/${workflowId}`, {
      method: 'PUT',
      headers,
      body: { isActive: !workflow.value?.isActive },
    });
    await refreshWf();
  } catch {
    alert('Failed to update workflow');
  }
}

// Trigger management
const showTriggerForm = ref(false);
const savingTrigger = ref(false);
const triggerError = ref('');
const triggerForm = reactive({ triggerType: 'time_schedule', cron: '', eventType: '' });

async function handleAddTrigger() {
  triggerError.value = '';
  savingTrigger.value = true;
  try {
    const configuration: Record<string, unknown> = {};
    if (triggerForm.triggerType === 'time_schedule') configuration.cron = triggerForm.cron;
    if (triggerForm.triggerType === 'event') configuration.eventType = triggerForm.eventType;

    await $fetch('/api/triggers', {
      method: 'POST',
      headers,
      body: { workflowId, triggerType: triggerForm.triggerType, configuration },
    });
    showTriggerForm.value = false;
    Object.assign(triggerForm, { triggerType: 'time_schedule', cron: '', eventType: '' });
    await refreshTriggers();
  } catch (e: any) {
    triggerError.value = e?.data?.error || 'Failed to add trigger';
  } finally {
    savingTrigger.value = false;
  }
}

async function handleDeleteTrigger(id: string) {
  if (!confirm('Delete this trigger?')) return;
  try {
    await $fetch(`/api/triggers/${id}`, { method: 'DELETE', headers });
    await refreshTriggers();
  } catch {
    alert('Failed to delete trigger');
  }
}
</script>
