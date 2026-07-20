/**
 * Lightweight SSH connection pool.
 *
 * Problem this solves: previously, every autosave (`/api/save-file`, fired
 * on a debounce for every edit a student makes) opened a brand-new ssh2
 * Client connection — full TCP handshake + SSH key exchange + auth — and
 * then immediately closed it. At 300 concurrent students typing, that's
 * potentially hundreds of fresh SSH handshakes per minute, which is real
 * CPU cost (crypto handshake) on both the Node process and every
 * container's sshd, and a real source of file-descriptor churn. It scales
 * badly well before RAM or CPU headroom runs out.
 *
 * Fix: keep one connection alive per (role, target) pair — e.g. one
 * "labuser" connection per active student session, one "networklab"
 * connection per port used for evaluation — and reuse it across calls.
 * ssh2 multiplexes exec/sftp channels over a single connection just fine,
 * so this is safe to do without callers needing to change how they use
 * the returned Client.
 *
 * Lifecycle:
 *  - First request for a key creates the connection and caches the
 *    in-flight promise immediately, so concurrent callers (e.g. two
 *    autosaves racing) await the same connection attempt instead of
 *    opening duplicates.
 *  - A background reaper closes and evicts connections that have been
 *    idle longer than IDLE_TIMEOUT_MS, so a student who stops working
 *    doesn't hold a socket/file-descriptor open forever.
 *  - If the underlying transport errors or closes on its own (container
 *    restarted, network blip, etc.), the entry is evicted immediately so
 *    the next caller transparently gets a fresh connection instead of a
 *    dead one.
 */

const IDLE_TIMEOUT_MS = 10 * 60 * 1000; // close connections idle > 10 min
const REAP_INTERVAL_MS = 60 * 1000; // sweep once a minute

// key -> { connPromise, conn, lastUsedAt }
const pool = new Map();

/**
 * Get (or lazily create) a pooled, ready-to-use connection for `key`.
 * `connectFn` should return a Promise that resolves to a connected client
 * exposing `.on('error'|'close', ...)` and `.end()` (an ssh2 `Client`).
 */
export async function getPooledConnection(key, connectFn) {
  const existing = pool.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.connPromise;
  }

  const entry = { connPromise: null, conn: null, lastUsedAt: Date.now() };
  pool.set(key, entry);

  entry.connPromise = connectFn()
    .then((conn) => {
      entry.conn = conn;

      const evict = (reason) => (err) => {
        console.log(`[ssh-pool] evicting "${key}" (${reason}${err ? `: ${err.message}` : ''})`);
        if (pool.get(key) === entry) pool.delete(key);
        try {
          conn.end();
        } catch (_) {
          /* already closed */
        }
      };

      conn.on('error', evict('error'));
      conn.on('close', evict('closed'));

      return conn;
    })
    .catch((err) => {
      // Connection attempt itself failed — don't leave a broken promise
      // cached, so the very next call gets a clean retry.
      if (pool.get(key) === entry) pool.delete(key);
      throw err;
    });

  return entry.connPromise;
}

/** Force-evict and close a pooled connection (e.g. after a caller decides
 * it's unhealthy for reasons the transport itself didn't surface). */
export function evictPooledConnection(key) {
  const entry = pool.get(key);
  if (!entry) return;
  pool.delete(key);
  entry.conn?.end?.();
}

function reapIdleConnections() {
  const now = Date.now();
  for (const [key, entry] of pool.entries()) {
    if (now - entry.lastUsedAt > IDLE_TIMEOUT_MS) {
      console.log(`[ssh-pool] closing idle connection "${key}"`);
      pool.delete(key);
      entry.conn?.end?.();
    }
  }
}

let reapTimer = null;
export function startSSHPoolReaper() {
  if (reapTimer) return reapTimer;
  reapTimer = setInterval(reapIdleConnections, REAP_INTERVAL_MS);
  return reapTimer;
}

export function getSSHPoolStats() {
  return Array.from(pool.entries()).map(([key, entry]) => ({
    key,
    connected: !!entry.conn,
    idleMs: Date.now() - entry.lastUsedAt,
  }));
}