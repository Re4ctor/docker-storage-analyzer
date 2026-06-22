import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DockerAnalyzer, type DiskUsageReport, type ImageInfo, type VolumeInfo, type ContainerInfo, type BuildCacheEntry, type CleanupRecommendation } from '../src/analyzer/docker-analyzer.js';

vi.mock('dockerode', () => {
  const MockDockerode = vi.fn();
  MockDockerode.prototype.listImages = vi.fn();
  MockDockerode.prototype.listContainers = vi.fn();
  MockDockerode.prototype.listVolumes = vi.fn();
  MockDockerode.prototype.info = vi.fn();
  return { default: MockDockerode };
});

import Dockerode from 'dockerode';

describe('DockerAnalyzer', () => {
  let analyzer: DockerAnalyzer;

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new DockerAnalyzer('/var/run/docker.sock');
  });

  describe('constructor', () => {
    it('should create instance with default socket', () => {
      const a = new DockerAnalyzer();
      expect(a).toBeInstanceOf(DockerAnalyzer);
    });

    it('should create instance with custom socket', () => {
      const a = new DockerAnalyzer('/custom/docker.sock');
      expect(a).toBeInstanceOf(DockerAnalyzer);
    });
  });

  describe('analyze', () => {
    it('should return a DiskUsageReport structure', async () => {
      const mockDocker = (Dockerode as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      if (mockDocker) {
        mockDocker.listImages.mockResolvedValue([]);
        mockDocker.listContainers.mockResolvedValue([]);
        mockDocker.listVolumes.mockResolvedValue({ Volumes: [] });
        mockDocker.info.mockResolvedValue({});
      }

      const report = await analyzer.analyze();

      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('images');
      expect(report).toHaveProperty('volumes');
      expect(report).toHaveProperty('containers');
      expect(report).toHaveProperty('buildCache');
      expect(report).toHaveProperty('totalUsed');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('errors');
      expect(report.dockerSocket).toBe('/var/run/docker.sock');
    });

    it('should handle Docker API errors gracefully', async () => {
      const mockDocker = (Dockerode as unknown as ReturnType<typeof vi.fn>).mock.results[0]?.value;
      if (mockDocker) {
        mockDocker.listImages.mockRejectedValue(new Error('Connection refused'));
        mockDocker.listContainers.mockRejectedValue(new Error('Connection refused'));
        mockDocker.listVolumes.mockRejectedValue(new Error('Connection refused'));
        mockDocker.info.mockRejectedValue(new Error('Connection refused'));
      }

      const report = await analyzer.analyze();
      expect(report.errors.length).toBeGreaterThan(0);
      expect(report.images).toEqual([]);
      expect(report.volumes).toEqual([]);
      expect(report.containers).toEqual([]);
    });
  });

  describe('recommendations', () => {
    it('should recommend pruning dangling images', () => {
      const analyzer = new DockerAnalyzer();
      const mockImages: ImageInfo[] = [
        { id: 'sha256:abc123', repoTag: '<none>:<none>', size: 500_000_000, created: new Date(), containersCount: 0 },
        { id: 'sha256:def456', repoTag: 'nginx:latest', size: 200_000_000, created: new Date(), containersCount: 2 },
      ];

      const recs = (analyzer as any).generateRecommendations(mockImages, [], [], []);
      const danglingRec = recs.find((r: CleanupRecommendation) => r.action === 'prune-dangling');
      expect(danglingRec).toBeDefined();
      expect(danglingRec.estimatedSpace).toBe(500_000_000);
    });

    it('should recommend pruning stopped containers', () => {
      const analyzer = new DockerAnalyzer();
      const mockContainers: ContainerInfo[] = [
        { id: 'abc123', name: 'test', image: 'nginx', status: 'Exited (0) 2 days ago', logSize: 10_000_000, writableLayerSize: 5_000_000, created: new Date() },
        { id: 'def456', name: 'running', image: 'redis', status: 'Up 3 hours', logSize: 0, writableLayerSize: 0, created: new Date() },
      ];

      const recs = (analyzer as any).generateRecommendations([], mockContainers, [], []);
      const stopRec = recs.find((r: CleanupRecommendation) => r.action === 'prune-stopped');
      expect(stopRec).toBeDefined();
      expect(stopRec.items).toEqual(['abc123']);
    });

    it('should recommend pruning unused volumes', () => {
      const analyzer = new DockerAnalyzer();
      const mockVolumes: VolumeInfo[] = [
        { name: 'data-volume', size: 1_000_000_000, mountpoint: '/mnt/data', containers: [], driver: 'local' },
        { name: 'used-volume', size: 500_000_000, mountpoint: '/mnt/used', containers: ['web'], driver: 'local' },
      ];

      const recs = (analyzer as any).generateRecommendations([], [], mockVolumes, []);
      const volRec = recs.find((r: CleanupRecommendation) => r.action === 'prune-volumes');
      expect(volRec).toBeDefined();
      expect(volRec.items).toEqual(['data-volume']);
      expect(volRec.estimatedSpace).toBe(1_000_000_000);
    });

    it('should recommend log rotation for large logs', () => {
      const analyzer = new DockerAnalyzer();
      const mockContainers: ContainerInfo[] = [
        { id: 'abc123', name: 'logger', image: 'app', status: 'Up 3 hours', logSize: 50_000_000, writableLayerSize: 1_000_000, created: new Date() },
        { id: 'def456', name: 'quiet', image: 'app', status: 'Up 3 hours', logSize: 1_000, writableLayerSize: 1_000_000, created: new Date() },
      ];

      const recs = (analyzer as any).generateRecommendations([], mockContainers, [], []);
      const logRec = recs.find((r: CleanupRecommendation) => r.action === 'rotate-logs');
      expect(logRec).toBeDefined();
      expect(logRec.items).toEqual(['logger']);
    });

    it('should return empty recommendations when everything is clean', () => {
      const analyzer = new DockerAnalyzer();
      const recs = (analyzer as any).generateRecommendations([], [], [], []);
      expect(recs.length).toBe(0);
    });

    it('should recommend pruning build cache', () => {
      const analyzer = new DockerAnalyzer();
      const mockCache: BuildCacheEntry[] = [
        { id: 'buildkit-abc', description: 'Build cache entry', size: 2_000_000_000, usageCount: 5, lastUsed: new Date() },
      ];

      const recs = (analyzer as any).generateRecommendations([], [], [], mockCache);
      const cacheRec = recs.find((r: CleanupRecommendation) => r.action === 'prune-build-cache');
      expect(cacheRec).toBeDefined();
      expect(cacheRec.estimatedSpace).toBe(2_000_000_000);
    });
  });
});
