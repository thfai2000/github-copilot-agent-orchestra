import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'Open Agent Orchestra',
    description: 'An autonomous AI workflow engine powered by the GitHub Copilot SDK. Build cost-effective AI teams with segregation of duties, secure credential management, and multi-step workflows.',
    ignoreDeadLinks: [
      /localhost/,
    ],
    head: [
      ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
    ],
    appearance: true,
    themeConfig: {
      logo: '/logo.svg',
      nav: [
        { text: 'Home', link: '/' },
        { text: 'Guide', link: '/guide/what-is-oao' },
        { text: 'Concepts', link: '/concepts/agents' },
        { text: 'Architecture', link: '/architecture/overview' },
        { text: 'API Reference', link: '/api/routes' },
      ],
      sidebar: {
        '/guide/': [
          {
            text: 'Getting Started',
            items: [
              { text: 'What is OAO?', link: '/guide/what-is-oao' },
              { text: 'Host on Docker', link: '/guide/docker' },
              { text: 'Host on Kubernetes', link: '/guide/kubernetes' },
            ],
          },
          {
            text: 'Start Development',
            items: [
              { text: 'Build & Deploy', link: '/guide/build-and-deploy' },
              { text: 'File Structure', link: '/guide/file-structure' },
            ],
          },
        ],
        '/concepts/': [
          {
            text: 'Core Concepts',
            items: [
              { text: 'Agents & Tools', link: '/concepts/agents' },
              { text: 'Workflows & Triggers', link: '/concepts/workflows' },
              { text: 'Variables & Credentials', link: '/concepts/variables' },
              { text: 'AI Security', link: '/concepts/security' },
              { text: 'Workspaces', link: '/concepts/workspaces' },
              { text: 'RBAC', link: '/concepts/rbac' },
              { text: 'Plugins', link: '/concepts/plugins' },
              { text: 'Admin', link: '/concepts/admin' },
            ],
          },
        ],
        '/architecture/': [
          {
            text: 'Architecture',
            items: [
              { text: 'System Overview', link: '/architecture/overview' },
              { text: 'Technologies', link: '/architecture/technologies' },
            ],
          },
        ],
        '/api/': [
          {
            text: 'API Reference',
            items: [
              { text: 'Endpoints', link: '/api/routes' },
            ],
          },
        ],
        '/database/': [
          {
            text: 'Database',
            items: [
              { text: 'Schema', link: '/database/schema' },
            ],
          },
        ],
        '/configuration/': [
          {
            text: 'Configuration',
            items: [
              { text: 'Copilot Sessions', link: '/configuration/copilot' },
            ],
          },
        ],
      },
      socialLinks: [
        { icon: 'github', link: 'https://github.com/thfai2000/github-copilot-agent-orchestra' },
      ],
      footer: {
        message: 'Built with the GitHub Copilot SDK',
        copyright: '© 2026 Open Agent Orchestra',
      },
      search: {
        provider: 'local',
      },
    },
    mermaid: {},
  }),
);
