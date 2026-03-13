import React, { useState, useEffect } from 'react';
import { Task, TaskCategory } from '../types';
import { fetchExternalTasks } from '../services/integrationService';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (tasks: Task[]) => void;
}

type Step = 'select-provider' | 'authenticating' | 'select-tasks';
type Provider = 'google' | 'microsoft';

export default function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
  const [step, setStep] = useState<Step>('select-provider');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [fetchedTasks, setFetchedTasks] = useState<Partial<Task>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('select-provider');
      setProvider(null);
      setFetchedTasks([]);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const performFetch = async (p: Provider) => {
    try {
      const tasks = await fetchExternalTasks(p);
      setFetchedTasks(tasks);
      setStep('select-tasks');
      // Default to selecting all non-completed tasks
      const initialSelection = new Set<number>();
      tasks.forEach((t, i) => {
        if (!t.completed) initialSelection.add(i);
      });
      setSelectedIndices(initialSelection);
    } catch (e) {
      console.error("Failed to fetch tasks", e);
      setError("Failed to retrieve tasks. Please try again.");
      setStep('select-provider');
    }
  };

  const handleConnect = async (p: Provider) => {
    setProvider(p);
    setStep('authenticating');
    setError(null);

    // Simulate OAuth Popup Flow
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    
    let authWindow: Window | null = null;
    
    try {
      authWindow = window.open(
        'about:blank', 
        'ConnectAccount', 
        `width=${width},height=${height},top=${top},left=${left}`
      );
    } catch (e) {
      console.warn("Popup open failed", e);
    }

    if (authWindow) {
      // Branding colors
      const brandColor = p === 'google' ? '#4285F4' : '#0078D4';
      const brandName = p === 'google' ? 'Google' : 'Microsoft';

      authWindow.document.write(`
        <html>
          <head>
            <title>Sign in to ${brandName}</title>
            <style>
              body { font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background-color: #f8f9fa; }
              .card { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; width: 90%; }
              .loader { margin: 20px auto; width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid ${brandColor}; border-radius: 50%; animation: spin 1s linear infinite; }
              @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
              h2 { color: #333; margin-bottom: 10px; }
              p { color: #666; font-size: 14px; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>${brandName}</h2>
              <div class="loader"></div>
              <p>Connecting to your account...</p>
              <p>Please wait while we verify your credentials.</p>
            </div>
          </body>
        </html>
      `);
      
      // Simulate the time it takes for user to click "Allow" / Authenticate
      setTimeout(() => {
        if (authWindow && !authWindow.closed) {
           authWindow.close();
        }
        performFetch(p);
      }, 2500);
    } else {
      // Fallback if popup is blocked - just wait a bit to simulate
      console.log("Popup blocked, simulating background auth");
      setTimeout(() => {
        performFetch(p);
      }, 1500);
    }
  };

  const toggleSelection = (index: number) => {
    const newSet = new Set(selectedIndices);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedIndices(newSet);
  };

  const executeImport = () => {
    const tasksToImport: Task[] = fetchedTasks
      .filter((_, i) => selectedIndices.has(i))
      .map(t => ({
        id: crypto.randomUUID(),
        title: t.title || "Untitled Task",
        completed: t.completed || false,
        category: t.category || TaskCategory.MY_DAY,
        createdAt: Date.now(),
        subTasks: []
      }));
    
    onImport(tasksToImport);
    resetAndClose();
  };

  const resetAndClose = () => {
    setStep('select-provider');
    setProvider(null);
    setFetchedTasks([]);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-semibold text-gray-800">
            {step === 'select-provider' && 'Import Tasks'}
            {step === 'authenticating' && 'Authenticating...'}
            {step === 'select-tasks' && 'Select Tasks to Import'}
          </h2>
          <button onClick={resetAndClose} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {step === 'select-provider' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">Connect your external accounts to sync tasks directly into Orbit.</p>
              
              <button 
                onClick={() => handleConnect('google')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group relative overflow-hidden"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm z-10">
                   {/* Google G Icon */}
                   <svg className="w-5 h-5" viewBox="0 0 24 24">
                     <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                     <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                     <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                     <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                   </svg>
                </div>
                <div className="text-left z-10">
                  <div className="font-semibold text-gray-800 group-hover:text-indigo-600">Google Tasks</div>
                  <div className="text-xs text-gray-400">Sign in with Google</div>
                </div>
              </button>

              <button 
                onClick={() => handleConnect('microsoft')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all group"
              >
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center shadow-sm">
                   {/* Microsoft Icon */}
                   <svg className="w-5 h-5" viewBox="0 0 23 23">
                     <path fill="#f35325" d="M1 1h10v10H1z"/>
                     <path fill="#81bc06" d="M12 1h10v10H12z"/>
                     <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                     <path fill="#ffba08" d="M12 12h10v10H12z"/>
                   </svg>
                </div>
                <div className="text-left">
                  <div className="font-semibold text-gray-800 group-hover:text-indigo-600">Microsoft To Do</div>
                  <div className="text-xs text-gray-400">Sign in with Microsoft</div>
                </div>
              </button>
            </div>
          )}

          {step === 'authenticating' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
              <p className="text-sm text-gray-500 font-medium">
                Verifying {provider === 'google' ? 'Google' : 'Microsoft'} Account...
              </p>
              <p className="text-xs text-gray-400 text-center max-w-xs">
                A popup window should appear. If not, we'll try to connect automatically.
              </p>
            </div>
          )}

          {step === 'select-tasks' && (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Found {fetchedTasks.length} Tasks</span>
                <button 
                  onClick={() => {
                    if (selectedIndices.size === fetchedTasks.length) {
                      setSelectedIndices(new Set());
                    } else {
                      setSelectedIndices(new Set(fetchedTasks.map((_, i) => i)));
                    }
                  }}
                  className="text-xs text-indigo-600 hover:underline font-medium"
                >
                  {selectedIndices.size === fetchedTasks.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              
              <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                {fetchedTasks.map((task, idx) => (
                  <label 
                    key={idx} 
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedIndices.has(idx) 
                        ? 'bg-indigo-50 border-indigo-200' 
                        : 'bg-white border-gray-100 hover:border-gray-300'
                    }`}
                  >
                    <input 
                      type="checkbox"
                      checked={selectedIndices.has(idx)}
                      onChange={() => toggleSelection(idx)}
                      className="mt-1 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className={`text-sm font-medium ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {task.title}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">{task.category}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'select-tasks' && (
           <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
             <button 
               onClick={resetAndClose}
               className="flex-1 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors"
             >
               Cancel
             </button>
             <button 
               onClick={executeImport}
               disabled={selectedIndices.size === 0}
               className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
             >
               Import ({selectedIndices.size})
             </button>
           </div>
        )}
      </div>
    </div>
  );
}