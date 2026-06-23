import os from 'os';
import path from 'path';
import fs from 'fs';

export function detectDockerSocket(): string {
  // 1. Custom DOCKER_SOCKET env var (project-specific)
  if (process.env.DOCKER_SOCKET) {
    return process.env.DOCKER_SOCKET;
  }

  // 2. Standard DOCKER_HOST for unix:// sockets
  if (process.env.DOCKER_HOST?.startsWith('unix://')) {
    const socketPath = process.env.DOCKER_HOST.slice(7);
    if (fs.existsSync(socketPath)) return socketPath;
  }

  // 3. macOS: Docker Desktop default socket
  if (os.platform() === 'darwin') {
    const homeSocket = path.join(os.homedir(), '.docker', 'run', 'docker.sock');
    if (fs.existsSync(homeSocket)) return homeSocket;

    // Fallback: check if /var/run/docker.sock exists (some setups symlink it)
    if (fs.existsSync('/var/run/docker.sock')) return '/var/run/docker.sock';

    // Last resort: return the Docker Desktop path (socket may not be running yet)
    return homeSocket;
  }

  // 4. Linux and other platforms: standard Docker socket
  return '/var/run/docker.sock';
}
