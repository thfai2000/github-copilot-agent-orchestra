<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbLink href="/workflows">Workflows</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>{{ workflow?.name || 'Loading…' }}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div v-if="workflow" class="space-y-6 mt-4">
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-3xl font-bold">{{ workflow.name }}</h1>
            <Badge :variant="workflow.isActive ? 'default' : 'secondary'">
              {{ workflow.isActive ? 'Active' : 'Inactive' }}
            </Badge>
          </div>
          <p v-if="workflow.description" class="text-muted-foreground text-sm mt-1">{{ workflow.description }}</p>
          <!-- Compact metadata row (no per-info badges) -->
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
            <span>v{{ workflow.version }}</span>
            <span aria-hidden="true">·</span>
            <span>{{ workflow.scope === 'workspace' ? 'Workspace' : 'Personal' }}</span>
            <span aria-hidden="true">·</span>
            <span>Owner: {{ workflow.ownerName || 'Unknown' }}</span>
            <span aria-hidden="true">·</span>
            <span v-if="workflow.lastExecutionAt">
              Last run {{ new Date(workflow.lastExecutionAt).toLocaleString() }}
              <span v-if="workflow.lastExecutionStatus" class="ml-1 text-foreground">({{ workflow.lastExecutionStatus }})</span>
            </span>
            <span v-else class="italic">Never run</span>
          </div>
          <!-- Labels as real tags (only when present) -->
          <div v-if="(workflow.labels || []).length > 0" class="flex flex-wrap gap-1 mt-2">
            <Badge v-for="label in workflow.labels" :key="label" variant="secondary" class="text-xs">{{ label }}</Badge>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Button v-if="!editingWorkflow" variant="outline" size="sm" @click="startEditWorkflow">Edit Workflow</Button>
          <Button size="sm" class="bg-green-600 hover:bg-green-700" :disabled="triggering || hasActiveExecution || !hasWebhookTrigger" @click="showRunDialog = true">
            <template v-if="hasActiveExecution">Execution In Progress…</template>
            <template v-else-if="triggering">Submitting…</template>
            <template v-else-if="!hasWebhookTrigger">No Webhook Trigger</template>
            <template v-else>Manual Run</template>
          </Button>
          <Button variant="outline" size="sm" @click="toggleActive">{{ workflow.isActive ? 'Deactivate' : 'Activate' }}</Button>
        </div>
      </div>

      <!-- Run Dialog -->
      <Dialog v-model:open="showRunDialog">
        <DialogContent class="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manual Run</DialogTitle>
            <DialogDescription v-if="webhookParams.length > 0">Fill in the required inputs. These are available as <code v-pre class="bg-muted px-1 rounded text-xs">{{ inputs.PARAM_NAME }}</code> in prompt templates.</DialogDescription>
            <DialogDescription v-else>No parameters defined on the webhook trigger. The workflow will run with empty inputs.</DialogDescription>
          </DialogHeader>
          <div v-if="webhookParams.length > 0" class="space-y-3 py-2">
            <div v-for="param in webhookParams" :key="param.name" class="space-y-1">
              <Label class="text-sm">{{ param.name }} <span v-if="param.required" class="text-destructive">*</span></Label>
              <Input v-model="runInputs[param.name]" :placeholder="param.description || param.name" />
              <p v-if="param.description" class="text-xs text-muted-foreground">{{ param.description }}</p>
            </div>
          </div>
          <div v-if="runValidationError" class="p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ runValidationError }}</div>
          <DialogFooter>
            <Button variant="outline" @click="showRunDialog = false; resetRunInputs()">Cancel</Button>
            <Button class="bg-green-600 hover:bg-green-700" :disabled="triggering" @click="handleManualRun">{{ triggering ? 'Running…' : 'Start Run' }}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Trigger Result -->
      <div v-if="triggerResult" class="p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-sm">
        Workflow run accepted! The controller will start execution shortly.
        <span v-if="latestActiveExecution" class="ml-2">
          Execution: {{ latestActiveExecution.id?.substring(0, 8) }}… ({{ latestActiveExecution.status }})
          <NuxtLink :to="`/${ws}/executions/${latestActiveExecution.id}`" class="text-primary hover:underline ml-1">View →</NuxtLink>
        </span>
      </div>

      <!-- Edit Workflow Form -->
      <Card v-if="editingWorkflow">
        <CardHeader><CardTitle>Edit Workflow</CardTitle></CardHeader>
        <CardContent>
          <div v-if="editWfError" class="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ editWfError }}</div>
          <form @submit.prevent="handleSaveWorkflow" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="space-y-2"><Label>Name *</Label><Input v-model="editWfForm.name" required /></div>
              <div class="space-y-2"><Label>Description</Label><Input v-model="editWfForm.description" /></div>
            </div>
            <Separator />
            <div class="space-y-2">
              <Label class="text-sm">Labels</Label>
              <div class="flex flex-wrap gap-2 mb-2">
                <Badge v-for="(label, idx) in editWfForm.labels" :key="idx" variant="secondary" class="gap-1">
                  {{ label }}
                  <button type="button" class="ml-1 text-muted-foreground hover:text-foreground" @click="editWfForm.labels.splice(idx, 1)">&times;</button>
                </Badge>
              </div>
              <div class="flex gap-2">
                <Input v-model="editNewLabel" placeholder="Add label…" class="max-w-xs" @keydown.enter.prevent="addEditLabel" />
                <Button type="button" variant="outline" size="sm" @click="addEditLabel">Add</Button>
              </div>
              <p class="text-xs text-muted-foreground">Tags for organizing and filtering workflows. Max 10 labels.</p>
            </div>
            <Separator />
            <div>
              <h3 class="text-sm font-semibold mb-1">Workflow Defaults</h3>
              <p class="text-xs text-muted-foreground mb-3">Steps inherit these unless overridden.</p>
              <div class="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div class="space-y-1">
                  <Label class="text-xs">Default Agent</Label>
                  <select v-model="editWfForm.defaultAgentId" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">None</option>
                    <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                  </select>
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Default Model</Label>
                  <select v-model="editWfForm.defaultModel" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">None</option>
                    <option v-for="m in availableModels" :key="m.id" :value="m.name">{{ m.name }}</option>
                  </select>
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Default Reasoning</Label>
                  <select v-model="editWfForm.defaultReasoningEffort" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="">None</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Worker Runtime</Label>
                  <select v-model="editWfForm.workerRuntime" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                    <option value="static">Static Worker</option>
                    <option value="ephemeral">Ephemeral Worker (Kubernetes)</option>
                  </select>
                  <p class="text-xs text-muted-foreground">Ephemeral runtime creates a dedicated pod for each step execution.</p>
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Step Allocation Timeout (s)</Label>
                  <Input v-model.number="editWfForm.stepAllocationTimeoutSeconds" type="number" min="15" max="3600" />
                  <p class="text-xs text-muted-foreground">A step stays pending until a static worker or ephemeral pod becomes ready, up to this limit.</p>
                </div>
              </div>
            </div>
            <div class="flex gap-3 pt-2">
              <Button type="submit" :disabled="savingWf">{{ savingWf ? 'Saving…' : 'Save Changes' }}</Button>
              <Button variant="outline" type="button" @click="editingWorkflow = false">Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <!-- View Workflow Details -->
      <div v-else>
        <p v-if="workflow.description" class="text-muted-foreground mb-4">{{ workflow.description }}</p>
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card><CardHeader class="pb-2"><CardTitle class="text-sm text-muted-foreground">Default Agent</CardTitle></CardHeader><CardContent><p class="font-medium">{{ workflow.defaultAgentId ? (agentNameMap[workflow.defaultAgentId] || workflow.defaultAgentId.substring(0, 8) + '…') : '—' }}</p></CardContent></Card>
          <Card><CardHeader class="pb-2"><CardTitle class="text-sm text-muted-foreground">Default Model</CardTitle></CardHeader><CardContent><p class="font-medium">{{ workflow.defaultModel || '—' }}</p></CardContent></Card>
          <Card><CardHeader class="pb-2"><CardTitle class="text-sm text-muted-foreground">Default Reasoning</CardTitle></CardHeader><CardContent><p class="font-medium capitalize">{{ workflow.defaultReasoningEffort || '—' }}</p></CardContent></Card>
          <Card><CardHeader class="pb-2"><CardTitle class="text-sm text-muted-foreground">Worker Runtime</CardTitle></CardHeader><CardContent><p class="font-medium">{{ formatWorkerRuntime(workflow.workerRuntime) }}</p></CardContent></Card>
          <Card><CardHeader class="pb-2"><CardTitle class="text-sm text-muted-foreground">Step Allocation Timeout</CardTitle></CardHeader><CardContent><p class="font-medium">{{ workflow.stepAllocationTimeoutSeconds }}s</p></CardContent></Card>
        </div>
      </div>

      <!-- Steps -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <CardTitle>Steps</CardTitle>
            <Button v-if="!editingSteps" variant="outline" size="sm" @click="startEditSteps">Edit Steps</Button>
          </div>
        </CardHeader>
        <CardContent>
          <!-- View mode -->
          <div v-if="!editingSteps" class="space-y-3">
            <Card v-for="(step, idx) in steps" :key="step.id" class="bg-muted/20">
              <CardContent class="pt-4">
                <div class="flex items-center gap-3 mb-2">
                  <span class="text-xl font-bold text-muted-foreground">{{ idx + 1 }}</span>
                  <h3 class="font-semibold">{{ step.name }}</h3>
                  <div class="flex items-center gap-2 ml-auto">
                    <Badge v-if="step.model" variant="secondary">{{ step.model }}</Badge>
                    <Badge v-if="step.reasoningEffort" variant="outline">{{ step.reasoningEffort }}</Badge>
                    <Badge variant="outline">{{ formatStepRuntime(step.workerRuntime) }}</Badge>
                    <span class="text-xs text-muted-foreground">{{ step.timeoutSeconds }}s</span>
                  </div>
                </div>
                <p class="text-xs text-muted-foreground mb-2">Agent: {{ step.agentId ? (agentNameMap[step.agentId] || step.agentId.substring(0, 8) + '…') : 'Workflow Default' }}</p>
                <div class="bg-muted p-3 rounded text-xs font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">{{ step.promptTemplate }}</div>
              </CardContent>
            </Card>
            <p v-if="steps.length === 0" class="text-muted-foreground text-sm">No steps defined.</p>
          </div>

          <!-- Edit mode -->
          <div v-else class="space-y-3">
            <div v-if="editStepError" class="p-3 rounded-md bg-destructive/10 text-destructive text-sm">{{ editStepError }}</div>
            <Card v-for="(step, idx) in editStepForm" :key="idx" class="bg-muted/20">
              <CardContent class="pt-4 space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium">Step {{ idx + 1 }}</span>
                  <Button v-if="editStepForm.length > 1" variant="ghost" size="sm" class="text-destructive h-7 text-xs" @click="editStepForm.splice(idx, 1)">Remove</Button>
                </div>
                <Input v-model="step.name" required placeholder="Step name" />
                <Textarea v-model="step.promptTemplate" rows="6" required class="font-mono text-xs" placeholder="Jinja2 prompt template: {{ precedent_output }}, {{ properties.KEY }}, {{ credentials.KEY }}" />
                <details class="rounded-md border border-dashed border-border bg-background/60 px-3 py-2">
                  <summary class="cursor-pointer text-xs font-medium text-foreground">Advanced Settings</summary>
                  <p class="mt-1 text-xs text-muted-foreground">Control the agent, model, reasoning, worker runtime, and timeout for this step.</p>
                  <div class="mt-3 grid grid-cols-1 md:grid-cols-5 gap-3">
                    <div class="space-y-1">
                      <Label class="text-xs">Agent</Label>
                      <select v-model="step.agentId" class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{{ workflow?.defaultAgentId ? 'Use Default' : 'Select…' }}</option>
                        <option v-for="a in agents" :key="a.id" :value="a.id">{{ a.name }}</option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <Label class="text-xs">Model</Label>
                      <select v-model="step.model" class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{{ workflow?.defaultModel ? 'Use Default' : 'None' }}</option>
                        <option v-for="m in availableModels" :key="m.id" :value="m.name">{{ m.name }}</option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <Label class="text-xs">Reasoning</Label>
                      <select v-model="step.reasoningEffort" class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">{{ workflow?.defaultReasoningEffort ? 'Use Default' : 'None' }}</option>
                        <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <Label class="text-xs">Worker Runtime</Label>
                      <select v-model="step.workerRuntime" class="w-full px-2 py-1.5 rounded-md border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">Use Workflow Default</option>
                        <option value="static">Static Worker</option>
                        <option value="ephemeral">Ephemeral Worker</option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <Label class="text-xs">Timeout (s)</Label>
                      <Input v-model.number="step.timeoutSeconds" type="number" min="30" max="3600" class="text-xs" />
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
            <Button variant="ghost" size="sm" @click="editStepForm.push({ name: '', promptTemplate: '', agentId: '', model: '', reasoningEffort: '', workerRuntime: '', timeoutSeconds: 300 })">+ Add Step</Button>
            <div class="flex gap-2 pt-2">
              <Button :disabled="savingSteps" @click="handleSaveSteps">{{ savingSteps ? 'Saving…' : 'Save Steps' }}</Button>
              <Button variant="outline" @click="editingSteps = false">Cancel</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Triggers -->
      <Card>
        <CardHeader>
          <div class="flex items-center justify-between">
            <div>
              <CardTitle>Triggers</CardTitle>
              <CardDescription>Add a webhook trigger to enable <strong>Manual Run</strong>. Webhook parameters define the input fields shown during Manual Run. Triggers can be edited after creation; saving updates the schedule, path, parameters, or event conditions in place.</CardDescription>
            </div>
            <Button variant="outline" size="sm" @click="showTriggerForm = true">+ Add Trigger</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Card v-if="showTriggerForm" class="mb-4 bg-muted/20">
            <CardContent class="pt-4">
              <div v-if="triggerError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ triggerError }}</div>
              <form @submit.prevent="handleAddTrigger" class="space-y-3">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <Label class="text-xs">Trigger Type *</Label>
                    <select v-model="triggerForm.triggerType" required class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="time_schedule">Repeatable Schedule (Cron)</option>
                      <option value="exact_datetime">Exact Datetime</option>
                      <option value="webhook">Webhook</option>
                      <option value="event">Event</option>
                    </select>
                  </div>
                  <div v-if="triggerForm.triggerType === 'time_schedule'" class="space-y-1">
                    <Label class="text-xs">Cron Expression *</Label>
                    <Input v-model="triggerForm.cron" class="font-mono" placeholder="0 9 * * 1-5" />
                    <p class="text-xs text-muted-foreground">e.g. "0 9 * * 1-5" = 9 AM weekdays</p>
                  </div>
                  <div v-if="triggerForm.triggerType === 'exact_datetime'" class="space-y-1">
                    <Label class="text-xs">Datetime (ISO 8601) *</Label>
                    <Input v-model="triggerForm.datetime" type="datetime-local" />
                    <p class="text-xs text-muted-foreground">The trigger fires once at this exact datetime and then deactivates.</p>
                  </div>
                  <div v-if="triggerForm.triggerType === 'webhook'" class="space-y-1">
                    <Label class="text-xs">Webhook Path *</Label>
                    <Input v-model="triggerForm.webhookPath" class="font-mono" placeholder="/my-webhook" />
                  </div>
                  <div v-if="triggerForm.triggerType === 'event'" class="space-y-1">
                    <Label class="text-xs">Event Name *</Label>
                    <select v-model="triggerForm.eventType" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                      <option value="">Select event...</option>
                      <option v-for="name in eventNames" :key="name" :value="name">{{ name }}</option>
                    </select>
                  </div>
                </div>
                <!-- Webhook Parameters -->
                <div v-if="triggerForm.triggerType === 'webhook'" class="mt-3 space-y-2">
                  <div class="flex items-center justify-between">
                    <Label class="text-xs">Webhook Parameters</Label>
                    <Button variant="ghost" size="sm" class="h-6 text-xs" type="button" @click="triggerForm.webhookParams.push({ name: '', required: false, description: '' })">+ Add Parameter</Button>
                  </div>
                  <div v-for="(param, pi) in triggerForm.webhookParams" :key="pi" class="flex gap-2 items-center">
                    <Input v-model="param.name" placeholder="Name" class="flex-1 text-xs" />
                    <Input v-model="param.description" placeholder="Description (optional)" class="flex-1 text-xs" />
                    <label class="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" v-model="param.required" /> Required</label>
                    <Button variant="ghost" size="sm" class="h-6 w-6 p-0 text-destructive" type="button" @click="triggerForm.webhookParams.splice(pi, 1)">×</Button>
                  </div>
                  <p class="text-xs text-muted-foreground">Define inputs for this webhook. Access in prompts: <code v-pre class="bg-muted px-1 rounded">{{ inputs.paramName }}</code>. Required parameters are validated.</p>
                </div>
                <!-- Event Conditions -->
                <div v-if="triggerForm.triggerType === 'event'" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <Label class="text-xs">Event Data Conditions (optional)</Label>
                    <Button variant="ghost" size="sm" class="h-6 text-xs" type="button" @click="triggerForm.conditions.push({ key: '', value: '' })">+ Add Condition</Button>
                  </div>
                  <div v-for="(cond, ci) in triggerForm.conditions" :key="ci" class="flex gap-2 items-center">
                    <Input v-model="cond.key" placeholder="Key (e.g. scope)" class="flex-1 text-xs" />
                    <span class="text-xs text-muted-foreground">=</span>
                    <Input v-model="cond.value" placeholder="Value (e.g. workspace)" class="flex-1 text-xs" />
                    <Button variant="ghost" size="sm" class="h-6 w-6 p-0 text-destructive" type="button" @click="triggerForm.conditions.splice(ci, 1)">×</Button>
                  </div>
                  <p class="text-xs text-muted-foreground">Only fire when event data matches all conditions. Common keys: agentId, agentName, scope</p>
                </div>
                <div class="flex gap-2">
                  <Button type="submit" size="sm" :disabled="savingTrigger">{{ savingTrigger ? 'Saving…' : 'Add Trigger' }}</Button>
                  <Button variant="outline" size="sm" type="button" @click="showTriggerForm = false">Cancel</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div class="space-y-2">
            <div v-for="trigger in triggers" :key="trigger.id" class="rounded-lg border border-border overflow-hidden">
              <!-- Display row -->
              <div v-if="editingTriggerId !== trigger.id" class="p-3 flex items-center justify-between">
                <div class="flex items-center gap-3 min-w-0">
                  <Badge variant="secondary" class="uppercase text-xs">{{ formatTriggerType(trigger.triggerType || trigger.type) }}</Badge>
                  <span class="text-sm font-mono truncate">{{ formatTriggerConfig(trigger) }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-xs text-muted-foreground">{{ trigger.isActive ? 'Enabled' : 'Disabled' }}</span>
                  <Button variant="ghost" size="sm" class="h-7 text-xs" @click="startEditTrigger(trigger)">Edit</Button>
                  <Button variant="ghost" size="sm" class="text-destructive text-xs h-7" @click="handleDeleteTrigger(trigger.id)">Delete</Button>
                </div>
              </div>
              <!-- Inline edit form -->
              <div v-else class="p-4 bg-muted/20">
                <div v-if="editTriggerError" class="mb-3 p-2 rounded-md bg-destructive/10 text-destructive text-sm">{{ editTriggerError }}</div>
                <form @submit.prevent="handleSaveEditTrigger(trigger.id)" class="space-y-3">
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div class="space-y-1">
                      <Label class="text-xs">Trigger Type *</Label>
                      <select v-model="editTriggerForm.triggerType" required class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="time_schedule">Repeatable Schedule (Cron)</option>
                        <option value="exact_datetime">Exact Datetime</option>
                        <option value="webhook">Webhook</option>
                        <option value="event">Event</option>
                      </select>
                    </div>
                    <div v-if="editTriggerForm.triggerType === 'time_schedule'" class="space-y-1">
                      <Label class="text-xs">Cron Expression *</Label>
                      <Input v-model="editTriggerForm.cron" class="font-mono" placeholder="0 9 * * 1-5" />
                    </div>
                    <div v-if="editTriggerForm.triggerType === 'exact_datetime'" class="space-y-1">
                      <Label class="text-xs">Datetime *</Label>
                      <Input v-model="editTriggerForm.datetime" type="datetime-local" />
                    </div>
                    <div v-if="editTriggerForm.triggerType === 'webhook'" class="space-y-1">
                      <Label class="text-xs">Webhook Path *</Label>
                      <Input v-model="editTriggerForm.webhookPath" class="font-mono" placeholder="/my-webhook" />
                    </div>
                    <div v-if="editTriggerForm.triggerType === 'event'" class="space-y-1">
                      <Label class="text-xs">Event Name *</Label>
                      <select v-model="editTriggerForm.eventType" class="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        <option value="">Select event...</option>
                        <option v-for="name in eventNames" :key="name" :value="name">{{ name }}</option>
                      </select>
                    </div>
                    <div class="space-y-1">
                      <Label class="text-xs">Enabled</Label>
                      <label class="flex items-center gap-2 text-sm h-10">
                        <input type="checkbox" v-model="editTriggerForm.isActive" />
                        <span>{{ editTriggerForm.isActive ? 'Enabled' : 'Disabled' }}</span>
                      </label>
                    </div>
                  </div>
                  <!-- Webhook Parameters -->
                  <div v-if="editTriggerForm.triggerType === 'webhook'" class="space-y-2">
                    <div class="flex items-center justify-between">
                      <Label class="text-xs">Webhook Parameters</Label>
                      <Button variant="ghost" size="sm" class="h-6 text-xs" type="button" @click="editTriggerForm.webhookParams.push({ name: '', required: false, description: '' })">+ Add Parameter</Button>
                    </div>
                    <div v-for="(param, pi) in editTriggerForm.webhookParams" :key="pi" class="flex gap-2 items-center">
                      <Input v-model="param.name" placeholder="Name" class="flex-1 text-xs" />
                      <Input v-model="param.description" placeholder="Description (optional)" class="flex-1 text-xs" />
                      <label class="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" v-model="param.required" /> Required</label>
                      <Button variant="ghost" size="sm" class="h-6 w-6 p-0 text-destructive" type="button" @click="editTriggerForm.webhookParams.splice(pi, 1)">×</Button>
                    </div>
                  </div>
                  <!-- Event Conditions -->
                  <div v-if="editTriggerForm.triggerType === 'event'" class="space-y-2">
                    <div class="flex items-center justify-between">
                      <Label class="text-xs">Event Data Conditions</Label>
                      <Button variant="ghost" size="sm" class="h-6 text-xs" type="button" @click="editTriggerForm.conditions.push({ key: '', value: '' })">+ Add Condition</Button>
                    </div>
                    <div v-for="(cond, ci) in editTriggerForm.conditions" :key="ci" class="flex gap-2 items-center">
                      <Input v-model="cond.key" placeholder="Key" class="flex-1 text-xs" />
                      <span class="text-xs text-muted-foreground">=</span>
                      <Input v-model="cond.value" placeholder="Value" class="flex-1 text-xs" />
                      <Button variant="ghost" size="sm" class="h-6 w-6 p-0 text-destructive" type="button" @click="editTriggerForm.conditions.splice(ci, 1)">×</Button>
                    </div>
                  </div>
                  <div class="flex gap-2">
                    <Button type="submit" size="sm" :disabled="savingEditTrigger">{{ savingEditTrigger ? 'Saving…' : 'Save Changes' }}</Button>
                    <Button variant="outline" size="sm" type="button" @click="editingTriggerId = null">Cancel</Button>
                  </div>
                </form>
              </div>
            </div>
            <p v-if="triggers.length === 0 && !showTriggerForm" class="text-muted-foreground text-sm">No automated triggers configured.</p>
          </div>
        </CardContent>
      </Card>
    </div>
    <p v-else class="text-muted-foreground mt-4">Workflow not found.</p>
  </div>
</template>

<script setup lang="ts">
interface EditStep {
  name: string;
  promptTemplate: string;
  agentId: string;
  model: string;
  reasoningEffort: string;
  workerRuntime: string;
  timeoutSeconds: number;
}

const route = useRoute();
const workflowId = route.params.id as string;
const ws = computed(() => (route.params.workspace as string) || 'default');

const { authHeaders } = useAuth();
const headers = authHeaders();

const { data: wfData, refresh: refreshWf } = await useFetch(`/api/workflows/${workflowId}`, { headers });
const { data: trigData, refresh: refreshTriggers } = await useFetch(`/api/triggers?workflowId=${workflowId}`, { headers });
const { data: agentsData } = await useFetch('/api/agents', { headers });

const { data: namesData } = await useFetch('/api/events/names', { headers });
const eventNames = computed(() => (namesData.value as any)?.eventNames ?? []);

const { data: modelsData } = await useFetch('/api/quota/models', { headers });
const availableModels = computed(() => (modelsData.value as any)?.models ?? []);

const workflow = computed(() => wfData.value?.workflow);
const steps = computed(() => wfData.value?.steps ?? []);
const triggers = computed(() => trigData.value?.triggers ?? []);
const agents = computed(() => agentsData.value?.agents ?? []);

const agentNameMap = computed(() => {
  const map: Record<string, string> = {};
  for (const a of agents.value) map[a.id] = a.name;
  return map;
});

function formatTriggerConfig(trigger: any): string {
  const cfg = trigger.configuration || trigger.config || {};
  if (cfg.cron) return `cron: ${cfg.cron}`;
  if (cfg.datetime) return `datetime: ${new Date(cfg.datetime).toLocaleString()}`;
  if (cfg.path) {
    const paramCount = Array.isArray(cfg.parameters) ? cfg.parameters.length : 0;
    return paramCount > 0 ? `path: ${cfg.path} (${paramCount} param${paramCount > 1 ? 's' : ''})` : `path: ${cfg.path}`;
  }
  if (cfg.eventType || cfg.eventName) return `event: ${cfg.eventType || cfg.eventName}`;
  return '—';
}

function formatTriggerType(type: string): string {
  const labels: Record<string, string> = {
    time_schedule: 'Repeatable Schedule',
    exact_datetime: 'Exact Datetime',
    webhook: 'Webhook',
    event: 'Event',
  };
  return labels[type] || type;
}

function formatWorkerRuntime(runtime?: string): string {
  const labels: Record<string, string> = {
    static: 'Static Worker',
    ephemeral: 'Ephemeral Worker',
  };
  return labels[runtime || 'static'] || runtime || 'Static Worker';
}

function formatStepRuntime(runtime?: string | null): string {
  return runtime ? formatWorkerRuntime(runtime) : `Workflow Default · ${formatWorkerRuntime(workflow.value?.workerRuntime)}`;
}

// ── Workflow Edit ────────────────────────────────────────────────
const editingWorkflow = ref(false);
const savingWf = ref(false);
const editWfError = ref('');
const editNewLabel = ref('');
const editWfForm = reactive({
  name: '',
  description: '',
  labels: [] as string[],
  defaultAgentId: '',
  defaultModel: '',
  defaultReasoningEffort: '',
  workerRuntime: 'static' as 'static' | 'ephemeral',
  stepAllocationTimeoutSeconds: 300,
});

function startEditWorkflow() {
  Object.assign(editWfForm, {
    name: workflow.value?.name || '',
    description: workflow.value?.description || '',
    labels: [...(workflow.value?.labels || [])],
    defaultAgentId: workflow.value?.defaultAgentId || '',
    defaultModel: workflow.value?.defaultModel || '',
    defaultReasoningEffort: workflow.value?.defaultReasoningEffort || '',
    workerRuntime: workflow.value?.workerRuntime || 'static',
    stepAllocationTimeoutSeconds: workflow.value?.stepAllocationTimeoutSeconds || 300,
  });
  editNewLabel.value = '';
  editWfError.value = '';
  editingWorkflow.value = true;
}

function addEditLabel() {
  const label = editNewLabel.value.trim();
  if (label && !editWfForm.labels.includes(label) && editWfForm.labels.length < 10) {
    editWfForm.labels.push(label);
  }
  editNewLabel.value = '';
}

async function handleSaveWorkflow() {
  editWfError.value = '';
  savingWf.value = true;
  try {
    await $fetch(`/api/workflows/${workflowId}`, {
      method: 'PUT',
      headers,
      body: {
        name: editWfForm.name,
        description: editWfForm.description || undefined,
        labels: editWfForm.labels,
        defaultAgentId: editWfForm.defaultAgentId || null,
        defaultModel: editWfForm.defaultModel || null,
        defaultReasoningEffort: editWfForm.defaultReasoningEffort || null,
        workerRuntime: editWfForm.workerRuntime,
        stepAllocationTimeoutSeconds: editWfForm.stepAllocationTimeoutSeconds,
      },
    });
    editingWorkflow.value = false;
    await refreshWf();
  } catch (e: any) {
    editWfError.value = e?.data?.error || 'Failed to save workflow';
  } finally {
    savingWf.value = false;
  }
}

// ── Manual Run ──────────────────────────────────────────────────
const triggering = ref(false);
const triggerResult = ref<any>(null);
const showRunDialog = ref(false);
const runInputs = reactive<Record<string, string>>({});
const runValidationError = ref('');
const activeExecutions = ref<any[]>([]);
const hasActiveExecution = computed(() => activeExecutions.value.length > 0);
const latestActiveExecution = computed(() => activeExecutions.value[0] ?? null);
let pollTimer: ReturnType<typeof setInterval> | null = null;

// Compute webhook trigger info for Manual Run
const hasWebhookTrigger = computed(() => triggers.value.some((t: any) => t.triggerType === 'webhook' && t.isActive));
const webhookParams = computed(() => {
  const wh = triggers.value.find((t: any) => t.triggerType === 'webhook' && t.isActive);
  if (!wh) return [];
  const config = wh.configuration || {};
  return Array.isArray(config.parameters) ? config.parameters : [];
});

function resetRunInputs() {
  for (const key of Object.keys(runInputs)) delete runInputs[key];
  runValidationError.value = '';
}

async function pollActiveExecutions() {
  try {
    const res = await $fetch<{ executions: any[] }>(`/api/executions/active?workflowId=${workflowId}`, { headers });
    activeExecutions.value = res.executions ?? [];
    // Stop polling when no active executions remain and we already triggered
    if (triggerResult.value && activeExecutions.value.length === 0 && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
      // Refresh workflow data to show the latest execution
      await refreshWf();
    }
  } catch { /* ignore poll errors */ }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(pollActiveExecutions, 3000);
}

// Initial check for active executions
pollActiveExecutions();

async function handleManualRun() {
  runValidationError.value = '';

  // Validate required params
  const missing = webhookParams.value.filter((p: any) => p.required && (!runInputs[p.name] || !runInputs[p.name].trim()));
  if (missing.length > 0) {
    runValidationError.value = `Missing required inputs: ${missing.map((p: any) => p.name).join(', ')}`;
    return;
  }

  triggering.value = true;
  triggerResult.value = null;
  try {
    const res = await $fetch<{ status: string; executionId: string }>(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers,
      body: { inputs: { ...runInputs } },
    });
    triggerResult.value = res;
    showRunDialog.value = false;
    resetRunInputs();
    // Start polling to pick up the execution
    startPolling();
    await pollActiveExecutions();
  } catch (e: any) {
    runValidationError.value = e?.data?.error || 'Failed to run workflow';
  } finally {
    triggering.value = false;
  }
}

onUnmounted(() => {
  if (pollTimer) clearInterval(pollTimer);
});

// ── Toggle active ───────────────────────────────────────────────
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

// ── Step editing ────────────────────────────────────────────────
const editingSteps = ref(false);
const savingSteps = ref(false);
const editStepError = ref('');
const editStepForm = ref<EditStep[]>([]);

function startEditSteps() {
  editStepForm.value = steps.value.map((s: any) => ({
    name: s.name,
    promptTemplate: s.promptTemplate,
    agentId: s.agentId || '',
    model: s.model || '',
    reasoningEffort: s.reasoningEffort || '',
    workerRuntime: s.workerRuntime || '',
    timeoutSeconds: s.timeoutSeconds || 300,
  }));
  editStepError.value = '';
  editingSteps.value = true;
}

async function handleSaveSteps() {
  editStepError.value = '';
  savingSteps.value = true;
  try {
    await $fetch(`/api/workflows/${workflowId}/steps`, {
      method: 'PUT',
      headers,
      body: {
        steps: editStepForm.value.map((s, i) => ({
          name: s.name,
          promptTemplate: s.promptTemplate,
          stepOrder: i + 1,
          agentId: s.agentId || undefined,
          model: s.model || undefined,
          reasoningEffort: s.reasoningEffort || undefined,
          workerRuntime: s.workerRuntime || undefined,
          timeoutSeconds: s.timeoutSeconds,
        })),
      },
    });
    editingSteps.value = false;
    await refreshWf();
  } catch (e: any) {
    editStepError.value = e?.data?.error || 'Failed to save steps';
  } finally {
    savingSteps.value = false;
  }
}

// ── Trigger management ──────────────────────────────────────────
const showTriggerForm = ref(false);
const savingTrigger = ref(false);
const triggerError = ref('');
const triggerForm = reactive({ triggerType: 'time_schedule', cron: '', webhookPath: '', webhookParams: [] as Array<{ name: string; required: boolean; description: string }>, eventType: '', datetime: '', conditions: [] as Array<{ key: string; value: string }> });

async function handleAddTrigger() {
  triggerError.value = '';
  savingTrigger.value = true;
  try {
    const configuration: Record<string, unknown> = {};
    if (triggerForm.triggerType === 'time_schedule') configuration.cron = triggerForm.cron;
    if (triggerForm.triggerType === 'exact_datetime') configuration.datetime = new Date(triggerForm.datetime).toISOString();
    if (triggerForm.triggerType === 'webhook') {
      configuration.path = triggerForm.webhookPath;
      const params = triggerForm.webhookParams.filter(p => p.name.trim());
      if (params.length > 0) configuration.parameters = params.map(p => ({ name: p.name.trim(), required: p.required, ...(p.description.trim() ? { description: p.description.trim() } : {}) }));
    }
    if (triggerForm.triggerType === 'event') {
      configuration.eventName = triggerForm.eventType;
      if (triggerForm.conditions.length > 0) {
        const conds: Record<string, string> = {};
        for (const c of triggerForm.conditions) { if (c.key.trim()) conds[c.key.trim()] = c.value; }
        if (Object.keys(conds).length > 0) configuration.conditions = conds;
      }
    }

    await $fetch('/api/triggers', {
      method: 'POST',
      headers,
      body: { workflowId, triggerType: triggerForm.triggerType, configuration },
    });
    showTriggerForm.value = false;
    Object.assign(triggerForm, { triggerType: 'time_schedule', cron: '', webhookPath: '', webhookParams: [], eventType: '', datetime: '', conditions: [] });
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

// ── Edit existing trigger ────────────────────────────────────────
interface EditTriggerForm {
  triggerType: string;
  cron: string;
  webhookPath: string;
  webhookParams: Array<{ name: string; required: boolean; description: string }>;
  eventType: string;
  datetime: string;
  conditions: Array<{ key: string; value: string }>;
  isActive: boolean;
}

const editingTriggerId = ref<string | null>(null);
const savingEditTrigger = ref(false);
const editTriggerError = ref('');
const editTriggerForm = reactive<EditTriggerForm>({
  triggerType: 'time_schedule',
  cron: '',
  webhookPath: '',
  webhookParams: [],
  eventType: '',
  datetime: '',
  conditions: [],
  isActive: true,
});

function toLocalDatetimeInput(iso: string | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startEditTrigger(trigger: any) {
  const cfg = (trigger.configuration || trigger.config || {}) as Record<string, any>;
  const paramList = Array.isArray(cfg.parameters) ? cfg.parameters : [];
  const condsObj: Record<string, string> = (cfg.conditions && typeof cfg.conditions === 'object') ? cfg.conditions : {};
  Object.assign(editTriggerForm, {
    triggerType: trigger.triggerType || trigger.type || 'time_schedule',
    cron: cfg.cron || '',
    webhookPath: cfg.path || '',
    webhookParams: paramList.map((p: any) => ({
      name: p.name || '',
      required: Boolean(p.required),
      description: p.description || '',
    })),
    eventType: cfg.eventName || cfg.eventType || '',
    datetime: toLocalDatetimeInput(cfg.datetime),
    conditions: Object.entries(condsObj).map(([key, value]) => ({ key, value: String(value) })),
    isActive: Boolean(trigger.isActive),
  });
  editTriggerError.value = '';
  editingTriggerId.value = trigger.id;
}

async function handleSaveEditTrigger(id: string) {
  editTriggerError.value = '';
  savingEditTrigger.value = true;
  try {
    const configuration: Record<string, unknown> = {};
    if (editTriggerForm.triggerType === 'time_schedule') configuration.cron = editTriggerForm.cron;
    if (editTriggerForm.triggerType === 'exact_datetime') {
      if (!editTriggerForm.datetime) throw new Error('Datetime is required');
      configuration.datetime = new Date(editTriggerForm.datetime).toISOString();
    }
    if (editTriggerForm.triggerType === 'webhook') {
      configuration.path = editTriggerForm.webhookPath;
      const params = editTriggerForm.webhookParams.filter((p) => p.name.trim());
      if (params.length > 0) {
        configuration.parameters = params.map((p) => ({
          name: p.name.trim(),
          required: p.required,
          ...(p.description.trim() ? { description: p.description.trim() } : {}),
        }));
      }
    }
    if (editTriggerForm.triggerType === 'event') {
      configuration.eventName = editTriggerForm.eventType;
      if (editTriggerForm.conditions.length > 0) {
        const conds: Record<string, string> = {};
        for (const c of editTriggerForm.conditions) { if (c.key.trim()) conds[c.key.trim()] = c.value; }
        if (Object.keys(conds).length > 0) configuration.conditions = conds;
      }
    }

    await $fetch(`/api/triggers/${id}`, {
      method: 'PUT',
      headers,
      body: {
        triggerType: editTriggerForm.triggerType,
        configuration,
        isActive: editTriggerForm.isActive,
      },
    });
    editingTriggerId.value = null;
    await refreshTriggers();
  } catch (e: any) {
    editTriggerError.value = e?.data?.error || e?.message || 'Failed to save trigger';
  } finally {
    savingEditTrigger.value = false;
  }
}
</script>
