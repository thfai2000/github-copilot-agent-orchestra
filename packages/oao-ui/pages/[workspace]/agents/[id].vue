<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}/agents`">Agents</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>{{ agent?.name || 'Agent' }}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div v-if="agent" class="space-y-6 mt-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">{{ agent.name }}</h1>
          <div class="flex flex-wrap items-center gap-1.5 mt-1">
            <Badge :variant="agent.status === 'active' ? 'default' : agent.status === 'paused' ? 'secondary' : 'destructive'">
              {{ agent.status }}
            </Badge>
            <Badge v-if="agent.scope === 'workspace'" variant="outline">Workspace</Badge>
            <Badge v-else variant="outline" class="text-muted-foreground">Personal</Badge>
          </div>
          <p v-if="agent.description && !editing" class="text-muted-foreground text-sm mt-1">{{ agent.description }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="!editing" @click="startEdit">Edit Agent</Button>
          <Button variant="outline" @click="toggleStatus"
            :class="agent.status === 'active' ? 'border-yellow-500 text-yellow-600' : 'border-green-500 text-green-600'">
            {{ agent.status === 'active' ? 'Pause' : 'Activate' }}
          </Button>
          <Button variant="destructive" size="sm" @click="handleDelete">Delete</Button>
        </div>
      </div>

      <!-- View Configuration (when not editing) -->
      <div v-if="!editing" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle class="text-base">Configuration</CardTitle></CardHeader>
          <CardContent>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-muted-foreground">Source Type</dt><dd><Badge variant="outline">{{ (agent as any).sourceType === 'database' ? 'Database' : 'GitHub Repo' }}</Badge></dd></div>
              <template v-if="(agent as any).sourceType !== 'database'">
                <div class="flex justify-between"><dt class="text-muted-foreground">Git Repo</dt><dd class="font-mono text-xs truncate max-w-[250px]">{{ agent.gitRepoUrl }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted-foreground">Branch</dt><dd class="font-mono text-xs">{{ agent.gitBranch || 'main' }}</dd></div>
                <div class="flex justify-between"><dt class="text-muted-foreground">Agent File</dt><dd class="font-mono text-xs">{{ agent.agentFilePath }}</dd></div>
                <div v-if="(agent as any).skillsDirectory" class="flex justify-between"><dt class="text-muted-foreground">Skills Dir</dt><dd class="font-mono text-xs">{{ (agent as any).skillsDirectory }}</dd></div>
                <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Git Auth</dt><dd class="text-right text-xs">{{ formatGitAuthDisplay(agent) }}</dd></div>
              </template>
              <div class="flex justify-between gap-3"><dt class="text-muted-foreground">Copilot Auth</dt><dd class="text-right text-xs">{{ formatCopilotAuthDisplay(agent) }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">Built-in Tools</dt><dd>{{ ((agent as any).builtinToolsEnabled || []).length }} / {{ BUILTIN_TOOLS.length }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">Last Session</dt><dd>{{ agent.lastSessionAt ? new Date(agent.lastSessionAt).toLocaleString() : 'Never' }}</dd></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle class="text-base">Info</CardTitle></CardHeader>
          <CardContent>
            <dl class="space-y-2 text-sm">
              <div class="flex justify-between"><dt class="text-muted-foreground">ID</dt><dd class="font-mono text-xs">{{ agent.id?.substring(0, 8) }}&hellip;</dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">Scope</dt><dd><Badge :variant="agent.scope === 'workspace' ? 'default' : 'secondary'">{{ agent.scope === 'workspace' ? 'Workspace' : 'Personal' }}</Badge></dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">MCP Template</dt><dd>{{ (agent as any).mcpJsonTemplate ? 'Configured' : 'None' }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">Created</dt><dd>{{ new Date(agent.createdAt).toLocaleDateString() }}</dd></div>
              <div class="flex justify-between"><dt class="text-muted-foreground">Updated</dt><dd>{{ new Date(agent.updatedAt).toLocaleDateString() }}</dd></div>
            </dl>
          </CardContent>
        </Card>
      </div>

      <!-- Edit Form (follows Create page card layout) -->
      <template v-if="editing">
        <div v-if="editError" class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ editError }}</div>
        <form @submit.prevent="handleSave" class="max-w-3xl space-y-6">
          <!-- Basic Info -->
          <Card>
            <CardHeader><CardTitle>Basic Info</CardTitle></CardHeader>
            <CardContent class="space-y-4">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="space-y-2">
                  <Label>Name *</Label>
                  <Input v-model="editForm.name" required />
                </div>
                <div class="space-y-2">
                  <Label>Scope</Label>
                  <div class="flex h-10 items-center rounded-md border border-input bg-muted px-3 text-sm">{{ formatScopeLabel(agent?.scope) }}</div>
                  <p class="text-xs text-muted-foreground">Scope cannot be changed after creation.</p>
                </div>
              </div>
              <div class="space-y-2">
                <Label>Description</Label>
                <Textarea v-model="editForm.description" rows="2" placeholder="What does this agent do?" />
                <p class="text-xs text-muted-foreground">This field is for UI display only. It is not used as the Agent.md instruction file content.</p>
              </div>
            </CardContent>
          </Card>

          <!-- Agent Files Source -->
          <Card>
            <CardHeader>
              <CardTitle>Agent File Sources</CardTitle>
              <CardDescription>How the agent's instruction and skill files are provided.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <label :class="['flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-not-allowed opacity-80',
                  editForm.sourceType === 'github_repo' ? 'border-primary bg-primary/5' : 'border-border']">
                  <span class="text-2xl">&#x1f419;</span>
                  <span class="font-medium text-sm">GitHub Repository</span>
                  <span class="text-xs text-muted-foreground text-center">Clone agent files from a Git repository</span>
                </label>
                <label :class="['flex flex-col items-center gap-2 p-4 rounded-lg border-2 cursor-not-allowed opacity-80',
                  editForm.sourceType === 'database' ? 'border-primary bg-primary/5' : 'border-border']">
                  <span class="text-2xl">&#x1f4be;</span>
                  <span class="font-medium text-sm">Database Storage</span>
                  <span class="text-xs text-muted-foreground text-center">Create and edit agent files directly in the platform</span>
                </label>
              </div>
              <p class="text-xs text-muted-foreground">Source type cannot be changed after creation.</p>

              <!-- GitHub Repo Fields -->
              <div v-if="editForm.sourceType === 'github_repo'" class="space-y-4 pt-2">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label>Git Repository URL *</Label>
                    <Input v-model="editForm.gitRepoUrl" type="url" required placeholder="https://github.com/user/repo" />
                  </div>
                  <div class="space-y-2">
                    <Label>Git Branch</Label>
                    <Input v-model="editForm.gitBranch" placeholder="main" />
                  </div>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div class="space-y-2">
                    <Label>Agent File Path *</Label>
                    <Input v-model="editForm.agentFilePath" required />
                  </div>
                  <div class="space-y-2">
                    <Label>Skills Directory</Label>
                    <Input v-model="editForm.skillsDirectory" placeholder=".github/skills/" />
                    <p class="text-xs text-muted-foreground">Loads all .md files from this directory as skills. Path is relative to the repository root.</p>
                  </div>
                </div>
                <div class="space-y-2">
                  <Label>Git Authentication</Label>
                  <select v-model="editForm.githubAuthSelection"
                    class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring max-w-xl">
                    <option value="">No Authentication (Public Repo)</option>
                    <option v-if="legacyGitAuthOption" :value="legacyGitAuthOption.id">{{ legacyGitAuthOption.optionLabel }}</option>
                    <option v-for="cred in gitAuthCredentials" :key="cred.id" :value="cred.id">{{ cred.optionLabel }}</option>
                  </select>
                  <p class="text-xs text-muted-foreground">Uses credential variables only. Git checkout automatically applies the selected credential subtype, such as GitHub Token, GitHub App, or User Account.</p>
                </div>
              </div>

              <!-- Database Source Info -->
              <div v-if="editForm.sourceType === 'database'" class="p-4 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                <p>&#x1f4a1; Manage the database-stored <strong>Agent Instruction</strong> and <strong>Skill Files</strong> in the dedicated sections below (they remain editable while you edit the agent config).</p>
              </div>
            </CardContent>
          </Card>

          <!-- Copilot Authentication -->
          <Card>
            <CardHeader>
              <CardTitle>Copilot Authentication</CardTitle>
              <CardDescription>Configure authentication for GitHub Copilot SDK sessions. This is separate from Git authentication used for cloning repositories.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-2">
                <Label>Copilot Authentication</Label>
                <select v-model="editForm.copilotTokenCredentialId"
                  class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring max-w-xl">
                  <option value="">Use system default (GITHUB_TOKEN env var)</option>
                  <option v-for="cred in copilotCredentials" :key="cred.id" :value="cred.id">{{ cred.optionLabel }}</option>
                </select>
                <p class="text-xs text-muted-foreground">Copilot authentication accepts credential variables only. Use a GitHub Token credential when you want this agent to override the system default token.</p>
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
                <Button type="button" variant="outline" size="sm" @click.prevent="selectAllBuiltinTools">Select All</Button>
                <Button type="button" variant="outline" size="sm" @click.prevent="deselectAllBuiltinTools">Deselect All</Button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                <label v-for="tool in BUILTIN_TOOLS" :key="tool.name"
                  class="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer">
                  <Checkbox :model-value="editForm.builtinToolsEnabled.includes(tool.name)" @update:model-value="toggleEditTool(tool.name, $event)" />
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
              <CardDescription>Jinja2 template that renders to a <code class="bg-muted px-1 rounded text-xs">mcp.json</code> configuration. MCP servers defined here are spawned during Copilot sessions. Use <code v-pre class="bg-muted px-1 rounded text-xs">{{ properties.KEY }}</code> and <code v-pre class="bg-muted px-1 rounded text-xs">{{ credentials.KEY }}</code> for variable substitution.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <Textarea v-model="editForm.mcpJsonTemplate" rows="12" class="font-mono text-xs"
                :placeholder="mcpTemplatePlaceholder" />
              <div class="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p><strong>Jinja2 Variables:</strong></p>
                <p><code v-pre class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{{ properties.KEY }}</code> &mdash; Agent/user/workspace properties</p>
                <p><code v-pre class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{{ credentials.KEY }}</code> &mdash; Agent/user/workspace credentials</p>
                <p>The rendered output must be valid JSON with a <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">mcpServers</code> key mapping server names to <code class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{ command, args?, env? }</code> objects.</p>
              </div>
            </CardContent>
          </Card>

          <div class="flex gap-3">
            <Button type="submit" :disabled="saving">{{ saving ? 'Saving...' : 'Save Changes' }}</Button>
            <Button variant="outline" type="button" @click="editing = false">Cancel</Button>
          </div>
        </form>
      </template>

      <!-- Agent Instruction (Agent.md) — Database source only -->
      <Card v-if="(agent as any).sourceType === 'database'">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Agent Instruction</CardTitle>
              <CardDescription>The main <code class="bg-muted px-1 rounded text-xs">Agent.md</code> instruction file. This is the primary system prompt the Copilot SDK reads at session start. The first root-level markdown file is treated as the main instruction.</CardDescription>
            </div>
            <Button v-if="!mainAgentFile" size="sm" @click="startCreateMainFile">+ Create Agent.md</Button>
          </div>
        </CardHeader>
        <CardContent>
          <!-- Main file create form -->
          <div v-if="creatingMainFile" class="mb-4 p-4 rounded-lg border border-border bg-muted/30">
            <div v-if="fileError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ fileError }}</div>
            <form @submit.prevent="handleCreateMainFile" class="space-y-3">
              <div class="space-y-1.5">
                <Label class="text-xs">File Path *</Label>
                <Input v-model="fileForm.filePath" required placeholder="Agent.md" class="font-mono" />
                <p class="text-xs text-muted-foreground">Root-level <code class="bg-muted px-1 rounded text-[10px]">.md</code> file (no slashes). The first root markdown file becomes the main instruction.</p>
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">Content *</Label>
                <Textarea v-model="fileForm.content" required rows="10" class="font-mono text-xs" placeholder="# Agent Instructions&#10;&#10;Describe the agent's role, tools, and behaviour..." />
              </div>
              <div class="flex gap-2">
                <Button type="submit" size="sm" :disabled="savingFile">{{ savingFile ? 'Creating…' : 'Create Agent.md' }}</Button>
                <Button variant="outline" size="sm" type="button" @click="cancelCreateFile">Cancel</Button>
              </div>
            </form>
          </div>

          <!-- Main file display -->
          <div v-if="mainAgentFile" class="rounded-lg border border-border overflow-hidden">
            <div class="flex items-center justify-between p-3 bg-muted/30 cursor-pointer" @click="toggleFileExpand(mainAgentFile.id)">
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs">{{ expandedFileId === mainAgentFile.id ? '&#x25bc;' : '&#x25b6;' }}</span>
                <span class="font-mono text-sm font-medium truncate">{{ mainAgentFile.filePath }}</span>
                <Badge variant="default" class="text-[10px]">Main</Badge>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <span class="text-xs text-muted-foreground">{{ new Date(mainAgentFile.updatedAt).toLocaleDateString() }}</span>
                <Button variant="ghost" size="sm" class="h-7 text-xs" @click.stop="startEditFile(mainAgentFile)">Edit</Button>
                <Button variant="ghost" size="sm" class="text-destructive h-7 text-xs" @click.stop="handleDeleteFile(mainAgentFile.id, mainAgentFile.filePath)">Delete</Button>
              </div>
            </div>
            <div v-if="expandedFileId === mainAgentFile.id" class="border-t border-border">
              <div v-if="editingFileId === mainAgentFile.id" class="p-3">
                <Textarea v-model="editFileContent" rows="14" class="font-mono text-xs" />
                <div class="flex gap-2 mt-2">
                  <Button size="sm" :disabled="savingFile" @click="handleUpdateFile(mainAgentFile.id)">{{ savingFile ? 'Saving…' : 'Save' }}</Button>
                  <Button variant="outline" size="sm" @click="editingFileId = ''">Cancel</Button>
                </div>
              </div>
              <div v-else class="p-3 max-h-80 overflow-auto">
                <pre class="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{{ mainAgentFile.content }}</pre>
              </div>
            </div>
          </div>
          <p v-else-if="!creatingMainFile" class="text-muted-foreground text-sm">
            No main instruction file yet. Click <strong>+ Create Agent.md</strong> to add one.
          </p>
        </CardContent>
      </Card>

      <!-- Skill Files — Database source only -->
      <Card v-if="(agent as any).sourceType === 'database'">
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Skill Files</CardTitle>
              <CardDescription>Additional markdown files loaded as agent skills. Conventionally placed under <code class="bg-muted px-1 rounded text-xs">skills/</code>. The Copilot SDK can reference these via file-reading tools during a session.</CardDescription>
            </div>
            <Button size="sm" @click="startCreateSkillFile">+ Add Skill File</Button>
          </div>
        </CardHeader>
        <CardContent>
          <!-- Skill file create form -->
          <div v-if="creatingSkillFile" class="mb-4 p-4 rounded-lg border border-border bg-muted/30">
            <div v-if="fileError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ fileError }}</div>
            <form @submit.prevent="handleCreateSkillFile" class="space-y-3">
              <div class="space-y-1.5">
                <Label class="text-xs">File Path *</Label>
                <Input v-model="fileForm.filePath" required placeholder="skills/research.md" class="font-mono" />
                <p class="text-xs text-muted-foreground">Use forward slashes for subdirectories (e.g. <code class="bg-muted px-1 rounded text-[10px]">skills/research.md</code>).</p>
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">Content *</Label>
                <Textarea v-model="fileForm.content" required rows="8" class="font-mono text-xs" placeholder="# Skill: Research&#10;&#10;Describe when and how the agent should use this skill..." />
              </div>
              <div class="flex gap-2">
                <Button type="submit" size="sm" :disabled="savingFile">{{ savingFile ? 'Creating…' : 'Create Skill File' }}</Button>
                <Button variant="outline" size="sm" type="button" @click="cancelCreateFile">Cancel</Button>
              </div>
            </form>
          </div>

          <!-- Skill files list -->
          <div class="space-y-2">
            <div v-for="f in skillFiles" :key="f.id" class="rounded-lg border border-border overflow-hidden">
              <div class="flex items-center justify-between p-3 bg-muted/30 cursor-pointer" @click="toggleFileExpand(f.id)">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-xs">{{ expandedFileId === f.id ? '&#x25bc;' : '&#x25b6;' }}</span>
                  <span class="font-mono text-sm font-medium truncate">{{ f.filePath }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-xs text-muted-foreground">{{ new Date(f.updatedAt).toLocaleDateString() }}</span>
                  <Button variant="ghost" size="sm" class="h-7 text-xs" @click.stop="startEditFile(f)">Edit</Button>
                  <Button variant="ghost" size="sm" class="text-destructive h-7 text-xs" @click.stop="handleDeleteFile(f.id, f.filePath)">Delete</Button>
                </div>
              </div>
              <div v-if="expandedFileId === f.id" class="border-t border-border">
                <div v-if="editingFileId === f.id" class="p-3">
                  <Textarea v-model="editFileContent" rows="12" class="font-mono text-xs" />
                  <div class="flex gap-2 mt-2">
                    <Button size="sm" :disabled="savingFile" @click="handleUpdateFile(f.id)">{{ savingFile ? 'Saving…' : 'Save' }}</Button>
                    <Button variant="outline" size="sm" @click="editingFileId = ''">Cancel</Button>
                  </div>
                </div>
                <div v-else class="p-3 max-h-64 overflow-auto">
                  <pre class="whitespace-pre-wrap font-mono text-xs text-muted-foreground">{{ f.content }}</pre>
                </div>
              </div>
            </div>
            <p v-if="skillFiles.length === 0 && !creatingSkillFile" class="text-muted-foreground text-sm">
              No skill files yet. Click <strong>+ Add Skill File</strong> to create one under <code class="bg-muted px-1 rounded text-[10px]">skills/</code>.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Agent Variables Section -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Agent Variables</CardTitle>
              <CardDescription>Agent-level variables available to all workflow steps using this agent. They override user-level variables with the same key.</CardDescription>
            </div>
            <Button size="sm" @click="showVarForm = true">+ Add Variable</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div v-if="showVarForm" class="mb-4 p-4 rounded-lg border border-border bg-muted/30">
            <div v-if="varError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ varError }}</div>
            <form @submit.prevent="handleAddVar" class="space-y-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <Label class="text-xs">Key (UPPER_SNAKE_CASE) *</Label>
                  <Input v-model="varForm.key" required pattern="^[A-Z_][A-Z0-9_]*$" class="font-mono" placeholder="API_KEY" />
                </div>
                <div class="space-y-1.5">
                  <Label class="text-xs">Value *</Label>
                  <Input v-model="varForm.value" type="password" required placeholder="Secret value (encrypted at rest)" />
                </div>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="space-y-1.5">
                  <Label class="text-xs">Type *</Label>
                  <select v-model="varForm.variableType"
                    class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="credential">Credential (secret, masked)</option>
                    <option value="property">Property (can be used in prompts)</option>
                  </select>
                </div>
                <div class="space-y-1.5">
                  <Label class="text-xs">Description</Label>
                  <Input v-model="varForm.description" placeholder="What is this variable for?" />
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Switch :checked="varForm.injectAsEnvVariable" @update:checked="varForm.injectAsEnvVariable = $event" />
                <Label class="text-xs">Inject as .env variable in Copilot session workspace</Label>
              </div>
              <div v-if="varForm.variableType === 'property'" class="p-3 rounded-md bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-700 dark:text-blue-300">
                &#x1f4a1; <strong>Tip:</strong> Properties can be referenced in agent prompt templates using <code v-pre class="bg-blue-100 dark:bg-blue-900 px-1 rounded">{{ properties.KEY_NAME }}</code>
              </div>
              <div class="flex gap-2">
                <Button type="submit" size="sm" :disabled="savingVar">{{ savingVar ? 'Saving...' : 'Save Variable' }}</Button>
                <Button variant="outline" size="sm" type="button" @click="showVarForm = false">Cancel</Button>
              </div>
            </form>
          </div>

          <div class="space-y-2">
            <div v-for="v in agentVariables" :key="v.id"
              class="p-3 rounded-lg border border-border flex items-center justify-between">
              <div class="flex items-center gap-3">
                <Badge :variant="v.variableType === 'credential' ? 'destructive' : 'secondary'" class="text-[10px]">{{ v.variableType }}</Badge>
                <div>
                  <p class="font-mono font-semibold text-sm">{{ v.key }}</p>
                  <p v-if="v.description" class="text-xs text-muted-foreground">{{ v.description }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Badge v-if="v.injectAsEnvVariable" variant="outline" class="text-[10px]">.env</Badge>
                <span class="text-xs text-muted-foreground font-mono">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                <Button variant="ghost" size="sm" class="text-destructive h-7 text-xs" @click="handleDeleteVar(v.id, v.key)">Delete</Button>
              </div>
            </div>
            <p v-if="agentVariables.length === 0 && !showVarForm" class="text-muted-foreground text-sm">No agent-level variables stored.</p>
          </div>
        </CardContent>
      </Card>
    </div>
    <p v-else class="text-muted-foreground mt-4">Agent not found.</p>
  </div>
</template>

<script setup lang="ts">
import { useAgentCredentialOptions } from '~/composables/useAgentCredentialOptions';

const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const router = useRouter();
const ws = computed(() => (route.params.workspace as string) || 'default');
const agentId = route.params.id as string;
const { buildCredentialOptions, filterGitAuthCredentialOptions, filterCopilotCredentialOptions, findCredentialOption } = useAgentCredentialOptions();

const LEGACY_INLINE_GIT_TOKEN_ID = '__legacy_inline_git_token__';

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

const mcpTemplatePlaceholder = `{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["-y", "@some/mcp-server"],
      "env": {
        "API_KEY": "` + "{{ credentials.API_KEY }}" + `"
      }
    }
  }
}`;

const { data: agentData, refresh: refreshAgent } = await useFetch(`/api/agents/${agentId}`, { headers });
const { data: varData, refresh: refreshVars } = await useFetch(`/api/variables?agentId=${agentId}`, { headers });

// Agent files for database source
const { data: filesData, refresh: refreshFiles } = await useFetch(`/api/agent-files/${agentId}`, { headers });

const agent = computed(() => agentData.value?.agent);
const agentVariables = computed(() => varData.value?.variables ?? []);
const agentFiles = computed(() => (filesData.value as any)?.files ?? []);

// Credentials for token selectors
const { data: userVarData } = await useFetch('/api/variables?scope=user', { headers });
const { data: wsVarData } = await useFetch('/api/variables?scope=workspace', { headers });
const credentialOptions = computed(() => buildCredentialOptions([
  {
    scope: 'agent',
    scopeLabel: 'Agent',
    variables: (agentVariables.value ?? []) as any[],
  },
  {
    scope: 'user',
    scopeLabel: 'Personal',
    variables: ((userVarData.value as any)?.variables ?? []) as any[],
  },
  {
    scope: 'workspace',
    scopeLabel: 'Workspace',
    variables: ((wsVarData.value as any)?.variables ?? []) as any[],
  },
]));

const legacyGitAuthOption = computed(() => {
  if ((agent.value as any)?.hasInlineGitToken && !(agent.value as any)?.githubTokenCredentialId) {
    return {
      id: LEGACY_INLINE_GIT_TOKEN_ID,
      optionLabel: 'Legacy manual token (replace recommended)',
    };
  }
  return null;
});

const gitAuthCredentials = computed(() => filterGitAuthCredentialOptions(
  credentialOptions.value,
  editForm.githubAuthSelection || (agent.value as any)?.githubTokenCredentialId || null,
));
const copilotCredentials = computed(() => filterCopilotCredentialOptions(
  credentialOptions.value,
  editForm.copilotTokenCredentialId || (agent.value as any)?.copilotTokenCredentialId || null,
));

function formatScopeLabel(scope?: string): string {
  return scope === 'workspace' ? 'Workspace (shared, admin-managed)' : 'Personal (owned by you)';
}

function formatGitAuthDisplay(agentRecord: any): string {
  if (agentRecord?.githubTokenCredentialId) {
    return findCredentialOption(credentialOptions.value, agentRecord.githubTokenCredentialId)?.optionLabel || 'Credential variable';
  }
  if (agentRecord?.hasInlineGitToken) {
    return 'Legacy manual token';
  }
  return 'No Authentication (Public Repo)';
}

function formatCopilotAuthDisplay(agentRecord: any): string {
  if (agentRecord?.copilotTokenCredentialId) {
    return findCredentialOption(credentialOptions.value, agentRecord.copilotTokenCredentialId)?.optionLabel || 'Credential variable';
  }
  return 'System default (GITHUB_TOKEN env var)';
}

// -- Inline Edit -----------------------------------------------------------
const editing = ref(false);
const saving = ref(false);
const editError = ref('');
const editForm = reactive({
  name: '',
  description: '',
  sourceType: 'github_repo' as string,
  gitRepoUrl: '',
  gitBranch: '',
  agentFilePath: '',
  skillsDirectory: '',
  githubAuthSelection: '' as string,
  copilotTokenCredentialId: '' as string,
  builtinToolsEnabled: [] as string[],
  mcpJsonTemplate: '',
});

function startEdit() {
  Object.assign(editForm, {
    name: agent.value?.name || '',
    description: agent.value?.description || '',
    sourceType: (agent.value as any)?.sourceType || 'github_repo',
    gitRepoUrl: agent.value?.gitRepoUrl || '',
    gitBranch: agent.value?.gitBranch || 'main',
    agentFilePath: agent.value?.agentFilePath || '',
    skillsDirectory: (agent.value as any)?.skillsDirectory || '',
    githubAuthSelection: (agent.value as any)?.githubTokenCredentialId || ((agent.value as any)?.hasInlineGitToken ? LEGACY_INLINE_GIT_TOKEN_ID : ''),
    copilotTokenCredentialId: (agent.value as any)?.copilotTokenCredentialId || '',
    builtinToolsEnabled: Array.isArray((agent.value as any)?.builtinToolsEnabled)
      ? [...(agent.value as any).builtinToolsEnabled]
      : BUILTIN_TOOLS.map(t => t.name),
    mcpJsonTemplate: (agent.value as any)?.mcpJsonTemplate || '',
  });
  editError.value = '';
  editing.value = true;
}

function replaceEditBuiltinTools(nextToolNames: string[]) {
  editForm.builtinToolsEnabled.splice(0, editForm.builtinToolsEnabled.length, ...nextToolNames);
}

function selectAllBuiltinTools() {
  replaceEditBuiltinTools(BUILTIN_TOOLS.map((tool) => tool.name));
}

function deselectAllBuiltinTools() {
  replaceEditBuiltinTools([]);
}

function toggleEditTool(name: string, checked: boolean | string) {
  if (checked) {
    if (!editForm.builtinToolsEnabled.includes(name)) editForm.builtinToolsEnabled.push(name);
  } else {
    const index = editForm.builtinToolsEnabled.indexOf(name);
    if (index >= 0) editForm.builtinToolsEnabled.splice(index, 1);
  }
}

async function handleSave() {
  editError.value = '';
  saving.value = true;
  try {
    const body: Record<string, unknown> = {
      name: editForm.name,
      description: editForm.description || undefined,
      builtinToolsEnabled: editForm.builtinToolsEnabled,
      mcpJsonTemplate: editForm.mcpJsonTemplate.trim() || null,
    };
    if (editForm.sourceType === 'github_repo') {
      body.gitRepoUrl = editForm.gitRepoUrl;
      body.gitBranch = editForm.gitBranch;
      body.agentFilePath = editForm.agentFilePath;
      body.skillsDirectory = editForm.skillsDirectory || null;
      if (editForm.githubAuthSelection !== LEGACY_INLINE_GIT_TOKEN_ID) {
        body.githubTokenCredentialId = null;
        if (editForm.githubAuthSelection) body.githubTokenCredentialId = editForm.githubAuthSelection;
      }
    }
    if (editForm.copilotTokenCredentialId) {
      body.copilotTokenCredentialId = editForm.copilotTokenCredentialId;
    } else if ((agent.value as any)?.copilotTokenCredentialId) {
      body.copilotTokenCredentialId = null;
    }
    await $fetch(`/api/agents/${agentId}`, { method: 'PUT', headers, body });
    editing.value = false;
    await refreshAgent();
  } catch (e: any) { editError.value = e?.data?.error || 'Failed to save agent'; }
  finally { saving.value = false; }
}

async function toggleStatus() {
  const newStatus = agent.value?.status === 'active' ? 'paused' : 'active';
  try { await $fetch(`/api/agents/${agentId}`, { method: 'PUT', headers, body: { status: newStatus } }); await refreshAgent(); }
  catch { alert('Failed to update agent status'); }
}

async function handleDelete() {
  if (!confirm(`Delete agent "${agent.value?.name}"? This cannot be undone.`)) return;
  try { await $fetch(`/api/agents/${agentId}`, { method: 'DELETE', headers }); router.push(`/${ws.value}/agents`); }
  catch { alert('Failed to delete agent'); }
}

// -- Variable management ---------------------------------------------------
const showVarForm = ref(false);
const savingVar = ref(false);
const varError = ref('');
const varForm = reactive({ key: '', value: '', description: '', variableType: 'credential' as string, injectAsEnvVariable: false });

async function handleAddVar() {
  varError.value = '';
  savingVar.value = true;
  try {
    await $fetch('/api/variables', {
      method: 'POST', headers,
      body: { agentId, key: varForm.key, value: varForm.value, description: varForm.description || undefined, variableType: varForm.variableType, injectAsEnvVariable: varForm.injectAsEnvVariable },
    });
    showVarForm.value = false;
    Object.assign(varForm, { key: '', value: '', description: '', variableType: 'credential', injectAsEnvVariable: false });
    await refreshVars();
  } catch (e: any) { varError.value = e?.data?.error || 'Failed to save variable'; }
  finally { savingVar.value = false; }
}

async function handleDeleteVar(id: string, key: string) {
  if (!confirm(`Delete variable "${key}"?`)) return;
  try { await $fetch(`/api/variables/${id}`, { method: 'DELETE', headers }); await refreshVars(); }
  catch { alert('Failed to delete variable'); }
}

// -- Agent Files management (database source) ------------------------------
const showFileForm = ref(false);
const savingFile = ref(false);
const fileError = ref('');
const fileForm = reactive({ filePath: '', content: '' });
const expandedFileId = ref('');
const editingFileId = ref('');
const editFileContent = ref('');
const creatingMainFile = ref(false);
const creatingSkillFile = ref(false);

// Sort agent files so the first root-level markdown file is the "main" Agent.md.
const sortedAgentFiles = computed(() => {
  return [...agentFiles.value].sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
});

const mainAgentFile = computed(() => {
  return sortedAgentFiles.value.find((f: any) => f.filePath.endsWith('.md') && !f.filePath.includes('/')) ?? null;
});

const skillFiles = computed(() => {
  const main = mainAgentFile.value;
  return sortedAgentFiles.value.filter((f: any) => f.id !== main?.id);
});

function isMainAgentFile(filePath: string): boolean {
  return mainAgentFile.value?.filePath === filePath;
}

function cancelCreateFile() {
  creatingMainFile.value = false;
  creatingSkillFile.value = false;
  showFileForm.value = false;
  fileError.value = '';
  Object.assign(fileForm, { filePath: '', content: '' });
}

function startCreateMainFile() {
  cancelCreateFile();
  Object.assign(fileForm, { filePath: 'Agent.md', content: '' });
  creatingMainFile.value = true;
}

function startCreateSkillFile() {
  cancelCreateFile();
  Object.assign(fileForm, { filePath: 'skills/', content: '' });
  creatingSkillFile.value = true;
}

function toggleFileExpand(id: string) {
  expandedFileId.value = expandedFileId.value === id ? '' : id;
  if (expandedFileId.value !== id) editingFileId.value = '';
}

function startEditFile(f: any) {
  expandedFileId.value = f.id;
  editingFileId.value = f.id;
  editFileContent.value = f.content;
}

async function createFileFromForm() {
  fileError.value = '';
  savingFile.value = true;
  try {
    await $fetch(`/api/agent-files/${agentId}`, {
      method: 'POST', headers,
      body: { filePath: fileForm.filePath, content: fileForm.content },
    });
    cancelCreateFile();
    await refreshFiles();
  } catch (e: any) {
    fileError.value = e?.data?.error || 'Failed to create file';
  } finally {
    savingFile.value = false;
  }
}

async function handleCreateMainFile() { await createFileFromForm(); }
async function handleCreateSkillFile() { await createFileFromForm(); }
// Backwards-compat alias for any remaining references.
async function handleCreateFile() { await createFileFromForm(); }

async function handleUpdateFile(fileId: string) {
  savingFile.value = true;
  try {
    await $fetch(`/api/agent-files/${agentId}/${fileId}`, {
      method: 'PUT', headers,
      body: { content: editFileContent.value },
    });
    editingFileId.value = '';
    await refreshFiles();
  } catch { alert('Failed to update file'); }
  finally { savingFile.value = false; }
}

async function handleDeleteFile(fileId: string, filePath: string) {
  if (!confirm(`Delete "${filePath}"?`)) return;
  try {
    await $fetch(`/api/agent-files/${agentId}/${fileId}`, { method: 'DELETE', headers });
    if (expandedFileId.value === fileId) expandedFileId.value = '';
    await refreshFiles();
  } catch { alert('Failed to delete file'); }
}
</script>
