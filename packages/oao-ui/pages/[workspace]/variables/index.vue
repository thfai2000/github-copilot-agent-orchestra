<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>Variables</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="flex items-center justify-between mt-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold">Variables</h1>
        <p class="text-muted-foreground mt-1">Encrypted key-value pairs. <strong>Credentials</strong> are injected into Copilot sessions. <strong>Properties</strong> can be used as tokens in prompts.</p>
      </div>
      <Button @click="showCreate = true">+ Add Variable</Button>
    </div>

    <!-- Property Hint -->
    <div class="mb-6 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
      <p class="text-sm text-blue-700 dark:text-blue-300">
        <strong>Tip:</strong> Properties can be referenced in agent prompt templates using <code class="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs font-mono" v-text="'{{ Properties.KEY_NAME }}'"></code>. Variables flagged as <em>"Inject as Env Variable"</em> will be written to the agent's <code class="bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded text-xs font-mono">.env</code> file during execution.
      </p>
    </div>

    <!-- Create Form Dialog -->
    <Dialog v-model:open="showCreate">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add New Variable</DialogTitle>
          <DialogDescription>Variables are encrypted at rest. Priority: Agent &gt; User &gt; Workspace (more specific wins).</DialogDescription>
        </DialogHeader>
        <div v-if="formError" class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ formError }}</div>
        <form @submit.prevent="handleCreate" class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>Scope *</Label>
              <select v-model="form.scope" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="user">User-level (all workflows)</option>
                <option value="agent">Agent-level (specific agent)</option>
                <option v-if="isAdmin" value="workspace">Workspace-level (all users)</option>
              </select>
            </div>
            <div class="space-y-2">
              <Label>Type *</Label>
              <select v-model="form.variableType" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="credential">Credential</option>
                <option value="property">Property</option>
              </select>
            </div>
          </div>
          <!-- Credential Sub-Type -->
          <div v-if="form.variableType === 'credential'" class="space-y-2">
            <Label>Credential Type *</Label>
            <select v-model="form.credentialSubType" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="secret_text">Secret Text</option>
              <option value="github_token">GitHub Token (PAT)</option>
              <option value="github_app">GitHub App Credential</option>
              <option value="user_account">User Account</option>
              <option value="private_key">Private Key (SSH/PEM)</option>
              <option value="certificate">Certificate</option>
            </select>
            <p class="text-xs text-muted-foreground">
              {{ CREDENTIAL_SUB_TYPE_HINTS[form.credentialSubType] || '' }}
            </p>
          </div>
          <div v-if="form.scope === 'agent'" class="space-y-2">
            <Label>Agent *</Label>
            <select v-model="form.agentId" :required="form.scope === 'agent'" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="" disabled>Select an agent…</option>
              <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label>Key (UPPER_SNAKE_CASE) *</Label>
              <Input v-model="form.key" required pattern="^[A-Z_][A-Z0-9_]*$" class="font-mono" placeholder="API_KEY" />
            </div>
          </div>

          <!-- Dynamic Value Fields based on credential sub-type -->
          <template v-if="form.variableType === 'credential' && form.credentialSubType === 'github_app'">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>App ID *</Label>
                <Input v-model="subFields.appId" required placeholder="123456" />
              </div>
              <div class="space-y-2">
                <Label>Installation ID *</Label>
                <Input v-model="subFields.installationId" required placeholder="789012" />
              </div>
            </div>
            <div class="space-y-2">
              <Label>Private Key (PEM) *</Label>
              <Textarea v-model="subFields.privateKey" required rows="4" class="font-mono text-xs" placeholder="-----BEGIN RSA PRIVATE KEY-----" />
            </div>
          </template>
          <template v-else-if="form.variableType === 'credential' && form.credentialSubType === 'user_account'">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label>Username *</Label>
                <Input v-model="subFields.username" required placeholder="user@example.com" />
              </div>
              <div class="space-y-2">
                <Label>Password / Secret *</Label>
                <Input v-model="subFields.password" type="password" required placeholder="Secret" />
              </div>
            </div>
          </template>
          <template v-else-if="form.variableType === 'credential' && form.credentialSubType === 'private_key'">
            <div class="space-y-2">
              <Label>Private Key (PEM/SSH) *</Label>
              <Textarea v-model="subFields.key" required rows="5" class="font-mono text-xs" placeholder="-----BEGIN PRIVATE KEY-----" />
            </div>
            <div class="space-y-2">
              <Label>Passphrase (optional)</Label>
              <Input v-model="subFields.passphrase" type="password" placeholder="Passphrase if key is encrypted" />
            </div>
          </template>
          <template v-else-if="form.variableType === 'credential' && form.credentialSubType === 'certificate'">
            <div class="space-y-2">
              <Label>Certificate (PEM) *</Label>
              <Textarea v-model="subFields.certificate" required rows="4" class="font-mono text-xs" placeholder="-----BEGIN CERTIFICATE-----" />
            </div>
            <div class="space-y-2">
              <Label>Private Key (optional)</Label>
              <Textarea v-model="subFields.key" rows="4" class="font-mono text-xs" placeholder="-----BEGIN PRIVATE KEY-----" />
            </div>
            <div class="space-y-2">
              <Label>Passphrase (optional)</Label>
              <Input v-model="subFields.passphrase" type="password" placeholder="Passphrase" />
            </div>
          </template>
          <template v-else>
            <!-- secret_text, github_token, or property -->
            <div class="space-y-2">
              <Label>Value *</Label>
              <Input v-model="form.value" type="password" required :placeholder="form.credentialSubType === 'github_token' ? 'ghp_xxxxxxxxxxxx' : 'Secret value (encrypted at rest)'" />
            </div>
          </template>
          <div class="space-y-2">
            <Label>Description</Label>
            <Input v-model="form.description" placeholder="What is this variable for?" />
          </div>
          <div class="flex items-center gap-2">
            <Switch :checked="form.injectAsEnvVariable" @update:checked="form.injectAsEnvVariable = $event" />
            <Label class="text-sm">Inject as environment variable in agent's .env file</Label>
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" @click="showCreate = false">Cancel</Button>
            <Button type="submit" :disabled="submitting">{{ submitting ? 'Saving…' : 'Save Variable' }}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Workspace-level Variables (admin only) -->
    <Card v-if="isAdmin" class="mb-6">
      <CardHeader>
        <CardTitle>Workspace Variables</CardTitle>
        <CardDescription>Available to all users in this workspace. Lowest priority — overridden by user &amp; agent variables.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div v-for="v in workspaceVariables" :key="v.id"
            class="p-4 rounded-lg border border-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="font-mono font-semibold">{{ v.key }}</span>
              <Badge :variant="v.variableType === 'property' ? 'outline' : 'secondary'">{{ v.variableType }}</Badge>
              <Badge v-if="v.variableType === 'credential' && v.credentialSubType && v.credentialSubType !== 'secret_text'" variant="outline" class="text-xs">{{ formatSubType(v.credentialSubType) }}</Badge>
              <Badge v-if="v.injectAsEnvVariable" variant="outline" class="text-xs">env</Badge>
              <span v-if="v.description" class="text-xs text-muted-foreground">{{ v.description }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted-foreground font-mono">••••••••</span>
              <Button variant="ghost" size="sm" class="text-destructive text-xs h-7" @click="handleDelete(v.id, v.key, 'workspace')">Delete</Button>
            </div>
          </div>
          <p v-if="workspaceVariables.length === 0" class="text-muted-foreground text-sm">No workspace-level variables stored.</p>
        </div>
      </CardContent>
    </Card>

    <!-- User-level Variables -->
    <Card class="mb-6">
      <CardHeader>
        <CardTitle>User Variables</CardTitle>
        <CardDescription>Available to all workflow steps. Agent-level variables with the same key take priority.</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="space-y-2">
          <div v-for="v in userVariables" :key="v.id"
            class="p-4 rounded-lg border border-border flex items-center justify-between">
            <div class="flex items-center gap-3">
              <span class="font-mono font-semibold">{{ v.key }}</span>
              <Badge :variant="v.variableType === 'property' ? 'outline' : 'secondary'">{{ v.variableType }}</Badge>
              <Badge v-if="v.variableType === 'credential' && v.credentialSubType && v.credentialSubType !== 'secret_text'" variant="outline" class="text-xs">{{ formatSubType(v.credentialSubType) }}</Badge>
              <Badge v-if="v.injectAsEnvVariable" variant="outline" class="text-xs">env</Badge>
              <span v-if="v.description" class="text-xs text-muted-foreground">{{ v.description }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-muted-foreground font-mono">••••••••</span>
              <Button variant="ghost" size="sm" class="text-destructive text-xs h-7" @click="handleDelete(v.id, v.key, 'user')">Delete</Button>
            </div>
          </div>
          <p v-if="userVariables.length === 0" class="text-muted-foreground text-sm">No user-level variables stored.</p>
        </div>
      </CardContent>
    </Card>

    <!-- Agent-level Variables -->
    <Card>
      <CardHeader>
        <CardTitle>Agent Variables</CardTitle>
        <CardDescription>Scoped to a specific agent. Override user-level variables with the same key during execution.</CardDescription>
      </CardHeader>
      <CardContent>
        <div v-for="a in agents" :key="a.id">
          <div v-if="varsByAgent[a.id]?.length" class="mb-4">
            <h3 class="text-sm font-semibold mb-2 flex items-center gap-2">
              {{ a.name }}
              <Badge variant="secondary" class="text-xs">{{ varsByAgent[a.id].length }}</Badge>
            </h3>
            <div class="space-y-2">
              <div v-for="v in varsByAgent[a.id]" :key="v.id"
                class="p-4 rounded-lg border border-border flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="font-mono font-semibold">{{ v.key }}</span>
                  <Badge :variant="v.variableType === 'property' ? 'outline' : 'secondary'">{{ v.variableType }}</Badge>
                  <Badge v-if="v.variableType === 'credential' && v.credentialSubType && v.credentialSubType !== 'secret_text'" variant="outline" class="text-xs">{{ formatSubType(v.credentialSubType) }}</Badge>
                  <Badge v-if="v.injectAsEnvVariable" variant="outline" class="text-xs">env</Badge>
                  <span v-if="v.description" class="text-xs text-muted-foreground">{{ v.description }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted-foreground font-mono">••••••••</span>
                  <Button variant="ghost" size="sm" class="text-destructive text-xs h-7" @click="handleDelete(v.id, v.key, 'agent')">Delete</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <p v-if="allAgentVariables.length === 0" class="text-muted-foreground text-sm">No agent-level variables stored.</p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
const { authHeaders, user } = useAuth();
const headers = authHeaders();
const isAdmin = computed(() => user.value?.role === 'workspace_admin' || user.value?.role === 'super_admin');

const showCreate = ref(false);
const submitting = ref(false);
const formError = ref('');
const form = reactive({ scope: 'user', agentId: '', key: '', value: '', description: '', variableType: 'credential' as string, credentialSubType: 'secret_text' as string, injectAsEnvVariable: false });
const subFields = reactive({ appId: '', installationId: '', privateKey: '', username: '', password: '', key: '', passphrase: '', certificate: '' });

const CREDENTIAL_SUB_TYPE_HINTS: Record<string, string> = {
  secret_text: 'A generic secret string (API key, token, etc.)',
  github_token: 'GitHub Personal Access Token (classic or fine-grained)',
  github_app: 'GitHub App credentials with App ID, Installation ID and Private Key',
  user_account: 'Username and password/secret pair',
  private_key: 'SSH or PEM private key, optionally with passphrase',
  certificate: 'X.509 certificate with optional private key and passphrase',
};

function formatSubType(subType: string): string {
  const labels: Record<string, string> = {
    secret_text: 'Secret Text',
    github_token: 'GitHub Token',
    github_app: 'GitHub App',
    user_account: 'User Account',
    private_key: 'Private Key',
    certificate: 'Certificate',
  };
  return labels[subType] || subType;
}

/** Serialize sub-fields into a JSON string for multi-attribute credential types */
function buildCredentialValue(): string {
  const st = form.credentialSubType;
  if (st === 'github_app') {
    return JSON.stringify({ appId: subFields.appId, installationId: subFields.installationId, privateKey: subFields.privateKey });
  }
  if (st === 'user_account') {
    return JSON.stringify({ username: subFields.username, password: subFields.password });
  }
  if (st === 'private_key') {
    const obj: Record<string, string> = { key: subFields.key };
    if (subFields.passphrase) obj.passphrase = subFields.passphrase;
    return JSON.stringify(obj);
  }
  if (st === 'certificate') {
    const obj: Record<string, string> = { certificate: subFields.certificate };
    if (subFields.key) obj.key = subFields.key;
    if (subFields.passphrase) obj.passphrase = subFields.passphrase;
    return JSON.stringify(obj);
  }
  // secret_text, github_token, property — use form.value directly
  return form.value;
}

function resetSubFields() {
  Object.assign(subFields, { appId: '', installationId: '', privateKey: '', username: '', password: '', key: '', passphrase: '', certificate: '' });
}

const { data: agentsData } = await useFetch('/api/agents', { headers });
const agents = computed(() => agentsData.value?.agents ?? []);

const userVariables = ref<any[]>([]);
const allAgentVariables = ref<any[]>([]);
const workspaceVariables = ref<any[]>([]);
const varsByAgent = computed(() => {
  const map: Record<string, any[]> = {};
  for (const v of allAgentVariables.value) {
    if (!map[v.agentId]) map[v.agentId] = [];
    map[v.agentId].push(v);
  }
  return map;
});

async function fetchAllVariables() {
  try {
    const data = await $fetch<{ variables: any[] }>('/api/variables?scope=user', { headers });
    userVariables.value = data.variables || [];
  } catch {
    userVariables.value = [];
  }

  // Fetch workspace variables
  if (isAdmin.value) {
    try {
      const data = await $fetch<{ variables: any[] }>('/api/variables?scope=workspace', { headers });
      workspaceVariables.value = data.variables || [];
    } catch {
      workspaceVariables.value = [];
    }
  }

  const results: any[] = [];
  for (const a of agents.value) {
    try {
      const data = await $fetch<{ variables: any[] }>(`/api/variables?agentId=${a.id}`, { headers });
      results.push(...(data.variables || []));
    } catch { /* skip */ }
  }
  allAgentVariables.value = results;
}

await fetchAllVariables();

async function handleCreate() {
  formError.value = '';
  submitting.value = true;
  try {
    const body: Record<string, unknown> = {
      key: form.key,
      value: form.value,
      description: form.description || undefined,
      variableType: form.variableType,
      credentialSubType: form.variableType === 'credential' ? form.credentialSubType : 'secret_text',
      injectAsEnvVariable: form.injectAsEnvVariable,
      scope: form.scope,
    };
    if (form.scope === 'agent') body.agentId = form.agentId;

    await $fetch('/api/variables', { method: 'POST', headers, body });
    showCreate.value = false;
    Object.assign(form, { scope: 'user', agentId: '', key: '', value: '', description: '', variableType: 'credential', credentialSubType: 'secret_text', injectAsEnvVariable: false });    resetSubFields();    await fetchAllVariables();
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed to save variable';
  } finally {
    submitting.value = false;
  }
}

async function handleDelete(id: string, key: string, scope: string) {
  if (!confirm(`Delete variable "${key}"?`)) return;
  try {
    const query = scope !== 'agent' ? `?scope=${scope}` : '';
    await $fetch(`/api/variables/${id}${query}`, { method: 'DELETE', headers });
    await fetchAllVariables();
  } catch {
    alert('Failed to delete variable');
  }
}
</script>
