<template>
  <div class="rounded-2xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
    <div class="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
      <i class="pi pi-question-circle"></i>
      <span>{{ headerLabel }}</span>
    </div>
    <p v-if="ask.introduction" class="mb-3 whitespace-pre-wrap text-sm text-surface-800">{{ ask.introduction }}</p>

    <div class="space-y-4">
      <div v-for="question in ask.questions" :key="question.id" class="space-y-2">
        <p class="text-sm font-medium text-surface-900">
          {{ question.prompt }}
          <span v-if="isQuestionRequired(question)" class="text-red-600">*</span>
        </p>

        <div v-if="question.type === 'single_choice'" class="space-y-1.5">
          <div v-for="opt in question.options" :key="opt" class="flex items-center gap-2">
            <RadioButton
              :inputId="`${ask.askId}-${question.id}-${opt}`"
              :name="`${ask.askId}-${question.id}`"
              :value="opt"
              v-model="draft[question.id].value"
            />
            <label :for="`${ask.askId}-${question.id}-${opt}`" class="text-sm text-surface-800">{{ opt }}</label>
          </div>
          <div v-if="question.allowOther" class="flex items-center gap-2">
            <RadioButton
              :inputId="`${ask.askId}-${question.id}-__other__`"
              :name="`${ask.askId}-${question.id}`"
              value="__other__"
              v-model="draft[question.id].value"
            />
            <label :for="`${ask.askId}-${question.id}-__other__`" class="text-sm text-surface-800">Other</label>
            <InputText
              v-if="draft[question.id].value === '__other__'"
              v-model="draft[question.id].other"
              placeholder="Type your answer"
              size="small"
              class="ml-2 flex-1"
            />
          </div>
        </div>

        <div v-else-if="question.type === 'multi_choice'" class="space-y-1.5">
          <div v-for="opt in question.options" :key="opt" class="flex items-center gap-2">
            <Checkbox
              :inputId="`${ask.askId}-${question.id}-${opt}`"
              :value="opt"
              v-model="draft[question.id].value"
            />
            <label :for="`${ask.askId}-${question.id}-${opt}`" class="text-sm text-surface-800">{{ opt }}</label>
          </div>
          <div v-if="question.allowOther" class="flex items-center gap-2">
            <Checkbox
              :inputId="`${ask.askId}-${question.id}-__other__`"
              value="__other__"
              v-model="draft[question.id].value"
            />
            <label :for="`${ask.askId}-${question.id}-__other__`" class="text-sm text-surface-800">Other</label>
            <InputText
              v-if="Array.isArray(draft[question.id].value) && (draft[question.id].value as string[]).includes('__other__')"
              v-model="draft[question.id].other"
              placeholder="Type your answer"
              size="small"
              class="ml-2 flex-1"
            />
          </div>
        </div>

        <Textarea
          v-else
          v-model="draft[question.id].value"
          rows="3"
          autoResize
          placeholder="Type your answer"
          class="w-full"
        />
      </div>
    </div>

    <div class="mt-4 flex items-center justify-end gap-2">
      <Button
        :label="submitLabel"
        icon="pi pi-send"
        :loading="submitting"
        :disabled="!isComplete"
        size="small"
        @click="onSubmit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import RadioButton from 'primevue/radiobutton';
import Checkbox from 'primevue/checkbox';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import Button from 'primevue/button';

interface AskQuestion {
  id: string;
  prompt: string;
  type: 'single_choice' | 'multi_choice' | 'free_text';
  options?: string[];
  allowOther?: boolean;
  required?: boolean;
}

interface AskRequest {
  askId: string;
  introduction?: string | null;
  questions: AskQuestion[];
}

const props = defineProps<{
  ask: AskRequest;
  submitting?: boolean;
  headerLabel?: string;
  submitLabel?: string;
}>();

const emit = defineEmits<{
  (e: 'submit', payload: { askId: string; answers: Record<string, unknown> }): void;
}>();

const headerLabel = computed(() => props.headerLabel || 'The agent needs your input');
const submitLabel = computed(() => props.submitLabel || 'Submit Answers');

type DraftEntry = { value: any; other?: string };
const draft = reactive<Record<string, DraftEntry>>({});

function isQuestionRequired(question: AskQuestion): boolean {
  return question.required !== false;
}

function ensureDraft(questions: AskQuestion[]) {
  for (const q of questions) {
    if (draft[q.id]) continue;
    if (q.type === 'multi_choice') draft[q.id] = { value: [], other: '' };
    else draft[q.id] = { value: '', other: '' };
  }
}

watch(() => props.ask, (a) => { if (a) ensureDraft(a.questions); }, { immediate: true });

const isComplete = computed(() => {
  for (const q of props.ask.questions) {
    if (!isQuestionRequired(q)) continue;
    const entry = draft[q.id];
    if (!entry) return false;
    if (q.type === 'multi_choice') {
      const arr = Array.isArray(entry.value) ? entry.value : [];
      if (arr.length === 0) return false;
      if (arr.includes('__other__') && !(entry.other || '').trim()) return false;
    } else if (q.type === 'single_choice') {
      if (!entry.value) return false;
      if (entry.value === '__other__' && !(entry.other || '').trim()) return false;
    } else {
      if (!String(entry.value || '').trim()) return false;
    }
  }
  return true;
});

function buildAnswers(): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const q of props.ask.questions) {
    const entry = draft[q.id] || { value: q.type === 'multi_choice' ? [] : '', other: '' };
    if (q.type === 'multi_choice') {
      const arr = (Array.isArray(entry.value) ? entry.value : []).slice();
      if (arr.includes('__other__') && (entry.other || '').trim()) {
        const filtered = arr.filter((v: string) => v !== '__other__');
        answers[q.id] = { value: filtered, other: entry.other!.trim() };
      } else {
        answers[q.id] = arr.filter((v: string) => v !== '__other__');
      }
    } else if (q.type === 'single_choice') {
      if (entry.value === '__other__' && (entry.other || '').trim()) {
        answers[q.id] = { value: entry.value, other: entry.other!.trim() };
      } else {
        answers[q.id] = entry.value;
      }
    } else {
      answers[q.id] = String(entry.value || '');
    }
  }
  return answers;
}

function onSubmit() {
  if (!isComplete.value || props.submitting) return;
  emit('submit', { askId: props.ask.askId, answers: buildAnswers() });
}
</script>
