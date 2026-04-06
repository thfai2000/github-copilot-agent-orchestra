import type { Hono } from 'hono';
import { swaggerUI } from '@hono/swagger-ui';

export function registerOpenAPI(app: Hono, spec: object): void {
  app.get('/api/openapi.json', (c) => c.json(spec));
  app.get('/api/docs', swaggerUI({ url: '/api/openapi.json' }));
}

export const agentApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Agent Orchestration API',
    version: '4.0.0',
    description:
      'Autonomous AI agent workflow engine — agents, workflows, executions, triggers, and webhooks.',
  },
  servers: [{ url: 'http://localhost:4002', description: 'Local development' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
  },
  paths: {
    '/health': {
      get: {
        summary: 'Health check',
        tags: ['System'],
        responses: { 200: { description: 'OK' } },
      },
    },
    '/api/agents': {
      get: {
        summary: 'List agents',
        tags: ['Agents'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Agent list' } },
      },
      post: {
        summary: 'Create agent',
        tags: ['Agents'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name', 'gitRepoUrl', 'agentFilePath'],
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  gitRepoUrl: { type: 'string', format: 'uri' },
                  gitBranch: { type: 'string', default: 'main' },
                  agentFilePath: { type: 'string' },
                  skillsPaths: { type: 'array', items: { type: 'string' } },
                  githubToken: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Agent created' } },
      },
    },
    '/api/agents/{id}': {
      get: {
        summary: 'Get agent detail',
        tags: ['Agents'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Agent detail' }, 404: { description: 'Not found' } },
      },
      put: {
        summary: 'Update agent',
        tags: ['Agents'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Agent updated' } },
      },
      delete: {
        summary: 'Delete agent',
        tags: ['Agents'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { 200: { description: 'Agent deleted' } },
      },
    },
    '/api/workflows': {
      get: {
        summary: 'List workflows',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Workflow list' } },
      },
      post: {
        summary: 'Create workflow',
        tags: ['Workflows'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['agentId', 'name', 'steps'],
                properties: {
                  agentId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  steps: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        prompt: { type: 'string' },
                        order: { type: 'integer' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Workflow created' } },
      },
    },
    '/api/executions': {
      get: {
        summary: 'List workflow executions',
        tags: ['Executions'],
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'agentId', in: 'query', schema: { type: 'string', format: 'uuid' } },
          {
            name: 'status',
            in: 'query',
            schema: {
              type: 'string',
              enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
            },
          },
        ],
        responses: { 200: { description: 'Execution list' } },
      },
    },
    '/api/triggers': {
      get: {
        summary: 'List triggers',
        tags: ['Triggers'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Trigger list' } },
      },
      post: {
        summary: 'Create trigger',
        tags: ['Triggers'],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['workflowId', 'type', 'config'],
                properties: {
                  workflowId: { type: 'string', format: 'uuid' },
                  type: { type: 'string', enum: ['time_schedule', 'webhook', 'event', 'manual'] },
                  config: { type: 'object' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Trigger created' } },
      },
    },
    '/api/webhooks/receive': {
      post: {
        summary: 'Receive webhook event',
        tags: ['Webhooks'],
        parameters: [
          { name: 'X-Webhook-Signature', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'X-Webhook-Timestamp', in: 'header', required: true, schema: { type: 'string' } },
          { name: 'X-Webhook-Event-Id', in: 'header', required: true, schema: { type: 'string' } },
        ],
        responses: {
          200: { description: 'Event processed' },
          401: { description: 'Invalid signature' },
        },
      },
    },
    '/api/supervisor/emergency-stop': {
      post: {
        summary: 'Emergency stop — pause all agents',
        tags: ['Supervisor'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'All agents paused' } },
      },
    },
    '/api/supervisor/resume-all': {
      post: {
        summary: 'Resume all paused agents',
        tags: ['Supervisor'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'All agents resumed' } },
      },
    },
    '/api/supervisor/status': {
      get: {
        summary: 'Get agent status overview',
        tags: ['Supervisor'],
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Agent status counts and details' } },
      },
    },
    '/api/events': {
      get: {
        summary: 'SSE real-time event stream',
        tags: ['Events'],
        responses: { 200: { description: 'Server-Sent Events stream' } },
      },
    },
  },
};
