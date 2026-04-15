<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>Agents</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="flex items-center justify-between mt-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold">Agents</h1>
        <p class="text-muted-foreground text-sm mt-1">Git-hosted AI agent definitions with Copilot SDK integration</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex border rounded-md">
          <button @click="viewMode = 'card'" :class="['px-3 py-1.5 text-xs', viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted']">Cards</button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1.5 text-xs', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted']">Table</button>
        </div>
        <NuxtLink :to="`/${ws}/agents/new`">
          <Button>+ Create Agent</Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Card View -->
    <div v-if="viewMode === 'card'" class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <NuxtLink v-for="agent in agents" :key="agent.id" :to="`/${ws}/agents/${agent.id}`" class="block">
        <Card class="hover:border-primary/40 transition h-full">
          <CardHeader class="pb-2">
            <CardTitle class="text-lg">{{ agent.name }}</CardTitle>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge :variant="agent.status === 'active' ? 'default' : agent.status === 'paused' ? 'secondary' : 'destructive'">
                {{ agent.status }}
              </Badge>
              <Badge v-if="agent.scope === 'workspace'" variant="outline" class="text-xs">Workspace</Badge>
              <Badge variant="outline" class="text-xs">{{ (agent as any).sourceType === 'database' ? 'DB' : 'Git' }}</Badge>
              <Badge v-if="(agent as any).builtinToolsEnabled?.length" variant="secondary" class="text-xs">{{ (agent as any).builtinToolsEnabled.length }} tools</Badge>
            </div>
            <CardDescription v-if="agent.description" class="mt-1">{{ agent.description }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <span v-if="agent.gitRepoUrl" class="truncate max-w-[250px] font-mono">{{ agent.gitRepoUrl }}</span>
              <span v-if="agent.lastSessionAt" class="ml-auto whitespace-nowrap">Last: {{ new Date(agent.lastSessionAt).toLocaleDateString() }}</span>
            </div>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <!-- Table View -->
    <Card v-if="viewMode === 'table'">
      <CardContent class="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Scope</TableHead>
              <TableHead>Tools</TableHead>
              <TableHead>Last Session</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="agent in agents" :key="agent.id" class="cursor-pointer hover:bg-muted/50" @click="navigateTo(`/${ws}/agents/${agent.id}`)">
              <TableCell class="font-medium">
                {{ agent.name }}
                <p v-if="agent.description" class="text-xs text-muted-foreground truncate max-w-[200px]">{{ agent.description }}</p>
              </TableCell>
              <TableCell>
                <Badge :variant="agent.status === 'active' ? 'default' : 'secondary'" class="text-xs">{{ agent.status }}</Badge>
              </TableCell>
              <TableCell class="text-xs font-mono text-muted-foreground">
                {{ (agent as any).sourceType === 'database' ? 'Database' : (agent.gitRepoUrl || '').replace('https://github.com/', '') }}
              </TableCell>
              <TableCell>
                <Badge variant="outline" class="text-xs">{{ agent.scope === 'workspace' ? 'Workspace' : 'Personal' }}</Badge>
              </TableCell>
              <TableCell class="text-sm">{{ (agent as any).builtinToolsEnabled?.length ?? 0 }}</TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ agent.lastSessionAt ? new Date(agent.lastSessionAt).toLocaleDateString() : 'Never' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <p v-if="agents.length === 0" class="text-muted-foreground text-center py-8">
      No agents registered yet. Click "Create Agent" to get started.
    </p>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <span class="text-xs text-muted-foreground">Page {{ page }} of {{ totalPages }} ({{ total }} agents)</span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">Previous</Button>
        <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">Next</Button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();
const headers = authHeaders();
const route = useRoute();
const ws = computed(() => (route.params.workspace as string) || 'default');

const viewMode = ref<'card' | 'table'>('card');
const page = ref(1);
const limit = 20;

const { data } = await useFetch(
  computed(() => `/api/agents?page=${page.value}&limit=${limit}`),
  { headers, watch: [page] },
);
const agents = computed(() => data.value?.agents ?? []);
const total = computed(() => (data.value as any)?.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));
</script>
