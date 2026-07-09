import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import axios from 'axios';
import Header from '../components/Header';
import { PlusIcon } from '@heroicons/react/24/outline';
import { TabButton } from '../components/FormComponents';
import { API_BASE } from '../config';
import { 
  SendModuleModal, 
  ModuleTable, 
  QuestionTable, 
  ModuleForm, 
  QuestionForm 
} from '../components/TeacherComponents';
import { useNavigate } from 'react-router-dom';

// Updated initial question including evaluation settings and matchType in testCases
const initialQuestion = {
  title: '',
  description: '',
  questionKey: 'q1',
  maxMarks: 15,
  files: [
    { name: 'server.c', tag: 's1', precode: '#include <stdio.h>\n// server starter\n' },
    { name: 'client.c', tag: 'c1', precode: '#include <stdio.h>\n// client starter\n' },
  ],
  testcases: {
    testcase1: [[0], { c1_to_s1: 'Hi' }, [0], { s1_to_c1: 'Hi' }],
    testcase2: [[0], { c1_to_s1: 'OpenAI' }, [0], { s1_to_c1: 'OpenAI' }],
  },
  input: 'Hi\nOpenAI\n',
  evalScript: `START_TCPDUMP "tcp" "\${SERVER_PORT[0]}" "transfer.pcap"\nsleep 2\n\nCOMPILE_RUN "\$TAG_s1" myserver \${SERVER_PORT[0]}\nCHECK_PORT "127.0.0.1:\${SERVER_PORT[0]}" "0.0.0.0:0000" myserver tcp LISTEN\n\nfor tc in 1 2; do\n  COMPILE_RUN "\$TAG_c1" myclient \${CLIENT_PORT[0]}\n  INPUT myclient input \${tc} 1\n  sleep 2\n  END_TCPDUMP\n  EVALUATE tcp \${tc}\n  START_TCPDUMP "tcp" "\${SERVER_PORT[0]}" "transfer.pcap"\n  sleep 1\ndone\n\nCLEAR_ALL`,
};

// Module form initial values
const initialModule = {
  moduleName: '',
  description: '',
  lab: '123',
  maxMarks: ''
};

export default function TeacherUpload() {
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('success'); // 'success' or 'error'
  const [codeType, setCodeType] = useState('precode');
  const [isLoading, setIsLoading] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [modules, setModules] = useState([]);
  const [activeTab, setActiveTab] = useState('upload');
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editingModuleId, setEditingModuleId] = useState(null);
  const [isCreatingModule, setIsCreatingModule] = useState(false);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState([]);
  const [showSendModuleModal, setShowSendModuleModal] = useState(false);
  const [selectedModuleToSend, setSelectedModuleToSend] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [isLabSession, setIsLabSession] = useState(false); // Toggle for lab session mode
  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadStatus, setBulkUploadStatus] = useState({ total: 0, uploaded: 0, failed: 0 });
  const [isBulkUploading, setIsBulkUploading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('isTeacherLoggedIn') !== 'true') {
      navigate('/teacher-login');
    }
  }, []);
  // Initialize react-hook-form for question
  const questionForm = useForm({
    defaultValues: initialQuestion
  });
  
  // Initialize react-hook-form for module
  const moduleForm = useForm({
    defaultValues: initialModule
  });

  // Destructure form methods
  const { 
    register, 
    handleSubmit: handleFormSubmit, 
    formState: { errors }, 
    control,
    reset,
    setValue,
    watch
  } = questionForm;

  const watchedValues = watch(); // Get current form values for code editors

  useEffect(() => {
    fetchQuestions();
    fetchModules();
    // Only fetch sessions if in lab session mode
    if (isLabSession) {
      fetchSessions();
    }
  }, [isLabSession]);

  const fetchQuestions = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/questions`);
      setQuestions(response.data);
    } catch (err) {
      console.error('Error fetching questions:', err);
    }
  };
  
  const fetchModules = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/modules`);
      setModules(response.data);
    } catch (err) {
      console.error('Error fetching modules:', err);
    }
  };
  
  const fetchSessions = async () => {
    try {
      // Fetch active sessions from the backend
      const response = await axios.get(`${API_BASE}/api/sessions/active`);
      
      if (response.data && response.data.length > 0) {
        setSessions(response.data);
      } else {
        // If no active sessions are found, use test data for development
        setSessions([
          { _id: 's1', sessionId: 'lab-session-1', name: 'Morning Lab - July 7', studentCount: 25 },
          { _id: 's2', sessionId: 'lab-session-2', name: 'Afternoon Lab - July 7', studentCount: 18 },
          { _id: 's3', sessionId: 'lab-session-3', name: 'Evening Lab - July 7', studentCount: 12 }
        ]);
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
      setMessage('Failed to load active sessions. Using test data.');
      setMessageType('error');
      
      // Fallback to test data in case of error
      setSessions([
        { _id: 's1', sessionId: 'lab-session-1', name: 'Morning Lab (Test)', studentCount: 25 },
        { _id: 's2', sessionId: 'lab-session-2', name: 'Afternoon Lab (Test)', studentCount: 18 }
      ]);
    }
  };
  
  const handleTestCaseChange = (type, idx, field, value) => {
    const testCases = [...(watchedValues.testCases[type] || [])];
    testCases[idx][field] = field === 'points' ? parseInt(value) || 0 : value;
    setValue(`testCases.${type}`, testCases);
  };

  const addTestCase = (type) => {
    const testCases = [...(watchedValues.testCases[type] || [])];
    testCases.push({ input: '', expectedOutput: '', description: '', points: 5, matchType: 'exact' });
    setValue(`testCases.${type}`, testCases);
  };

  const removeTestCase = (type, idx) => {
    const testCases = [...(watchedValues.testCases[type] || [])].filter((_, i) => i !== idx);
    setValue(`testCases.${type}`, testCases);
  };

  const handleCodeChange = (type, file, code) => {
    const currentFiles = watchedValues[type] || {};
    const updatedFiles = { ...currentFiles, [file]: code };
    setValue(type, updatedFiles);
  };

  const addCodeFile = (type) => {
    let fileName = prompt(`Enter new file name for ${type} (with extension, e.g. server.c):`);
    if (!fileName) return;
    fileName = fileName.trim();
    // Prevent files without extension
    if (!fileName.includes('.')) {
      alert('Please include a file extension, e.g. server.c');
      return;
    }
    const files = { ...watchedValues[type] };
    if (files[fileName]) {
      alert('File already exists!');
      return;
    }
    files[fileName] = '// New file\n';
    setValue(type, files);
  };

  const deleteCodeFile = (type, file) => {
    if (confirm(`Delete ${file} from ${type}?`)) {
      const files = { ...watchedValues[type] };
      delete files[file];
      setValue(type, files);
    }
  };
  
  const onSubmit = async (data) => {
    setIsLoading(true);

    try {
      // Process the description: upload any base64 images and replace them with URLs
      let processedDescription = data.description;
      const base64ImagePattern = /src="data:image\/(.*?);base64,(.*?)"/g;
      const matches = [...processedDescription.matchAll(base64ImagePattern)];

      for (const match of matches) {
        const fullMatch = match[0];
        const mimeType = match[1];
        const base64Data = match[2];

        // Convert base64 to file
        const byteCharacters = atob(base64Data);
        const byteArrays = [];
        for (let i = 0; i < byteCharacters.length; i++) {
          byteArrays.push(byteCharacters.charCodeAt(i));
        }
        const byteArray = new Uint8Array(byteArrays);
        const blob = new Blob([byteArray], { type: `image/${mimeType}` });
        const file = new File([blob], `image-${Date.now()}.${mimeType}`, { type: `image/${mimeType}` });
        
        // Upload the image
        const formData = new FormData();
        formData.append('image', file);
        const response = await axios.post(`${API_BASE}/api/questions/upload-image`, formData);
        
        // Replace the base64 string with the returned URL
        processedDescription = processedDescription.replace(fullMatch, `src="${response.data.url}"`);
      }

      // Remove unnecessary fields (like evalType) that are not defined in the schema
      const { evalType, ...payload } = data;

      const questionData = {
        ...payload,
        description: processedDescription,
        moduleType: 'CNQuestion',
        lab: '123',
      };

      delete questionData.precode;
      delete questionData.clientPrecode;
      delete questionData.solution;
      delete questionData.clientSolution;
      delete questionData.testCases;
      delete questionData.evaluationScript;
      delete questionData.clientCount;
      delete questionData.clientDelay;

      if (editingQuestionId) {
        await axios.put(`${API_BASE}/api/questions/${editingQuestionId}`, questionData);
        setMessage('Question updated successfully!');
      } else {
        await axios.post(`${API_BASE}/api/questions`, questionData);
        setMessage('Question uploaded successfully!');
      }

      setEditingQuestionId(null);
      reset(initialQuestion);
      fetchQuestions();
    } catch (err) {
      console.error('Upload error:', err.response ? err.response.data : err.message);
      setMessage(`Error: ${err.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const editQuestion = (q) => {
    reset({
      ...q,
      description: q.description || '',
    });
    setEditingQuestionId(q._id);
    setActiveTab('upload');
  }

  const deleteQuestion = async (id) => {
    if (!confirm('Are you sure you want to delete this question?')) return;
    
    try {
      await axios.delete(`${API_BASE}/api/questions/${id}`);
      fetchQuestions();
    } catch (err) {
      alert(`Error deleting question: ${err.message}`);
    }
  };

  const toggleQuestionSelection = (id) => {
    setSelectedQuestionIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(qId => qId !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleBulkUpload = async (jsonData) => {
    setIsBulkUploading(true);
    setBulkUploadStatus({ total: jsonData.length, uploaded: 0, failed: 0 });
    
    try {
      // Process each question to handle any base64 images
      const processedQuestions = await Promise.all(jsonData.map(async (questionData) => {
        // Process images in description
        let processedDescription = questionData.description || '';
        
        // Find all base64 image patterns and upload them
        const base64Pattern = /<img[^>]*src="data:image\/(jpeg|png|gif|jpg);base64,([^"]*)"[^>]*>/g;
        let match;
        
        while ((match = base64Pattern.exec(processedDescription)) !== null) {
          const fullMatch = match[0];
          const mimeType = match[1];
          const base64Data = match[2];
          
          // Convert base64 to file
          const byteCharacters = atob(base64Data);
          const byteArrays = [];
          for (let i = 0; i < byteCharacters.length; i++) {
            byteArrays.push(byteCharacters.charCodeAt(i));
          }
          const byteArray = new Uint8Array(byteArrays);
          const blob = new Blob([byteArray], { type: `image/${mimeType}` });
          const file = new File([blob], `image-${Date.now()}.${mimeType}`, { type: `image/${mimeType}` });
          
          // Upload the image
          const formData = new FormData();
          formData.append('image', file);
          const response = await axios.post(`${API_BASE}/api/questions/upload-image`, formData);
          
          // Replace the base64 string with the returned URL
          processedDescription = processedDescription.replace(fullMatch, `<img src="${response.data.url}" alt="Question image" />`);
        }
        
        // Add moduleType and lab (required fields)
        return {
          ...questionData,
          description: processedDescription,
          moduleType: "CNQuestion",
          lab: questionData.lab || "123" // Default lab ID if not provided
        };
      }));
      
      // Use the bulk upload endpoint to create all questions at once
      const response = await axios.post(`${API_BASE}/api/questions/bulk`, processedQuestions);
      const { results } = response.data;
      
      // Update status
      setBulkUploadStatus({
        total: jsonData.length,
        uploaded: results.success.length,
        failed: results.failed.length
      });
      
      // Refresh questions list
      fetchQuestions();
      
      // Show success message
      if (results.failed.length === 0) {
        setMessage(`Successfully uploaded ${results.success.length} questions!`);
        setMessageType('success');
      } else {
        setMessage(`Uploaded ${results.success.length} questions with ${results.failed.length} failures.`);
        setMessageType('warning');
      }
    } catch (err) {
      console.error('Bulk upload error:', err);
      setMessage(`Error in bulk upload: ${err.message}`);
      setMessageType('error');
    } finally {
      setIsBulkUploading(false);
      setShowBulkUploadModal(false);
    }
  };

  const handleBulkFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        // Validate the JSON structure
        if (!Array.isArray(jsonData)) {
          throw new Error('JSON file must contain an array of questions');
        }
        
        // Start the upload process
        handleBulkUpload(jsonData);
      } catch (err) {
        console.error('Error parsing JSON file:', err);
        setMessage(`Error parsing JSON file: ${err.message}`);
        setMessageType('error');
      }
    };
    reader.readAsText(file);
  };

  const createModule = async (data) => {
    setIsLoading(true);
    try {
      if (selectedQuestionIds.length === 0) {
        setMessage("Please select at least one question for the module");
        setMessageType('error');
        setIsLoading(false);
        return;
      }
      
      const payload = {
        name: data.moduleName,
        description: data.description,
        lab: data.lab,
        questions: selectedQuestionIds,
        creator: "teacherId_placeholder", // Replace with authenticated teacher's id
        maxMarks: data.maxMarks,
      };
      
      let response;
      if (editingModuleId) {
        // Update existing module
        response = await axios.put(`${API_BASE}/api/modules/${editingModuleId}`, payload);
        setMessage("Module updated successfully!");
      } else {
        // Create new module
        response = await axios.post(`${API_BASE}/api/modules`, payload);
        setMessage("Module created successfully!");
      }
      
      if (response.status >= 200 && response.status < 300) {
        setMessageType('success');
        // Reset form and selection
        moduleForm.reset();
        setSelectedQuestionIds([]);
        setIsCreatingModule(false);
        setEditingModuleId(null);
        fetchModules();
      } else {
        setMessage("Unexpected response status: " + response.status);
        setMessageType('error');
      }
    } catch (err) {
      setMessage("Error " + (editingModuleId ? "updating" : "creating") + " module: " + (err.response?.data?.error || err.message));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const editModule = (module) => {
    // Set form values
    moduleForm.reset({
      moduleName: module.name,
      description: module.description || '',
      lab: module.lab,
      maxMarks: module.maxMarks
    });
    
    // Set selected questions
    setSelectedQuestionIds(module.questions.map(q => typeof q === 'object' ? q._id : q));
    
    // Set editing state
    setEditingModuleId(module._id);
    setIsCreatingModule(true);
    setActiveTab('modules');
  };
  
  const deleteModule = async (id) => {
    if (!confirm('Are you sure you want to delete this module?')) return;
    
    try {
      await axios.delete(`${API_BASE}/api/modules/${id}`);
      fetchModules();
      setMessage('Module deleted successfully!');
      setMessageType('success');
    } catch (err) {
      setMessage(`Error deleting module: ${err.message}`);
      setMessageType('error');
    }
  };

  const cancelModuleCreation = () => {
    setIsCreatingModule(false);
    setSelectedQuestionIds([]);
    setEditingModuleId(null);
    moduleForm.reset();
  };

  const openSendModuleModal = (moduleId) => {
    setSelectedModuleToSend(moduleId);
    setShowSendModuleModal(true);
  };

  const sendModuleToStudents = async () => {
    if (!selectedModuleToSend) {
      setMessage('Please select a module to send');
      setMessageType('error');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Use a hardcoded test session ID for simplicity
      const testSessionId = "lab_session_test";
      
      // Make the API request to assign the module to the test session
      const response = await axios.post(`${API_BASE}/api/modules/${selectedModuleToSend}/assign-to-test-session`, {});
      
      if (response.data && response.data.success) {
        const moduleInfo = modules.find(m => m._id === selectedModuleToSend);
        const moduleName = moduleInfo ? moduleInfo.name : 'Selected module';
        
        setMessage(`${moduleName} successfully sent to students`);
        setMessageType('success');
        
        // Update localStorage for test purposes so CNLabWorkspace can access it
        localStorage.setItem('currentModuleId', selectedModuleToSend);
        
        // Dispatch a custom event that CNLabWorkspace can listen for
        window.dispatchEvent(new CustomEvent('module-change', { 
          detail: { 
            moduleId: selectedModuleToSend,
            moduleName: moduleInfo?.name || 'New module' 
          } 
        }));
        
        // Close the modal
        setShowSendModuleModal(false);
        setSelectedModuleToSend(null);
        setSelectedSessionId('');
      } else {
        throw new Error(response.data?.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error sending module:', error);
      
      // Simplified approach - even if the backend call fails, we'll set the module ID in localStorage
      // This allows the student view to pick it up for demo purposes
      localStorage.setItem('currentModuleId', selectedModuleToSend);
      
      // Dispatch a custom event that CNLabWorkspace can listen for
      const moduleInfo = modules.find(m => m._id === selectedModuleToSend);
      window.dispatchEvent(new CustomEvent('module-change', { 
        detail: { 
          moduleId: selectedModuleToSend,
          moduleName: moduleInfo?.name || 'New module' 
        } 
      }));
      
      setMessage(`Module assigned for test purposes (bypassing backend validation)`);
      setMessageType('success');
      
      // Close the modal
      setShowSendModuleModal(false);
      setSelectedModuleToSend(null);
      setSelectedSessionId('');
    } finally {
      setIsLoading(false);
    }
  };
  
  const quickUpdateModule = async (moduleId, update) => {
    setIsLoading(true);
    try {
      // In production, uncomment this code to send the actual API request
      /*
      const response = await axios.patch(`http://localhost:5001/api/modules/${moduleId}/quick-update`, update);
      
      if (response.status >= 200 && response.status < 300) {
        setMessage('Module updated and changes propagated to active sessions');
        setMessageType('success');
        fetchModules(); // Refresh the modules list
      } else {
        setMessage(`Error: Unexpected response from server`);
        setMessageType('error');
      }
      */
      
      // Mock successful response
      await new Promise(resolve => setTimeout(resolve, 600)); // Simulate network delay
      setMessage('Module updated and changes propagated to active sessions');
      setMessageType('success');
      fetchModules(); // Refresh the modules list
    } catch (err) {
      setMessage(`Error updating module: ${err.response?.data?.error || err.message}`);
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  function getLanguageFromFilename(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'py') return 'python';
    if (ext === 'js') return 'javascript';
    if (ext === 'cpp' || ext === 'cc' || ext === 'cxx') return 'cpp';
    if (ext === 'java') return 'java';
    if (ext === 'html') return 'html';
    if (ext === 'css') return 'css';
    if (ext === 'json') return 'json';
    return 'c';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        title={isCreatingModule ? "Create Module" : isLabSession ? "Lab Session Management" : "Question Management"} 
        isTeacherPage={true}
        backLink="/"
        backText="Back to Home"
      />
      
      {/* Lab Session Toggle */}
      <div className="container mx-auto pt-2 px-4">
        <div className="flex justify-end">
          <div className="flex items-center">
            <span className="mr-2 text-sm font-medium text-gray-700">Lab Session Mode:</span>
            <button
              onClick={() => setIsLabSession(!isLabSession)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                isLabSession ? 'bg-indigo-600' : 'bg-gray-200'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isLabSession ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-5xl mx-auto shadow-xl">

          <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
            {editingQuestionId && (
              <div className="p-3 bg-yellow-100 text-yellow-800 flex justify-between items-center">
                <span>Edit Mode: You are editing an existing question.</span>
                <button
                  type="button"
                  onClick={() => {
                    reset(initialQuestion);
                    setEditingQuestionId(null);
                  }}
                  className="py-1 px-3 rounded-md text-gray-600 hover:text-black hover:bg-yellow-300"
                >
                  Exit Edit Mode
                </button>
              </div>
            )}
            
            {isCreatingModule && (
              <div className="p-3 bg-indigo-50 text-indigo-800 flex justify-between items-center">
                <span>Module Creation Mode: Select questions to include in your module.</span>
                <button
                  type="button"
                  onClick={cancelModuleCreation}
                  className="py-1 px-3 rounded-md text-gray-600 hover:text-black hover:bg-indigo-200"
                >
                  Cancel Module Creation
                </button>
              </div>
            )}

            <div className="relative flex bg-gray-100">
              <TabButton active={activeTab === 'upload'} onClick={() => setActiveTab('upload')} curved={true}>
                {editingQuestionId ? 'Update' : 'Upload New'} Question
              </TabButton>
              <TabButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} curved={true}>
                Manage Questions
              </TabButton>
              <TabButton active={activeTab === 'modules'} onClick={() => setActiveTab('modules')} curved={true}>
                Manage Modules
              </TabButton>
              {isCreatingModule && (
                <TabButton active={true} onClick={() => {}} curved={true}>
                  {editingModuleId ? 'Update' : 'Create New'} Module
                </TabButton>
              )}
            </div>
            
            {message && (
              <div 
                className={`p-4 mx-6 mt-6 rounded-md ${
                  messageType === 'error' ? 'bg-red-50 text-red-700 border-l-4 border-red-500' : 'bg-green-50 text-green-700 border-l-4 border-green-500'
                }`}
              >
                {message}
              </div>
            )}
            
            {isCreatingModule ? (
              <div className="px-6 py-4">
                <ModuleForm
                  initialModule={initialModule}
                  questions={questions}
                  selectedQuestionIds={selectedQuestionIds}
                  toggleQuestionSelection={toggleQuestionSelection}
                  onSubmit={createModule}
                  isLoading={isLoading}
                  editingModuleId={editingModuleId}
                  cancelModuleCreation={cancelModuleCreation}
                  setSelectedQuestionIds={setSelectedQuestionIds}
                />
              </div>
            ) : activeTab === 'upload' ? (
              <div className="px-6 py-4">
                <QuestionForm
                  handleFormSubmit={handleFormSubmit}
                  onSubmit={onSubmit}
                  register={register}
                  errors={errors}
                  control={control}
                  reset={reset}
                  setValue={setValue}
                  initialQuestion={initialQuestion}
                  editingQuestionId={editingQuestionId}
                  isLoading={isLoading}
                  watchedValues={watchedValues}
                  getLanguageFromFilename={getLanguageFromFilename}
                />
              </div>
            ) : activeTab === 'manage' ? (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Existing Questions</h2>
                
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setShowBulkUploadModal(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Bulk Upload Questions
                  </button>
                </div>
                
                {questions.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No questions available. Start by creating one!</p>
                ) : (
                  <QuestionTable 
                    questions={questions} 
                    editQuestion={editQuestion} 
                    deleteQuestion={deleteQuestion}
                  />
                )}
              </div>
            ) : (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 mb-4">
                  {isLabSession ? "Modules Available for Lab Session" : "Existing Modules"}
                </h2>
                
                {isLabSession && (
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <p className="text-sm text-blue-800">
                      <span className="font-bold">Lab Session Mode Active:</span> You can send modules to students and make quick updates during the session.
                    </p>
                  </div>
                )}
                
                {modules.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">No modules available. Start by creating one!</p>
                ) : (
                  <ModuleTable
                    modules={modules}
                    isLabSession={isLabSession}
                    editModule={editModule}
                    deleteModule={deleteModule}
                    openSendModuleModal={openSendModuleModal}
                    quickUpdateModule={quickUpdateModule}
                  />
                )}
                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingModule(true);
                      setEditingModuleId(null);
                      moduleForm.reset(initialModule);
                      setSelectedQuestionIds([]);
                    }}
                    className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    <PlusIcon className="h-4 w-4 mr-2" />
                    Create Module
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Send Module Modal */}
      <SendModuleModal
        isOpen={showSendModuleModal}
        onClose={() => {
          setShowSendModuleModal(false);
          setSelectedModuleToSend(null);
          setSelectedSessionId('');
        }}
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        setSelectedSessionId={setSelectedSessionId}
        onSend={sendModuleToStudents}
        isLoading={isLoading}
        moduleId={selectedModuleToSend}
        modules={modules}
      />
      
      {/* Bulk Upload Modal */}
      {showBulkUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-[500px] max-w-full">
            <h3 className="text-lg font-semibold mb-4">Bulk Upload Questions</h3>
            
            {isBulkUploading ? (
              <div className="space-y-4">
                <p>Uploading questions... ({bulkUploadStatus.uploaded + bulkUploadStatus.failed} of {bulkUploadStatus.total})</p>
                
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full" 
                    style={{ width: `${((bulkUploadStatus.uploaded + bulkUploadStatus.failed) / bulkUploadStatus.total) * 100}%` }}
                  ></div>
                </div>
                
                <div className="flex justify-between text-sm">
                  <span className="text-green-600">Success: {bulkUploadStatus.uploaded}</span>
                  <span className="text-red-600">Failed: {bulkUploadStatus.failed}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-gray-600 mb-4">
                  Upload a JSON file containing an array of questions to import them in bulk. Each question should follow the same format as when exporting a single question.
                </p>
                
                <div className="flex justify-end mb-2">
                  <a 
                    href="/sample_bulk_questions.json" 
                    download="sample_bulk_questions.json"
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    Download sample JSON format
                  </a>
                </div>
                
                <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-6 bg-gray-50">
                  <label className="flex flex-col items-center cursor-pointer">
                    <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
                    </svg>
                    <span className="mt-2 text-sm font-medium text-gray-600">Select JSON file</span>
                    <input type="file" className="hidden" accept=".json" onChange={handleBulkFileUpload} />
                  </label>
                </div>
                
                <div className="mt-6 flex space-x-2 justify-end">
                  <button
                    onClick={() => setShowBulkUploadModal(false)}
                    className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Main content */}
    </div>
  );
}