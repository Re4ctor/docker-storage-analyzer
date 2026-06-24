#!/usr/bin/env node

import { Command } from 'commander';
import { DockerAnalyzer } from '../analyzer/docker-analyzer.js';
import { formatReport, formatJsonReport } from './formatter.js';
import { detectDockerSocket } from '../analyzer/socket-detector.js';
import { getAIRecommendations, type AIProvider } from '../analyzer/ai-recommender.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const program = new Command();

program
  .name('dkanalyze')
  .description('Docker Storage Analyzer - Analyze Docker disk usage')
  .version('1.0.2');

program
  .command('analyze')
  .description('Perform a full analysis of Docker disk usage')
  .option('-H, --host <socket>', 'Docker socket path', detectDockerSocket())
  .option('-j, --json', 'Output as JSON', false)
  .option('-h, --history', 'Show historical trend data (requires SQLite)', false)
  .option('--ai', 'Enable AI-powered recommendations (auto-detects provider)')
  .option('--ai-provider <provider>', 'AI backend: openai, anthropic, ollama, or opencode')
  .action(async (options) => {
    try {
      const analyzer = new DockerAnalyzer(options.host);
      const report = await analyzer.analyze();

      if (options.json) {
        console.log(formatJsonReport(report));
      } else {
        console.log(formatReport(report));
      }

      if (options.history) {
        console.log(chalk.dim('\nHistorical tracking is not implemented in this local prototype yet.'));
      }

      if (options.ai || options.aiProvider) {
        const provider = (options.aiProvider as AIProvider | undefined) ?? undefined;
        console.log(chalk.dim('\nAsking AI...'));
        try {
          const result = await getAIRecommendations(report, provider);
          console.log(chalk.bold.cyan(`\nAI Recommendations (${result.provider} / ${result.model}):`));
          console.log(chalk.dim('─'.repeat(60)));
          console.log(result.content);
          console.log(chalk.dim('─'.repeat(60)));
        } catch (aiError: any) {
          console.log(chalk.yellow(`\nAI recommendation failed: ${aiError.message}`));
          console.log(chalk.dim('  Falling back to standard recommendations above.'));
        }
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch mode - re-analyze every 60 seconds')
  .option('-H, --host <socket>', 'Docker socket path', detectDockerSocket())
  .option('-i, --interval <seconds>', 'Interval between analyses', '60')
  .action(async (options) => {
    const interval = parseInt(options.interval, 10) * 1000;
    const analyzer = new DockerAnalyzer(options.host);

    console.log(chalk.cyan(`Watching Docker socket: ${options.host}`));
    console.log(chalk.dim(`Interval: ${options.interval}s (press Ctrl+C to stop)\n`));

    const run = async () => {
      try {
        const report = await analyzer.analyze();
        console.clear();
        console.log(formatReport(report));
      } catch (error: any) {
        console.error(chalk.red('Error:'), error.message);
      }
    };

    await run();
    setInterval(run, interval);
  });

program.parse(process.argv);
