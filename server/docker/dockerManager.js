import Docker from 'dockerode';
import getPort from 'get-port';
import dotenv from 'dotenv';

dotenv.config();

const docker = new Docker(); // Connects via Unix socket by default
const SSH_IMAGE = process.env.SSH_IMAGE || 'lab-cn-image';

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

/**
 * Create or reuse a Docker container for a given userId-sessionId pair.
 */
export async function createContainerForUser(userId) {
  const sessionId = generateSessionId();
  const containerName = `lab_exam_${userId}_${sessionId}`;
  const volumeName = `lab_data_${userId}_${sessionId}`;

  // Check if container already exists
  const existingContainers = await docker.listContainers({ all: true });
  const existing = existingContainers.find(c => c.Names.includes(`/${containerName}`));

  if (existing) {
    const existingContainer = docker.getContainer(existing.Id);
    const containerState = existing.State;

    const sshPort = parseInt(
      existing.Ports.find(p => p.PrivatePort === 22)?.PublicPort || '0'
    );

    if (containerState !== 'running') {
      try {
        await existingContainer.start();
        await runInContainer(existingContainer, `
        setfacl -m u:networklab:rwx /home/labuser
        setfacl -d -m u:networklab:rwx /home/labuser

        setfacl -m u:tcpdump:rwx /home/networklab
        setfacl -d -m u:tcpdump:rwx /home/networklab
        `);
        console.log(`[Dockerode] Restarted container ${containerName}`);
      } catch (err) {
        console.error(`[Dockerode] Failed to restart container:`, err.message);
        // Maybe the old container is broken. Remove and recreate:
        await existingContainer.remove({ force: true });
        return await createContainerForUser(userId); // retry creation
      }
    } else {
      console.log(`[Dockerode] Reusing running container ${containerName}`);
    }

    return { containerName, volumeName, sshPort, sessionId };
  }

  // Check and create volume if needed
  const volumes = await docker.listVolumes();
  const volumeExists = volumes.Volumes.find(v => v.Name === volumeName);
  if (!volumeExists) {
    await docker.createVolume({ Name: volumeName });
    console.log(`[Dockerode] Created volume ${volumeName}`);
  }

  // Reserve a new random port for SSH
  const sshPort = await getPort({ port: Array.from({ length: 100 }, (_, i) => 2200 + i) });

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
    },
  });

  await container.start();
  await runInContainer(container, `
  setfacl -m u:networklab:rwx /home/labuser
  setfacl -d -m u:networklab:rwx /home/labuser

  setfacl -m u:tcpdump:rwx /home/networklab
  setfacl -d -m u:tcpdump:rwx /home/networklab
  `);
  console.log(`[Dockerode] Started new container ${containerName} on port ${sshPort}`);

  return { containerName, volumeName, sshPort, sessionId };
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