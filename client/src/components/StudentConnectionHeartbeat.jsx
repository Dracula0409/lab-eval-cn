import { useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../config';

const DEVICE_KEY = 'cnlab-device-id';

// A browser-held device label is only used to distinguish two local browser
// sessions. The server remains authoritative for IP and session enforcement.
export function getStudentDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_KEY);
  if (!deviceId) {
    // crypto.randomUUID is restricted to secure browser contexts by some
    // browsers. localhost is treated as secure, but a LAN HTTP address is
    // not, so use a non-security-sensitive fallback there. The server-issued
    // session ID and IP check remain the actual security controls.
    deviceId = globalThis.crypto?.randomUUID?.()
      || `browser-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, deviceId);
  }
  return deviceId;
}

export default function StudentConnectionHeartbeat() {
  const navigate = useNavigate();

  useEffect(() => {
    const heartbeat = async () => {
      try {
        await axios.post(`${API_BASE}/api/auth/heartbeat`);
      } catch (error) {
        if ([401, 403].includes(error.response?.status)) {
          axios.post(`${API_BASE}/api/auth/logout`, { role: 'student' }).catch(() => {});
          navigate('/login', { replace: true, state: { sessionEnded: true } });
        }
      }
    };

    heartbeat();
    const timer = window.setInterval(heartbeat, 25_000);
    return () => window.clearInterval(timer);
  }, [navigate]);

  return null;
}
