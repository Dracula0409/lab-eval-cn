import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import fs from 'fs';
import url from 'url';
import dotenv from 'dotenv';
import Session from '../models/Session.js';
import { createContainerForUser, docker, normalizeSessionId } from '../docker/dockerManager.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { Question } from '../models/Question.js';
import EvaluationRun from '../models/EvaluationRun.js';
import { getPooledConnection, evictPooledConnection } from '../utils/sshConnectionPool.js';
import {
  EVAL_DIR,
  buildNiceScript,
  buildStudentSh,
  buildTestcasesJson,
  parseEvaluatedCsv,
  parseConnCsv,
  parseStatusCsv,
  toApiResults,
} from '../utils/evaluationHelper.js';
import { getCurrentSlotKey } from '../utils/labSlot.js';
import LabAssignment from '../models/LabAssignment.js';
import User from '../models/User.js';
import { getUserFromRequest } from '../middleware/auth.js';

dotenv.config();

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessions = {}; // session socket key => { conn, stream, ws, userId, sessionId, terminalId }

// Teacher-driven revocation must also terminate an already-open terminal;
// otherwise an interactive shell could remain usable until the tab reloads.
export function closeStudentSocketsForConnection(connectionId) {
  Object.entries(sessions).forEach(([socketKey, session]) => {
    if (session.connectionId !== connectionId) return;
    try { session.ws.close(4001, 'Session disconnected by teacher'); } catch (_) {}
    try { session.stream?.end(); } catch (_) {}
    try { session.conn?.end(); } catch (_) {}
    delete sessions[socketKey];
  });
}

function isChannelOpenFailure(err) {
  return err?.reason === 2 || /Channel open failure|open failed/i.test(err?.message || '');
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeSftp(sftp) {
  try {
    sftp?.end?.();
  } catch (_) {
    /* already closed */
  }
}

function isTransientSshStartupError(err) {
  return (
    err?.level === 'client-authentication' ||
    /All configured authentication methods failed|ECONNREFUSED|ECONNRESET|Timed out while waiting for handshake/i.test(err?.message || '')
  );
}

function connectSshClient({ sshPort, username, privateKeyPath, label }) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let settled = false;

    conn.on('ready', () => {
      settled = true;
      resolve(conn);
    })
    .on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      } else {
        console.error(`[SSH] ${label} connection error:`, err);
      }
    })
    .connect({
      host: '127.0.0.1',
      port: sshPort,
      username,
      privateKey: fs.readFileSync(privateKeyPath),
      readyTimeout: 10000,
    });
  });
}

async function connectSshWithRetry(config, attempts = 6) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await connectSshClient(config);
    } catch (err) {
      lastError = err;
      if (!isTransientSshStartupError(err) || attempt === attempts) break;
      const delay = Math.min(250 * attempt, 1500);
      console.warn(`[SSH] ${config.label} not ready on port ${config.sshPort}; retrying in ${delay}ms (${attempt}/${attempts})`);
      await wait(delay);
    }
  }
  throw lastError;
}

async function createSSHConnection(userId, sshPortOverride = null, requestedSessionId = null) {
  const activeSession = sshPortOverride
    ? null
    : await ensureSessionContainer(userId, requestedSessionId);
  const session = sshPortOverride
    ? await Session.findOne({ userId }).sort({ createdAt: -1 })
    : await Session.findOne({ userId, sessionId: activeSession.sessionId });
  console.log("[SSH] Session found:", session);
  if (!session && !sshPortOverride) throw new Error('No active session for user');
  const sshPort = sshPortOverride || session.sshPort;
  const poolKey = `labuser:${sshPort}`;

  // One labuser connection is reused across autosaves/exec calls for the
  // same container instead of a fresh SSH handshake per call — see
  // utils/sshConnectionPool.js for why this matters at scale.
  const conn = await getPooledConnection(poolKey, () => connectSshWithRetry({
    sshPort,
    username: 'labuser',
    privateKeyPath: './labuser_key',
    label: 'labuser',
  }));
  conn.__poolKey = poolKey;
  return conn;
}

/**
 * A dedicated, non-pooled labuser connection for the interactive terminal.
 * Deliberately NOT routed through the shared pool: a terminal shell's
 * connection lifecycle is tied 1:1 to its WebSocket (it's ended the moment
 * the tab closes), whereas the pool exists for short-lived, fire-and-forget
 * operations (autosave, exec, evaluate) that outlive any single request. If
 * these shared a connection, closing a terminal tab would kill an
 * in-flight autosave on the same container.
 */
function createLabuserConnection(sshPort) {
  return connectSshWithRetry({
    sshPort,
    username: 'labuser',
    privateKeyPath: './labuser_key',
    label: 'terminal labuser',
  });
}

export function initSSHWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const { pathname, query } = url.parse(request.url, true);
    if (pathname === '/ws/ssh') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        ws.query = query;
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (ws, request) => {
    const { terminalId = 'main', sessionId: requestedSessionId = null } = ws.query;

    try {
      const user = await getUserFromRequest(request);
      if (!user || user.role !== 'student') {
        ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
        ws.close();
        return;
      }
      const userId = user.user_id;
      const connectionId = request.studentConnection?.sessionId;
      const { sshPort, sessionId } = await ensureSessionContainer(userId, requestedSessionId);

      let conn;
      
      try {
        conn = await createLabuserConnection(sshPort);

        // Request shell with explicit PTY for interactive programs
        conn.shell({
          term: 'xterm-256color',
          cols: 240,
          rows: 20,
          width: 640,
          height: 480
        }, (err, stream) => {
          if (err) {
            return ws.send(JSON.stringify({ type: 'error', message: 'SSH Shell Error' }));
          }
            stream.stderr?.on('data', (data) => {
              if (ws.readyState === ws.OPEN) {
                // Send stderr data as well for complete output
                const errorOutput = data.toString('utf8');
                ws.send(JSON.stringify({ type: 'data', data: errorOutput }));
              }
            });            
            
            ws.on('message', (message) => {
              try {
                const { type, data, cols, rows } = JSON.parse(message);

                if (type === 'input') {
                  // // Handle Ctrl+C properly by sending SIGINT
                  // if (data === '\u0003') { // Ctrl+C character
                  //   stream.write(data);
                  //   // Don't automatically kill other processes - let Ctrl+C handle it naturally
                  // } else {
                  //   stream.write(data);
                  // }
                  stream.write(data);
                } else if (type === 'resize') {
                  stream.setWindow(rows, cols, 600, 800);
                }
              } catch (err) {
                console.error('[WS] Invalid message format:', err);
              }
            });
          const socketKey = `${userId}:${sessionId}:${terminalId}`;
          sessions[socketKey] = { conn, stream, ws, userId, sessionId, terminalId, connectionId };

          // Handle incoming data from SSH
          stream.on('data', (data) => {
            if (ws.readyState === ws.OPEN) {
              const output = data.toString('utf8');
              ws.send(JSON.stringify({ type: 'data', data: output }));
            }
          });

          stream.stderr?.on('data', (data) => {
            if (ws.readyState === ws.OPEN) {
              // Send stderr data as well for complete output
              const errorOutput = data.toString('utf8');
              ws.send(JSON.stringify({ type: 'data', data: errorOutput }));
            }
          });            

          const cleanup = async () => {
            stream.end();
            conn.end();
            delete sessions[socketKey];

            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify({ type: 'end' }));
            }

            await Session.updateOne(
              { userId, sessionId },
              { $pull: { activeSockets: terminalId } }
            );
          };

          ws.on('close', cleanup);
        });
      } catch (err) {
        if (conn) conn.end();
        throw err;
      }
    } catch (err) {
      console.error('[SSH WS] Failed to init session:', err.message);
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to start lab session' }));
    }
  });
}

async function resolveContainerSessionId(userId, requestedSessionId = null) {
  const normalizedRequested = normalizeSessionId(requestedSessionId);
  if (normalizedRequested) return normalizedRequested;

  const student = await User.findOne({ user_id: userId, role: 'student' }).select('batch').lean();
  if (!student) return null;

  const assignment = await LabAssignment.findOne({
    status: 'active',
    $or: [
      { endsAt: null },
      { endsAt: { $gt: new Date() } },
    ],
    slotKey: { $nin: [null, ''] },
    $and: [
      {
        $or: [
          { targetBatch: { $in: [null, ''] } },
          { targetBatch: student.batch || '' },
        ],
      },
    ],
  }).lean();

  if (!assignment) return null;
  if (assignment.endsAt && new Date(assignment.endsAt) <= new Date()) return null;
  if (assignment.targetBatch && assignment.targetBatch !== student.batch) return null;

  return normalizeSessionId(assignment.slotKey);
}

export async function ensureSessionContainer(userId, requestedSessionId = null) {
  const resolvedSessionId = await resolveContainerSessionId(userId, requestedSessionId);
  const { containerName, sshPort, sessionId } = await createContainerForUser(userId, resolvedSessionId);

  let sessionDoc = await Session.findOne({ userId, sessionId });
  if (!sessionDoc) {
    await Session.create({
      userId,
      sessionId,
      containerName,
      sshPort,
      createdAt: new Date(),
      activeSockets: [],
    });
    console.log(`[Session DB] Created new session for ${userId} @ ${sessionId}`);
  } else if ((sessionDoc.containerName !== containerName) || (sessionDoc.sshPort !== sshPort)) {
    sessionDoc.containerName = containerName;
    sessionDoc.sshPort = sshPort;
    await sessionDoc.save();
    console.log(`[Session DB] Updated existing session for ${userId}`);
  }

  return { containerName, sshPort, sessionId };
}

export async function stopSessionContainer(userId, requestedSessionId) {
  const sessionId = normalizeSessionId(requestedSessionId);
  if (!sessionId) throw new Error('sessionId is required');

  const session = await Session.findOne({ userId, sessionId });
  const expectedContainerName = `lab_exam_${userId}_${sessionId}`;
  const containerName = session?.containerName || expectedContainerName;

  for (const [socketKey, entry] of Object.entries(sessions)) {
    if (entry.userId === userId && entry.sessionId === sessionId) {
      try {
        entry.ws?.close?.();
      } catch (_) {
        /* socket already closed */
      }
      try {
        entry.stream?.end?.();
      } catch (_) {
        /* stream already closed */
      }
      try {
        entry.conn?.end?.();
      } catch (_) {
        /* connection already closed */
      }
      delete sessions[socketKey];
    }
  }

  if (session?.sshPort) {
    evictPooledConnection(`labuser:${session.sshPort}`);
    evictPooledConnection(`networklab:${session.sshPort}`);
  }

  const containers = await docker.listContainers({ all: true });
  const match = containers.find((info) => {
    const names = (info.Names || []).map((name) => name.replace(/^\//, ''));
    return names.includes(containerName) || names.includes(expectedContainerName);
  });

  if (!match) {
    await Session.updateOne(
      { userId, sessionId },
      { $set: { activeSockets: [] } }
    );
    return {
      success: true,
      stopped: false,
      reason: 'container_not_found',
      sessionId,
      containerName,
      expectedContainerName,
    };
  }

  const container = docker.getContainer(match.Id);
  try {
    const inspect = await container.inspect();
    if (inspect.State?.Running) {
      await container.stop({ t: 3 });
    }
  } catch (err) {
    if (err.statusCode !== 304 && err.statusCode !== 404) throw err;
  }

  let finalInspect = null;
  try {
    finalInspect = await container.inspect();
    if (finalInspect.State?.Running) {
      await container.kill();
      finalInspect = await container.inspect();
    }
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  await Session.updateOne(
    { userId, sessionId },
    { $set: { activeSockets: [] } }
  );

  const stillRunning = !!finalInspect?.State?.Running;
  return {
    success: !stillRunning,
    stopped: !stillRunning,
    sessionId,
    containerName: match.Names?.[0]?.replace(/^\//, '') || containerName,
    state: finalInspect?.State?.Status || match.State,
  };
}

async function ensureDirectoryExists(sftp, remotePath) {
  const pathParts = remotePath.split('/').slice(0, -1);
  let currentPath = '';
  
  for (let i = 1; i < pathParts.length; i++) {
    currentPath += (currentPath.endsWith('/') ? '' : '/') + pathParts[i];
    await new Promise((resolve) => {
      sftp.mkdir(currentPath, { mode: 0o755 }, () => resolve());
    });
  }
}

/**
 * upload string to file in container
 */
async function uploadFileContent(userId, content, remotePath, sessionId = null, attempt = 1) {
  let conn;
  try {
    conn = await createSSHConnection(userId, null, sessionId);
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }
        
        ensureDirectoryExists(sftp, remotePath).then(() => {
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on('close', () => {
            console.log(`[SFTP] File content written to ${remotePath}`);
            closeSftp(sftp);
            resolve();
          });
          writeStream.on('error', (err) => {
            console.error('[SFTP] WriteStream error:', err);
            closeSftp(sftp);
            reject(err);
          });
          writeStream.write(content);
          writeStream.end();
        }).catch(err => {
          closeSftp(sftp);
          reject(err);
        });
      });
    });
  } catch (err) {
    if (conn?.__poolKey && isChannelOpenFailure(err) && attempt < 3) {
      console.warn(`[SFTP] Channel open failed for ${conn.__poolKey}; evicting pooled connection and retrying (${attempt}/2).`);
      evictPooledConnection(conn.__poolKey);
      await wait(150 * attempt);
      return uploadFileContent(userId, content, remotePath, sessionId, attempt + 1);
    }
    throw err;
  }
}

/**
 * Save file to user's container via SFTP
 */
export async function saveFileToContainer({ userId, filePath, code, sessionId = null }) {
  // Normalize path
  const remotePath = filePath;
  return uploadFileContent(userId, code, remotePath, sessionId);
}

/**
 * Upload a local file to the container
 */
async function uploadLocalFile(userId, localPath, remotePath, attempt = 1) {
  let conn;
  try {
    conn = await createSSHConnection(userId);
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }
        
        ensureDirectoryExists(sftp, remotePath).then(() => {
          sftp.fastPut(localPath, remotePath, (err) => {
            closeSftp(sftp);
            if (err) {
              console.error('[SFTP] Upload error:', err);
              reject(err);
            } else {
              console.log(`[SFTP] File uploaded: ${localPath} → ${remotePath}`);
              resolve();
            }
          });
        }).catch(err => {
          closeSftp(sftp);
          reject(err);
        });
      });
    });
  } catch (err) {
    if (conn?.__poolKey && isChannelOpenFailure(err) && attempt < 3) {
      console.warn(`[SFTP] Channel open failed for ${conn.__poolKey}; evicting pooled connection and retrying upload (${attempt}/2).`);
      evictPooledConnection(conn.__poolKey);
      await wait(150 * attempt);
      return uploadLocalFile(userId, localPath, remotePath, attempt + 1);
    }
    throw err;
  }
}

/**
 * Execute a command in the user's container via SSH
 */
// async function execCmd(command, userId) {
//   const session = await Session.findOne({ userId }).sort({ createdAt: -1 });
//   if (!session) throw new Error('No active session for user');
//   const { sshPort } = session;

//   return execSSH(userId, command, sshPort);
// }

/**
 * Execute command via SSH and return stdout, stderr, and exit code
 */
async function execSSH(userId, command, sshPortOverride = null) {
  let conn;
  try {
    conn = await createSSHConnection(userId, sshPortOverride);
    
    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      
      conn.exec(command, (err, stream) => {
        if (err) {
          return reject(err);
        }
        
        stream.on('data', (data) => {
          stdout += data.toString('utf8');
        });
        
        stream.stderr.on('data', (data) => {
          stderr += data.toString('utf8');
        });
        
        stream.on('close', (code) => {
          resolve({ stdout, stderr, exitCode: code });
        });
      });
    });
  } catch (err) {
    throw err;
  }
}

async function createNetworklabConnection(sshPort) {
  const poolKey = `networklab:${sshPort}`;
  const conn = await getPooledConnection(poolKey, () => connectSshWithRetry({
    sshPort,
    username: 'networklab',
    privateKeyPath: './networklab_key',
    label: 'networklab',
  }));
  conn.__poolKey = poolKey;
  return conn;
}

function uploadStringViaConn(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', () => {
        closeSftp(sftp);
        resolve();
      });
      ws.on('error', (err) => {
        closeSftp(sftp);
        reject(err);
      });
      ws.write(content ?? '');
      ws.end();
    });
  });
}

function execViaConn(conn, command, onLog) {
  console.log("EXEC START:", command);
  onLog?.({ type: 'stage', message: `$ ${command}` });

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    conn.exec(command, (err, stream) => {
      if (err) {
        console.log("EXEC ERROR:", err);
        return reject(err);
      }

      console.log("CHANNEL OPEN");

      stream.on('data', (d) => {
        const chunk = d.toString();
        stdout += chunk;
        onLog?.({ type: 'stdout', message: chunk });
      });

      stream.stderr.on('data', (d) => {
        const chunk = d.toString();
        stderr += chunk;
        onLog?.({ type: 'stderr', message: chunk });
      });

      stream.on('exit', (code) => {
        console.log("EXIT:", code);
        onLog?.({ type: 'stage', message: `process exited with code ${code}` });
      });

      stream.on('end', () => {
        console.log("END");
      });

      stream.on('close', (code) => {
        console.log("CLOSE:", code);
        resolve({ stdout, stderr, exitCode: code });
      });
    });
  });
}

/**
 * Runs question-specific nice.sh inside networklab evaluation dir.
 * Generic framework scripts must already exist in the container image.
 */
export async function runAndEvaluate({
  userId,
  studentName = '',
  sessionId,
  moduleId,
  questionId,
  tagPaths = {},
  sourceFiles = {},
  runType = 'evaluate',
  onLog,
}) {
  console.log("========== ENTERED runAndEvaluate ==========");
  onLog?.({ type: 'stage', message: `Starting ${runType} for question ${questionId}` });
  const activeSession = await ensureSessionContainer(userId, sessionId);
  const session = await Session.findOne({ userId, sessionId: activeSession.sessionId });
  if (!session) throw new Error('No active session for user');

  const question = await Question.findById(questionId).lean();
  if (!question) throw new Error(`Question ${questionId} not found`);

  const questionKey = question.questionKey || 'q1';
  const testcases = question.testcases || {};
  const evalScriptBody = question.evalScript || '';
  const inputContent = question.input || '';

  const niceScript = buildNiceScript({ evalScriptBody });
  const testcasesJson = buildTestcasesJson(questionKey, testcases);
  const studentSh = buildStudentSh(userId, studentName);

  const conn = await createNetworklabConnection(session.sshPort);

  try {
    console.log("A writing nice.sh");
    onLog?.({ type: 'stage', message: 'Writing nice.sh' });
    await uploadStringViaConn(conn, `${EVAL_DIR}/nice.sh`, niceScript);
    console.log("B writing testcase");
    onLog?.({ type: 'stage', message: 'Writing testcases.json' });
    await uploadStringViaConn(conn, `${EVAL_DIR}/testcases.json`, testcasesJson);
    console.log("C upload input");
    onLog?.({ type: 'stage', message: 'Writing input file' });
    await uploadStringViaConn(conn, `${EVAL_DIR}/input`, inputContent);
    console.log("D upload student");
    onLog?.({ type: 'stage', message: 'Writing student.sh' });
    await uploadStringViaConn(conn, `${EVAL_DIR}/student.sh`, studentSh);

    /*
    console.log("E creating symlinks");
    onLog?.({ type: 'stage', message: 'Linking student source files' });
    const fileArgs = [];

    for (const [tag, filePath] of Object.entries(tagPaths)) {
      const ext = path.posix.extname(filePath);      // ".c", ".py", etc.
      const taggedName = `${tag}${ext}`;             // server1.c, client2.c

      await execViaConn(
        conn,
        `ln -sf "${filePath}" "${EVAL_DIR}/${taggedName}"`
      );

      fileArgs.push(`"${EVAL_DIR}/${taggedName}"`);
    }

    const args = fileArgs.join(' ');
    */
   
    // Instead of symlinks, copy the files to the evaluation directory
    console.log("E copying source files");
    onLog?.({ type: 'stage', message: 'Copying student source files' });

    const fileArgs = [];
    // tagPaths keys look like "s1", "s2", "c1", "c2", ... — group filenames
    // by whether the tag is a server (s*) or client (c*) role so nice.sh
    // gets them as two separate quoted args:
    //   bash nice.sh "server1.c server2.c" "client1.c client2.c"
    const serverFiles = [];
    const clientFiles = [];

    for (const [tag, filePath] of Object.entries(tagPaths)) {
      const fileName = path.posix.basename(filePath);

      await execViaConn(
        conn,
        `cp -f "${filePath}" "${EVAL_DIR}/${fileName}"`
      );

      fileArgs.push(`"${fileName}"`);

      const role = String(tag).trim().toLowerCase().charAt(0);
      if (role === 's') {
        serverFiles.push(fileName);
      } else if (role === 'c') {
        clientFiles.push(fileName);
      }
    }

    const args = fileArgs.join(' ');
    const serverArgs = `"${serverFiles.join(' ')}"`;
    const clientArgs = `"${clientFiles.join(' ')}"`;

    console.log("F chmod");
    await execViaConn(conn, `chmod +x ${EVAL_DIR}/nice.sh`, onLog);

    console.log("G running nice.sh");
    onLog?.({ type: 'stage', message: 'Running nice.sh' });
    const { stdout, stderr, exitCode } = await execViaConn(
      conn,
      `cd ${EVAL_DIR} && bash nice.sh ${serverArgs} ${clientArgs}; echo "__DONE__"; exit`,
      onLog
    );

    console.log("H nice.sh finished");
    console.log("stdout:");
    console.log(stdout);

    console.log("stderr:");
    console.log(stderr);

    console.log("exitCode:", exitCode);
    const csvPath = `${EVAL_DIR}/${userId}_evaluated.csv`;
    const connPath = `${EVAL_DIR}/${userId}_conn.csv`;
    const statusPath = `${EVAL_DIR}/${userId}_status.csv`;

    console.log("I reading csvs (evaluated, conn, status)");
    onLog?.({ type: 'stage', message: 'Reading evaluation CSV files' });
    const { stdout: csvContent } = await execViaConn(conn, `cat ${csvPath} 2>/dev/null || true`);
    const { stdout: connCsvContent } = await execViaConn(conn, `cat ${connPath} 2>/dev/null || true`);
    const { stdout: statusCsvContent } = await execViaConn(conn, `cat ${statusPath} 2>/dev/null || true`);

    console.log("J csv read");
    const communicationResults = parseEvaluatedCsv(csvContent, userId);
    const connResults = parseConnCsv(connCsvContent);
    const statusResults = parseStatusCsv(statusCsvContent);
    console.log("K parsing");
    const results = toApiResults(communicationResults);

    console.log("L saving mongodb");
    const assignment = moduleId
      ? await LabAssignment.findOne({
          activeModule: moduleId,
          status: 'active',
          $or: [
            { endsAt: null },
            { endsAt: { $gt: new Date() } },
          ],
        }).lean()
      : null;
    const runDoc = await EvaluationRun.create({
      userId,
      studentName,
      sessionId,
      moduleId,
      questionId,
      questionKey,
      runType,
      tagPaths,
      sourceFiles,
      communicationResults,
      connResults,
      statusResults,
      rawCsv: csvContent,
      stdout,
      stderr,
      exitCode,
      slotKey: assignment?.slotKey || getCurrentSlotKey(),
    });

    console.log("M returning");
    return {
      runId: runDoc._id,
      results,
      communicationResults,
      connResults,
      statusResults,
      stdout,
      stderr,
      exitCode,
    };
  } catch (err) {
    // A genuine failure here might mean the connection itself is bad
    // (container restarted mid-run, etc.) — evict it so the next attempt
    // gets a fresh connection instead of retrying against a dead one.
    evictPooledConnection(`networklab:${session.sshPort}`);
    throw err;
  }
}




/**
 * Runs the evaluation workflow: saves code, copies scripts, runs evaluation, fetches result CSVs.
 */
export async function runEvaluation(userId, questionId, serverCode, clientCode) {
  // * accept arrays for server and client files and update evaluation command to use the files from arrays *
  try {
    // Create or get container/session
    const { containerName } = await createContainerForUser(userId);

    // Save server and client code files
    await saveFileToContainer({ userId, filePath: '/home/labuser/evaluation/nserver.c', code: serverCode });
    await saveFileToContainer({ userId, filePath: '/home/labuser/evaluation/nclient.c', code: clientCode });

    // Copy evaluation scripts (kmam) to /home/labuser/kmam
    const localEvalpath = path.resolve(__dirname, '../../kmam');
    const remoteEvalpath = '/home/labuser/kmam';
    await execSSH(userId, `mkdir -p ${remoteEvalpath}`);
    
    // Recursively upload all files in kmam (simple implementation: upload each file)
    const files = fs.readdirSync(localEvalpath);
    for (const file of files) {
      const localFile = path.join(localEvalpath, file);
      const remoteFile = `${remoteEvalpath}/${file}`;
      if (fs.statSync(localFile).isFile()) {
        await uploadLocalFile(userId, localFile, remoteFile);
      }
      // to support subdirectories, add recursive logic here
    }

    // Run evaluation script (nice.sh)
    // not sure about how ordering of arguments is going to be done
    const evalCmd = `cd ${remoteEvalpath} && ./nice.sh "nserver.c" "nclient.c nclient.c nclient.c"`; 

    const { stdout, stderr } = await execSSH(userId, evalCmd);
    console.log(`Evaluation stdout:`, stdout);
    if (stderr) console.error(`Evaluation stderr:`, stderr);

    // Read result files
    const evaluatedCsv = await readFileFromContainer(userId, `${remoteEvalpath}/${userId}_evaluated.csv`);
    const connCsv = await readFileFromContainer(userId, `${remoteEvalpath}/${userId}_conn.csv`);
    const statusCsv = await readFileFromContainer(userId, `${remoteEvalpath}/${userId}_status.csv`);

    return {
      evaluated: evaluatedCsv,
      conn: connCsv,
      status: statusCsv
    };
  } catch (error) {
    console.error(`Error running evaluation for user ${userId}:`, error);
    throw error;
  }
}
// Helper: Read file content from container via SFTP
async function readFileFromContainer(userId, remotePath, attempt = 1) {
  let conn;
  try {
    conn = await createSSHConnection(userId);
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          return reject(err);
        }
        let data = '';
        const stream = sftp.createReadStream(remotePath);
        stream.on('data', chunk => { data += chunk.toString(); });
        stream.on('end', () => {
          closeSftp(sftp);
          resolve(data);
        });
        stream.on('error', err => {
          closeSftp(sftp);
          reject(err);
        });
      });
    });
  } catch (err) {
    if (conn?.__poolKey && isChannelOpenFailure(err) && attempt < 3) {
      console.warn(`[SFTP] Channel open failed for ${conn.__poolKey}; evicting pooled connection and retrying read (${attempt}/2).`);
      evictPooledConnection(conn.__poolKey);
      await wait(150 * attempt);
      return readFileFromContainer(userId, remotePath, attempt + 1);
    }
    throw err;
  }
}
