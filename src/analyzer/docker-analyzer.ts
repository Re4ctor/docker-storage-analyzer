import Dockerode from 'dockerode';
import fs from 'fs/promises';
import path from 'path';
import { detectDockerSocket } from './socket-detector.js';

export interface ImageInfo {
  id: string;
  repoTag: string;
  size: number;
  created: Date;
  containersCount: number;
}

export interface VolumeInfo {
  name: string;
  size: number;
  mountpoint: string;
  containers: string[];
  driver: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  logSize: number;
  writableLayerSize: number;
  created: Date;
}

export interface BuildCacheEntry {
  id: string;
  description: string;
  size: number;
  usageCount: number;
  lastUsed: Date | null;
}

export interface CleanupRecommendation {
  category: 'images' | 'containers' | 'volumes' | 'build-cache' | 'logs';
  action: string;
  description: string;
  estimatedSpace: number;
  command?: string;
  items: string[];
}

export interface DiskUsageReport {
  timestamp: Date;
  dockerSocket: string;
  images: ImageInfo[];
  volumes: VolumeInfo[];
  containers: ContainerInfo[];
  buildCache: BuildCacheEntry[];
  totalUsed: number;
  totalCapacity: number;
  recommendations: CleanupRecommendation[];
  errors: string[];
}

const DOCKER_BASE = '/var/lib/docker';
const CONTAINER_LOGS_DIR = '/var/lib/docker/containers';

async function getFileSize(filePath: string): Promise<number> {
  try {
    const stat = await fs.stat(filePath);
    return stat.size;
  } catch {
    return 0;
  }
}

function parseImageSize(bytes: number): number {
  return bytes;
}

export class DockerAnalyzer {
  private docker: Dockerode;
  private socketPath: string;

  constructor(socketPath?: string) {
    this.socketPath = socketPath || detectDockerSocket();
    this.docker = new Dockerode({ socketPath: this.socketPath });
  }

  async analyze(): Promise<DiskUsageReport> {
    const errors: string[] = [];
    const startTime = Date.now();

    const [images, containers, volumes, buildCacheInfo] = await Promise.all([
      this.collectImages().catch((e) => {
        errors.push(`Images: ${e.message}`);
        return [];
      }),
      this.collectContainers().catch((e) => {
        errors.push(`Containers: ${e.message}`);
        return [];
      }),
      this.collectVolumes().catch((e) => {
        errors.push(`Volumes: ${e.message}`);
        return [];
      }),
      this.collectBuildCache().catch((e) => {
        errors.push(`Build cache: ${e.message}`);
        return { entries: [], totalSize: 0 };
      }),
    ]);

    const totalUsed =
      images.reduce((s, i) => s + i.size, 0) +
      volumes.reduce((s, v) => s + v.size, 0) +
      containers.reduce((s, c) => s + c.logSize + c.writableLayerSize, 0) +
      buildCacheInfo.totalSize;

    const totalCapacity = await this.getDockerRootCapacity();

    const recommendations = this.generateRecommendations(
      images,
      containers,
      volumes,
      buildCacheInfo.entries,
    );

    return {
      timestamp: new Date(),
      dockerSocket: this.socketPath,
      images,
      volumes,
      containers,
      buildCache: buildCacheInfo.entries,
      totalUsed,
      totalCapacity,
      recommendations,
      errors,
    };
  }

  private async collectImages(): Promise<ImageInfo[]> {
    const dockerImages = await this.docker.listImages({ all: true });
    const result: ImageInfo[] = [];

    for (const img of dockerImages) {
      const repoTag =
        img.RepoTags && img.RepoTags.length > 0
          ? img.RepoTags[0]
          : img.Id?.slice(7, 19) ?? '<none>:<none>';

      let containersCount = 0;
      try {
        const containers = await this.docker.listContainers({ all: true });
        containersCount = containers.filter((c) =>
          c.ImageID && img.Id ? c.ImageID === img.Id : false,
        ).length;
      } catch {
        containersCount = 0;
      }

      result.push({
        id: img.Id ?? 'unknown',
        repoTag,
        size: parseImageSize(img.Size ?? 0),
        created: new Date((img.Created ?? 0) * 1000),
        containersCount,
      });
    }

    return result.sort((a, b) => b.size - a.size);
  }

  private async collectContainers(): Promise<ContainerInfo[]> {
    const dockerContainers = await this.docker.listContainers({ all: true, size: true });
    const result: ContainerInfo[] = [];

    for (const c of dockerContainers) {
      const shortId = (c.Id ?? '').slice(0, 12);
      const name = (c.Names ?? [])[0]?.replace(/^\//, '') ?? shortId;

      const logDir = path.join(CONTAINER_LOGS_DIR, c.Id ?? '');
      const logFile = path.join(logDir, `${c.Id ?? shortId}-json.log`);
      const logSize = await getFileSize(logFile);

      const writableLayerSize = ((c as any).SizeRw ?? 0);

      result.push({
        id: shortId,
        name,
        image: c.Image ?? 'unknown',
        status: c.Status ?? 'unknown',
        logSize,
        writableLayerSize,
        created: new Date((c.Created ?? 0) * 1000),
      });
    }

    return result.sort((a, b) => b.logSize + b.writableLayerSize - (a.logSize + a.writableLayerSize));
  }

  private async collectVolumes(): Promise<VolumeInfo[]> {
    const dockerVolumes = await this.docker.listVolumes();
    const allContainers = await this.docker.listContainers({ all: true });
    const result: VolumeInfo[] = [];

    const containerVolumes: Map<string, string[]> = new Map();
    for (const c of allContainers) {
      const mounts = c.Mounts ?? [];
      for (const m of mounts) {
        if (m.Name) {
          const existing = containerVolumes.get(m.Name) ?? [];
          existing.push((c.Names ?? [])[0]?.replace(/^\//, '') ?? c.Id?.slice(0, 12) ?? 'unknown');
          containerVolumes.set(m.Name, existing);
        }
      }
    }

    for (const v of dockerVolumes.Volumes ?? []) {
      let size = 0;
      try {
        const mountPath = v.Mountpoint;
        size = await this.getDirectorySize(mountPath);
      } catch {
        size = 0;
      }

      result.push({
        name: v.Name,
        size,
        mountpoint: v.Mountpoint,
        containers: containerVolumes.get(v.Name) ?? [],
        driver: v.Driver,
      });
    }

    return result.sort((a, b) => b.size - a.size);
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    try {
      let totalSize = 0;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          totalSize += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          totalSize += await getFileSize(fullPath);
        }
      }
      return totalSize;
    } catch {
      return 0;
    }
  }

  private async getDockerRootCapacity(): Promise<number> {
    try {
      const stats = await fs.statfs(DOCKER_BASE);
      return stats.blocks * stats.bsize;
    } catch {
      return 0;
    }
  }

  private async collectBuildCache(): Promise<{ entries: BuildCacheEntry[]; totalSize: number }> {
    const entries: BuildCacheEntry[] = [];
    let totalSize = 0;

    try {
      const info = await this.docker.info() as any;
      const driverStatus = info.DriverStatus as Array<[string, string]> | undefined;
      totalSize += driverStatus?.reduce((acc: number, s: [string, string]) => {
        if (s[0]?.toLowerCase().includes('space used') || s[0]?.toLowerCase().includes('data space used')) {
          return acc + parseInt(s[1] ?? '0', 10);
        }
        return acc;
      }, 0) ?? 0;
    } catch {
      const cacheDir = path.join(DOCKER_BASE, 'builder');
      const buildkitDir = path.join(DOCKER_BASE, 'buildkit');

      for (const dir of [cacheDir, buildkitDir]) {
        try {
          const stat = await fs.stat(dir);
          if (stat.isDirectory()) {
            const size = await this.getDirectorySize(dir);
            if (size > 0) {
              entries.push({
                id: path.basename(dir),
                description: `Build cache: ${path.basename(dir)}`,
                size,
                usageCount: 0,
                lastUsed: null,
              });
              totalSize += size;
            }
          }
        } catch {
          // directory may not exist
        }
      }
    }

    return { entries, totalSize };
  }

  private generateRecommendations(
    images: ImageInfo[],
    containers: ContainerInfo[],
    volumes: VolumeInfo[],
    buildCache: BuildCacheEntry[],
  ): CleanupRecommendation[] {
    const recommendations: CleanupRecommendation[] = [];

    const danglingImages = images.filter((i) => i.repoTag === '<none>:<none>');
    if (danglingImages.length > 0) {
      const totalDangling = danglingImages.reduce((s, i) => s + i.size, 0);
      const danglingIds = danglingImages.map((i) => i.id.slice(0, 12));
      recommendations.push({
        category: 'images',
        action: 'prune-dangling',
        description: `Remove ${danglingImages.length} dangling (untagged) images`,
        estimatedSpace: totalDangling,
        command: 'docker image prune',
        items: danglingIds,
      });
    }

    const stoppedContainers = containers.filter((c) => c.status.startsWith('Exited'));
    if (stoppedContainers.length > 0) {
      const totalStopped = stoppedContainers.reduce(
        (s, c) => s + c.logSize + c.writableLayerSize,
        0,
      );
      const stoppedIds = stoppedContainers.map((c) => c.id);
      recommendations.push({
        category: 'containers',
        action: 'prune-stopped',
        description: `Remove ${stoppedContainers.length} stopped containers`,
        estimatedSpace: totalStopped,
        command: 'docker container prune',
        items: stoppedIds,
      });
    }

    const unusedVolumes = volumes.filter((v) => v.containers.length === 0);
    if (unusedVolumes.length > 0) {
      const totalUnusedVolumes = unusedVolumes.reduce((s, v) => s + v.size, 0);
      const volumeNames = unusedVolumes.map((v) => v.name);
      recommendations.push({
        category: 'volumes',
        action: 'prune-volumes',
        description: `Remove ${unusedVolumes.length} unused volumes`,
        estimatedSpace: totalUnusedVolumes,
        command: 'docker volume prune',
        items: volumeNames,
      });
    }

    if (buildCache.length > 0) {
      const totalCache = buildCache.reduce((s, e) => s + e.size, 0);
      const cacheIds = buildCache.map((e) => e.id);
      recommendations.push({
        category: 'build-cache',
        action: 'prune-build-cache',
        description: `Clear ${buildCache.length} build cache entries`,
        estimatedSpace: totalCache,
        command: 'docker builder prune',
        items: cacheIds,
      });
    }

    const containersWithLogs = containers.filter((c) => c.logSize > 10 * 1024 * 1024);
    if (containersWithLogs.length > 0) {
      const totalLogs = containersWithLogs.reduce((s, c) => s + c.logSize, 0);
      const containerNames = containersWithLogs.map((c) => c.name);
      recommendations.push({
        category: 'logs',
        action: 'rotate-logs',
        description: `Rotate logs for ${containersWithLogs.length} containers exceeding 10 MB`,
        estimatedSpace: totalLogs,
        command: 'docker logs --tail 1000 <container> > /dev/null 2>&1 || truncate -s 0 $(docker inspect --format=\'{{.LogPath}}\' <container>)',
        items: containerNames,
      });
    }

    return recommendations;
  }

  getDocker(): Dockerode {
    return this.docker;
  }
}
