<template>
  <div class="max-w-md mx-auto">
    <h1 class="text-2xl font-bold mb-6">Change Password</h1>

    <form @submit.prevent="changePassword" class="space-y-4">
      <div class="space-y-2">
        <Label>Current Password</Label>
        <Input v-model="form.currentPassword" type="password" required placeholder="Enter current password" />
      </div>
      <div class="space-y-2">
        <Label>New Password</Label>
        <Input v-model="form.newPassword" type="password" required minlength="8" placeholder="Enter new password (min 8 characters)" />
      </div>
      <div class="space-y-2">
        <Label>Confirm New Password</Label>
        <Input v-model="form.confirmPassword" type="password" required minlength="8" placeholder="Confirm new password" />
      </div>

      <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      <p v-if="success" class="text-sm text-green-600">{{ success }}</p>

      <Button type="submit" :disabled="loading" class="w-full">
        {{ loading ? 'Changing...' : 'Change Password' }}
      </Button>
    </form>
  </div>
</template>

<script setup lang="ts">
const { authHeaders } = useAuth();

const form = reactive({
  currentPassword: '',
  newPassword: '',
  confirmPassword: '',
});

const loading = ref(false);
const error = ref('');
const success = ref('');

async function changePassword() {
  error.value = '';
  success.value = '';

  if (form.newPassword !== form.confirmPassword) {
    error.value = 'New passwords do not match.';
    return;
  }
  if (form.newPassword.length < 8) {
    error.value = 'New password must be at least 8 characters.';
    return;
  }

  loading.value = true;
  try {
    const res = await $fetch<{ message: string }>('/api/auth/change-password', {
      method: 'PUT',
      headers: authHeaders(),
      body: {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      },
    });
    success.value = res.message || 'Password changed successfully.';
    form.currentPassword = '';
    form.newPassword = '';
    form.confirmPassword = '';
  } catch (err: unknown) {
    const fetchErr = err as { data?: { error?: string } };
    error.value = fetchErr.data?.error || 'Failed to change password.';
  } finally {
    loading.value = false;
  }
}
</script>
