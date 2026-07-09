import { useState, useEffect, useRef, useMemo } from 'react';
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


// Helper functions
const getCurrentUser = () => localStorage.getItem('studentId') || 'testuser123';
const getStudentName = () => localStorage.getItem('studentName') || getCurrentUser();
const getCurrentDateTime = () => {
  const now = new Date();
  return now.toISOString().slice(0, 19).replace('T', ' ');
};

// Real-time module handling will be implemented with WebSockets


export default function CNLabWorkspace() {
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
  const panelRef = useRef(null);
  const dirtyFileIdsRef = useRef(new Set());
  const fileHydrationRequestRef = useRef(0);
  // const [isSubmitted, setIsSubmitted] = useState(false);

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
        // Check if we have a module ID in localStorage (set by the teacher)
        const moduleId = localStorage.getItem('currentModuleId');
        
        if (moduleId) {
          console.log('Found module ID in localStorage:', moduleId);
          
          // Fetch the module directly using the module ID
          const response = await axios.get(`${API_BASE}/api/modules/${moduleId}`);
          
          if (response.data) {
            const moduleData = response.data;
            
            // Set module info
            setModuleInfo({
              _id: moduleData._id,
              name: moduleData.name,
              description: moduleData.description,
              maxMarks: moduleData.maxMarks,
              time: moduleData.time || "Not specified",
              date: moduleData.date
            });
            
            // Fetch questions for this module if not already included
            let questionsData = moduleData.questions;
            
            // If questions are just IDs, fetch the full question data
            if (moduleData.questions.length > 0 && typeof moduleData.questions[0] === 'string') {
              const questionsResponse = await axios.get(`${API_BASE}/api/modules/${moduleId}/questions`);
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
          } else {
            throw new Error('Failed to load module data');
          }
        } else {
          // Fallback to static JSON if no module ID in localStorage
          console.log('No module ID found, using static data');
          const response = await fetch('/questionPool.json');
          
          if (!response.ok) {
            throw new Error('Failed to fetch question data');
          }
          
          const data = await response.json();
          
          setModuleInfo({
            _id: "static_module",
            name: "Computer Networks Lab (Demo)",
            description: "TCP/IP Socket Programming Practice",
            maxMarks: 50,
            time: "2 hours",
            date: new Date().toISOString()
          });
          
          setQuestions(data);
        }
      } catch (error) {
        console.error('Error loading module data:', error);
        setModuleError(error.response?.data?.error || error.message || 'Failed to load questions');
        
        // Try to load from backup static source
        try {
          const backupResponse = await fetch('/questionPool.json');
          if (!backupResponse.ok) throw new Error('Backup source unavailable');
          
          const backupData = await backupResponse.json();
          setQuestions(backupData);
          
          // Create a fallback module
          setModuleInfo({
            _id: "fallback_module",
            name: "Computer Networks Lab (Offline Mode)",
            description: "Practice questions from local storage",
            maxMarks: 50,
            time: "Not timed",
            date: new Date().toISOString()
          });
        } catch (backupError) {
          console.error('Error loading backup questions:', backupError);
          setQuestions([]);
        }
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
    
    // Check for module changes periodically
    const checkModuleInterval = setInterval(() => {
      const newModuleId = localStorage.getItem('currentModuleId');
      const prevModuleId = sessionStorage.getItem('loadedModuleId');
      
      if (newModuleId && newModuleId !== prevModuleId) {
        console.log('New module detected:', newModuleId);
        sessionStorage.setItem('loadedModuleId', newModuleId);
        handleModuleChange();
      }
    }, 5000);
    
    return () => {
      window.removeEventListener('module-change', handleModuleChange);
      clearInterval(checkModuleInterval);
    };
  }, []);


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
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/2fbaf848-a638-4e46-beb4-cd433f8f423b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d3d7c5'},body:JSON.stringify({sessionId:'d3d7c5',location:'CNLabWorkspace.jsx:handleRun',message:'run dispatch',data:{fullPath,activeFilePath:activeFile.path,currentWorkingDir},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
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
          userId: 'testuser123',  // or dynamically get userId if you have JWT/session
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

  const handleEvaluate = async () => {
    const currentQuestion = questions[activeQuestionIdx];
    if (!currentQuestion) return;

    if (Object.keys(tagToFileMap).length !== tags.length) {
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

      const response = await axios.post(`${API_BASE}/api/evaluation/run`, {
        userId: getCurrentUser(),
        studentName: getStudentName(),
        sessionId: getCurrentLabSession(),
        moduleId: moduleInfo?._id,
        questionId: currentQuestion.id,
        tagPaths,
        sourceFiles,
      });

      const results = response.data?.results ?? [];
      setTestCaseResults((prev) => ({
        ...prev,
        [currentQuestion.id]: results,
      }));
      setEvalMessage(null);
      setQuestionPaneTab('testcases');
      setShowQuestion(true);

      const { total } = summarizeResults(results);
      if (total === 0) {
        const hint = response.data?.stderr?.trim() || 'Evaluation finished but no test results were produced. Check that your code compiles.';
        setEvalMessage(hint);
      }

      window.dispatchEvent(new CustomEvent('evaluation-complete', {
        detail: { results, questionId: currentQuestion.id },
      }));
    } catch (error) {
      console.error('Evaluation failed:', error);
      // #region agent log
      fetch('http://127.0.0.1:7428/ingest/2fbaf848-a638-4e46-beb4-cd433f8f423b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'d3d7c5'},body:JSON.stringify({sessionId:'d3d7c5',location:'CNLabWorkspace.jsx:handleEvaluate',message:'evaluation error',data:{error:error.response?.data?.error||error.message,tagToFileMap},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
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
    if (Object.keys(tagToFileMap).length !== tags.length) {
      alert('Please assign a file for every tag before submitting.');
      return;
    }

    setIsSubmitting(true);

    try {
      const question = questions[activeQuestionIdx];
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

      const evalRes = await axios.post(`${API_BASE}/api/evaluation/submit`, {
        userId: getCurrentUser(),
        studentName: getStudentName(),
        sessionId: getCurrentLabSession(),
        moduleId: moduleInfo?._id,
        questionId: question.id,
        tagPaths,
        sourceFiles,
      });

      if (evalRes.data?.results) {
        setTestCaseResults((prev) => ({
          ...prev,
          [question.id]: evalRes.data.results,
        }));
      }

      const results = evalRes.data?.results ?? [];
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
          module: moduleInfo?.name || 'CN Lab',
          sourceCode: sourceFiles,
          language: filteredFiles[0]?.language || 'c',
          passedCount: correctCount,
          totalTestCases: totalCount,
          evaluationResults: results,
          evalError: results.length === 0 ? (evalRes.data?.stderr?.trim() || null) : null,
        }),
      });

      if (!submitDbRes.ok) {
        const body = await submitDbRes.json().catch(() => ({}));
        throw new Error(body.error || `Failed to save submission (status ${submitDbRes.status})`);
      }

      const statusLabel = totalCount > 0 && correctCount === totalCount ? 'All test cases passed' : `${correctCount}/${totalCount} test cases passed`;
      setSubmissionRefreshTrigger((n) => n + 1);
      alert(`Submitted successfully. ${statusLabel}`);
    } catch (err) {
      console.error('[Frontend] Submission error:', err);
      alert(err.response?.data?.error || 'Failed to submit.');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleTimeUp = () => {
    alert("[Time] Time's up! Your code will be automatically submitted.");
    handleSubmit();
  };


  const question = questions && questions.length > 0 ? questions[activeQuestionIdx] : undefined;


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
        <Header
          title={question ? question.title : 'No questions available'}
          onTimeUp={handleTimeUp}
          timeLimit={question && question.timeLimit ? question.timeLimit : 3600}
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
      <Header
        title={moduleInfo ? moduleInfo.name : (question ? question.title : 'No questions available')}
        onTimeUp={handleTimeUp}
        timeLimit={question && question.timeLimit ? question.timeLimit : 3600}
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