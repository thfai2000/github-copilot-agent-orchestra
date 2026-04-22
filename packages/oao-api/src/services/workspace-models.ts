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

export interface ResolvedWorkspaceModelSession {
  modelRecord: typeof models.$inferSelect;
  modelName: string;
  provider: ResolvedSessionProviderConfig | null;
}

export async function listWorkspaceActiveModels(workspaceId: string) {
  return db.query.models.findMany({
    where: and(eq(models.workspaceId, workspaceId), eq(models.isActive, true)),
    orderBy: asc(models.name),
  });
}

export async function getWorkspaceModelRecord(params: {
  workspaceId: string;
  requestedModel: string;
}) {
  const activeModels = await listWorkspaceActiveModels(params.workspaceId);
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
    throw new Error(`Model ${modelRecord.name} is missing required custom provider settings. Update the model record in Admin > Models.`);
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

export async function resolveWorkspaceActiveModelName(params: {
  workspaceId: string;
  requestedModel?: string | null;
  envDefaultModel?: string | null;
}) {
  const activeModels = await listWorkspaceActiveModels(params.workspaceId);
  const requestedModel = params.requestedModel?.trim() || null;
  const envDefaultModel = params.envDefaultModel?.trim() || null;

  if (requestedModel) {
    if (activeModels.some((model) => model.name === requestedModel)) {
      return requestedModel;
    }

    throw new Error(`Model ${requestedModel} is not active in this workspace. Choose an active model from Admin > Models or clear the override.`);
  }

  if (envDefaultModel && activeModels.some((model) => model.name === envDefaultModel)) {
    return envDefaultModel;
  }

  if (activeModels.length > 0) {
    return activeModels[0].name;
  }

  throw new Error('No active models are configured for this workspace. Add one in Admin > Models before sending a conversation turn.');
}

export async function resolveWorkspaceModelSession(params: {
  workspaceId: string;
  requestedModel?: string | null;
  envDefaultModel?: string | null;
  authToken?: string | null;
}): Promise<ResolvedWorkspaceModelSession> {
  const modelName = await resolveWorkspaceActiveModelName({
    workspaceId: params.workspaceId,
    requestedModel: params.requestedModel,
    envDefaultModel: params.envDefaultModel,
  });

  const modelRecord = await getWorkspaceModelRecord({
    workspaceId: params.workspaceId,
    requestedModel: modelName,
  });

  if (!modelRecord) {
    throw new Error(`Model ${modelName} is not active in this workspace. Choose an active model from Admin > Models.`);
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