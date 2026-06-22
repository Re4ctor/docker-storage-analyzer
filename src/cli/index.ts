#!/usr/bin/env node

import { Command } from 'commander';
import { DockerAnalyzer } from '../analyzer/docker-analyzer.js';
import { formatReport, formatJsonReport } from './formatter.js';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

const program = new Command();

program
  .name('dkanalyze')
  .description('Docker Storage Analyzer - Analyze Docker disk usage')
  .version('1.0.0');

program
  .command('analyze')
  .description('Perform a full analysis of Docker disk usage')
  .option('-H, --host <socket>', 'Docker socket path', process.env.DOCKER_SOCKET || '/var/run/docker.sock')
  .option('-j, --json', 'Output as JSON', false)
  .option('-h, --history', 'Show historical trend data (requires SQLite)', false)
  .option('--ai', 'Enable AI-powered recommendations (experimental)', false)
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
        console.log(chalk.dim('\nHistorical tracking is available with the web server.'));
        console.log(chalk.dim('Run `dkanalyze web` to start the dashboard.'));
      }

      if (options.ai) {
        console.log(chalk.dim('\nAI recommendations:'));
        console.log(chalk.dim('  Enable AI mode by setting OPENAI_API_KEY in .env'));
        console.log(chalk.dim('  or use the hosted version at https://docker-analyzer.example.com'));
      }
    } catch (error: any) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('watch')
  .description('Watch mode - re-analyze every 60 seconds')
  .option('-H, --host <socket>', 'Docker socket path', process.env.DOCKER_SOCKET || '/var/run/docker.sock')
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
