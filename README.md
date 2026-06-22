# Docker Storage Analyzer

Analyze Docker disk usage on any host machine. See what's consuming space across images, containers, volumes, build cache, and logs — with actionable cleanup recommendations.

## Quick Start

```bash
npx dkanalyze analyze
```

Or install globally:

```bash
npm install -g docker-storage-analyzer
dkanalyze analyze
```

## CLI Usage

```
Usage: dkanalyze [command] [options]

Commands:
  analyze   Perform a full analysis of Docker disk usage
  watch     Watch mode - re-analyze every N seconds

Options:
  -H, --host <socket>   Docker socket path (default: /var/run/docker.sock)
  -j, --json            JSON output
  --history             Show historical data
  --ai                  Enable AI-powered recommendations
  -i, --interval <sec>  Watch interval in seconds (default: 60)
  -V, --version         Show version
  -h, --help            Show help
```

### Examples

```bash
# Standard analysis
dkanalyze analyze

# JSON output for scripting
dkanalyze analyze --json

# Watch every 30 seconds
dkanalyze watch --interval 30

# Custom Docker socket (e.g., Colima, Podman)
dkanalyze analyze --host ~/.colima/docker.sock
```

## Web Dashboard

```bash
dkanalyze web
# Open http://localhost:3000
```

## Features

- **Per-Project Breakdown** — see which images, volumes, and containers consume the most space
- **Historical Tracking** — track usage over time (requires persistent storage)
- **Cleanup Recommendations** — actionable suggestions to reclaim space
- **Log Analysis** — detect containers with oversized logs
- **Build Cache** — measure BuildKit and builder cache usage
- **Docker Extension** — available as a Docker Desktop extension (paid)

## Pricing

| Tier | Price | Includes |
|------|-------|----------|
| CLI | Free | Full analysis, terminal reports, JSON, watch mode |
| Docker Extension | $9/mo | GUI, historical trends, one-click prune |
| Team | $49/mo | Team dashboards, Slack alerts, usage policies |
| Enterprise | $199/mo | Self-hosted, SSO, audit logs, priority support |

## Development

```bash
git clone <repo>
cd docker-storage-analyzer
npm install
npm run dev          # Run CLI in dev mode
npm run web          # Start web dashboard
npm test             # Run tests
npm run build        # Build for production
```

## License

MIT
