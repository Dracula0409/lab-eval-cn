import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';
import fs from 'fs';
import url from 'url';
import dotenv from 'dotenv';
import Session from '../models/Session.js';
import { createContainerForUser, docker } from '../docker/dockerManager.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { Question } from '../models/Question.js';
import EvaluationRun from '../models/EvaluationRun.js';
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

dotenv.config();

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sessions = {}; // terminalId => { conn, stream, ws }

async function createSSHConnection(userId, sshPortOverride = null) {
  const session = await Session.findOne({ userId }).sort({ createdAt: -1 });
  console.log("[SSH] Session found:", session);
  if (!session && !sshPortOverride) throw new Error('No active session for user');
  const sshPort = sshPortOverride || session.sshPort;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      resolve(conn);
    })
    .on('error', (err) => {
      console.error('[SSH] Connection error:', err);
      reject(err);
    })
    .connect({
      host: '127.0.0.1',
      port: sshPort,
      username: 'labuser',                          
      privateKey: fs.readFileSync('./labuser_key'),   
      readyTimeout: 10000
    });
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

  wss.on('connection', async (ws) => {
    const { terminalId = 'main', userId: queryUserId } = ws.query;

    // No real JWT auth yet — the client sends the logged-in student's ID
    // directly. Fall back to the test user only if none was provided.
    const userId = queryUserId;

    try {
      const { sshPort, sessionId } = await ensureSessionContainer(userId);

      let conn;
      
      try {
        conn = await createSSHConnection(userId, sshPort);

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
          sessions[terminalId] = { conn, stream, ws };

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
            delete sessions[terminalId];

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

export async function ensureSessionContainer(userId) {
  const { containerName, sshPort, sessionId } = await createContainerForUser(userId);

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
async function uploadFileContent(userId, content, remotePath) {
  let conn;
  try {
    conn = await createSSHConnection(userId);
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        ensureDirectoryExists(sftp, remotePath).then(() => {
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on('close', () => {
            console.log(`[SFTP] File content written to ${remotePath}`);
            conn.end();
            resolve();
          });
          writeStream.on('error', (err) => {
            console.error('[SFTP] WriteStream error:', err);
            conn.end();
            reject(err);
          });
          writeStream.write(content);
          writeStream.end();
        }).catch(err => {
          conn.end();
          reject(err);
        });
      });
    });
  } catch (err) {
    if (conn) conn.end();
    throw err;
  }
}

/**
 * Save file to user's container via SFTP
 */
export async function saveFileToContainer({ userId, filePath, code }) {
  // Normalize path
  const remotePath = filePath;
  return uploadFileContent(userId, code, remotePath);
}

/**
 * Upload a local file to the container
 */
async function uploadLocalFile(userId, localPath, remotePath) {
  let conn;
  try {
    conn = await createSSHConnection(userId);
    
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        
        ensureDirectoryExists(sftp, remotePath).then(() => {
          sftp.fastPut(localPath, remotePath, (err) => {
            conn.end();
            if (err) {
              console.error('[SFTP] Upload error:', err);
              reject(err);
            } else {
              console.log(`[SFTP] File uploaded: ${localPath} → ${remotePath}`);
              resolve();
            }
          });
        }).catch(err => {
          conn.end();
          reject(err);
        });
      });
    });
  } catch (err) {
    if (conn) conn.end();
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
          conn.end();
          return reject(err);
        }
        
        stream.on('data', (data) => {
          stdout += data.toString('utf8');
        });
        
        stream.stderr.on('data', (data) => {
          stderr += data.toString('utf8');
        });
        
        stream.on('close', (code) => {
          conn.end();
          resolve({ stdout, stderr, exitCode: code });
        });
      });
    });
  } catch (err) {
    if (conn) conn.end();
    throw err;
  }
}

async function createNetworklabConnection(sshPort) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn
      .on('ready', () => resolve(conn))
      .on('error', reject)
      .connect({
        host: '127.0.0.1',
        port: sshPort,
        username: 'networklab',
        privateKey: fs.readFileSync('./networklab_key'),
        readyTimeout: 10000,
      });
  });
}

function uploadStringViaConn(conn, remotePath, content) {
  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) return reject(err);
      const ws = sftp.createWriteStream(remotePath);
      ws.on('close', resolve);
      ws.on('error', reject);
      ws.write(content ?? '');
      ws.end();
    });
  });
}

function execViaConn(conn, command) {
  console.log("EXEC START:", command);

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
        stdout += d.toString();
      });

      stream.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      stream.on('exit', (code) => {
        console.log("EXIT:", code);
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
}) {
  console.log("========== ENTERED runAndEvaluate ==========");
  await ensureSessionContainer(userId);
  const session = await Session.findOne({ userId }).sort({ createdAt: -1 });
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
    await uploadStringViaConn(conn, `${EVAL_DIR}/nice.sh`, niceScript);
    console.log("B writing testcase");
    await uploadStringViaConn(conn, `${EVAL_DIR}/testcases.json`, testcasesJson);
    console.log("C upload input");
    await uploadStringViaConn(conn, `${EVAL_DIR}/input`, inputContent);
    console.log("D upload student");
    await uploadStringViaConn(conn, `${EVAL_DIR}/student.sh`, studentSh);

    console.log("E creating symlinks");
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

    console.log("F chmod");
    await execViaConn(conn, `chmod +x ${EVAL_DIR}/nice.sh`);

    console.log("G running nice.sh");
    const { stdout, stderr, exitCode } = await execViaConn(
      conn,
      `cd ${EVAL_DIR} && bash nice.sh ${args}; echo "__DONE__"; exit`
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
      slotKey: getCurrentSlotKey(),
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
  } finally {
    conn.end();
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
async function readFileFromContainer(userId, remotePath) {
  let conn;
  try {
    conn = await createSSHConnection(userId);
    return new Promise((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) {
          conn.end();
          return reject(err);
        }
        let data = '';
        const stream = sftp.createReadStream(remotePath);
        stream.on('data', chunk => { data += chunk.toString(); });
        stream.on('end', () => { conn.end(); resolve(data); });
        stream.on('error', err => { conn.end(); reject(err); });
      });
    });
  } catch (err) {
    if (conn) conn.end();
    throw err;
  }
}