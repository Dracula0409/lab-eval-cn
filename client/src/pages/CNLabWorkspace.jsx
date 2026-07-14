import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Panel, PanelGroup } from 'react-resizable-panels';
import axios from 'axios';
import Header from '../components/Header';
import EditorPane from '../components/EditorPane';
import QuestionPane from '../components/QuestionPane';
import TerminalPane from '../components/TerminalPane';
import FileSelectorModal from '../components/EditorPane/fileSelectorModal';
import ResizeHandle from '../components/shared/ResizeHandle';
import { useIsMobile } from '../components/utils/useIsMobile';
import { summarizeResults } from '../components/utils/testcaseHelper';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import { API_BASE } from '../config';

// Create a hardcoded session ID for testing
const TEST_SESSION_ID = "lab_session_" + Math.random().toString(36).substring(2, 15);

// Save the session ID to localStorage if not already present
if (!localStorage.getItem('labSessionId')) {
  localStorage.setItem('labSessionId', TEST_SESSION_ID);
  console.log('Created test lab session ID:', TEST_SESSION_ID);
}

// Helper function to get current lab session ID
const getCurrentLabSession = () => localStorage.getItem('labSessionId') || TEST_SESSION_ID;
const LABUSER_HOME = '/home/labuser';


const MobileTabs = ({ activeTab, setActiveTab, tabs }) => (
  <div className="flex bg-white border-b border-gray-200 shadow-sm">
    {tabs.map(tab => (
      <button
        key={tab.id}
        className={`flex-1 py-3 px-4 text-sm font-medium transition-all duration-200 ${
          activeTab === tab.id 
            ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600' 
            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
        }`}
        onClick={() => setActiveTab(tab.id)}
      >
        <span className="flex items-center justify-center">
          {tab.icon && <tab.icon className="w-4 h-4 mr-2" />}
          {tab.label}
        </span>
      </button>
    ))}
  </div>
);

const EvaluationOverlay = ({ overlay, logBoxRef, onClose }) => {
  if (!overlay.open) return null;

  const ansiToHtml = (text) => {
    const escapeHtml = (value) => value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const colorMap = {
      30: '#111827',
      31: '#ff5f56',
      32: '#27c93f',
      33: '#ffbd2e',
      34: '#5e9cff',
      35: '#d670d6',
      36: '#56d4dd',
      37: '#f8f8f2',
      90: '#6b7280',
      91: '#ff7b72',
      92: '#7ee787',
      93: '#f2cc60',
      94: '#79c0ff',
      95: '#d2a8ff',
      96: '#a5f3fc',
      97: '#ffffff',
    };

    let html = '';
    let openSpan = false;
    const parts = escapeHtml(text).split(/(\x1b\[[0-9;]*m)/g);
    for (const part of parts) {
      const match = part.match(/^\x1b\[([0-9;]*)m$/);
      if (!match) {
        html += part;
        continue;
      }

      const codes = match[1].split(';').filter(Boolean).map(Number);
      if (openSpan) {
        html += '</span>';
        openSpan = false;
      }
      if (codes.length === 0 || codes.includes(0)) continue;

      const color = codes.map((code) => colorMap[code]).find(Boolean);
      const bold = codes.includes(1);
      if (color || bold) {
        html += `<span style="${color ? `color:${color};` : ''}${bold ? 'font-weight:700;' : ''}">`;
        openSpan = true;
      }
    }
    if (openSpan) html += '</span>';
    return html;
  };

  const logText = overlay.logs.join('');

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-[#101010] rounded-lg shadow-2xl border border-gray-700 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between bg-[#181818]">
          <div>
            <h2 className="text-sm font-semibold text-gray-100">{overlay.title}</h2>
            <p className="text-xs text-gray-400">
              {overlay.running ? 'Evaluation is running. Please wait.' : 'Evaluation complete.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={overlay.running}
            className="px-3 py-1.5 rounded-md text-sm font-medium bg-gray-800 text-gray-100 border border-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Close
          </button>
        </div>
        <pre
          ref={logBoxRef}
          className="h-96 overflow-auto bg-black text-[#f8f8f2] text-[13px] leading-5 p-4 whitespace-pre-wrap font-mono"
          style={{ fontFamily: 'Menlo, Monaco, Consolas, "Liberation Mono", monospace' }}
          dangerouslySetInnerHTML={{ __html: ansiToHtml(logText) }}
        />
      </div>
    </div>
  );
};


// Helper functions
const getCurrentUser = () => localStorage.getItem('studentId');
const getStudentName = () => localStorage.getItem('studentName') || getCurrentUser();
const getCurrentDateTime = () => {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace('T', ' ');
};

// Real-time module handling will be implemented with WebSockets


export default function CNLabWorkspace() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('question');
  const [language, setLanguage] = useState('c');
  const [showQuestion, setShowQuestion] = useState(true);
  const [showTerminal, setShowTerminal] = useState(false);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [files, setFiles] = useState([]);
  const [newFileCreated, setNewFileCreated] = useState(true);
  const [fileNo, setFileNo] = useState(1);
  const [tagToFileMap, setTagToFileMap] = useState({}); // Example: { 'server1': 'server_file.c', 'client2': 'client_impl.c' }
  const [currentWorkingDir, setCurrentWorkingDir] = useState('/home/labuser'); // Track current directory
  const [saveStatus, setSaveStatus] = useState('idle'); //track autosave status
  const [activeFileId, setActiveFileId] = useState('server');
  const [showFileModal, setShowFileModal] = useState(false);
  const [availableFiles, setAvailableFiles] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testCaseResults, setTestCaseResults] = useState({});
  const [questionPaneTab, setQuestionPaneTab] = useState('description');
  const [evalMessage, setEvalMessage] = useState(null);
  const [submissionRefreshTrigger, setSubmissionRefreshTrigger] = useState(0);
  const [attemptInfo, setAttemptInfo] = useState(null);
  const [evaluationOverlay, setEvaluationOverlay] = useState({
    open: false,
    title: '',
    running: false,
    logs: [],
  });
  const panelRef = useRef(null);
  const logBoxRef = useRef(null);
  const dirtyFileIdsRef = useRef(new Set());
  const fileHydrationRequestRef = useRef(0);
  const lastLoadedModuleIdRef = useRef(null);
  const autoSubmitStartedRef = useRef(false);
  // const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('isLoggedIn') !== 'true' || !getCurrentUser()) {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    console.log(currentWorkingDir);
  }, [currentWorkingDir]);

  // Load questions from the assigned module
  const [questions, setQuestions] = useState([]);
  const [moduleInfo, setModuleInfo] = useState(null);
  const [loadingQuestions, setLoadingQuestions] = useState(true);
  const [moduleError, setModuleError] = useState(null);
  
  useEffect(() => {
    const fetchModuleData = async () => {
      setLoadingQuestions(true);
      setModuleError(null);
      
      try {
        // Ask the server which module is assigned to THIS session, rather
        // than relying on localStorage (which only exists on whichever
        // browser the teacher happened to click "Send to Students" from).
        const sessionId = getCurrentLabSession();
        const userId = getCurrentUser();

        let moduleData = null;
        try {
          const currentModuleRes = await axios.get(
            `${API_BASE}/api/sessions/${sessionId}/current-module`,
            { params: { userId } }
          );
          moduleData = currentModuleRes.data;
        } catch (moduleLookupErr) {
          // 404 just means "no module assigned to this session yet" —
          // expected before a teacher has sent one.
          if (moduleLookupErr.response?.status !== 404) throw moduleLookupErr;
        }

        if (moduleData) {
          console.log('Loaded active module from server:', moduleData._id);

          // Set module info
          setModuleInfo({
            _id: moduleData._id,
            name: moduleData.name,
            description: moduleData.description,
            maxMarks: moduleData.maxMarks,
            time: moduleData.time || "Not specified",
            date: moduleData.date,
            durationMinutes: moduleData.assignment?.durationMinutes || moduleData.durationMinutes || 60,
            endsAt: moduleData.assignment?.endsAt || null,
            targetBatch: moduleData.assignment?.targetBatch || moduleData.targetBatch || '',
            sessionSlot: moduleData.assignment?.sessionSlot || moduleData.sessionSlot || ''
          });

          // Fetch questions for this module if not already included
          let questionsData = moduleData.questions;

          // If questions are just IDs, fetch the full question data
          if (moduleData.questions.length > 0 && typeof moduleData.questions[0] === 'string') {
            const questionsResponse = await axios.get(`${API_BASE}/api/modules/${moduleData._id}/questions`);
            questionsData = questionsResponse.data;
          }

          // Format questions for the question pane
          const formattedQuestions = questionsData.map(q => ({
            id: q._id,
            title: q.title,
            description: q.description,
            questionKey: q.questionKey || 'q1',
            files: q.files || [],
            testcases: q.testcases || {},
            input: q.input || '',
            evalScript: q.evalScript || '',
            maxMarks: q.maxMarks,
          }));

          setQuestions(formattedQuestions);
          lastLoadedModuleIdRef.current = moduleData._id;
          startOrRefreshAttempt(moduleData._id).catch((err) => {
            console.error('Failed to start/refresh test attempt:', err);
            setModuleError(err.response?.data?.error || 'Could not start your test timer.');
          });
        } else {
          // No module currently assigned (teacher hasn't sent one, or
          // explicitly cleared it) — give students an open editor instead
          // of canned demo content.
          console.log('No module assigned to this session, enabling free-coding mode');
          setModuleInfo({
            _id: "free_coding",
            name: "Free Coding",
            description: "No lab module has been assigned right now. Feel free to write and run any C program you'd like using the editor below.",
            maxMarks: null,
            time: null,
            date: new Date().toISOString()
          });
          setAttemptInfo(null);

          setQuestions([{
            id: "free_coding",
            title: "Free Coding",
            description: "No lab module has been assigned right now. Write, run, and experiment with any C program you'd like — nothing here is graded.",
            questionKey: "free",
            files: [
              { name: "main.c", tag: "main", precode: "#include <stdio.h>\n\nint main() {\n    // Write your code here\n    return 0;\n}\n" }
            ],
            testcases: {},
            input: "",
            evalScript: "",
            maxMarks: null,
          }]);
        }
      } catch (error) {
        console.error('Error loading module data:', error);
        setModuleError(error.response?.data?.error || error.message || 'Failed to load questions');
        
        // Something actually went wrong (not just "no module assigned") —
        // still don't leave the student with a broken editor.
        setModuleInfo({
          _id: "free_coding",
          name: "Free Coding",
          description: "Couldn't reach the lab server just now. Feel free to write and run any C program you'd like using the editor below.",
          maxMarks: null,
          time: null,
          date: new Date().toISOString()
        });
        setAttemptInfo(null);
        setQuestions([{
          id: "free_coding",
          title: "Free Coding",
          description: "Couldn't reach the lab server just now. Write, run, and experiment with any C program you'd like — nothing here is graded.",
          questionKey: "free",
          files: [
            { name: "main.c", tag: "main", precode: "#include <stdio.h>\n\nint main() {\n    // Write your code here\n    return 0;\n}\n" }
          ],
          testcases: {},
          input: "",
          evalScript: "",
          maxMarks: null,
        }]);
      }
      
      setLoadingQuestions(false);
    };
    
    fetchModuleData();
    
    // Set up event listener for module changes
    const handleModuleChange = () => {
      console.log('Module change detected, refreshing...');
      fetchModuleData();
      
      // Show notification to user
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Module Updated", {
          body: "The teacher has updated the module. Loading new content...",
        });
      }
    };
    
    window.addEventListener('module-change', handleModuleChange);
    
    // Check for module changes periodically by asking the server, rather
    // than watching a localStorage value that only exists on the teacher's
    // own browser.
    const checkModuleInterval = setInterval(async () => {
      try {
        const sessionId = getCurrentLabSession();
        const res = await axios.get(`${API_BASE}/api/sessions/${sessionId}/current-module`, {
          params: { userId: getCurrentUser() },
        });
        const activeModuleId = res.data?._id;
        if (activeModuleId && activeModuleId !== lastLoadedModuleIdRef.current) {
          console.log('New module detected on server:', activeModuleId);
          handleModuleChange();
        }
      } catch (err) {
        // 404 just means no module assigned yet — try again next tick.
      }
    }, 5000);
    
    return () => {
      window.removeEventListener('module-change', handleModuleChange);
      clearInterval(checkModuleInterval);
    };
  }, []);

  useEffect(() => {
    if (!moduleInfo?._id || moduleInfo._id === 'free_coding') return undefined;

    const interval = setInterval(() => {
      startOrRefreshAttempt(moduleInfo._id).catch((err) => {
        console.error('Failed to refresh test attempt:', err);
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [moduleInfo?._id]);


  function getTagsFromQuestion(question) {
    if (!question?.files?.length) return [];
    return question.files.map(f => f.tag).filter(Boolean);
  }
  const tags = useMemo(() => {
  if (
    !Array.isArray(questions) ||
    questions.length === 0 ||
    !questions[activeQuestionIdx]
  ) return [];

  return getTagsFromQuestion(questions[activeQuestionIdx]);
}, [questions, activeQuestionIdx]);


  useEffect(() => {
    fetch('/codeFiles.json')
      .then(res => res.json())
      .then(data => {
        // Ensure each file has a .path property (default to name if not present)
        setFiles(data.map(f => ({
          ...f,
          path: `${currentWorkingDir}/${f.name}` // always set path
        })));
      })
      .catch(err => console.error("Error loading files:", err));
  }, []);


  useEffect(() => {
    const onEval = (e) => {
      const { results, questionId } = e.detail || {};
      if (!questionId || !results) return;

      setTestCaseResults(prev => ({
        ...prev,
        [questionId]: results,
      }));
    };

    window.addEventListener('evaluation-complete', onEval);
    return () => window.removeEventListener('evaluation-complete', onEval);
  }, []);


  useEffect(() => {
    if (questions?.length > 0 && questions[activeQuestionIdx]) {
      const activeQuestion = questions[activeQuestionIdx];
      const requestId = fileHydrationRequestRef.current + 1;
      fileHydrationRequestRef.current = requestId;

      const loadFilesForQuestion = async () => {
        const filesFromQuestion = await Promise.all((activeQuestion.files || []).map(async (f) => {
        let lang = 'plaintext';
        if (f.name?.endsWith('.py')) lang = 'python';
        else if (f.name?.endsWith('.c')) lang = 'c';
        else if (f.name?.endsWith('.js')) lang = 'javascript';

        const filePath = `${LABUSER_HOME}/${f.name}`;
        let code = f.precode || '';

        try {
          const response = await axios.get(`${API_BASE}/api/file/read-file`, {
            params: {
              cwd: LABUSER_HOME,
              filename: f.name,
              userId: getCurrentUser(),
            },
          });
          code = response.data?.code ?? code;
        } catch {
          // If the student has not created/saved this file yet, use the starter code.
        }

        return {
          id: f.tag || f.name.replace(/\.[^/.]+$/, ''),
          name: f.name,
          tag: f.tag,
          path: filePath,
          language: lang,
          code,
        };
      }));

      if (fileHydrationRequestRef.current !== requestId) return;

      setFiles(filesFromQuestion);
      dirtyFileIdsRef.current = new Set();
      if (filesFromQuestion.length > 0) {
        setActiveFileId(filesFromQuestion[0].id);
      }

      const autoMap = {};
      filesFromQuestion.forEach(f => {
        if (f.tag) autoMap[f.tag] = f.path;
      });
      setTagToFileMap(autoMap);
      };

      loadFilesForQuestion();
    }
  }, [questions, activeQuestionIdx]);


  // Handle file operations
  const updateCode = (newCode) => {
    if (activeFileId) {
      dirtyFileIdsRef.current.add(activeFileId);
    }
    setFiles(prevFiles => 
      prevFiles.map(f => 
        f.id === activeFileId ? {...f, code: newCode} : f
      )
    );
  };


  //track changes and auto-save
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const activeFile = files.find(f => f.id === activeFileId);
      if (activeFile && activeFile.code?.trim() && dirtyFileIdsRef.current.has(activeFile.id)) {
        saveFile(activeFile).then(() => {
          dirtyFileIdsRef.current.delete(activeFile.id);
        });
      }
    }, 1000); // Debounce: wait 1 second after user stops typing

    return () => clearTimeout(timeoutId);
  }, [files, activeFileId]);


  const addNewFile = () => {
    if(!newFileCreated){
      return;
    }

    const fileName = `new_file_${fileNo}.${language === 'c' ? 'c' : language === 'python' ? 'py' : 'txt'}`;
    
    const confirmCreate = window.confirm(
      `📁 This new file will be created in:\n\n  ${currentWorkingDir}\n\nFilename: ${fileName}\n\nIf you'd like to save it elsewhere, please change the directory in your terminal first.\n\nContinue?`
    );

    if (!confirmCreate) return;
    setFileNo(fileNo+1);

    setNewFileCreated(false);

    const timestamp = Date.now();
    const newId = `file_${timestamp}`;
    const template = language === 'c' ? 
      `"""\nNew C File\nAuthor: ${getCurrentUser()}\nCreated: ${getCurrentDateTime()} UTC\n"""\n\n# Your code here\n` :
      `// New ${language} file\n// Author: ${getCurrentUser()}\n// Created: ${getCurrentDateTime()} UTC\n\n`;

    setFiles(prevFiles => [
      ...prevFiles, 
      {
        id: newId,
        name: fileName,
        path: `${currentWorkingDir}/${fileName}`,
        code: template,
        language
      }
    ]);
    dirtyFileIdsRef.current.add(newId);
    setActiveFileId(newId);
    setTimeout(() => {
      setNewFileCreated(true);
    },1000);
  };


  const openFile = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/file/list-files`, {
        params: { cwd: currentWorkingDir,
                  userId: getCurrentUser()
         }
      });
      setAvailableFiles(response.data.files);
      setShowFileModal(true); // show modal
    } catch (err) {
      console.error("Failed to open file:", err);
      alert("Could not load file list.");
    }
  };


  const handleFileSelect = async (selected) => {
    setShowFileModal(false);
    if (!selected) return;

    const alreadyOpen = files.some(f => f.name === selected && f.path === `${currentWorkingDir}/${selected}`);
    if (alreadyOpen) {
      alert(`⚠️ File "${selected}" is already open in the editor.\n\nPlease choose a different file.`);
      return;
    }

    try {
      const res = await axios.get(`${API_BASE}/api/file/read-file`, {
        params: { filename: selected, cwd: currentWorkingDir }
      });

      const code = res.data.code;
      const newId = `file_${Date.now()}`;
      setFiles(prev => [
        ...prev,
        {
          id: newId,
          name: selected,
          path: `${currentWorkingDir}/${selected}`,
          code,
          language: selected.endsWith('.py') ? 'python' : 'c'
        }
      ]);
      setActiveFileId(newId);
    } catch (err) {
      console.error("Error loading file content:", err);
      alert("Failed to load file content.");
    }
  };


  const handleCloseFile = (fileId) => {
    setFiles(prevFiles => prevFiles.filter(f => f.id !== fileId));
    // set a new active file if the closed one was active
    if (activeFileId === fileId && files.length > 1) {
      const idx = files.findIndex(f => f.id === fileId);
      const nextFile = files[idx + 1] || files[idx - 1];
      setActiveFileId(nextFile?.id || null);
    }
  };  // Handle execution


  // Handle execution
  const handleRun = () => {
    setIsRunning(true);
    setShowTerminal(true);
    const activeFile = files.find(f => f.id === activeFileId);
    if (!activeFile) {
      window.dispatchEvent(new CustomEvent('terminal-error', { detail: "No file selected" }));
      setIsRunning(false);
      return;
    }
    // If we're in a subdirectory, update the file's path to include the current directory
    const fullPath = currentWorkingDir 
      ? `${currentWorkingDir}/${activeFile.name}` 
      : activeFile.path;
    
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('run-file-in-terminal', {
        detail: {
          code: activeFile.code,
          userId: getCurrentUser(),
          filename: activeFile.name,
          filePath: fullPath,
          language: activeFile.language || language
        }
      }));
      setIsRunning(false);
    }, 100);
  };


  const saveFile = async (file) => {
    if (!file) return;
    try {
      setSaveStatus('saving');
      const payload = {
        userId: getCurrentUser(),
        filename: file.name,
        filePath: file.path,
        code: file.code
      };

      await fetch(`${API_BASE}/api/save-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000); // Reset to idle after 2 seconds
    } catch (err) {
      console.error(`[AutoSave] Failed to save ${file.path}:`, err);
      setSaveStatus('idle');
    }
  };

  const saveActiveFile = async () => {
    const file = files.find(f => f.id === activeFileId);
    if (!file) return;
    await saveFile(file);
    dirtyFileIdsRef.current.delete(file.id);
  };

  const appendEvaluationLog = (line) => {
    const text = line.endsWith('\n') ? line : `${line}\n`;
    setEvaluationOverlay((prev) => ({
      ...prev,
      logs: [...prev.logs, text],
    }));
  };

  useEffect(() => {
    if (logBoxRef.current) {
      logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }
  }, [evaluationOverlay.logs]);

  const runEvaluationWithLogs = async ({ endpoint, payload, title }) => {
    setEvaluationOverlay({
      open: true,
      title,
      running: true,
      logs: [`${title} started...`],
    });

    const response = await fetch(`${API_BASE}/api/evaluation/${endpoint}?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => '');
      throw new Error(body || `Evaluation failed with status ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.event === 'log') {
          appendEvaluationLog(event.message || '');
        } else if (event.event === 'done') {
          finalResult = event.result;
          appendEvaluationLog('Evaluation finished.');
        } else if (event.event === 'error') {
          throw new Error(event.error || 'Evaluation failed.');
        }
      }
    }

    setEvaluationOverlay((prev) => ({ ...prev, running: false }));
    return finalResult || {};
  };

  const startOrRefreshAttempt = async (moduleId) => {
    if (!moduleId || moduleId === 'free_coding') return null;

    const res = await axios.post(`${API_BASE}/api/sessions/test-attempts/start`, {
      userId: getCurrentUser(),
      moduleId,
      sessionId: getCurrentLabSession(),
    });

    setAttemptInfo(res.data);
    return res.data;
  };

  useEffect(() => {
    const handleSaveShortcut = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        event.stopPropagation();
        saveActiveFile();
      }
    };

    window.addEventListener('keydown', handleSaveShortcut, true);
    return () => window.removeEventListener('keydown', handleSaveShortcut, true);
  }, [files, activeFileId]);

  useEffect(() => {
    if (!evaluationOverlay.running) return;

    const blockKeys = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('keydown', blockKeys, true);
    return () => window.removeEventListener('keydown', blockKeys, true);
  }, [evaluationOverlay.running]);


  //handle rename and code language change
  const renameFile = async (fileId, newName) => {
    const extension = newName.split('.').pop().toLowerCase();

    let detectedLanguage = 'plaintext';
    if (extension === 'py') detectedLanguage = 'python';
    else if (extension === 'c') detectedLanguage = 'c';

    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const oldPath = file.path;
    const newPath = file.path
      ? file.path.split('/').slice(0, -1).concat(newName).join('/')
      : newName;

    // Update frontend state
    setFiles(prevFiles =>
      prevFiles.map(f =>
        f.id === fileId
          ? {
              ...f,
              name: newName,
              path: newPath,
              language: detectedLanguage
            }
          : f
      )
    );

    setLanguage(detectedLanguage);

    // Notify backend to rename inside container
    try {
      await fetch(`${API_BASE}/api/rename-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getCurrentUser(),
          oldPath,
          newPath
        })
      });
    } catch (err) {
      console.error('Failed to rename file in container:', err);
    }
  };


  const updateFileLanguage = async (fileId, newLang) => {
    const newExt = newLang === 'c' ? 'c' : newLang === 'python' ? 'py' : '';
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const newName = `${baseName}.${newExt}`;
    const oldPath = file.path;
    const newPath = file.path
      ? file.path.split('/').slice(0, -1).concat(newName).join('/')
      : newName;

    // Update frontend state
    setFiles(prevFiles =>
      prevFiles.map(f =>
        f.id === fileId
          ? {
              ...f,
              language: newLang,
              name: newName,
              path: newPath
            }
          : f
      )
    );

    // Notify backend to rename file inside container
    try {
      await fetch(`${API_BASE}/api/rename-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getCurrentUser(),
          oldPath,
          newPath
        })
      });
    } catch (err) {
      console.error('Failed to rename file in container:', err);
    }
  };

  const activeFile = files.find(f => f.id === activeFileId) || files[0];
  const isFreeCoding = moduleInfo?._id === 'free_coding';

  const handleEvaluate = async () => {
    const currentQuestion = questions[activeQuestionIdx];
    if (!currentQuestion) return;

    if (useActiveFiles && Object.keys(tagToFileMap).length !== tags.length) {
      alert('Please assign a file for every tag before running evaluation.');
      return;
    }

    setIsEvaluating(true);

    try {
      const requiredPaths = Object.values(tagToFileMap);
      const filteredFiles = files.filter(f => requiredPaths.includes(f.path));

      for (const file of filteredFiles) {
        await axios.post(`${API_BASE}/api/save-file`, {
          userId: getCurrentUser(),
          filename: file.name,
          filePath: file.path,
          code: file.code,
        });
      }

      const tagPaths = { ...tagToFileMap };
      const sourceFiles = Object.fromEntries(filteredFiles.map(f => [f.name, f.code]));

      const response = await runEvaluationWithLogs({
        endpoint: 'run',
        title: `Evaluating ${currentQuestion.questionKey || currentQuestion.title}`,
        payload: {
        userId: getCurrentUser(),
        studentName: getStudentName(),
        sessionId: getCurrentLabSession(),
        moduleId: moduleInfo?._id,
        questionId: currentQuestion.id,
        tagPaths,
        sourceFiles,
        },
      });

      const results = response?.results ?? [];
      setTestCaseResults((prev) => ({
        ...prev,
        [currentQuestion.id]: results,
      }));
      setEvalMessage(null);
      setQuestionPaneTab('testcases');
      setShowQuestion(true);

      const { total } = summarizeResults(results);
      if (total === 0) {
        const hint = response?.stderr?.trim() || 'Evaluation finished but no test results were produced. Check that your code compiles.';
        setEvalMessage(hint);
      }

      window.dispatchEvent(new CustomEvent('evaluation-complete', {
        detail: { results, questionId: currentQuestion.id },
      }));
    } catch (error) {
      console.error('Evaluation failed:', error);
      setEvaluationOverlay((prev) => ({
        ...prev,
        running: false,
        logs: [...prev.logs, error.message || 'Evaluation failed.'],
      }));
      alert(error.response?.data?.error || 'Evaluation failed');
    } finally {
      setIsEvaluating(false);
    }
  };


  // Handle stopping all processes
  const handleStopAll = () => {
    setShowTerminal(true);
    window.dispatchEvent(new CustomEvent('stop-all-processes'));
  };


  const handleSubmit = async () => {
    return submitQuestion(questions[activeQuestionIdx], { autoSubmitted: false, useActiveFiles: true });
  };

  const submitQuestion = async (question, { autoSubmitted = false, useActiveFiles = false } = {}) => {
    if (!question || question.id === 'free_coding') return null;

    if (Object.keys(tagToFileMap).length !== tags.length) {
      if (autoSubmitted) return null;
      alert('Please assign a file for every tag before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      let effectiveTagMap = tagToFileMap;
      let filteredFiles = files.filter(f => Object.values(effectiveTagMap).includes(f.path));

      if (!useActiveFiles) {
        effectiveTagMap = {};
        filteredFiles = await Promise.all((question.files || []).map(async (f) => {
          const filePath = `${LABUSER_HOME}/${f.name}`;
          let code = f.precode || '';
          try {
            const response = await axios.get(`${API_BASE}/api/file/read-file`, {
              params: { cwd: LABUSER_HOME, filename: f.name, userId: getCurrentUser() },
            });
            code = response.data?.code ?? code;
          } catch {
            // Use starter code if no saved file exists for this question.
          }
          if (f.tag) effectiveTagMap[f.tag] = filePath;
          return {
            id: f.tag || f.name,
            name: f.name,
            path: filePath,
            language: f.name?.endsWith('.py') ? 'python' : 'c',
            code,
          };
        }));
      }

      for (const file of filteredFiles) {
        await axios.post(`${API_BASE}/api/save-file`, {
          userId: getCurrentUser(),
          filename: file.name,
          filePath: file.path,
          code: file.code,
        });
      }

      const tagPaths = { ...effectiveTagMap };
      const sourceFiles = Object.fromEntries(filteredFiles.map(f => [f.name, f.code]));

      const evalRes = await runEvaluationWithLogs({
        endpoint: 'submit',
        title: autoSubmitted
          ? `Auto-submitting ${question.questionKey || question.title}`
          : `Submitting ${question.questionKey || question.title}`,
        payload: {
        userId: getCurrentUser(),
        studentName: getStudentName(),
        sessionId: getCurrentLabSession(),
        moduleId: moduleInfo?._id,
        questionId: question.id,
        tagPaths,
        sourceFiles,
        },
      });

      if (evalRes?.results) {
        setTestCaseResults((prev) => ({
          ...prev,
          [question.id]: evalRes.results,
        }));
      }

      const results = evalRes?.results ?? [];
      const testcaseCount = Object.keys(question.testcases || {}).length;
      const { passed: passedFromResults } = summarizeResults(results);
      const correctCount = results.length > 0 ? passedFromResults : 0;
      const totalCount = results.length > 0 ? results.length : testcaseCount;

      const submitDbRes = await fetch(`${API_BASE}/api/submission/db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: getCurrentUser(),
          questionId: question.id,
          sessionId: getCurrentLabSession(),
          moduleId: moduleInfo?._id,
          module: moduleInfo?.name || 'CN Lab',
          sourceCode: sourceFiles,
          language: filteredFiles[0]?.language || 'c',
          passedCount: correctCount,
          totalTestCases: totalCount,
          evaluationResults: results,
          evalError: results.length === 0 ? (evalRes?.stderr?.trim() || null) : null,
          autoSubmitted,
        }),
      });

      if (!submitDbRes.ok) {
        const body = await submitDbRes.json().catch(() => ({}));
        throw new Error(body.error || `Failed to save submission (status ${submitDbRes.status})`);
      }

      const statusLabel = totalCount > 0 && correctCount === totalCount ? 'All test cases passed' : `${correctCount}/${totalCount} test cases passed`;
      setSubmissionRefreshTrigger((n) => n + 1);
      if (!autoSubmitted) alert(`Submitted successfully. ${statusLabel}`);
      return { questionId: question.id, statusLabel };
    } catch (err) {
      console.error('[Frontend] Submission error:', err);
      setEvaluationOverlay((prev) => ({
        ...prev,
        running: false,
        logs: [...prev.logs, err.message || 'Submission failed.'],
      }));
      if (!autoSubmitted) alert(err.response?.data?.error || 'Failed to submit.');
      return null;
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleTimeUp = async () => {
    if (autoSubmitStartedRef.current || isFreeCoding || !moduleInfo?._id) return;
    autoSubmitStartedRef.current = true;

    try {
      const res = await axios.get(`${API_BASE}/api/submission/has-submission`, {
        params: {
          userId: getCurrentUser(),
          sessionId: getCurrentLabSession(),
          moduleId: moduleInfo._id,
        },
      });

      if (!res.data?.hasSubmission) {
        alert("[Time] Time's up. Auto-submitting your answers now.");
        for (const q of questions) {
          await submitQuestion(q, {
            autoSubmitted: true,
            useActiveFiles: q.id === questions[activeQuestionIdx]?.id,
          });
        }
      }
    } finally {
      navigate('/student-dashboard');
    }
  };


  const question = questions && questions.length > 0 ? questions[activeQuestionIdx] : undefined;
  const remainingSeconds = attemptInfo?.remainingSeconds ?? ((moduleInfo?.durationMinutes || 60) * 60);


  // Keep window.questions and window.activeQuestionIdx in sync for evaluation
  useEffect(() => {
    window.questions = questions;
    window.activeQuestionIdx = activeQuestionIdx;
  }, [questions, activeQuestionIdx]);


  //handle resize for terminal open and close
  useEffect(() => {
    if (panelRef.current) {
      if (showTerminal) {
        panelRef.current.resize(45); // Show with size 45%
      } else {
        panelRef.current.resize(0); // Collapse to 0%
      }
    }
  }, [showTerminal]);

  // Request notification permissions on component load
  useEffect(() => {
    // Check if browser supports notifications
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  // Mobile layout

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-screen bg-gray-50">
        <EvaluationOverlay
          overlay={evaluationOverlay}
          logBoxRef={logBoxRef}
          onClose={() => setEvaluationOverlay((prev) => ({ ...prev, open: false }))}
        />
        <Header
          title={question ? question.title : 'No questions available'}
          onTimeUp={handleTimeUp}
          timeLimit={isFreeCoding ? null : remainingSeconds}
        />
        <MobileTabs
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          tabs={[
            { id: 'question', label: 'Problem', icon: null },
            { id: 'editor', label: 'Code', icon: null },
            { id: 'terminal', label: 'Output', icon: null }
          ]}
        />
        <div className="flex-1 overflow-hidden">
          {activeTab === 'question' && (
            <QuestionPane 
              questions={questions}
              activeQuestionIdx={activeQuestionIdx}
              setActiveQuestionIdx={setActiveQuestionIdx}
              testCaseResults={testCaseResults[questions[activeQuestionIdx]?.id] || []}
              activeTab={questionPaneTab}
              setActiveTab={setQuestionPaneTab}
              evalMessage={evalMessage}
              submissionRefreshTrigger={submissionRefreshTrigger}
            />
          )}
          {activeTab === 'editor' && (
            <EditorPane 
              language={language}
              setLanguage={setLanguage}
              files={files}
              activeFileId={activeFileId}
              setActiveFileId={setActiveFileId}
              updateCode={updateCode}
              addNewFile={addNewFile}
              onRun={handleRun}
              onSubmit={handleSubmit}
              onStopAll={handleStopAll}
              isRunning={isRunning}
              isSubmitting={isSubmitting}
              saveStatus={saveStatus}
              renameFile={renameFile}
              updateFileLanguage={updateFileLanguage}
              onSave={saveActiveFile}
            />
          )}
          {activeTab === 'terminal' && (
            <TerminalPane
              onClose={() => setActiveTab('editor')}
            />
          )}
        </div>
      </div>
    );
  }

  // Desktop layout

  // Desktop layout
  return (
    <div className="flex flex-col h-screen bg-white">
      <EvaluationOverlay
        overlay={evaluationOverlay}
        logBoxRef={logBoxRef}
        onClose={() => setEvaluationOverlay((prev) => ({ ...prev, open: false }))}
      />
      <Header
        title={moduleInfo ? moduleInfo.name : (question ? question.title : 'No questions available')}
        onTimeUp={handleTimeUp}
        timeLimit={isFreeCoding ? null : remainingSeconds}
        showQuestion={showQuestion}
        onToggleQuestion={() => setShowQuestion(!showQuestion)}
        moduleInfo={moduleInfo}
        loadingQuestions={loadingQuestions}
      />
      
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="vertical" className="h-full" autoSaveId="cnlab-vertical-panels">
          <Panel defaultSize={showTerminal ? 70 : 100} minSize={30} id="main-panel" order={1}>
            <PanelGroup direction="horizontal" className="h-full" autoSaveId="cnlab-horizontal-panels">
              {showQuestion && (
                <>
                  <Panel defaultSize={35} minSize={25} maxSize={60} id="question-panel" order={1}>
                    {loadingQuestions ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                          <p className="mt-2 text-gray-600">Loading questions...</p>
                        </div>
                      </div>
                    ) : moduleError ? (
                      <div className="h-full flex items-center justify-center">
                        <div className="text-center text-red-500 max-w-md mx-auto p-4">
                          <InformationCircleIcon className="h-8 w-8 mx-auto mb-2" />
                          <p>{moduleError}</p>
                          <p className="text-sm mt-2 text-gray-600">
                            Using fallback questions if available.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <QuestionPane
                        questions={questions}
                        activeQuestionIdx={activeQuestionIdx}
                        setActiveQuestionIdx={setActiveQuestionIdx}
                        onClose={() => setShowQuestion(false)}
                        testCaseResults={testCaseResults[questions[activeQuestionIdx]?.id] || []}
                        activeTab={questionPaneTab}
                        setActiveTab={setQuestionPaneTab}
                        evalMessage={evalMessage}
                        submissionRefreshTrigger={submissionRefreshTrigger}
                      />
                    )}
                  </Panel>
                  <ResizeHandle />
                </>
              )}
              <Panel minSize={40} id="editor-panel" order={2}>                
                <EditorPane 
                  language={language}
                  setLanguage={setLanguage}
                  files={files}
                  setFiles={setFiles}
                  activeFileId={activeFileId}
                  setActiveFileId={setActiveFileId}
                  activeFile={activeFile}
                  updateCode={updateCode}
                  addNewFile={addNewFile}
                  openFile={openFile}
                  onRun={handleRun}
                  onEvaluate={handleEvaluate}
                  onSubmit={handleSubmit}
                  onStopAll={handleStopAll}
                  isRunning={isRunning}
                  isEvaluating={isEvaluating}
                  isSubmitting={isSubmitting}
                  showQuestion={showQuestion}
                  onToggleQuestion={() => setShowQuestion(true)}
                  showTerminal={showTerminal}
                  setShowTerminal={setShowTerminal}
                  onCloseFile={handleCloseFile}
                  saveStatus={saveStatus}
                  renameFile={renameFile}
                  updateFileLanguage={updateFileLanguage}
                  tags={tags}
                  tagToFileMap={tagToFileMap}
                  setTagToFileMap={setTagToFileMap}
                  isFreeCoding={isFreeCoding}
                  onSave={saveActiveFile}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          {/* Always render TerminalPane panel, but hide with CSS if not visible */}
          <ResizeHandle orientation="horizontal" style={{ display: showTerminal ? undefined : 'none' }} />
          <Panel
            ref={panelRef}
            defaultSize={45}
            minSize={0}
            maxSize={100}
            id="terminal-panel"
            order={3}
          >
            <TerminalPane 
              onClose={() => setShowTerminal(false)} 
              termVisible={showTerminal} 
              setCurrentWorkingDir={setCurrentWorkingDir} 
            />
          </Panel>
        </PanelGroup>

        {showFileModal && (
          <FileSelectorModal
            files={availableFiles}
            onSelect={handleFileSelect}
            onClose={() => setShowFileModal(false)}
          />
        )}
      </div>
    </div>
  );
}
