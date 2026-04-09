import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Agent Orchestration Platform',
  description: 'An autonomous AI workflow engine powered by the GitHub Copilot SDK. Define agents as markdown, connect them to multi-step workflows, and run them on schedule.',
  ignoreDeadLinks: [
    /localhost/,
  ],
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/architecture/overview' },
      { text: 'API Reference', link: '/api/routes' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is Agent Orchestra?', link: '/guide/what-is-agent-orchestra' },
            { text: 'Getting Started', link: '/guide/getting-started' },
          ],
        },
        {
          text: 'Core Concepts',
          items: [
            { text: 'Agents', link: '/guide/agents' },
            { text: 'Workflows & Steps', link: '/guide/workflows' },
            { text: 'Triggers', link: '/guide/triggers' },
            { text: 'Variables & Credentials', link: '/guide/variables' },
            { text: 'Workspaces & RBAC', link: '/guide/workspaces' },
          ],
        },
        {
          text: 'Advanced',
          items: [
            { text: 'Plugin System', link: '/guide/plugins' },
            { text: 'MCP Servers', link: '/guide/mcp-servers' },
          ],
        },
      ],
      '/architecture/': [
        {
          text: 'Architecture',
          items: [
            { text: 'System Overview', link: '/architecture/overview' },
            { text: 'Workflow Engine', link: '/architecture/workflow-engine' },
            { text: 'Scheduler & Workers', link: '/architecture/scheduler' },
            { text: 'Copilot Sessions', link: '/architecture/copilot-sessions' },
            { text: 'Database Schema', link: '/architecture/database' },
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          items: [
            { text: 'Endpoints', link: '/api/routes' },
            { text: 'Variable System', link: '/api/variables' },
          ],
        },
      ],
      '/deployment/': [
        {
          text: 'Deployment',
          items: [
            { text: 'Local Deployment', link: '/deployment/local' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/nicejimmy/github-copilot-agent-orchestra' },
    ],
    footer: {
      message: 'Built with the GitHub Copilot SDK',
      copyright: '© 2026 Agent Orchestration Platform',
    },
    search: {
      provider: 'local',
    },
  },
});
