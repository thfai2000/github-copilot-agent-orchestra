import { db } from './index.js';
import { agents, workflows, workflowSteps, triggers } from './schema.js';
import { createLogger } from '@ai-trader/shared';

const logger = createLogger('agent-seed');

async function seed() {
  logger.info('Seeding agent database...');

  // Create a sample agent
  const [agent] = await db
    .insert(agents)
    .values({
      userId: '00000000-0000-0000-0000-000000000001', // placeholder user id
      name: 'VeritasTrader',
      description: 'A methodical trading agent that relies on verified information.',
      gitRepoUrl: 'https://github.com/example/ai-trader-agent-normal',
      gitBranch: 'main',
      agentFilePath: '.github/agents/normal.md',
      skillsPaths: ['skills/trading.md'],
      status: 'active',
    })
    .onConflictDoNothing()
    .returning();

  if (agent) {
    logger.info(`Created agent: ${agent.name}`);

    // Create a sample workflow
    const [workflow] = await db
      .insert(workflows)
      .values({
        agentId: agent.id,
        name: 'Morning Trading Analysis',
        description: 'Analyze market conditions and make trading decisions every weekday morning.',
        isActive: true,
      })
      .returning();

    // Create workflow steps
    await db.insert(workflowSteps).values([
      {
        workflowId: workflow.id,
        name: 'Analyze Market Conditions',
        promptTemplate: `Analyze the current market conditions for the following symbols: AAPL, GOOG, MSFT, NVDA, TSLA.

For each symbol, provide:
1. Current trend (bullish/bearish/neutral)
2. Key support/resistance levels
3. Recent news impact
4. Technical indicator signals

Use the Trading Platform API to fetch current prices and news.`,
        stepOrder: 1,
        timeoutSeconds: 300,
      },
      {
        workflowId: workflow.id,
        name: 'Make Trade Decisions',
        promptTemplate: `Based on the following market analysis, decide which trades to make:

<PRECEDENT_OUTPUT>

Consider risk management rules:
- No more than 3% of portfolio in a single trade
- Maximum 5 trades per session
- Always set mental stop-loss levels

For each recommended trade, provide: symbol, side (buy/sell), quantity, and detailed reasoning.`,
        stepOrder: 2,
        timeoutSeconds: 300,
      },
      {
        workflowId: workflow.id,
        name: 'Write Market Commentary',
        promptTemplate: `Write a brief market commentary blog post based on the following analysis and trade decisions:

<PRECEDENT_OUTPUT>

Write in a professional but approachable tone. Include:
- Key market observations
- Rationale behind any trades made
- Outlook for the rest of the day`,
        stepOrder: 3,
        timeoutSeconds: 300,
      },
    ]);

    // Create a time-based trigger
    await db.insert(triggers).values({
      workflowId: workflow.id,
      triggerType: 'time_schedule',
      configuration: { cron: '0 9 * * 1-5', timezone: 'America/New_York' },
      isActive: true,
    });

    logger.info(`Created workflow: ${workflow.name} with 3 steps`);
  }

  logger.info('Agent database seeded successfully!');
  process.exit(0);
}

seed().catch((err) => {
  logger.error(err, 'Seed failed');
  process.exit(1);
});
