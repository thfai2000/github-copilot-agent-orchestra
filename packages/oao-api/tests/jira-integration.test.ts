import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TriggerServiceError } from '../src/services/trigger-errors.js';
import {
  buildTriggerCallbackUrl,
  extractJiraIssuesFromPayload,
  buildJiraWebhookInputs,
} from '../src/services/jira-integration.js';

const prevPublic = process.env.PUBLIC_API_BASE_URL;

beforeAll(() => {
  process.env.PUBLIC_API_BASE_URL = 'https://oao.example.com/';
});

afterAll(() => {
  if (prevPublic === undefined) delete process.env.PUBLIC_API_BASE_URL;
  else process.env.PUBLIC_API_BASE_URL = prevPublic;
});

describe('buildTriggerCallbackUrl', () => {
  it('builds a URL with the normalized base and encoded token', () => {
    const url = buildTriggerCallbackUrl('trig-1', 'tok en&x');
    expect(url).toBe('https://oao.example.com/api/jira-webhooks/trig-1?token=tok%20en%26x');
  });

  it('throws 400 when PUBLIC_API_BASE_URL is missing', () => {
    const prev = process.env.PUBLIC_API_BASE_URL;
    delete process.env.PUBLIC_API_BASE_URL;
    try {
      expect(() => buildTriggerCallbackUrl('t', 'tok')).toThrow(TriggerServiceError);
    } finally {
      process.env.PUBLIC_API_BASE_URL = prev;
    }
  });

  it('throws 400 when PUBLIC_API_BASE_URL is not a valid URL', () => {
    const prev = process.env.PUBLIC_API_BASE_URL;
    process.env.PUBLIC_API_BASE_URL = 'not a url';
    try {
      expect(() => buildTriggerCallbackUrl('t', 'tok')).toThrow(/valid absolute URL/);
    } finally {
      process.env.PUBLIC_API_BASE_URL = prev;
    }
  });
});

describe('extractJiraIssuesFromPayload', () => {
  const site = 'https://acme.atlassian.net';

  it('returns empty array for empty payload', () => {
    expect(extractJiraIssuesFromPayload(site, {})).toEqual([]);
  });

  it('extracts a single "issue" object', () => {
    const issues = extractJiraIssuesFromPayload(site, {
      issue: {
        id: '10001',
        key: 'OAO-1',
        fields: {
          summary: 'Fix bug',
          status: { name: 'Open' },
          assignee: { displayName: 'Alice' },
          updated: '2024-01-01T00:00:00.000Z',
        },
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      id: '10001',
      key: 'OAO-1',
      summary: 'Fix bug',
      status: 'Open',
      assignee: 'Alice',
      url: `${site}/browse/OAO-1`,
    });
  });

  it('extracts multiple issues from "issues" array', () => {
    const issues = extractJiraIssuesFromPayload(site, {
      issues: [
        { id: '1', key: 'A-1', fields: { summary: 'a' } },
        { id: '2', key: 'A-2', fields: { summary: 'b' } },
        'not-an-object',
      ],
    });
    expect(issues.map((i) => i.key)).toEqual(['A-1', 'A-2']);
  });

  it('combines single issue and issues array', () => {
    const issues = extractJiraIssuesFromPayload(site, {
      issue: { id: '1', key: 'A-1', fields: {} },
      issues: [{ id: '2', key: 'A-2', fields: {} }],
    });
    expect(issues.map((i) => i.key)).toEqual(['A-1', 'A-2']);
  });

  it('produces null url when issue.key is missing', () => {
    const [issue] = extractJiraIssuesFromPayload(site, {
      issue: { id: '7', fields: {} },
    });
    expect(issue.url).toBeNull();
  });

  it('returns empty strings/null for missing fields without throwing', () => {
    const [issue] = extractJiraIssuesFromPayload(site, {
      issue: { id: '1', key: 'X-1' },
    });
    expect(issue.summary).toBe('');
    expect(issue.status).toBeNull();
    expect(issue.assignee).toBeNull();
  });
});

describe('buildJiraWebhookInputs', () => {
  const trigger = {
    id: 't-1',
    configuration: {
      jiraSiteUrl: 'https://acme.atlassian.net',
      jql: 'project = OAO',
    },
  } as unknown as Parameters<typeof buildJiraWebhookInputs>[0];

  it('returns structured input for the workflow execution', () => {
    const out = buildJiraWebhookInputs(trigger, {
      webhookEvent: 'jira:issue_updated',
      issue: { id: '10001', key: 'OAO-1', fields: { summary: 's' } },
    });
    expect(out.jiraSiteUrl).toBe('https://acme.atlassian.net');
    expect(out.jiraJql).toBe('project = OAO');
    expect(out.jiraWebhookEvent).toBe('jira:issue_updated');
    expect(out.jiraIssueKeys).toEqual(['OAO-1']);
    expect(out.jiraIssues).toHaveLength(1);
    expect(new Date(out.receivedAt).toISOString()).toBe(out.receivedAt);
  });

  it('falls back to issue_event_type_name when webhookEvent is missing', () => {
    const out = buildJiraWebhookInputs(trigger, {
      issue_event_type_name: 'issue_created',
      issue: { id: '1', key: 'X-1', fields: {} },
    });
    expect(out.jiraWebhookEvent).toBe('issue_created');
  });

  it('defaults webhookEvent to "jira:webhook" when neither field is present', () => {
    const out = buildJiraWebhookInputs(trigger, {
      issue: { id: '1', key: 'X-1', fields: {} },
    });
    expect(out.jiraWebhookEvent).toBe('jira:webhook');
  });

  it('handles trigger with no configuration gracefully', () => {
    const bare = { id: 't-2', configuration: null } as unknown as Parameters<
      typeof buildJiraWebhookInputs
    >[0];
    const out = buildJiraWebhookInputs(bare, {});
    expect(out.jiraSiteUrl).toBe('');
    expect(out.jiraJql).toBe('');
    expect(out.jiraIssues).toEqual([]);
    expect(out.jiraIssueKeys).toEqual([]);
  });
});
