import Docker from 'dockerode';
import getPort from 'get-port';
import dotenv from 'dotenv';

dotenv.config();

const docker = new Docker(); // Connects via Unix socket by default
const SSH_IMAGE = process.env.SSH_IMAGE || 'lab-cn-image';
const containerLocks = new Map();

async function withContainerLock(key, fn) {
  const previous = containerLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  containerLocks.set(key, queued);

  await previous;
  try {
    return await fn();
  } finally {
    release();
    if (containerLocks.get(key) === queued) {
      containerLocks.delete(key);
    }
  }
}

/**
 * Generates session ID like 20150616_FN or 20250616_AN
 */
function generateSessionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const period = now.getHours() < 12 ? 'FN' : 'AN'; 
  return `${year}${month}${day}_${period}`;         
}

export function normalizeSessionId(sessionId) {
  if (!sessionId) return null;
  const value = String(sessionId).trim();
  if (!value) return null;
  const [datePart, slotPart] = value.split('_');
  if (!datePart || !slotPart) return value.replace(/-/g, '');
  return `${datePart.replace(/-/g, '')}_${slotPart.toUpperCase()}`;
}

function parsePort(value) {
  const parsed = parseInt(value || '0', 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPublishedSshPort(containerInfo) {
  return parsePort(containerInfo.Ports?.find((p) => p.PrivatePort === 22)?.PublicPort);
}

async function getPublishedSshPortFromInspect(container) {
  const inspect = await container.inspect();
  const binding = inspect.NetworkSettings?.Ports?.['22/tcp']?.[0]?.HostPort;
  return parsePort(binding);
}

async function resolvePublishedSshPort(container, containerInfo) {
  const listPort = getPublishedSshPort(containerInfo);
  if (listPort > 0) return listPort;

  const inspectPort = await getPublishedSshPortFromInspect(container);
  if (inspectPort > 0) return inspectPort;

  throw new Error(`Container ${containerInfo.Names?.[0] || containerInfo.Id} has no published SSH port`);
}

async function getContainerState(container) {
  const inspect = await container.inspect();
  return inspect.State?.Running ? 'running' : (inspect.State?.Status || 'unknown');
}

async function getAllocatedSshPorts() {
  const containers = await docker.listContainers({ all: true });
  const ports = new Set();

  const addBindingPorts = (bindingArray) => {
    if (!Array.isArray(bindingArray)) return;
    for (const binding of bindingArray) {
      const hostPort = parsePort(binding?.HostPort);
      if (hostPort > 0) {
        ports.add(hostPort);
      }
    }
  };

  for (const containerInfo of containers) {
    if (Array.isArray(containerInfo.Ports) && containerInfo.Ports.length > 0) {
      for (const portInfo of containerInfo.Ports) {
        if (portInfo.PrivatePort === 22 && portInfo.PublicPort) {
          const hostPort = parsePort(portInfo.PublicPort);
          if (hostPort > 0) {
            ports.add(hostPort);
          }
        }
      }
      continue;
    }

    try {
      const container = docker.getContainer(containerInfo.Id);
      const inspect = await container.inspect();
      const binding = inspect.NetworkSettings?.Ports?.['22/tcp'];
      addBindingPorts(binding);
    } catch (err) {
      console.warn(`[Dockerode] Failed to inspect container ${containerInfo.Id}: ${err.message}`);
    }
  }

  return [...ports];
}

async function applyContainerAcl(container, containerName) {
  try {
    await runInContainer(container, `
    setfacl -m u:networklab:rwx /home/labuser
    setfacl -d -m u:networklab:rwx /home/labuser

    setfacl -m u:tcpdump:rwx /home/networklab
    setfacl -d -m u:tcpdump:rwx /home/networklab
    `);
  } catch (err) {
    console.warn(`[Dockerode] ACL setup skipped for ${containerName}: ${err.message}`);
  }
}

/**
 * Create or reuse a Docker container for a given userId-sessionId pair.
 */
export async function createContainerForUser(userId, requestedSessionId = null) {
  const sessionId = normalizeSessionId(requestedSessionId) || generateSessionId();
  const containerName = `lab_exam_${userId}_${sessionId}`;
  const volumeName = `lab_data_${userId}_${sessionId}`;

  return withContainerLock(containerName, async () => {

  // Check if container already exists
  const existingContainers = await docker.listContainers({ all: true });
  const existing = existingContainers.find(c => c.Names.includes(`/${containerName}`));

  if (existing) {
    const existingContainer = docker.getContainer(existing.Id);
    let containerState = existing.State;

    if (containerState !== 'running') {
      try {
        await existingContainer.start();
        containerState = 'running';
      } catch (err) {
        if (err.statusCode === 304 || /already started/i.test(err.message || '')) {
          containerState = await getContainerState(existingContainer);
        } else if (err.statusCode === 409 || /removal of container/i.test(err.message || '')) {
          throw new Error(`Container ${containerName} is busy being removed. Please retry in a moment.`);
        } else {
          throw err;
        }
      }

      if (containerState === 'running') {
        await applyContainerAcl(existingContainer, containerName);
        console.log(`[Dockerode] Restarted container ${containerName}`);
      } else {
        throw new Error(`Container ${containerName} could not be started; state is ${containerState}`);
      }
    } else {
      console.log(`[Dockerode] Reusing running container ${containerName}`);
    }

    const sshPort = await resolvePublishedSshPort(existingContainer, existing);
    return { containerName, volumeName, sshPort, sessionId };
  }

  // Check and create volume if needed
  const volumes = await docker.listVolumes();
  const volumeExists = volumes.Volumes.find(v => v.Name === volumeName);
  if (!volumeExists) {
    await docker.createVolume({ Name: volumeName });
    console.log(`[Dockerode] Created volume ${volumeName}`);
  }

  // Reserve a new random port for SSH.
  // Sized for a worst case of 300 concurrent students with headroom —
  // 100 ports was a hard ceiling that made >100 concurrent containers
  // impossible regardless of hardware.
  const PORT_RANGE_START = parseInt(process.env.SSH_PORT_RANGE_START || '2200', 10);
  const PORT_RANGE_SIZE = parseInt(process.env.SSH_PORT_RANGE_SIZE || '500', 10);
  const candidatePorts = Array.from({ length: PORT_RANGE_SIZE }, (_, i) => PORT_RANGE_START + i);
  const allocatedPorts = await getAllocatedSshPorts();
  const sshPort = await getPort({
    port: candidatePorts,
    exclude: allocatedPorts,
  });

  // Create the container
  const container = await docker.createContainer({
    Image: SSH_IMAGE,
    name: containerName,
    ExposedPorts: {
      '22/tcp': {},
    },
    HostConfig: {
      Privileged: true, // this is what gives write access to /proc/sys
      CapAdd: ['NET_ADMIN', 'NET_RAW', 'SYS_ADMIN'], // Added SYS_ADMIN
      PortBindings: {
        '22/tcp': [{ HostPort: sshPort.toString() }],
      },
      Binds: [`${volumeName}:/home/labuser/workdir`],
      AutoRemove: false, // Don't auto-remove to retain state
      // Resource caps — sized for a worst case of 300 concurrent
      // containers on a 64GB host (see scaling notes). Without these, a
      // single runaway/malicious student process (fork bomb, memory leak)
      // can degrade or crash the entire host for every other student.
      // 320MB * 300 containers ≈ 94GB worst case if every container maxes
      // out simultaneously, which is above 64GB — these are meant to be
      // tuned per your actual concurrent load (see SCALING_NOTES.md), not
      // left at these defaults blindly.
      Memory: parseInt(process.env.CONTAINER_MEMORY_BYTES || `${320 * 1024 * 1024}`, 10),
      MemorySwap: parseInt(process.env.CONTAINER_MEMORY_BYTES || `${320 * 1024 * 1024}`, 10), // == Memory disables swap
      NanoCpus: parseInt(process.env.CONTAINER_NANO_CPUS || `${0.5 * 1e9}`, 10), // 0.5 vCPU
      PidsLimit: parseInt(process.env.CONTAINER_PIDS_LIMIT || '150', 10), // caps fork bombs
    },
  });

  await container.start();
  await applyContainerAcl(container, containerName);
  console.log(`[Dockerode] Started new container ${containerName} on port ${sshPort}`);

  return { containerName, volumeName, sshPort, sessionId };
  });
}

async function runInContainer(container, cmd) {
  const exec = await container.exec({
    User: 'root',
    Cmd: ['bash', '-c', cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  const stream = await exec.start({});

  return new Promise((resolve, reject) => {
    let output = '';

    stream.on('data', (chunk) => {
      output += chunk.toString();
    });

    stream.on('end', async () => {
      const inspect = await exec.inspect();
      if (inspect.ExitCode === 0) resolve(output);
      else reject(new Error(output));
    });

    stream.on('error', reject);
  });
}

export { docker };
