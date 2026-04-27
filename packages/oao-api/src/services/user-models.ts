import { and, asc, eq } from 'drizzle-orm';
import { db } from '../database/index.js';
import { models } from '../database/schema.js';

export const CUSTOM_MODEL_PROVIDER_TYPES = ['openai', 'azure', 'anthropic'] as const;
export const CUSTOM_MODEL_PROVIDER_AUTH_TYPES = ['none', 'api_key', 'bearer_token'] as const;
export const CUSTOM_MODEL_PROVIDER_WIRE_APIS = ['completions', 'responses'] as const;

export type CustomModelProviderType = (typeof CUSTOM_MODEL_PROVIDER_TYPES)[number];
export type CustomModelProviderAuthType = (typeof CUSTOM_MODEL_PROVIDER_AUTH_TYPES)[number];
export type CustomModelProviderWireApi = (typeof CUSTOM_MODEL_PROVIDER_WIRE_APIS)[number];

export interface ResolvedSessionProviderConfig {
  type?: CustomModelProviderType;
  baseUrl: string;
  apiKey?: string;
  bearerToken?: string;
  wireApi?: CustomModelProviderWireApi;
  azure?: {
    apiVersion?: string;
  };
}

export interface ResolvedUserModelSession {
  modelRecord: typeof models.$inferSelect;
  modelName: string;
  provider: ResolvedSessionProviderConfig | null;
}

export async function listUserActiveModels(userId: string) {
  return db.query.models.findMany({
    where: and(eq(models.userId, userId), eq(models.isActive, true)),
    orderBy: asc(models.name),
  });
}

export async function getUserModelRecord(params: {
  userId: string;
  requestedModel: string;
}) {
  const activeModels = await listUserActiveModels(params.userId);
  return activeModels.find((model) => model.name === params.requestedModel) ?? null;
}

function buildSessionProviderConfig(params: {
  modelRecord: typeof models.$inferSelect;
  authToken?: string | null;
}): ResolvedSessionProviderConfig | null {
  const { modelRecord } = params;

  if (modelRecord.providerType !== 'custom') {
    return null;
  }

  if (!modelRecord.customProviderType || !modelRecord.customBaseUrl) {
    throw new Error(`Model ${modelRecord.name} is missing required custom provider settings. Update the model record in Models.`);
  }

  const provider: ResolvedSessionProviderConfig = {
    type: modelRecord.customProviderType,
    baseUrl: modelRecord.customBaseUrl,
  };

  if (modelRecord.customWireApi && (modelRecord.customProviderType === 'openai' || modelRecord.customProviderType === 'azure')) {
    provider.wireApi = modelRecord.customWireApi;
  }

  if (modelRecord.customProviderType === 'azure' && modelRecord.customAzureApiVersion) {
    provider.azure = {
      apiVersion: modelRecord.customAzureApiVersion,
    };
  }

  if (modelRecord.customAuthType === 'api_key') {
    if (!params.authToken) {
      throw new Error(
        `Model ${modelRecord.name} requires an LLM API key. Configure the GitHub Copilot Token / LLM API Key field on the agent or set DEFAULT_LLM_API_KEY (or GITHUB_TOKEN as a fallback) on the server.`,
      );
    }
    provider.apiKey = params.authToken;
  }

  if (modelRecord.customAuthType === 'bearer_token') {
    if (!params.authToken) {
      throw new Error(
        `Model ${modelRecord.name} requires an LLM bearer token. Configure the GitHub Copilot Token / LLM API Key field on the agent or set DEFAULT_LLM_API_KEY (or GITHUB_TOKEN as a fallback) on the server.`,
      );
    }
    provider.bearerToken = params.authToken;
  }

  return provider;
}

export async function resolveUserActiveModelName(params: {
  userId: string;
  requestedModel?: string | null;
  envDefaultModel?: string | null;
}) {
  const activeModels = await listUserActiveModels(params.userId);
  const requestedModel = params.requestedModel?.trim() || null;
  const envDefaultModel = params.envDefaultModel?.trim() || null;

  if (requestedModel) {
    if (activeModels.some((model) => model.name === requestedModel)) {
      return requestedModel;
    }

    throw new Error(
      `Model ${requestedModel} is not active for this user. Choose an active model from Models or clear the override.`,
    );
  }

  if (envDefaultModel && activeModels.some((model) => model.name === envDefaultModel)) {
    return envDefaultModel;
  }

  if (activeModels.length > 0) {
    return activeModels[0].name;
  }

  throw new Error('No active models are configured for this user. Add one in Models before sending a conversation turn.');
}

export async function resolveUserModelSession(params: {
  userId: string;
  requestedModel?: string | null;
  envDefaultModel?: string | null;
  authToken?: string | null;
}): Promise<ResolvedUserModelSession> {
  const modelName = await resolveUserActiveModelName({
    userId: params.userId,
    requestedModel: params.requestedModel,
    envDefaultModel: params.envDefaultModel,
  });

  const modelRecord = await getUserModelRecord({
    userId: params.userId,
    requestedModel: modelName,
  });

  if (!modelRecord) {
    throw new Error(`Model ${modelName} is not active for this user. Choose an active model from Models.`);
  }

  return {
    modelRecord,
    modelName,
    provider: buildSessionProviderConfig({
      modelRecord,
      authToken: params.authToken,
    }),
  };
}
