import chalk from 'chalk';
import Table from 'cli-table3';
import { DiskUsageReport, ImageInfo, VolumeInfo, ContainerInfo, BuildCacheEntry, CleanupRecommendation } from '../analyzer/docker-analyzer.js';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatReport(report: DiskUsageReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(chalk.bold.cyan('╭──────────────────────────────────────────────────────╮'));
  lines.push(chalk.bold.cyan('│                                                      │'));
  lines.push(chalk.bold.cyan('│     Docker Storage Analyzer                          │'));
  lines.push(chalk.bold.cyan('│     Disk Usage Report                                │'));
  lines.push(chalk.bold.cyan('│                                                      │'));
  lines.push(chalk.bold.cyan('╰──────────────────────────────────────────────────────╯'));
  lines.push('');

  lines.push(formatSummary(report));
  lines.push('');
  lines.push(formatImagesTable(report.images));
  lines.push('');
  lines.push(formatContainersTable(report.containers));
  lines.push('');
  lines.push(formatVolumesTable(report.volumes));
  lines.push('');
  lines.push(formatBuildCacheTable(report.buildCache));
  lines.push('');
  lines.push(formatRecommendations(report.recommendations));

  if (report.errors.length > 0) {
    lines.push('');
    lines.push(chalk.bold.yellow('Warnings/Errors:'));
    for (const err of report.errors) {
      lines.push(chalk.yellow(`  * ${err}`));
    }
  }

  lines.push('');
  lines.push(chalk.dim(`Analyzed at: ${report.timestamp.toISOString()}`));
  lines.push(chalk.dim(`Docker socket: ${report.dockerSocket}`));
  lines.push('');

  return lines.join('\n');
}

function formatSummary(report: DiskUsageReport): string {
  const lines: string[] = [];
  lines.push(chalk.bold('Summary'));
  lines.push(chalk.dim('─'.repeat(50)));

  const imagesSize = report.images.reduce((s, i) => s + i.size, 0);
  const volumesSize = report.volumes.reduce((s, v) => s + v.size, 0);
  const containersSize = report.containers.reduce(
    (s, c) => s + c.logSize + c.writableLayerSize,
    0,
  );
  const cacheSize = report.buildCache.reduce((s, e) => s + e.size, 0);

  const categoryBreakdown = [
    { label: 'Images', size: imagesSize, color: chalk.blue },
    { label: 'Volumes', size: volumesSize, color: chalk.magenta },
    { label: 'Containers (logs+layer)', size: containersSize, color: chalk.green },
    { label: 'Build Cache', size: cacheSize, color: chalk.yellow },
  ];

  lines.push(
    `  ${chalk.bold('Total Used:')}     ${chalk.white(formatBytes(report.totalUsed))}`,
  );

  for (const cat of categoryBreakdown) {
    const pct = report.totalUsed > 0 ? ((cat.size / report.totalUsed) * 100).toFixed(1) : '0.0';
    lines.push(`  ${cat.color(cat.label.padEnd(25))} ${cat.color(formatBytes(cat.size).padStart(12))} ${chalk.dim(`(${pct}%)`)}`);
  }

  lines.push(chalk.dim('─'.repeat(50)));
  return lines.join('\n');
}

function formatImagesTable(images: ImageInfo[]): string {
  if (images.length === 0) return chalk.dim('No images found.');

  const table = new Table({
    head: [chalk.bold('Repository:Tag'), chalk.bold('Size'), chalk.bold('Created'), chalk.bold('Containers')],
    style: { head: [], border: ['dim'] },
    colWidths: [40, 14, 14, 12],
  });

  for (const img of images.slice(0, 30)) {
    table.push([
      img.repoTag.length > 38 ? img.repoTag.slice(0, 35) + '...' : img.repoTag,
      formatBytes(img.size),
      formatDate(img.created),
      String(img.containersCount),
    ]);
  }

  if (images.length > 30) {
    table.push([chalk.dim(`... and ${images.length - 30} more`), '', '', '']);
  }

  return `${chalk.bold('Images')}\n${table.toString()}`;
}

function formatContainersTable(containers: ContainerInfo[]): string {
  if (containers.length === 0) return chalk.dim('No containers found.');

  const table = new Table({
    head: [chalk.bold('Name'), chalk.bold('Image'), chalk.bold('Status'), chalk.bold('Log Size'), chalk.bold('Writable')],
    style: { head: [], border: ['dim'] },
    colWidths: [22, 22, 14, 12, 12],
  });

  for (const c of containers.slice(0, 25)) {
    const statusColor =
      c.status.startsWith('Up') ? chalk.green :
      c.status.startsWith('Exited') ? chalk.red :
      chalk.yellow;

    table.push([
      c.name.length > 20 ? c.name.slice(0, 18) + '…' : c.name,
      c.image.length > 20 ? c.image.slice(0, 18) + '…' : c.image,
      statusColor(c.status),
      formatBytes(c.logSize),
      formatBytes(c.writableLayerSize),
    ]);
  }

  return `${chalk.bold('Containers')}\n${table.toString()}`;
}

function formatVolumesTable(volumes: VolumeInfo[]): string {
  if (volumes.length === 0) return chalk.dim('No volumes found.');

  const table = new Table({
    head: [chalk.bold('Name'), chalk.bold('Size'), chalk.bold('Containers'), chalk.bold('Driver')],
    style: { head: [], border: ['dim'] },
    colWidths: [30, 14, 14, 12],
  });

  for (const v of volumes.slice(0, 20)) {
    table.push([
      v.name.length > 28 ? v.name.slice(0, 25) + '...' : v.name,
      formatBytes(v.size),
      String(v.containers.length || 0),
      v.driver,
    ]);
  }

  return `${chalk.bold('Volumes')}\n${table.toString()}`;
}

function formatBuildCacheTable(entries: BuildCacheEntry[]): string {
  if (entries.length === 0) return chalk.dim('No build cache entries found.');

  const table = new Table({
    head: [chalk.bold('ID'), chalk.bold('Size'), chalk.bold('Type')],
    style: { head: [], border: ['dim'] },
    colWidths: [40, 14, 20],
  });

  for (const e of entries) {
    table.push([
      e.id.length > 38 ? e.id.slice(0, 35) + '...' : e.id,
      formatBytes(e.size),
      e.description,
    ]);
  }

  return `${chalk.bold('Build Cache')}\n${table.toString()}`;
}

function formatRecommendations(recommendations: CleanupRecommendation[]): string {
  if (recommendations.length === 0) {
    return chalk.green('No cleanup recommendations — everything looks clean.');
  }

  const lines: string[] = [];
  lines.push(chalk.bold('Cleanup Recommendations'));

  const totalReclaimable = recommendations.reduce((s, r) => s + r.estimatedSpace, 0);
  lines.push(chalk.dim(`  Estimated reclaimable space: ${chalk.bold(formatBytes(totalReclaimable))}`));
  lines.push('');

  for (const rec of recommendations) {
    const label =
      rec.category === 'images' ? '[images]' :
      rec.category === 'containers' ? '[containers]' :
      rec.category === 'volumes' ? '[volumes]' :
      rec.category === 'build-cache' ? '[build-cache]' :
      '[logs]';

    lines.push(`  ${chalk.dim(label)} ${chalk.bold(rec.description)}`);
    lines.push(`     ${chalk.dim('Estimated:')} ${chalk.yellow(formatBytes(rec.estimatedSpace))}`);
    if (rec.command) {
      lines.push(`     ${chalk.dim('Command:')} ${chalk.cyan(rec.command)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatJsonReport(report: DiskUsageReport): string {
  return JSON.stringify(report, (key, value) => {
    if (key === 'timestamp' && value instanceof Date) {
      return value.toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }, 2);
}
