import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';
import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const CONN_LABELS = ['Listen', 'Established', 'Closed'];

function VerdictPill({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const isCorrect = value === 'Correct';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {value}
    </span>
  );
}

export default function TeacherPerformance() {
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [slots, setSlots] = useState([]);
  const [modules, setModules] = useState([]);

  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  const [tableSearch, setTableSearch] = useState('');
  const [classReport, setClassReport] = useState(null);
  const [isClassLoading, setIsClassLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
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

  const loadFilters = useCallback(async () => {
    try {
      const [batchesRes, slotsRes, modulesRes] = await Promise.all([
        axios.get(`${API_BASE}/api/performance/batches`),
        axios.get(`${API_BASE}/api/performance/slots`),
        axios.get(`${API_BASE}/api/modules`),
      ]);
      setBatches(batchesRes.data || []);
      setSlots(slotsRes.data || []);
      setModules(modulesRes.data || []);
    } catch (err) {
      console.error('Error loading performance filters:', err);
      setMessage('Failed to load batches/slots/modules.');
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  const filtersReady = Boolean(selectedBatch && selectedModuleId && selectedSlot);

  useEffect(() => {
    setTableSearch('');

    if (!filtersReady) {
      setClassReport(null);
      return;
    }

    let cancelled = false;
    setIsClassLoading(true);
    setMessage('');
    axios.get(`${API_BASE}/api/performance/class-report`, {
      params: {
        batch: selectedBatch,
        moduleId: selectedModuleId,
        slot: selectedSlot,
      },
    })
      .then((res) => {
        if (!cancelled) setClassReport(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setClassReport(null);
          setMessage(err.response?.data?.error || 'Failed to load class report.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsClassLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBatch, selectedModuleId, selectedSlot, filtersReady]);

  // Filters the already-fetched pool of students for this session/batch/module
  // — no extra request per keystroke, and nothing to search until that pool exists.
  const visibleRows = useMemo(() => {
    const rows = classReport?.rows || [];
    const term = tableSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => (
      row.student.name?.toLowerCase().includes(term)
      || row.student.user_id?.toLowerCase().includes(term)
      || row.student.roll_number?.toLowerCase().includes(term)
    ));
  }, [classReport, tableSearch]);

  const handleDownloadCsv = async () => {
    if (!selectedBatch) {
      setMessage('Please select a class/batch first.');
      return;
    }
    if (!selectedModuleId) {
      setMessage('Please select a module first.');
      return;
    }

    setIsDownloading(true);
    setMessage('');

    try {
      const res = await axios.get(`${API_BASE}/api/performance/class-csv`, {
        params: { batch: selectedBatch, moduleId: selectedModuleId, slot: selectedSlot || undefined },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const slotPart = selectedSlot || 'all-slots';
      link.setAttribute('download', `performance_${selectedBatch}_${slotPart}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading CSV:', err);
      setMessage(
        err.response?.data?.error
          ? err.response.data.error
          : 'Failed to download the class report.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const summary = classReport?.summary;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Student Performances"
        isTeacherPage={true}
        backLink="/teacher-dashboard"
        backText="Back to Dashboard"
        onLogout={handleLogout}
      />

      <div className="container mx-auto py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Filters — session/batch/module must be picked before anything
              else on the page becomes usable. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Session &amp; Class</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Session (slot)
                </label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All sessions</option>
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Class / Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select batch</option>
                  {batches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Module</label>
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select module</option>
                  {modules.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Search — sits right below the filters, and only searches the
              pool of students the filters above just fetched. Disabled until
              that pool exists so it can't be mistaken for a global lookup. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="relative">
              <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                disabled={!filtersReady}
                placeholder={filtersReady ? 'Search this session by name, roll number, or student ID…' : 'Select session, batch, and module above to search'}
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
            {filtersReady && classReport?.rows && (
              <p className="mt-2 text-xs text-gray-500">
                Showing {visibleRows.length} of {classReport.rows.length} students
              </p>
            )}
          </div>

          {message && (
            <div className="p-3 rounded-md bg-yellow-50 text-yellow-800 border-l-4 border-yellow-400 text-sm">
              {message}
            </div>
          )}

          {/* Session status boxes — quick monitoring snapshot for the
              currently selected batch/module/slot (covers the whole batch,
              independent of the search filter above). */}
          {summary && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <ChartBarIcon className="w-4 h-4 text-indigo-500" />
                Session Status
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Students in Batch</p>
                  <p className="text-2xl font-semibold text-gray-900">{summary.totalStudents}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Not Started</p>
                  <p className="text-2xl font-semibold text-red-700">{summary.studentsNotStarted}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Completed All Questions</p>
                  <p className="text-2xl font-semibold text-green-700">{summary.studentsCompletedAll}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-xs text-gray-500">Total Questions</p>
                  <p className="text-2xl font-semibold text-indigo-700">{summary.totalQuestions}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    Students by questions fully solved
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {summary.completionDistribution.map((count, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs text-indigo-700"
                      >
                        {i}/{summary.totalQuestions} solved: <span className="font-semibold">{count}</span>
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Per-question progress</p>
                  <div className="space-y-1">
                    {summary.perQuestion.map((q) => (
                      <div key={q.questionId} className="flex items-center justify-between text-xs text-gray-600 bg-gray-50 rounded-md px-3 py-1.5">
                        <span className="truncate pr-2">{q.questionKey}</span>
                        <span className="whitespace-nowrap">
                          {q.correctCount} solved · {q.attemptedCount} attempted / {summary.totalStudents}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Class Report</h2>
            {!filtersReady ? (
              <p className="text-sm text-gray-500">Select session, batch, and module to show all student reports.</p>
            ) : isClassLoading ? (
              <p className="text-sm text-gray-500">Loading class report...</p>
            ) : visibleRows.length ? (
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Student</th>
                      {visibleRows[0]?.questions?.map((q) => (
                        <th key={q.questionId} className="text-left px-3 py-2">
                          {q.questionKey || q.title || 'Question'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRows.map((row) => (
                      <tr key={row.student.user_id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.student.roll_number || row.student.user_id}</p>
                          <p className="text-xs text-gray-500">{row.student.name}</p>
                        </td>
                        {row.questions.map((q) => (
                          <td key={q.questionId} className="px-3 py-2 align-top">
                            {q.attempted ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {q.tcVerdicts.map((value, index) => (
                                    <span key={index} className="text-xs">
                                      TC{index + 1}: <VerdictPill value={value} />
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500">Persistence: {q.persistence || '-'}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Not attempted</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                {classReport?.rows?.length ? 'No students match your search.' : 'No students found for this selection.'}
              </p>
            )}
          </div>

          {/* Collective CSV download */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Collective Class Report
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Downloads one CSV row per student in the selected batch, with each
              question's test-case verdicts, persistence, and connection checks
              laid out as columns — matching the per-student evaluated/status/conn
              CSVs produced during evaluation.
            </p>
            <button
              onClick={handleDownloadCsv}
              disabled={isDownloading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              {isDownloading ? 'Preparing CSV…' : 'Download Class CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}