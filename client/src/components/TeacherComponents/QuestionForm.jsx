import { useState } from 'react';
import { Controller } from 'react-hook-form';
import axios from 'axios';
import { FormSection, FormLabel, ErrorMessage } from '../FormComponents';
import TiptapEditor from '../TiptapEditor';
import Editor from "@monaco-editor/react";
import { PlusIcon } from '@heroicons/react/24/outline';

const SUPPORTED_LANGUAGES = [
  { key: 'c', label: 'C' },
  { key: 'java', label: 'Java' },
];

// Import JSON reads a file straight off disk, bypassing the backend's
// toJSON normalization — so a JSON export from before this feature (base
// name with an extension baked in, precode as a single string) needs the
// same legacy handling applied here on the client.
function normalizeFiles(rawFiles) {
  if (!Array.isArray(rawFiles)) return [];
  return rawFiles.map((f) => {
    const name = (f.name || '').replace(/\.(c|java)$/i, '');
    const legacyLang = /\.java$/i.test(f.name || '') ? 'java' : 'c';
    let precode;
    if (typeof f.precode === 'string') {
      precode = { c: '', java: '', [legacyLang]: f.precode };
    } else {
      precode = { c: '', java: '', ...(f.precode || {}) };
    }
    return { ...f, name, precode };
  });
}

const defaultSampleEvalScript = `START_TCPDUMP "tcp" "\${SERVER_PORT[0]}" "transfer.pcap"
sleep 2

COMPILE_RUN "\$TAG_s1" myserver \${SERVER_PORT[0]}
CHECK_PORT "127.0.0.1:\${SERVER_PORT[0]}" "0.0.0.0:0000" myserver tcp LISTEN

for tc in 1 2 3; do
  COMPILE_RUN "\$TAG_c1" myclient \${CLIENT_PORT[0]}
  INPUT myclient input \${tc} 1
  sleep 2
  END_TCPDUMP
  EVALUATE tcp \${tc}
  START_TCPDUMP "tcp" "\${SERVER_PORT[0]}" "transfer.pcap"
  sleep 1
done

CLEAR_ALL`;

const QuestionForm = ({
  handleFormSubmit,
  onSubmit,
  register,
  errors,
  control,
  reset,
  initialQuestion,
  editingQuestionId,
  isLoading,
  watchedValues,
  setValue,
}) => {
  const files = watchedValues.files || [];
  // Which language tab (C/Java) is currently showing in each file's editor —
  // purely local UI state, not part of the saved question.
  const [activeLangByIdx, setActiveLangByIdx] = useState({});

  const addFile = () => {
    const name = prompt('File name, without extension (e.g. server):');
    if (!name) return;
    const tag = prompt('Tag for this file (e.g. s1, c1, c2):');
    if (!tag) return;
    setValue('files', [
      ...files,
      { name: name.replace(/\.(c|java)$/i, ''), tag, precode: { c: '', java: '' } },
    ]);
  };

  const removeFile = (idx) => {
    setValue('files', files.filter((_, i) => i !== idx));
  };

  const updateFile = (idx, field, value) => {
    const next = [...files];
    next[idx] = { ...next[idx], [field]: value };
    setValue('files', next);
  };

  const updateFilePrecode = (idx, lang, value) => {
    const current = files[idx]?.precode || {};
    updateFile(idx, 'precode', { ...current, [lang]: value });
  };

  const activeLangFor = (idx) => activeLangByIdx[idx] || 'c';

  return (
    <form onSubmit={handleFormSubmit(onSubmit)} className="space-y-8">
      <FormSection title="Basic Information">
        <div>
          <FormLabel htmlFor="title" required>Question Title</FormLabel>
          <input
            id="title"
            {...register('title', { required: 'Title is required' })}
            className="w-full border rounded-md px-3 py-2"
            placeholder="TCP Echo Server"
          />
          {errors.title && <ErrorMessage>{errors.title.message}</ErrorMessage>}
        </div>

        <div>
          <FormLabel htmlFor="description" required>Description</FormLabel>
          <Controller
            name="description"
            control={control}
            rules={{ required: 'Description is required' }}
            render={({ field }) => (
              <TiptapEditor value={field.value} onChange={field.onChange} />
            )}
          />
          {errors.description && <ErrorMessage>{errors.description.message}</ErrorMessage>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <FormLabel htmlFor="questionKey">Question Key</FormLabel>
            <input
              id="questionKey"
              {...register('questionKey')}
              className="w-full border rounded-md px-3 py-2"
              placeholder="q1"
            />
            <p className="text-xs text-gray-500 mt-1">Used in testcases.json and CSV (q1, q2, …)</p>
          </div>
          <div>
            <FormLabel htmlFor="maxMarks">Max Marks (teacher assigns manually)</FormLabel>
            <input
              id="maxMarks"
              type="number"
              {...register('maxMarks', { valueAsNumber: true })}
              className="w-full border rounded-md px-3 py-2"
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Code Files">
        <p className="text-sm text-gray-600 mb-3">
          Each file has a custom tag (s1, c1, c2, …) used in testcases and to be referenced easily
          in evaluation. Give each file a base name only, without an extension — the student's
          own language choice (C or Java) decides which extension and which boilerplate below
          they actually get.
        </p>
        <button
          type="button"
          onClick={addFile}
          className="inline-flex items-center px-3 py-1.5 border rounded text-sm mb-4"
        >
          <PlusIcon className="w-4 h-4 mr-1" /> Add File
        </button>

        {files.map((file, idx) => {
          const activeLang = activeLangFor(idx);
          return (
            <div key={idx} className="mb-4 border rounded-lg overflow-hidden">
              <div className="flex gap-3 items-center px-4 py-2 bg-gray-100">
                <input
                  value={file.name}
                  onChange={(e) => updateFile(idx, 'name', e.target.value.replace(/\.(c|java)$/i, ''))}
                  className="border rounded px-2 py-1 text-sm flex-1"
                  placeholder="server"
                />
                <input
                  value={file.tag}
                  onChange={(e) => updateFile(idx, 'tag', e.target.value)}
                  className="border rounded px-2 py-1 text-sm w-24"
                  placeholder="s1"
                />
                <button type="button" onClick={() => removeFile(idx)} className="text-red-500 text-sm">Remove</button>
              </div>
              <div className="flex gap-1 px-4 pt-2 bg-white border-b">
                {SUPPORTED_LANGUAGES.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveLangByIdx((prev) => ({ ...prev, [idx]: key }))}
                    className={`px-3 py-1.5 text-xs font-medium rounded-t-md border border-b-0 ${
                      activeLang === key
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="h-48">
                <Editor
                  height="100%"
                  language={activeLang}
                  value={file.precode?.[activeLang] || ''}
                  onChange={(v) => updateFilePrecode(idx, activeLang, v ?? '')}
                  options={{ minimap: { enabled: false }, fontSize: 13 }}
                />
              </div>
            </div>
          );
        })}
      </FormSection>

      <FormSection title="Evaluation Data (copied to container at run time)">
        <div className="mb-4">
          <FormLabel>Input file (stdin lines for INPUT command)</FormLabel>
          <Controller
            name="input"
            control={control}
            render={({ field }) => (
              <Editor
                height="120px"
                language="plaintext"
                value={field.value || ''}
                onChange={field.onChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            )}
          />
        </div>

        <div className="mb-4">
          <FormLabel>testcases.json content</FormLabel>
          <Controller
            name="testcases"
            control={control}
            render={({ field }) => (
              <Editor
                height="200px"
                language="json"
                value={typeof field.value === 'string' ? field.value : JSON.stringify(field.value || {}, null, 2)}
                onChange={(v) => {
                  try {
                    field.onChange(JSON.parse(v || '{}'));
                  } catch {
                    field.onChange(v);
                  }
                }}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            )}
          />
        </div>

        <div>
          <FormLabel>nice.sh body (question-specific flow only)</FormLabel>
          <Controller
            name="evalScript"
            control={control}
            render={({ field }) => (
              <Editor
                height="280px"
                language="shell"
                value={field.value || defaultSampleEvalScript}
                onChange={field.onChange}
                options={{ minimap: { enabled: false }, fontSize: 13 }}
              />
            )}
          />
        </div>
      </FormSection>

      <FormSection title="Import JSON">
        <input
          type="file"
          accept=".json"
          className="text-sm"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              try {
                const data = JSON.parse(ev.target.result);
                reset({
                  title: data.title || '',
                  description: data.description || '',
                  questionKey: data.questionKey || 'q1',
                  maxMarks: data.maxMarks || 15,
                  files: normalizeFiles(data.files || []),
                  testcases: data.testcases || {},
                  input: data.input || '',
                  evalScript: data.evalScript || data.evalscripts?.['nice.sh'] || defaultSampleEvalScript,
                });
              } catch (err) {
                alert('Invalid JSON: ' + err.message);
              }
            };
            reader.readAsText(file);
          }}
        />
      </FormSection>

      <div className="pt-4 border-t flex space-x-4">
        <button type="button" onClick={() => reset(initialQuestion)} className="flex-1 py-2 border rounded-md bg-gray-100">
          Clear Form
        </button>
        {editingQuestionId && (
          <button
            type="button"
            onClick={async () => {
              const response = await axios.get(`http://localhost:5001/api/questions/${editingQuestionId}`);
              reset(response.data);
            }}
            className="flex-1 py-2 border rounded-md bg-gray-100"
          >
            Reset to DB
          </button>
        )}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-2.5 rounded-md text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70"
      >
        {isLoading ? 'Saving…' : editingQuestionId ? 'Update Question' : 'Upload Question'}
      </button>
    </form>
  );
};

export default QuestionForm;