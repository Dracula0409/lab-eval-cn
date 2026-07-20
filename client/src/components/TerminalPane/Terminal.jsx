import { useEffect, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import axios from 'axios';
import { API_BASE, WS_BASE } from '../../config';

const TerminalComponent = ({
  isVisible,
  isTermVisible,
  terminalId,
  sessionId = '',
  onSessionEnd,
  initialBuffer = [], 
  onData,
  setCurrentWorkingDir
}) => {
  const terminalRef = useRef(null);
  const wsRef = useRef(null);
  const xterm = useRef(null);
  const commandBufferRef = useRef('');
  const fitAddon = useRef(null);
  const inputReadyRef = useRef(false);
  const cwdListenerRef = useRef(null);
  const timeoutRef = useRef(null);
  const lastSentDataRef = useRef('');
  const sessionEnded = useRef(false);
  const isClosedManuallyRef = useRef(false);

  const wsURL = `${WS_BASE}/ws/ssh?terminalId=${encodeURIComponent(terminalId)}&sessionId=${encodeURIComponent(sessionId)}`;

  //Track current Working directory
  const requestCurrentWorkingDir = () => {
    if (!xterm.current) return;

    const buffer = xterm.current.buffer.active;
    let lastLineText = '';

    // Look backwards in buffer to find last non-empty line
    for (let i = buffer.length - 1; i >= 0; i--) {
      const line = buffer.getLine(i);
      if (!line) continue;

      console.log(line);

      const text = line.translateToString(true).trim();
      if (text) {
        lastLineText = text;
        console.log(lastLineText);
        break;
      }
    }

    if (!lastLineText) {
      console.log('[CWD] No non-empty line found in terminal buffer');
      return;
    }

    const colonIndex = lastLineText.indexOf(':');
    const dollarIndex = lastLineText.lastIndexOf('$');
    let cwd;

    if (colonIndex !== -1 && dollarIndex !== -1 && dollarIndex > colonIndex) {
      cwd = lastLineText.slice(colonIndex + 1, dollarIndex).trim();
    }

    if (cwd) {
      const resolvedCWD = cwd.replace('~', '/home/labuser');
      setCurrentWorkingDir?.(terminalId, resolvedCWD);
    } else {
      console.log('[CWD] Prompt-like pattern not found in last line');
    }
  };

  // WebSocket connection effect - independent of visibility
  useEffect(() => {
    // Don't attempt to connect until we have a valid sessionId. If the
    // component mounts before the session is initialized, wait for the
    // prop to change and the effect will re-run.
    if (!sessionId) {
      return undefined;
    }
    let retryCount = 0;
    const maxRetries = 5;

    const connectWebSocket = () => {
      const ws = new WebSocket(wsURL);
      
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WS] Connected to terminal ${terminalId}`);
        retryCount = 0;
        setTimeout(requestCurrentWorkingDir, 500);
      };

      ws.onmessage = (event) => {
        let msg;
        try {
          msg = JSON.parse(event.data);
        } catch (err) {
          console.error("[WS] Failed to parse message:", event.data, err);
          return;
        }

        // Even if terminal is not visible, process message if xterm exists
        if (!xterm.current) return;

        try {
          if (msg.type === 'data') {
            const data = msg.data;

            xterm.current?.write(data);
            onData?.(data);
          } else if (msg.type === 'end') {
            sessionEnded.current = true;
            xterm.current.writeln("\r\n*** SSH session ended ***");
            xterm.current.blur();
            onSessionEnd?.();
          } else if (msg.type === 'error') {
            const message = msg.message || '';

            xterm.current?.writeln(`\r\n*** Error: ${message} ***`);

            // ✅ Detect SSH auth failure
            if (message.includes('All configured authentication methods failed')) {
              xterm.current?.writeln(`\r\n*** Retrying connection in 3 seconds... ***`);
              onData();
              setTimeout(() => {
                if (xterm.current) xterm.current.clear();
                  retryCount = 0;
                  connectWebSocket();
                }, 3000);
              }
            }
        } catch (err) {
          console.error("[WS] Terminal message handling failed:", err);
          if (xterm.current) {
            xterm.current.writeln("\r\n*** Terminal error occurred ***");
          }
        }
      };

      ws.onerror = (err) => {
        console.error("[WS] Error on terminal", terminalId, ":", err.message || "Unknown error");
      };

      ws.onclose = () => {
        if (!isClosedManuallyRef.current && retryCount < maxRetries && !sessionEnded.current) {
          const delay = Math.min(1000 * 2 ** retryCount, 10000);
          console.warn(`[WS] Disconnected from ${terminalId}, retrying in ${delay}ms`);
          if (xterm.current) {
            xterm.current.writeln(`\r\n*** Reconnecting in ${delay / 1000}s... ***`);
          }
          retryCount++;
          setTimeout(connectWebSocket, delay);
        } else if (!sessionEnded.current) {
          if (xterm.current) {
            xterm.current.writeln("\r\n*** Still waiting for server, retrying anyway... ***");
          }
          setTimeout(connectWebSocket, 3000); // ← Force reconnect even after maxRetries
        } else {
          console.log(`[WS] Gave up retrying for ${terminalId}`);
        }
      };
    };

    connectWebSocket();

    const onCloseSession = () => {
      try {
        isClosedManuallyRef.current = true;
        sessionEnded.current = true;
        if (wsRef.current) {
          try { wsRef.current.close(); } catch (_) {}
        }
        if (xterm.current) {
          xterm.current.writeln('\r\n*** Session closed by user ***');
          xterm.current.blur();
        }
      } catch (err) {
        console.error('Failed to close session cleanly:', err);
      }
    };

    window.addEventListener('close-session', onCloseSession);

    return () => {
      isClosedManuallyRef.current = true;
      try { window.removeEventListener('close-session', onCloseSession); } catch (_) {}
      wsRef.current?.close();
    };
  }, [terminalId, wsURL, onSessionEnd]);

  // Terminal UI effect - handles visibility changes
  useEffect(() => {
    if (!terminalRef.current) return;
    
    // If terminal exists but is invisible, just hide it - don't dispose it
    if (!isVisible) {
      if (terminalRef.current) {
        terminalRef.current.style.display = 'none';
      }
      return;
    }

    if (terminalRef.current) {
      terminalRef.current.style.display = 'block';
    }
    
    // Only create a new terminal if it doesn't exist
    if (!xterm.current) {
      try {
        const term = new Terminal({
          cursorBlink: true,
          scrollback: 1000,
          convertEol: true
        });

        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(terminalRef.current);
        // Replay any stored output for this terminal
        initialBuffer.forEach(chunk => term.write(chunk));
        fit.fit();
        term.scrollToBottom();
        term.focus();

        xterm.current = term;
        fitAddon.current = fit;

        // Attach input handler only for visible/active terminal
        const onDataHandler = (data) => {
          if (!inputReadyRef.current) return;

          if (!sessionEnded.current && wsRef.current?.readyState === WebSocket.OPEN) {
            try {
              wsRef.current.send(
                JSON.stringify({
                  type: 'input',
                  data,
                  terminalId
                })
              );

              // Append to command buffer unless it's Enter
              if (data === '\r' || data === '\n') {
                const commandOnly = commandBufferRef.current.trim();
                console.log("Current command:", commandOnly);

                if (commandOnly.startsWith('cd')) {
                  setTimeout(() => {
                    console.log('called');
                    requestCurrentWorkingDir();
                  }, 50);
                }

                commandBufferRef.current = ''; // Reset after Enter
              } else {
                commandBufferRef.current += data;
              }
            } catch (err) {
              console.error("[WS] Failed to send input:", err);
            }
          }
        };
        term.onData(onDataHandler);

        term.onResize(({ cols, rows }) => {
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(
              JSON.stringify({
                type: 'resize',
                cols,
                rows,
                terminalId
              })
            );
          }
        });

        // Observe container resize to auto-fit and keep cursor visible
        if (terminalRef.current) {
          const resizeObserver = new window.ResizeObserver(() => {
            fit.fit();
            term.scrollToBottom();
          });
          resizeObserver.observe(terminalRef.current);
          terminalRef.current._resizeObserver = resizeObserver;
        }
      } catch (err) {
        console.error("[Terminal] Failed to initialize terminal UI:", err);
      }
    } else if (isVisible) {
      // Terminal became visible: refit, clear old wrapping, replay buffer, and scroll
      xterm.current.focus();
      fitAddon.current?.fit();
      // Clear existing display and replay full buffer for correct wrapping
      xterm.current.clear();
      if (initialBuffer.length > 0) {
        const lastChunk = initialBuffer[initialBuffer.length - 1];
        if (lastChunk.endsWith('\r')) {
          initialBuffer[initialBuffer.length - 1] = lastChunk.slice(0, -1);
        }
      }
      initialBuffer.forEach(chunk => xterm.current.write(chunk));
      xterm.current.scrollToBottom();
      requestCurrentWorkingDir(); // Track working dir
    } 
  }, [isVisible, terminalId]);

  // cleanup effect that runs on unmount only
  useEffect(() => {
    return () => {
      if (xterm.current) {
        xterm.current.dispose();
        xterm.current = null;
      }

      if (terminalRef.current?._resizeObserver) {
        terminalRef.current._resizeObserver.disconnect();
        delete terminalRef.current._resizeObserver;
      }

      if (cwdListenerRef.current && wsRef.current) {
        wsRef.current.removeEventListener('message', cwdListenerRef.current);
        cwdListenerRef.current = null;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const waitForTerminalReady = () => new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        if (xterm.current && wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(timer);
          resolve();
          return;
        }
        attempts += 1;
        if (attempts > 40) {
          clearInterval(timer);
          reject(new Error('Terminal connection was not ready.'));
        }
      }, 250);
    });

    const executeRun = async (detail = {}) => {
      const {
        code,
        filename,
        language,
        filePath,
        sessionId: runSessionId,
      } = detail;

      if (!code || !filename) return;

      try {
        await waitForTerminalReady();
      } catch (err) {
        xterm.current?.writeln(`\r\n*** ${err.message} ***`);
        return;
      }

      try {
        const savePayload = {
          filename,
          filePath: filePath || filename,
          code,
          sessionId: runSessionId || sessionId,
        };
        
        await axios.post(`${API_BASE}/api/save-file`, savePayload);
      } catch (err) {
        console.error('[Terminal] Save error:', err);
        xterm.current?.writeln(`\r\n*** Error saving file: ${err?.response?.data?.error || err.message} ***`);
        return;
      }

      const runFile = () => {
        setTimeout(() => {
          let runCmd = '';
          const justFilename = filePath;
          
          if (language === 'java') {
            const directory = justFilename.includes('/')
              ? justFilename.slice(0, justFilename.lastIndexOf('/'))
              : '.';
            const className = justFilename
              .slice(justFilename.lastIndexOf('/') + 1)
              .replace(/\.java$/, '');
            runCmd = `javac ${justFilename} && java -cp ${directory} ${className}`;
          } else if (language === 'c') {
            const exe = justFilename.replace(/\.c$/, '');
            runCmd = `gcc ${justFilename} -o ${exe} && ${exe}`;
          }
          if (runCmd) {
            wsRef.current.send(JSON.stringify({ type: 'input', data: `${runCmd}\n`, terminalId }));
          }
        }, 200);
      };

      const isServerFile = /bind\(|listen\(|accept\(/.test(code);
      if (isServerFile) {
        setTimeout(runFile, 200);
      } else {
        runFile();
      }
    };

    const onRunFile = async (e) => {
      const targetTerminalId = e.detail?.targetTerminalId;
      if (targetTerminalId && targetTerminalId !== terminalId) return;
      if (!targetTerminalId && !isVisible) return;
      await executeRun(e.detail);
   };
   window.addEventListener('run-file-in-terminal', onRunFile);

   const onStopAll = () => {
     if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
     const stopCmd = `killall -9 server client 2>/dev/null || true\n`;
     wsRef.current.send(JSON.stringify({ type: 'input', data: stopCmd, terminalId }));
   };  
   window.addEventListener('stop-all-processes', onStopAll);

    return () => {
      window.removeEventListener('run-file-in-terminal', onRunFile);
      window.removeEventListener('stop-all-processes', onStopAll);
    };
  }, [isVisible, sessionId, terminalId]);

  // Autofocus and refit when terminal becomes visible (e.g. from hidden state)
  useEffect(() => {
    if ((isTermVisible && isVisible) && xterm.current) {
      setTimeout(() => {
        fitAddon.current?.fit();
        xterm.current.refresh(0, xterm.current.buffer.active.length - 1);
        xterm.current.focus();
      }, 100); // slight delay ensures DOM is painted
    }
  }, [isTermVisible]);

  useEffect(() => {
    if ((isTermVisible && isVisible) && wsRef.current?.readyState === WebSocket.OPEN) {
      setTimeout(() => {
        requestCurrentWorkingDir();
      }, 50); // small delay to ensure shell readiness
    }

    // Delay user input by 100ms
    inputReadyRef.current = false;
    setTimeout(() => {
      inputReadyRef.current = true;
    }, 500);
  }, [isTermVisible, isVisible]);

  return (
    <div
      ref={terminalRef}
      style={{
        display: isVisible ? "block" : "none",
        width: "100%",
        height: "100%",
        backgroundColor: "black",
        overflow: "hidden"
      }}
    />
  );
};

export default TerminalComponent;
