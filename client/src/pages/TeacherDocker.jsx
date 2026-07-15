import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';
import {
  ArrowPathIcon,
  CubeIcon,
  ServerStackIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

function StateBadge({ state }) {
  const running = state === 'running';
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
      running ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
    }`}>
      {state || 'unknown'}
    </span>
  );
}

export default function TeacherDocker() {
  const navigate = useNavigate();
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    axios.get(`${API_BASE}/api/auth/me`, { params: { role: 'teacher' } })
      .then((res) => {
        if (!['faculty', 'admin'].includes(res.data.user.role)) navigate('/teacher-login');
      })
      .catch(() => navigate('/teacher-login'));
  }, [navigate]);

  const handleLogout = async () => {
    await axios.post(`${API_BASE}/api/auth/logout`, { role: 'teacher' }).catch(() => {});
    navigate('/teacher-login');
  };

  const loadContainers = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const res = await axios.get(`${API_BASE}/api/docker/containers`);
      setContainers(res.data || []);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to load Docker containers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  const stats = useMemo(() => {
    const running = containers.filter((c) => c.state === 'running').length;
    const lab = containers.filter((c) => c.isLabContainer).length;
    const stoppedLab = containers.filter((c) => c.isLabContainer && c.state !== 'running').length;
    return { total: containers.length, running, lab, stoppedLab };
  }, [containers]);

  const removeContainer = async (container) => {
    const force = container.state === 'running';
    const warning = force
      ? `Container "${container.name}" is running. Force delete it?`
      : `Delete container "${container.name}"?`;
    if (!confirm(warning)) return;

    setLoading(true);
    try {
      await axios.delete(`${API_BASE}/api/docker/containers/${container.id}`, {
        params: { force: force ? '1' : undefined },
      });
      setMessage(`Removed ${container.name}.`);
      await loadContainers();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to remove container.');
    } finally {
      setLoading(false);
    }
  };

  const pruneLabContainers = async () => {
    if (!confirm('Delete all stopped lab_exam containers? Running containers will be kept.')) return;

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/docker/prune-lab-containers`);
      setMessage(`Removed ${res.data.removedCount || 0} stopped lab container(s).`);
      await loadContainers();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to prune lab containers.');
    } finally {
      setLoading(false);
    }
  };

  const renderPorts = (ports = []) => {
    const mapped = ports
      .filter((port) => port.PublicPort)
      .map((port) => `${port.PublicPort}->${port.PrivatePort}/${port.Type}`);
    return mapped.length ? mapped.join(', ') : '-';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Docker Manager"
        isTeacherPage={true}
        backLink="/teacher-dashboard"
        backText="Back to Dashboard"
        onLogout={handleLogout}
      />

      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.total}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Running</p>
              <p className="text-2xl font-semibold text-green-700">{stats.running}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Lab Containers</p>
              <p className="text-2xl font-semibold text-indigo-700">{stats.lab}</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <p className="text-xs text-gray-500">Stopped Lab</p>
              <p className="text-2xl font-semibold text-gray-700">{stats.stoppedLab}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ServerStackIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="text-base font-semibold text-gray-900">Containers</h2>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadContainers}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
                <button
                  onClick={pruneLabContainers}
                  disabled={loading || stats.stoppedLab === 0}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-red-600 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete Stopped Lab
                </button>
              </div>
            </div>

            {message && (
              <div className="mx-4 mt-4 p-3 rounded-md bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">
                {message}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Image</th>
                    <th className="text-left px-4 py-3">State</th>
                    <th className="text-left px-4 py-3">Ports</th>
                    <th className="text-left px-4 py-3">Created</th>
                    <th className="text-left px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {containers.map((container) => (
                    <tr key={container.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <CubeIcon className="w-4 h-4 text-gray-400" />
                          <div>
                            <p className="font-medium text-gray-900">{container.name}</p>
                            <p className="text-xs text-gray-400">{container.shortId}</p>
                          </div>
                          {container.isLabContainer && (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">lab</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{container.image}</td>
                      <td className="px-4 py-3">
                        <StateBadge state={container.state} />
                        <p className="text-xs text-gray-400 mt-1">{container.status}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{renderPorts(container.ports)}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {container.created ? new Date(container.created).toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => removeContainer(container)}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-red-700 hover:text-red-900 disabled:opacity-50"
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!containers.length && (
                    <tr>
                      <td className="px-4 py-10 text-center text-gray-500" colSpan="6">
                        {loading ? 'Loading containers...' : 'No containers found.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
