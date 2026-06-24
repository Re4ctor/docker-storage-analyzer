# @stackctl/docker-storage-analyzer

Analyze Docker disk usage on any host. Find images, volumes, container logs, and build cache consuming space — with cleanup commands you can review before running.

## Quick start

```bash
npx @stackctl/docker-storage-analyzer analyze
```

Or install globally:

```bash
npm install -g @stackctl/docker-storage-analyzer
dkanalyze analyze
```

## Sample output

```
╭──────────────────────────────────────────────────────╮
│                                                      │
│     Docker Storage Analyzer                          │
│     Disk Usage Report                                │
│                                                      │
╰──────────────────────────────────────────────────────╯

Summary
──────────────────────────────────────────────────
  Total Used:     138.4 GB
  Images                    52.1 GB (37.6%)
  Volumes                   34.8 GB (25.1%)
  Containers (logs+layer)   17.3 GB (12.5%)
  Build Cache               34.2 GB (24.7%)
──────────────────────────────────────────────────

Images
┌──────────────────────────────┬──────────────┬──────────────┬────────────┐
│ Repository:Tag               │ Size         │ Created      │ Containers │
├──────────────────────────────┼──────────────┼──────────────┼────────────┤
│ postgres:15                  │ 425.3 MB     │ Jun 15, 2026 │ 1          │
│ node:20-alpine               │ 175.8 MB     │ Jun 10, 2026 │ 0          │
│ <none>:<none>                │ 92.4 MB      │ May 3, 2026  │ 0          │
└──────────────────────────────┴──────────────┴──────────────┴────────────┘

Cleanup Recommendations
  Estimated reclaimable space: 46.2 GB

  [images] Remove 12 dangling (untagged) images
     Estimated: 8.3 GB
     Command: docker image prune

  [containers] Remove 3 stopped containers
     Estimated: 2.1 GB
     Command: docker container prune

  [volumes] Remove 5 unused volumes
     Estimated: 21.7 GB
     Command: docker volume prune

  [build-cache] Clear 1 build cache entries
     Estimated: 14.1 GB
     Command: docker builder prune

  [logs] Rotate logs for 2 containers exceeding 10 MB
     Estimated: 5.2 GB
     Command: docker logs --tail 1000 <container> > /dev/null 2>&1
```

## CLI

```
Usage: dkanalyze [command] [options]

Commands:
  analyze    Run a full Docker disk usage report
  watch      Re-analyze every N seconds

Options:
  -H, --host <socket>       Docker socket path (auto-detected if omitted)
  -j, --json                Machine-readable JSON output
  --history                 Show historical trend data (prototype — not yet functional)
  --ai                      AI-powered cleanup recommendations (experimental)
  --ai-provider <provider>  AI backend: openai, anthropic, ollama, or opencode
  -i, --interval <sec>      Watch interval in seconds (default 60)
  -V, --version             Print version
  -h, --help                Show help
```

### Examples

```bash
# Standard report
dkanalyze analyze

# JSON output for scripts and CI
dkanalyze analyze --json

# Watch every 30 seconds
dkanalyze watch --interval 30

# Custom Docker socket (Colima, Podman, remote)
dkanalyze analyze -H ~/.colima/docker.sock

# With history tracking (prototype)
dkanalyze analyze --history

# With AI-powered recommendations (experimental)
dkanalyze analyze --ai

# Use a specific AI provider
dkanalyze analyze --ai --ai-provider anthropic
dkanalyze analyze --ai --ai-provider ollama
dkanalyze analyze --ai --ai-provider opencode
```

## AI recommendations

Enable with `--ai` (auto-detects provider from env vars) or specify `--ai-provider`. At least one provider must be configured:

| Provider   | Env vars needed                                       |
|------------|-------------------------------------------------------|
| OpenAI     | `OPENAI_API_KEY` (required), `OPENAI_MODEL`           |
| Anthropic  | `ANTHROPIC_API_KEY` (required), `ANTHROPIC_MODEL`     |
| Ollama     | `OLLAMA_HOST` (default `http://localhost:11434`), `OLLAMA_MODEL` |
| OpenCode   | None — just install `opencode` CLI                    |

Set these in a `.env` file or export them in your shell.

## Web dashboard

```bash
npm run web
# Starts at http://localhost:3000
```

The dashboard auto-detects the Docker socket (supports Docker Desktop, Colima, Podman, and custom paths via `?dockerSocket=` query param). It lists images, volumes, containers, and recommendations with one-click prune (prototype — prune actions return 501 intentionally; use the suggested Docker commands manually).

### API endpoints

| Method | Path           | Description                                   |
|--------|---------------|-----------------------------------------------|
| POST   | `/api/analyze` | Full disk usage report (JSON). Supports `?dockerSocket=` query param |
| GET    | `/api/history` | Historical data (prototype — returns empty)    |
| POST   | `/api/prune`   | Prune resources (prototype — returns 501)      |

## What it reports

- **Images** — size, tags, age, attached containers
- **Volumes** — approximate usage, mount paths, active containers
- **Containers** — status, writable-layer size, log sizes
- **Build cache** — BuildKit/builder layers and total usage
- **Recommendations** — ordered by reclaimed space with safety notes:
  - Dangling images, stopped containers, unused volumes, build cache
  - Log rotation for containers with logs exceeding 10 MB

## Run with Docker

```bash
docker build -t dkanalyze .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock dkanalyze analyze
```

Or use a custom socket:

```bash
docker run --rm -v ~/.colima/docker.sock:/var/run/docker.sock \
  -e DOCKER_SOCKET=/var/run/docker.sock dkanalyze analyze
```

> **Note:** The `DOCKER_SOCKET` env var inside the container must point to the mount path (`/var/run/docker.sock`), not the host path.

## Requirements

- Node.js 18 or later (or Docker)
- Read access to the Docker socket (`/var/run/docker.sock` or equivalent)

## Development

```bash
git clone https://github.com/Re4ctor/docker-storage-analyzer
cd docker-storage-analyzer
npm install
npm run dev          # CLI in dev mode (tsx)
npm run web          # Web dashboard (tsx)
npm test             # Run test suite (vitest)
npm run build        # Compile TypeScript
npm run compile      # Build standalone binary (Linux, via pkg)
npm run compile:macos # Build standalone binary (macOS, via pkg)
```

## License

MIT
