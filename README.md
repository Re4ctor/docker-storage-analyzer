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
╔════════════════════════════════════════════════╗
║        Docker Storage Analyzer Report        ║
╚════════════════════════════════════════════════╝

📊 Summary
──────────────────────────────────────────────────
  Total Used:     138.4 GB
  Images                    52.1 GB (37.6%)
  Volumes                   34.8 GB (25.1%)
  Containers (logs+layer)   17.3 GB (12.5%)
  Build Cache               34.2 GB (24.7%)
──────────────────────────────────────────────────

🖼 Images
┌──────────────────────────────┬──────────────┬──────────────┬────────────┐
│ Repository:Tag               │ Size         │ Created      │ Containers │
├──────────────────────────────┼──────────────┼──────────────┼────────────┤
│ postgres:15                  │ 425.3 MB     │ Jun 15, 2026 │ 1          │
│ node:20-alpine               │ 175.8 MB     │ Jun 10, 2026 │ 0          │
│ <none>:<none>                │ 92.4 MB      │ May 3, 2026  │ 0          │
└──────────────────────────────┴──────────────┴──────────────┴────────────┘

🧹 Cleanup Recommendations
  Estimated reclaimable space: 46.2 GB

  🗑 Remove 12 dangling (untagged) images
     Estimated: 8.3 GB
     Command: docker image prune

  ⛔ Remove 3 stopped containers
     Estimated: 2.1 GB
     Command: docker container prune

  💿 Remove 5 unused volumes
     Estimated: 21.7 GB
     Command: docker volume prune

  🔧 Clear 1 build cache entries
     Estimated: 14.1 GB
     Command: docker builder prune
```

## CLI

```
Usage: dkanalyze [command] [options]

Commands:
  analyze    Run a full Docker disk usage report
  watch      Re-analyze every N seconds

Options:
  -H, --host <socket>     Docker socket path (auto-detected if omitted)
  -j, --json              Machine-readable JSON output
  --history               Show historical trend data (requires SQLite, prototype)
  --ai                    AI-powered cleanup recommendations (experimental)
  -i, --interval <sec>    Watch interval in seconds (default 60)
  -V, --version           Print version
  -h, --help              Show help
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
```

## Web dashboard

```bash
npm run web
# Starts at http://localhost:3000
```

The dashboard auto-detects the Docker socket (supports Docker Desktop, Colima, Podman, and custom paths via `?dockerSocket=` query param). It lists images, volumes, containers, and recommendations with one-click prune (prototype — prune actions return 501 intentionally; use the suggested Docker commands manually).

## What it reports

- **Images** — size, tags, age, attached containers
- **Volumes** — approximate usage, mount paths, active containers
- **Containers** — status, writable-layer size, log sizes
- **Build cache** — BuildKit/builder layers and total usage
- **Recommendations** — ordered by reclaimed space with safety notes

## Run with Docker

```bash
docker build -t dkanalyze .
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock dkanalyze analyze
```

Or use a custom socket:

```bash
docker run --rm -v ~/.colima/docker.sock:/var/run/docker.sock \
  -e DOCKER_SOCKET=~/.colima/docker.sock dkanalyze analyze
```

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
