import { useForm } from 'react-hook-form';
import axios from 'axios';
import { FormSection, FormLabel, ErrorMessage } from '../FormComponents';
import { CheckIcon, PlusIcon } from '@heroicons/react/24/outline';
import { API_BASE } from '../../config';

const ModuleForm = ({ 
  initialModule, 
  questions, 
  selectedQuestionIds, 
  toggleQuestionSelection, 
  onSubmit, 
  isLoading, 
  editingModuleId, 
  cancelModuleCreation,
  setSelectedQuestionIds,
  batches = []
}) => {
  const moduleForm = useForm({
    defaultValues: initialModule
  });

  const resetToDB = async (moduleId) => {
    try {
      const response = await axios.get(`${API_BASE}/api/modules/${moduleId}`);
      moduleForm.reset({
        moduleName: response.data.name,
        description: response.data.description || '',
        lab: response.data.lab,
        maxMarks: response.data.maxMarks,
        date: response.data.date ? new Date(response.data.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
        durationMinutes: response.data.durationMinutes || 60,
        targetBatch: response.data.targetBatch || '',
        sessionSlot: response.data.sessionSlot || 'AN'
      });
      setSelectedQuestionIds(response.data.questions.map(q => typeof q === 'object' ? q._id : q));
    } catch(err) {
      console.error('Error fetching module for reset:', err);
    }
  };

  return (
    <form onSubmit={moduleForm.handleSubmit(onSubmit)} className="space-y-6">
      <FormSection title="Module Details">
        <div>
          <FormLabel htmlFor="moduleName" required>Module Name</FormLabel>
          <input 
            id="moduleName"
            {...moduleForm.register('moduleName', { required: true })}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
            placeholder="Enter a descriptive name for this module"
          />
          {moduleForm.formState.errors.moduleName && (
            <ErrorMessage>Module name is required</ErrorMessage>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <FormLabel htmlFor="moduleDate" required>Date</FormLabel>
            <input
              id="moduleDate"
              type="date"
              {...moduleForm.register('date', { required: true })}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <FormLabel htmlFor="durationMinutes" required>Test Duration</FormLabel>
            <input
              id="durationMinutes"
              type="number"
              min="1"
              {...moduleForm.register('durationMinutes', { required: true, valueAsNumber: true })}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Minutes"
            />
          </div>

          <div>
            <FormLabel htmlFor="targetBatch">Batch</FormLabel>
            <select
              id="targetBatch"
              {...moduleForm.register('targetBatch')}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">All batches</option>
              {batches.map((batch) => (
                <option key={batch._id || batch.name} value={batch.name}>
                  {batch.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <FormLabel htmlFor="sessionSlot" required>Session</FormLabel>
            <select
              id="sessionSlot"
              {...moduleForm.register('sessionSlot', { required: true })}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="AN">AN</option>
              <option value="FN">FN</option>
            </select>
          </div>
        </div>
        
        <div>
          <FormLabel htmlFor="moduleDescription">Description</FormLabel>
          <textarea 
            id="moduleDescription"
            {...moduleForm.register('description')}
            className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 h-24" 
            placeholder="Describe the purpose and content of this module"
          />
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <FormLabel htmlFor="moduleLab" required>Lab ID</FormLabel>
            <input 
              id="moduleLab"
              {...moduleForm.register('lab', { required: true })}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
              placeholder="Associate with a lab"
            />
            {moduleForm.formState.errors.lab && (
              <ErrorMessage>Lab ID is required</ErrorMessage>
            )}
          </div>
          
          <div>
            <FormLabel htmlFor="moduleMaxMarks">Max Marks</FormLabel>
            <input 
              id="moduleMaxMarks"
              type="number" 
              {...moduleForm.register('maxMarks', { valueAsNumber: true })}
              className="w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
              placeholder="Total possible marks"
            />
          </div>
        </div>
      </FormSection>
      
      <FormSection title="Selected Questions">
        <div className="mb-3 text-sm text-gray-500">
          {selectedQuestionIds.length === 0 ? (
            <p className="italic">No questions selected yet. Select questions from the list below.</p>
          ) : (
            <p>Selected <span className="font-medium text-indigo-600">{selectedQuestionIds.length}</span> questions</p>
          )}
        </div>
        
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full bg-white">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-16 px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Select</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Server Tests</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client Tests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {questions.map((q) => (
                <tr key={q._id} className={selectedQuestionIds.includes(q._id) ? "bg-indigo-50" : ""}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleQuestionSelection(q._id)}
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          selectedQuestionIds.includes(q._id) 
                          ? "bg-indigo-600 text-white" 
                          : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        }`}
                      >
                        {selectedQuestionIds.includes(q._id) ? (
                          <CheckIcon className="w-4 h-4" />
                        ) : (
                          <PlusIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{q.title}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{q.testCases?.server?.length || 0}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{q.testCases?.client?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </FormSection>
      
      <div className="pt-4 border-t flex space-x-4">
        <button
          type="button"
          onClick={() => moduleForm.reset(initialModule)}
          className="flex-1 py-2 px-4 border rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
        >
          Clear Form
        </button>
        {editingModuleId && (
          <button
            type="button"
            onClick={() => resetToDB(editingModuleId)}
            className="flex-1 py-2 px-4 border rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
          >
            Reset to DB
          </button>
        )}
        <button
          type="button"
          onClick={cancelModuleCreation}
          className="flex-1 py-2 px-4 border rounded-md text-gray-700 bg-gray-100 hover:bg-gray-200"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          disabled={isLoading || questions.length === 0}
          className="flex-1 flex justify-center py-2.5 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all duration-200"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {editingModuleId ? 'Updating' : 'Creating'} Module...
            </>
          ) : editingModuleId ? 'Update Module' : 'Create Module'}
        </button>
      </div>
    </form>
  );
};

export default ModuleForm;
