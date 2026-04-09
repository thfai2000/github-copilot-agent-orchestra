<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>Security</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <h1 class="text-3xl font-bold mt-4 mb-8">Security Settings</h1>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Credential Approval Settings -->
      <Card>
        <CardHeader>
          <CardTitle>Credential Access Approval</CardTitle>
          <p class="text-sm text-muted-foreground">
            When enabled, agents must get approval from a designated audit agent before accessing credentials via <code>get_credentials_into_env</code>.
          </p>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="flex items-center justify-between">
            <Label>Enable Credential Approval</Label>
            <Switch v-model:checked="form.credentialApprovalEnabled" />
          </div>
          <div v-if="form.credentialApprovalEnabled">
            <Label>Approval Agent</Label>
            <p class="text-xs text-muted-foreground mb-2">Select an agent to act as the security auditor. This agent will review credential access requests in a sandbox Copilot session.</p>
            <select
              v-model="form.approvalAgentId"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
            >
              <option value="">— Select an agent —</option>
              <option v-for="agent in agents" :key="agent.id" :value="agent.id">
                {{ agent.name }}
              </option>
            </select>
          </div>
          <Button @click="saveSettings" :disabled="saving">
            {{ saving ? 'Saving...' : 'Save Settings' }}
          </Button>
        </CardContent>
      </Card>

      <!-- Status Card -->
      <Card>
        <CardHeader>
          <CardTitle>Current Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <div :class="form.credentialApprovalEnabled ? 'bg-green-500' : 'bg-gray-400'" class="w-2.5 h-2.5 rounded-full" />
              <span class="text-sm">Credential approval is <strong>{{ form.credentialApprovalEnabled ? 'enabled' : 'disabled' }}</strong></span>
            </div>
            <div v-if="form.credentialApprovalEnabled && approvalAgentName" class="flex items-center gap-2">
              <div class="bg-blue-500 w-2.5 h-2.5 rounded-full" />
              <span class="text-sm">Audit agent: <strong>{{ approvalAgentName }}</strong></span>
            </div>
            <div v-if="!form.credentialApprovalEnabled" class="text-sm text-muted-foreground">
              All credential access requests are auto-approved and logged.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Credential Access Logs -->
    <Card class="mt-6">
      <CardHeader>
        <CardTitle>Credential Access Logs</CardTitle>
        <p class="text-sm text-muted-foreground">Audit trail of all credential access requests made by agents.</p>
      </CardHeader>
      <CardContent>
        <div v-if="logs.length === 0" class="text-sm text-muted-foreground py-4">
          No credential access logs yet.
        </div>
        <Table v-else>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Credential</TableHead>
              <TableHead>Env Name</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Approved By</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="log in logs" :key="log.id">
              <TableCell class="text-xs whitespace-nowrap">{{ formatDate(log.createdAt) }}</TableCell>
              <TableCell class="font-mono text-xs">{{ log.credentialName }}</TableCell>
              <TableCell class="font-mono text-xs">{{ log.envName }}</TableCell>
              <TableCell class="max-w-[200px] truncate text-xs">{{ log.reason }}</TableCell>
              <TableCell>
                <span :class="log.approved ? 'text-green-600' : 'text-red-600'" class="text-xs font-semibold">
                  {{ log.approved ? 'Approved' : 'Denied' }}
                </span>
              </TableCell>
              <TableCell class="text-xs">{{ log.approvedBy }}</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
          <span class="text-sm text-muted-foreground">Page {{ page }} of {{ totalPages }}</span>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--; loadLogs()">Previous</Button>
            <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++; loadLogs()">Next</Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();

// Load security settings
const { data: settingsData } = await useFetch('/api/admin/security', { headers });
const settings = computed(() => settingsData.value as { credentialApprovalEnabled?: boolean; approvalAgentId?: string } | null);

const form = reactive({
  credentialApprovalEnabled: settings.value?.credentialApprovalEnabled ?? false,
  approvalAgentId: settings.value?.approvalAgentId ?? '',
});

const saving = ref(false);

// Load agents for dropdown
const { data: agentsData } = await useFetch('/api/agents', { headers });
const agents = computed(() => (agentsData.value as Array<{ id: string; name: string }>) ?? []);

const approvalAgentName = computed(() => {
  if (!form.approvalAgentId) return null;
  const agent = agents.value.find(a => a.id === form.approvalAgentId);
  return agent?.name ?? 'Unknown';
});

async function saveSettings() {
  saving.value = true;
  try {
    await $fetch('/api/admin/security', {
      method: 'PUT',
      headers,
      body: {
        credentialApprovalEnabled: form.credentialApprovalEnabled,
        approvalAgentId: form.approvalAgentId || null,
      },
    });
  } finally {
    saving.value = false;
  }
}

// Credential access logs
interface CredentialLog {
  id: string;
  credentialName: string;
  envName: string;
  reason: string;
  approved: boolean;
  approvedBy: string;
  createdAt: string;
}

const logs = ref<CredentialLog[]>([]);
const page = ref(1);
const totalPages = ref(1);

async function loadLogs() {
  const data = await $fetch<{ logs: CredentialLog[]; total: number }>(`/api/admin/credential-logs?page=${page.value}&limit=20`, { headers });
  logs.value = data.logs ?? [];
  totalPages.value = Math.ceil((data.total ?? 0) / 20) || 1;
}

await loadLogs();

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}
</script>
