import React, { useState } from 'react';
import { parseTaskInput } from '../services/geminiService';
import { Task, TaskCategory, SubTask, Priority } from '../types';

interface SmartInputProps {
  onAddTask: (task: Task) => void;
}

export default function SmartInput({ onAddTask }: SmartInputProps) {
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingTask, setPendingTask] = useState<Partial<Task> | null>(null);

  // For selection state of subtasks
  const [selectedSubTaskIds, setSelectedSubTaskIds] = useState<Set<string>>(new Set());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    setIsProcessing(true);
    try {
      const partialTask = await parseTaskInput(input);
      setPendingTask(partialTask);
      
      // Select all subtasks by default
      if (partialTask.subTasks) {
        setSelectedSubTaskIds(new Set(partialTask.subTasks.map(st => st.id)));
      }
      
      setInput('');
    } catch (error) {
      console.error("AI parsing failed", error);
      // Fallback to manual review with basic data
      setPendingTask({
        title: input,
        category: TaskCategory.MY_DAY,
        subTasks: []
      });
      setInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualEntry = () => {
    setPendingTask({
      title: "",
      category: TaskCategory.MY_DAY,
      dueDate: undefined,
      subTasks: []
    });
    setInput("");
  };

  const setQuickDate = (type: 'today' | 'tomorrow' | 'weekend' | 'next-week') => {
    if (!pendingTask) return;
    const date = new Date();
    // Set to noon to be safe with timezones for simple dates
    date.setHours(12, 0, 0, 0);

    if (type === 'tomorrow') date.setDate(date.getDate() + 1);
    if (type === 'weekend') {
        // Next Saturday
        const day = date.getDay();
        const dist = 6 - day + (day >= 6 ? 7 : 0);
        date.setDate(date.getDate() + dist);
    }
    if (type === 'next-week') {
        // Next Monday
        const d = date.getDay();
        const diff = (1 + 7 - d) % 7 || 7;
        date.setDate(date.getDate() + diff);
    }
    // today is default (already set)
    
    setPendingTask({ ...pendingTask, dueDate: date.getTime() });
  };

  const handleConfirm = () => {
    if (!pendingTask || !pendingTask.title) return;

    const finalSubTasks = pendingTask.subTasks?.filter(st => selectedSubTaskIds.has(st.id)) || [];

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: pendingTask.title,
      completed: false,
      category: pendingTask.category || TaskCategory.MY_DAY,
      createdAt: Date.now(),
      dueDate: pendingTask.dueDate,
      priority: pendingTask.priority,
      estimatedTime: pendingTask.estimatedTime,
      subTasks: finalSubTasks
    };

    onAddTask(newTask);
    setPendingTask(null);
    setSelectedSubTaskIds(new Set());
  };

  const handleCancel = () => {
    // Restore input so user can edit their original text if they want
    if (pendingTask?.title) setInput(pendingTask.title);
    setPendingTask(null);
    setSelectedSubTaskIds(new Set());
  };

  const updatePendingCategory = (cat: TaskCategory) => {
    if (pendingTask) {
      setPendingTask({ ...pendingTask, category: cat });
    }
  };

  const updatePendingTitle = (val: string) => {
    if (pendingTask) {
      setPendingTask({ ...pendingTask, title: val });
    }
  };
  
  const updatePendingDate = (val: string) => {
    if (pendingTask) {
      const timestamp = val ? new Date(val).getTime() : undefined;
      setPendingTask({ ...pendingTask, dueDate: timestamp });
    }
  }

  const updatePendingPriority = (val: Priority) => {
    if (pendingTask) {
      setPendingTask({ ...pendingTask, priority: val });
    }
  };

  const updatePendingEstimatedTime = (val: number) => {
    if (pendingTask) {
      setPendingTask({ ...pendingTask, estimatedTime: val });
    }
  };

  const toggleSubTaskSelection = (id: string) => {
    const newSet = new Set(selectedSubTaskIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedSubTaskIds(newSet);
  };

  // Helper to get YYYY-MM-DD from timestamp for input[type="date"]
  const getInputValueDate = (ts?: number) => {
    if (!ts) return "";
    return new Date(ts).toISOString().split('T')[0];
  };

  return (
    <div className="relative w-full">
      {/* Review Card - appears above the input */}
      {pendingTask && (
        <div className="absolute bottom-full mb-4 left-0 w-full bg-white rounded-xl shadow-2xl border border-indigo-50 overflow-hidden animate-fadeIn z-20">
          <div className="p-4 space-y-4">
            <div className="flex justify-between items-start">
               <h3 className="text-xs font-semibold text-indigo-600 uppercase tracking-wider">
                 {pendingTask.title ? 'Review Suggestion' : 'New Task'}
               </h3>
               <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                   <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                 </svg>
               </button>
            </div>

            {/* Title Input */}
            <input
              type="text"
              value={pendingTask.title || ''}
              onChange={(e) => updatePendingTitle(e.target.value)}
              className="w-full text-lg font-bold text-gray-800 border-b border-gray-200 focus:border-indigo-500 outline-none py-1 placeholder-gray-400 bg-transparent"
              placeholder="What needs to be done?"
              autoFocus
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Categories */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium uppercase">Category</label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(TaskCategory).map(cat => (
                    <button
                      key={cat}
                      onClick={() => updatePendingCategory(cat)}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors border ${
                        pendingTask.category === cat
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date Input */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium uppercase">Due Date</label>
                <input 
                  type="date"
                  value={getInputValueDate(pendingTask.dueDate)}
                  onChange={(e) => updatePendingDate(e.target.value)}
                  className="w-full text-sm p-2 rounded-lg border border-gray-200 focus:border-blue-500 outline-none text-gray-700 bg-gray-50/50"
                />
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setQuickDate('today')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-md transition-colors text-gray-600 border border-transparent hover:border-indigo-200">Today</button>
                  <button onClick={() => setQuickDate('tomorrow')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-md transition-colors text-gray-600 border border-transparent hover:border-indigo-200">Tomorrow</button>
                  <button onClick={() => setQuickDate('weekend')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-md transition-colors text-gray-600 border border-transparent hover:border-indigo-200">Weekend</button>
                  <button onClick={() => setQuickDate('next-week')} className="px-2 py-1 text-xs bg-gray-100 hover:bg-indigo-100 hover:text-indigo-600 rounded-md transition-colors text-gray-600 border border-transparent hover:border-indigo-200">Next Week</button>
                </div>
              </div>

              {/* Priority */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium uppercase">Priority</label>
                <div className="flex flex-wrap gap-2">
                  {Object.values(Priority).map(p => (
                    <button
                      key={p}
                      onClick={() => updatePendingPriority(p)}
                      className={`px-3 py-1 text-xs rounded-full font-medium transition-colors border ${
                        pendingTask.priority === p
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Time */}
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium uppercase">Est. Time (mins)</label>
                <input 
                  type="number"
                  min="0"
                  step="5"
                  value={pendingTask.estimatedTime || ''}
                  onChange={(e) => updatePendingEstimatedTime(parseInt(e.target.value) || 0)}
                  className="w-full text-sm p-2 rounded-lg border border-gray-200 focus:border-indigo-500 outline-none text-gray-700 bg-gray-50/50"
                  placeholder="e.g. 30"
                />
              </div>
            </div>

            {/* Subtasks */}
            {pendingTask.subTasks && pendingTask.subTasks.length > 0 && (
              <div className="space-y-2">
                <label className="text-xs text-gray-400 font-medium uppercase">Suggested Steps</label>
                <div className="bg-gray-50 rounded-lg p-2 space-y-1 border border-gray-100">
                  {pendingTask.subTasks.map(st => (
                    <div 
                      key={st.id} 
                      onClick={() => toggleSubTaskSelection(st.id)}
                      className="flex items-center gap-3 p-2 rounded hover:bg-white transition-colors cursor-pointer group select-none"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        selectedSubTaskIds.has(st.id) ? 'bg-indigo-500 border-indigo-500' : 'border-gray-300 bg-white'
                      }`}>
                        {selectedSubTaskIds.has(st.id) && (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white">
                            <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-sm flex-1 ${selectedSubTaskIds.has(st.id) ? 'text-gray-800' : 'text-gray-400'}`}>
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex gap-3">
              <button 
                onClick={handleConfirm}
                disabled={!pendingTask.title?.trim()}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
              >
                Create Task {selectedSubTaskIds.size > 0 && `(+${selectedSubTaskIds.size} steps)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Input */}
      <form onSubmit={handleSubmit} className={`relative flex items-center transition-all duration-300 ${pendingTask ? 'opacity-40 blur-[1px] pointer-events-none' : 'opacity-100'}`}>
        <div className="absolute left-4 text-gray-400 pointer-events-none">
          {isProcessing ? (
             <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
             </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          )}
        </div>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a task (e.g., 'Plan a trip to Paris')..."
          className="w-full py-4 pl-12 pr-14 bg-white/80 backdrop-blur-md rounded-xl shadow-lg border-0 focus:ring-2 focus:ring-indigo-500/50 text-gray-800 placeholder-gray-400 transition-all outline-none"
          disabled={isProcessing}
        />
        <button
          type="button"
          onClick={handleManualEntry}
          className="absolute right-3 p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
          title="Create manually"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
          </svg>
        </button>
      </form>
    </div>
  );
}