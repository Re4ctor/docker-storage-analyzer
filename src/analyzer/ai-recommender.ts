import { spawn } from 'child_process';
import type { DiskUsageReport } from './docker-analyzer.js';

export type AIProvider = 'openai' | 'anthropic' | 'ollama' | 'opencode';

export interface AIRecommendationResult {
  provider: AIProvider;
  model: string;
  content: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function buildSystemPrompt(): string {
  return `You are a Docker storage expert and SRE. Review the Docker host analysis below and provide:
1. **Prioritized cleanup plan** — ordered by impact (reclaimed space × safety)
2. **Risk flags** — any recommendations that could cause data loss, and how to mitigate
3. **Inference** — what each large image/volume might be based on its name
4. **Quick wins** — safe commands the user can run immediately
5. **Long-term advice** — config changes to prevent bloat (log rotation, dangling image policies, etc.)

Be concise and actionable. Use the exact Docker commands when possible.`;
}

function buildUserPrompt(report: DiskUsageReport): string {
  const imagesSize = report.images.reduce((s, i) => s + i.size, 0);
  const volumesSize = report.volumes.reduce((s, v) => s + v.size, 0);
  const containersSize = report.containers.reduce(
    (s, c) => s + c.logSize + c.writableLayerSize,
    0,
  );
  const cacheSize = report.buildCache.reduce((s, e) => s + e.size, 0);

  const topImages = report.images
    .slice(0, 10)
    .map((i) => `  - ${i.repoTag} (${formatBytes(i.size)}, containers: ${i.containersCount})`)
    .join('\n');

  const topVolumes = report.volumes
    .slice(0, 10)
    .map((v) => `  - ${v.name} (${formatBytes(v.size)}, used by: [${v.containers.join(', ') || 'none'}])`)
    .join('\n');

  const topContainers = report.containers
    .slice(0, 10)
    .map((c) => `  - ${c.name} [${c.status}] log:${formatBytes(c.logSize)} layer:${formatBytes(c.writableLayerSize)}`)
    .join('\n');

  const existingRecs = report.recommendations
    .map((r) => `  - ${r.description} → ${formatBytes(r.estimatedSpace)} (cmd: ${r.command ?? 'manual'})`)
    .join('\n');

  return `## Docker Host Storage Report

**Total used:** ${formatBytes(report.totalUsed)}
**Docker socket:** ${report.dockerSocket}

### Breakdown
- Images: ${formatBytes(imagesSize)} (${report.images.length} total)
- Volumes: ${formatBytes(volumesSize)} (${report.volumes.length} total)
- Containers (logs + writable): ${formatBytes(containersSize)} (${report.containers.length} total)
- Build cache: ${formatBytes(cacheSize)} (${report.buildCache.length} entries)

### Top Images
${topImages || '  (none)'}

### Top Volumes
${topVolumes || '  (none)'}

### Containers
${topContainers || '  (none)'}

### Auto-detected Recommendations
${existingRecs || '  (none)'}

${report.errors.length > 0 ? `### Errors\n${report.errors.map((e) => `  - ${e}`).join('\n')}\n` : ''}
What should I clean up?`;
}

async function callOpenAI(
  prompt: { system: string; user: string },
  apiKey: string,
  model: string,
): Promise<{ model: string; content: string }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  const data = await response.json() as any;
  return {
    model: data.model ?? model,
    content: data.choices?.[0]?.message?.content ?? '(empty response)',
  };
}

async function callAnthropic(
  prompt: { system: string; user: string },
  apiKey: string,
  model: string,
): Promise<{ model: string; content: string }> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${body}`);
  }

  const data = await response.json() as any;
  return {
    model: data.model ?? model,
    content: data.content?.[0]?.text ?? '(empty response)',
  };
}

async function callOllama(
  prompt: { system: string; user: string },
  model: string,
  host: string,
): Promise<{ model: string; content: string }> {
  const response = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${body}`);
  }

  const data = await response.json() as any;
  return {
    model: data.model ?? model,
    content: data.message?.content ?? '(empty response)',
  };
}

function callOpenCode(combinedPrompt: string): Promise<{ model: string; content: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('opencode', [combinedPrompt], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err: Error & { code?: string }) => {
      if (err.code === 'ENOENT') {
        reject(new Error('opencode CLI not found. Install it with: npm install -g opencode'));
      } else {
        reject(err);
      }
    });

    child.on('close', (code: number | null) => {
      if (code === 0) {
        resolve({ model: 'opencode', content: stdout.trim() || stderr.trim() || '(empty response)' });
      } else {
        reject(new Error(`opencode exited with code ${code}: ${stderr || stdout}`));
      }
    });
  });
}

function detectAvailableProvider(): AIProvider | null {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  // Ollama is always candidate — we'll try and fall back
  return null;
}

export async function getAIRecommendations(
  report: DiskUsageReport,
  provider?: AIProvider,
): Promise<AIRecommendationResult> {
  const prompt = {
    system: buildSystemPrompt(),
    user: buildUserPrompt(report),
  };

  // Resolve provider: explicit > env-var detection > openai default
  const resolvedProvider: AIProvider = provider ?? detectAvailableProvider() ?? 'openai';

  switch (resolvedProvider) {
    case 'openai': {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY not set in environment or .env file');
      const model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
      const result = await callOpenAI(prompt, apiKey, model);
      return { provider: 'openai', ...result };
    }

    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment or .env file');
      const model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-20250514';
      const result = await callAnthropic(prompt, apiKey, model);
      return { provider: 'anthropic', ...result };
    }

    case 'ollama': {
      const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
      const model = process.env.OLLAMA_MODEL ?? 'llama3';
      const result = await callOllama(prompt, model, host);
      return { provider: 'ollama', ...result };
    }

    case 'opencode': {
      const combined = `${prompt.system}\n\n${prompt.user}`;
      const result = await callOpenCode(combined);
      return { provider: 'opencode', ...result };
    }

    default:
      throw new Error(`Unknown AI provider: ${resolvedProvider}`);
  }
}
