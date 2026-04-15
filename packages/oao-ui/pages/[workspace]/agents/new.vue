<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}/agents`">Agents</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>New Agent</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <h1 class="text-3xl font-bold mt-4 mb-6">Create New Agent</h1>

    <div class="max-w-3xl space-y-6">
      <div v-if="formError" class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ formError }}</div>

      <form @submit.prevent="handleSubmit" class="space-y-6">
        <!-- Basic Info -->
        <Card>
          <CardHeader><CardTitle>Basic Info</CardTitle></CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2">
                <Label for="name">Name *</Label>
                <Input id="name" v-model="form.name" required placeholder="My Agent" />
              </div>
              <div class="space-y-2">
                <Label>Scope</Label>
                <select v-model="form.scope"
                  class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="user">Personal (owned by you)</option>
                  <option v-if="isAdmin" value="workspace">Workspace (shared, admin-managed)</option>
                </select>
              </div>
            </div>
            <div class="space-y-2">
              <Label for="description">Description</Label>
              <Textarea id="description" v-model="form.description" rows="2" placeholder="What does this agent do?" />
              <p class="text-xs text-muted-foreground">This field is for UI display only. It is not used as the Agent.md instruction file content.</p>
            </div>
          </CardContent>
        </Card>

        <!-- Agent Source -->
        <Card>
          <CardHeader>
            <CardTitle>Agent Files Source</CardTitle>
            <CardDescription>Choose how the agent's instruction and skill files are provided.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <label
                :class="['flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition',
                  form.sourceType === 'github_repo' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50']"
                @click="form.sourceType = 'github_repo'">
                <span class="text-2xl">🐙</span>
                <span class="font-medium text-sm">GitHub Repository</span>
                <span class="text-xs text-muted-foreground text-center">Clone agent files from a Git repository</span>
              </label>
              <label
                :class="['flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-pointer transition',
                  form.sourceType === 'database' ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/50']"
                @click="form.sourceType = 'database'">
                <span class="text-2xl">💾</span>
                <span class="font-medium text-sm">Database Storage</span>
                <span class="text-xs text-muted-foreground text-center">Create and edit agent files directly in the platform</span>
              </label>
            </div>

            <!-- GitHub Repo Fields -->
            <div v-if="form.sourceType === 'github_repo'" class="space-y-4 pt-2">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>Git Repository URL *</Label>
                  <Input v-model="form.gitRepoUrl" type="url" required placeholder="https://github.com/user/repo" />
                </div>
                <div class="space-y-2">
                  <Label>Git Branch</Label>
                  <Input v-model="form.gitBranch" placeholder="main" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>Agent File Path *</Label>
                  <Input v-model="form.agentFilePath" required placeholder=".github/agents/my-agent.md" />
                </div>
                <div class="space-y-2">
                  <Label>Skills Directory</Label>
                  <Input v-model="form.skillsDirectory" placeholder=".github/skills/" />
                  <p class="text-xs text-muted-foreground">Loads all .md files from this directory as skills. Path is relative to the repository root.</p>
                </div>
              </div>
              <div class="space-y-2">
                <Label>Git Authentication</Label>
                <p class="text-xs text-muted-foreground">Credential used for cloning private repositories. Not used for Copilot sessions.</p>
                <select v-model="form.githubTokenSource"
                  class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring max-w-md">
                  <option value="">No authentication (public repo)</option>
                  <option v-for="cred in credentials" :key="cred.id" :value="cred.id">{{ cred.key }} ({{ cred.scopeLabel }})</option>
                </select>
                <Input v-if="!form.githubTokenSource" v-model="form.githubToken" type="password" class="max-w-md" placeholder="Or enter a token directly (ghp_...)" />
              </div>
            </div>

            <!-- Database Source Info -->
            <div v-if="form.sourceType === 'database'" class="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
              <p>💡 After creating the agent, you can manage agent files (instructions, skills) directly from the agent detail page using the built-in file editor.</p>
            </div>
          </CardContent>
        </Card>

        <!-- Copilot CLI Setting -->
        <Card>
          <CardHeader>
            <CardTitle>Copilot CLI Setting</CardTitle>
            <CardDescription>Configure authentication for GitHub Copilot SDK sessions. This is separate from Git authentication used for cloning repositories.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="space-y-2">
              <Label>Copilot Authentication</Label>
              <select v-model="form.copilotTokenSource"
                class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring max-w-md">
                <option value="">Use system default (GITHUB_TOKEN env var)</option>
                <option v-for="cred in credentials" :key="cred.id" :value="cred.id">{{ cred.key }} ({{ cred.scopeLabel }})</option>
              </select>
              <p class="text-xs text-muted-foreground">Select a credential to override the system-level GITHUB_TOKEN for this agent's Copilot sessions. The credential should be a GitHub Token (PAT) with Copilot access.</p>
            </div>
          </CardContent>
        </Card>

        <!-- Built-in Tools -->
        <Card>
          <CardHeader>
            <CardTitle>Built-in Tools</CardTitle>
            <CardDescription>Select which built-in tools this agent can use during Copilot sessions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex gap-2 mb-3">
              <Button type="button" variant="outline" size="sm" @click="form.builtinToolsEnabled = BUILTIN_TOOLS.map(t => t.name)">Select All</Button>
              <Button type="button" variant="outline" size="sm" @click="form.builtinToolsEnabled = []">Deselect All</Button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <label v-for="tool in BUILTIN_TOOLS" :key="tool.name" class="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer">
                <Checkbox :checked="form.builtinToolsEnabled.includes(tool.name)" @update:checked="toggleTool(tool.name, $event)" />
                <div>
                  <p class="text-sm font-medium">{{ tool.label }}</p>
                  <p class="text-xs text-muted-foreground">{{ tool.description }}</p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        <!-- MCP JSON Template -->
        <Card>
          <CardHeader>
            <CardTitle>MCP JSON Template</CardTitle>
            <CardDescription>Jinja2 template that renders to a <code class="bg-muted px-1 rounded text-xs">mcp.json</code> configuration. MCP servers defined here are spawned during Copilot sessions. Use <code class="bg-muted px-1 rounded text-xs">{{ templateHintProps }}</code> and <code class="bg-muted px-1 rounded text-xs">{{ templateHintCreds }}</code> for variable substitution.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <Textarea v-model="form.mcpJsonTemplate" rows="10" class="font-mono text-xs"
              :placeholder='mcpTemplatePlaceholder' />
            <div class="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 space-y-1">
              <p><strong>Jinja2 Variables:</strong></p>
              <p><code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{{ templateHintProps }}</code> — Agent/user/workspace properties</p>
              <p><code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{{ templateHintCreds }}</code> — Agent/user/workspace credentials</p>
              <p>The rendered output must be valid JSON with a <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">mcpServers</code> key mapping server names to <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{ command, args?, env? }</code> objects.</p>
            </div>
          </CardContent>
        </Card>

        <div class="flex gap-3">
          <Button type="submit" :disabled="submitting">
            {{ submitting ? 'Creating...' : 'Create Agent' }}
          </Button>
          <NuxtLink :to="`/${ws}/agents`">
            <Button variant="outline" type="button">Cancel</Button>
          </NuxtLink>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
const { authHeaders, user } = useAuth();
const headers = authHeaders();
const router = useRouter();
const route = useRoute();
const ws = computed(() => (route.params.workspace as string) || 'default');
const isAdmin = computed(() => user.value?.role === 'workspace_admin' || user.value?.role === 'super_admin');

const submitting = ref(false);
const formError = ref('');

const BUILTIN_TOOLS = [
  { name: 'schedule_next_workflow_execution', label: 'Schedule Next Workflow Execution', description: 'Self-scheduling via exact datetime triggers' },
  { name: 'manage_webhook_trigger', label: 'Manage Webhook Trigger', description: 'Webhook lifecycle management' },
  { name: 'record_decision', label: 'Record Decision', description: 'Audit trail for agent decisions' },
  { name: 'memory_store', label: 'Memory Store', description: 'Store semantic memories (pgvector)' },
  { name: 'memory_retrieve', label: 'Memory Retrieve', description: 'Retrieve memories via similarity search' },
  { name: 'edit_workflow', label: 'Edit Workflow', description: 'Edit triggers and steps' },
  { name: 'read_variables', label: 'Read Variables', description: 'Read properties and credentials' },
  { name: 'edit_variables', label: 'Edit Variables', description: 'Create/update/delete variables' },
  { name: 'simple_http_request', label: 'Simple HTTP Request', description: 'Curl-like HTTP requests with Jinja2 templating on all arguments' },
];

const form = reactive({
  name: '',
  description: '',
  sourceType: 'github_repo' as 'github_repo' | 'database',
  gitRepoUrl: '',
  gitBranch: 'main',
  agentFilePath: '',
  skillsDirectory: '',
  githubToken: '',
  githubTokenSource: '' as string,
  copilotTokenSource: '' as string,
  scope: 'user' as 'user' | 'workspace',
  builtinToolsEnabled: BUILTIN_TOOLS.map(t => t.name),
  mcpJsonTemplate: '',
});

const templateHintProps = '{{ properties.KEY }}';
const templateHintCreds = '{{ credentials.KEY }}';
const mcpTemplatePlaceholder = `{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "API_KEY": "{{ credentials.API_KEY }}"
      }
    }
  }
}`;

// Fetch credentials for GitHub token selector
const { data: userVarData } = await useFetch('/api/variables?scope=user', { headers });
const { data: wsVarData } = await useFetch('/api/variables?scope=workspace', { headers });
const credentials = computed(() => {
  const userCreds = (userVarData.value as any)?.variables?.filter((v: any) => v.variableType === 'credential') ?? [];
  const wsCreds = (wsVarData.value as any)?.variables?.filter((v: any) => v.variableType === 'credential') ?? [];
  return [
    ...userCreds.map((v: any) => ({ ...v, scopeLabel: 'Personal' })),
    ...wsCreds.map((v: any) => ({ ...v, scopeLabel: 'Workspace' })),
  ];
});

function toggleTool(name: string, checked: boolean | string) {
  if (checked) {
    if (!form.builtinToolsEnabled.includes(name)) form.builtinToolsEnabled.push(name);
  } else {
    form.builtinToolsEnabled = form.builtinToolsEnabled.filter(t => t !== name);
  }
}

async function handleSubmit() {
  formError.value = '';
  submitting.value = true;
  try {
    const body: Record<string, unknown> = {
      name: form.name,
      description: form.description || undefined,
      sourceType: form.sourceType,
      scope: form.scope,
      builtinToolsEnabled: form.builtinToolsEnabled,
    };
    if (form.copilotTokenSource) {
      body.copilotTokenCredentialId = form.copilotTokenSource;
    }
    if (form.sourceType === 'github_repo') {
      body.gitRepoUrl = form.gitRepoUrl;
      body.gitBranch = form.gitBranch;
      body.agentFilePath = form.agentFilePath;
      if (form.skillsDirectory) body.skillsDirectory = form.skillsDirectory;
      if (form.githubTokenSource) {
        body.githubTokenCredentialId = form.githubTokenSource;
      } else if (form.githubToken) {
        body.githubToken = form.githubToken;
      }
    }    if (form.mcpJsonTemplate.trim()) {
      body.mcpJsonTemplate = form.mcpJsonTemplate;
    }
    const res = await $fetch<{ agent: { id: string } }>('/api/agents', { method: 'POST', headers, body });
    router.push(`/${ws.value}/agents/${res.agent.id}`);
  } catch (e: any) {
    formError.value = e?.data?.error || 'Failed to create agent';
  } finally {
    submitting.value = false;
  }
}
</script>
