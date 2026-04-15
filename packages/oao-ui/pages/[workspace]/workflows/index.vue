<template>
  <div>
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink :href="`/${ws}`">Home</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem><BreadcrumbPage>Workflows</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <div class="flex items-center justify-between mt-4 mb-6">
      <div>
        <h1 class="text-3xl font-bold">Workflows</h1>
        <p class="text-muted-foreground text-sm mt-1">Multi-step AI workflows with scheduled and manual triggers</p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex border rounded-md">
          <button @click="viewMode = 'card'" :class="['px-3 py-1.5 text-xs', viewMode === 'card' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted']">Cards</button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1.5 text-xs', viewMode === 'table' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted']">Table</button>
        </div>
        <NuxtLink :to="`/${ws}/workflows/new`">
          <Button>+ Create Workflow</Button>
        </NuxtLink>
      </div>
    </div>

    <!-- Label filter -->
    <div v-if="allLabels.length > 0" class="mb-4 flex flex-wrap items-center gap-2">
      <span class="text-sm text-muted-foreground mr-1">Filter by label:</span>
      <Badge
        v-for="label in allLabels" :key="label"
        :variant="selectedLabels.includes(label) ? 'default' : 'outline'"
        class="cursor-pointer select-none"
        @click="toggleLabel(label)"
      >
        {{ label }}
      </Badge>
      <button v-if="selectedLabels.length > 0" class="text-xs text-muted-foreground hover:text-foreground ml-2" @click="selectedLabels = []">Clear</button>
    </div>

    <!-- Card View -->
    <div v-if="viewMode === 'card'" class="space-y-3">
      <NuxtLink v-for="wf in filteredWorkflows" :key="wf.id" :to="`/${ws}/workflows/${wf.id}`" class="block">
        <Card class="hover:border-primary/40 transition">
          <CardHeader class="pb-2">
            <CardTitle class="text-lg">{{ wf.name }}</CardTitle>
            <div class="flex flex-wrap items-center gap-1.5 mt-1">
              <Badge :variant="wf.isActive ? 'default' : 'secondary'">{{ wf.isActive ? 'Active' : 'Inactive' }}</Badge>
              <Badge v-if="wf.scope === 'workspace'" variant="outline" class="text-xs">Workspace</Badge>
              <Badge variant="outline" class="font-mono text-xs">v{{ wf.version }}</Badge>
              <Badge v-for="label in (wf.labels || [])" :key="label" variant="secondary" class="text-xs">{{ label }}</Badge>
            </div>
            <CardDescription v-if="wf.description" class="mt-1">{{ wf.description }}</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Owner: {{ wf.ownerName || 'Unknown' }}</span>
              <span v-if="wf.lastExecutionAt">Last Run: {{ new Date(wf.lastExecutionAt).toLocaleString() }}</span>
              <span v-else class="italic">Never run</span>
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
              <TableHead>Version</TableHead>
              <TableHead>Labels</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Last Run</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="wf in filteredWorkflows" :key="wf.id" class="cursor-pointer hover:bg-muted/50" @click="navigateTo(`/${ws}/workflows/${wf.id}`)">
              <TableCell class="font-medium">
                {{ wf.name }}
                <p v-if="wf.description" class="text-xs text-muted-foreground truncate max-w-[200px]">{{ wf.description }}</p>
              </TableCell>
              <TableCell>
                <Badge :variant="wf.isActive ? 'default' : 'secondary'" class="text-xs">{{ wf.isActive ? 'Active' : 'Inactive' }}</Badge>
              </TableCell>
              <TableCell class="font-mono text-sm">v{{ wf.version }}</TableCell>
              <TableCell>
                <div class="flex flex-wrap gap-1">
                  <Badge v-for="label in (wf.labels || [])" :key="label" variant="secondary" class="text-xs">{{ label }}</Badge>
                </div>
              </TableCell>
              <TableCell class="text-sm text-muted-foreground">{{ wf.ownerName || 'Unknown' }}</TableCell>
              <TableCell class="text-sm text-muted-foreground">
                {{ wf.lastExecutionAt ? new Date(wf.lastExecutionAt).toLocaleString() : 'Never' }}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    <p v-if="filteredWorkflows.length === 0 && workflows.length > 0" class="text-muted-foreground text-center py-8">
      No workflows match the selected labels.
    </p>
    <p v-if="workflows.length === 0" class="text-muted-foreground text-center py-8">
      No workflows created yet. Click "Create Workflow" to get started.
    </p>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between mt-4">
      <span class="text-xs text-muted-foreground">Page {{ page }} of {{ totalPages }} ({{ total }} workflows)</span>
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
  computed(() => `/api/workflows?page=${page.value}&limit=${limit}`),
  { headers, watch: [page] },
);
const workflows = computed(() => data.value?.workflows ?? []);
const total = computed(() => (data.value as any)?.total ?? 0);
const totalPages = computed(() => Math.max(1, Math.ceil(total.value / limit)));

const { data: labelsData } = await useFetch('/api/workflows/labels', { headers });
const allLabels = computed(() => (labelsData.value as any)?.labels ?? []);

const selectedLabels = ref<string[]>([]);

function toggleLabel(label: string) {
  if (selectedLabels.value.includes(label)) {
    selectedLabels.value = selectedLabels.value.filter(l => l !== label);
  } else {
    selectedLabels.value = [...selectedLabels.value, label];
  }
}

const filteredWorkflows = computed(() => {
  if (selectedLabels.value.length === 0) return workflows.value;
  return workflows.value.filter((wf: any) =>
    selectedLabels.value.every(label => (wf.labels || []).includes(label)),
  );
});
</script>
