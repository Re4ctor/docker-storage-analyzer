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
HOST               docker-runner-04
DOCKER ROOT        /var/lib/docker
TOTAL USED         138.4 GB
RECLAIMABLE        46.2 GB

TYPE               USED       RECOMMENDATION
images             52.1 GB    remove unused tags older than 21 days
build-cache        41.7 GB    trim branches inactive for 10 days
volumes            34.8 GB    review detached named volumes
logs                9.8 GB    rotate containers over 2 GB
```

## CLI

```
Usage: dkanalyze [command] [options]

Commands:
  analyze    Run a full Docker disk usage report
  watch      Re-analyze every N seconds

Options:
  -H, --host <socket>     Docker socket path (default /var/run/docker.sock)
  -j, --json              Machine-readable output
  -i, --interval <sec>    Watch interval (default 60s)
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
```

## Web dashboard

```bash
npm run web
# Starts at http://localhost:3000
```

Connects to `/var/run/docker.sock` by default. The dashboard lists images, volumes, containers, and recommendations with one-click prune (prototype — prune actions return 501 intentionally; use the suggested Docker commands manually).

## What it reports

- **Images** — size, tags, age, attached containers
- **Volumes** — approximate usage, mount paths, active containers
- **Containers** — status, writable-layer size, log sizes
- **Build cache** — BuildKit/builder layers and total usage
- **Recommendations** — ordered by reclaimed space with safety notes

## Requirements

- Node.js 18 or later
- Read access to the Docker socket (`/var/run/docker.sock` or equivalent)

## Development

```bash
git clone https://github.com/your-org/docker-storage-analyzer
cd docker-storage-analyzer
npm install
npm run dev          # CLI in dev mode (tsx)
npm run web          # Web dashboard (tsx)
npm test             # Run test suite
npm run build        # Compile TypeScript
```

## License

MIT
