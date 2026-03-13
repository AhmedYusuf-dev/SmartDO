import React, { useState, useEffect, useRef } from 'react';
import { Task, TaskCategory, ErrandPlan, User, TaskList } from './types';
import TaskItem from './components/TaskItem';
import TodayPlan from './components/TodayPlan';
import SmartInput from './components/SmartInput';
import AuthModal from './components/AuthModal';
import { organizeErrands, smartPlanDay, prioritizeTasks } from './services/geminiService';
import { io, Socket } from 'socket.io-client';
import { Users, Zap } from 'lucide-react';

export default function App() {
  // User State
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem('smartdo_user') || localStorage.getItem('orbit_user');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Task State
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('smartdo_tasks') || localStorage.getItem('orbit_tasks');
    return saved ? JSON.parse(saved) : [];
  });
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);

  const [activeCategory, setActiveCategory] = useState<TaskCategory | 'All' | 'Today'>('All');
  const [aiSuggestion, setAiSuggestion] = useState<ErrandPlan | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isPrioritizing, setIsPrioritizing] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [overdueTask, setOverdueTask] = useState<Task | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Check for overdue tasks
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdue = tasks.find(t => !t.completed && t.dueDate && t.dueDate < today.getTime());
    if (overdue) {
      setOverdueTask(overdue);
    }
  }, [tasks]);

  const handleReschedule = (newDate: string) => {
    if (overdueTask) {
      updateTask(overdueTask.id, { dueDate: new Date(newDate).getTime() });
      setOverdueTask(null);
    }
  };

  // Socket connection
  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on('init', (data: { tasks: Task[], taskLists: TaskList[], users: User[] }) => {
      if (data.tasks && data.tasks.length > 0) {
        setTasks(data.tasks);
      }
      if (data.taskLists) {
        setTaskLists(data.taskLists);
      }
      setOnlineUsers(data.users || []);
    });

    socketRef.current.on('users_updated', (users: User[]) => {
      setOnlineUsers(users);
    });

    socketRef.current.on('task_created', (task: Task) => {
      setTasks(prev => {
        if (!prev.find(t => t.id === task.id)) {
          return [task, ...prev];
        }
        return prev;
      });
    });

    socketRef.current.on('task_updated', (taskUpdate: Partial<Task> & { id: string }) => {
      setTasks(prev => prev.map(t => t.id === taskUpdate.id ? { ...t, ...taskUpdate } : t));
    });

    socketRef.current.on('task_deleted', (taskId: string) => {
      setTasks(prev => prev.filter(t => t.id !== taskId));
    });

    socketRef.current.on('list_created', (list: TaskList) => {
      setTaskLists(prev => {
        if (!prev.find(l => l.id === list.id)) {
          return [...prev, list];
        }
        return prev;
      });
    });

    socketRef.current.on('list_updated', (listUpdate: Partial<TaskList> & { id: string }) => {
      setTaskLists(prev => prev.map(l => l.id === listUpdate.id ? { ...l, ...listUpdate } : l));
    });

    socketRef.current.on('list_deleted', (listId: string) => {
      setTaskLists(prev => prev.filter(l => l.id !== listId));
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (user && socketRef.current) {
      socketRef.current.emit('join', user);
    }
  }, [user]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('smartdo_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (user) {
      localStorage.setItem('smartdo_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('smartdo_user');
    }
  }, [user]);

  // Auth Handlers
  const handleAuthSuccess = (newUser: User) => {
    setUser(newUser);
    setIsAuthOpen(false);
  };

  const handleLogout = () => {
    setUser(null);
    setAiSuggestion(null);
    // Optional: Clear tasks on logout if we want multi-user simulation
    // setTasks([]); 
  };

  // Task Handlers
  const addTask = (task: Task) => {
    setTasks(prev => [task, ...prev]);
    socketRef.current?.emit('task_created', task);
  };

  const toggleTask = (id: string) => {
    setTasks(prev => {
      const newTasks = prev.map(t => 
        t.id === id ? { ...t, completed: !t.completed } : t
      );
      const updatedTask = newTasks.find(t => t.id === id);
      if (updatedTask) {
        socketRef.current?.emit('task_updated', { id, completed: updatedTask.completed });
      }
      return newTasks;
    });
  };

  const deleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    socketRef.current?.emit('task_deleted', id);
  };

  const updateTask = (id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => 
      t.id === id ? { ...t, ...updates } : t
    ));
    socketRef.current?.emit('task_updated', { id, ...updates });
  };

  const handleSmartPlan = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    
    setIsPlanning(true);
    setAiSuggestion(null);
    try {
      let calendarEvents = [];
      if (user.accessToken) {
        try {
          // Fetch today's events from Google Calendar
          const startOfDay = new Date();
          startOfDay.setHours(0, 0, 0, 0);
          const endOfDay = new Date();
          endOfDay.setHours(23, 59, 59, 999);
          
          const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${startOfDay.toISOString()}&timeMax=${endOfDay.toISOString()}&singleEvents=true&orderBy=startTime`, {
            headers: { Authorization: `Bearer ${user.accessToken}` }
          });
          
          if (response.ok) {
            const data = await response.json();
            calendarEvents = data.items || [];
          } else {
            console.warn("Failed to fetch calendar events, proceeding without them.");
          }
        } catch (err) {
          console.warn("Error fetching calendar events:", err);
        }
      }

      // Mock location for now, or request real one
      const plan = await smartPlanDay(tasks, { lat: 40.7128, lng: -74.0060 }, calendarEvents);
      setAiSuggestion(plan);
    } catch (e) {
      console.error(e);
      setAiSuggestion({ explanation: "Failed to plan your day. Please try again.", orderedTaskIds: [] });
    } finally {
      setIsPlanning(false);
    }
  };

  const handlePrioritize = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    
    setIsPrioritizing(true);
    try {
      const prioritizedTasks = await prioritizeTasks(tasks);
      setTasks(prioritizedTasks);
      // We could emit a bulk update here if needed, but for now just update local state
    } catch (e) {
      console.error(e);
    } finally {
      setIsPrioritizing(false);
    }
  };

  const applyOptimizedOrder = () => {
    if (!aiSuggestion || aiSuggestion.orderedTaskIds.length === 0) return;

    const orderedIds = new Set(aiSuggestion.orderedTaskIds);
    const orderedTasks = aiSuggestion.orderedTaskIds
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is Task => !!t);
    
    const remainingTasks = tasks.filter(t => !orderedIds.has(t.id));

    setTasks([...orderedTasks, ...remainingTasks]);
    setAiSuggestion(null);
  };

  const filteredTasks = tasks.filter(t => {
    if (activeCategory === 'All') return true;
    if (activeCategory === 'Today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return t.dueDate && t.dueDate >= today.getTime() && t.dueDate < tomorrow.getTime();
    }
    return t.category === activeCategory;
  });

  const categories = ['All', 'Today', 'Today Plan', ...Object.values(TaskCategory)];

  return (
    <div className="flex h-screen overflow-hidden font-sans">
      <AuthModal 
        isOpen={isAuthOpen} 
        onClose={() => setIsAuthOpen(false)} 
        onAuthSuccess={handleAuthSuccess} 
      />

      {overdueTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-lg max-w-sm w-full">
            <h3 className="text-lg font-bold mb-4">Task Overdue: {overdueTask.title}</h3>
            <p className="text-sm text-gray-600 mb-4">This task was due on {new Date(overdueTask.dueDate!).toLocaleDateString()}. Please reschedule it.</p>
            <input 
              type="date" 
              onChange={(e) => handleReschedule(e.target.value)}
              className="w-full p-2 border rounded mb-4"
            />
            <button onClick={() => setOverdueTask(null)} className="w-full bg-gray-200 py-2 rounded">Cancel</button>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col p-4 z-10">
        <div className="flex items-center gap-2 mb-8 px-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold shadow-indigo-200 shadow-lg">S</div>
          <h1 className="text-xl font-bold text-gray-800 tracking-tight">SmartDo</h1>
        </div>
        
        {/* User Profile Section (Sidebar) */}
        {user ? (
          <div className="mb-6 px-2">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 border border-gray-100">
              <img 
                src={user.avatarUrl} 
                alt={user.name} 
                className="w-10 h-10 rounded-full border border-white shadow-sm" 
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800 truncate">{user.name}</p>
                <p className="text-xs text-gray-500 truncate">Free Plan</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="mb-6 px-2">
             <button
               onClick={() => setIsAuthOpen(true)}
               className="w-full bg-gray-900 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition-all shadow-md flex items-center justify-center gap-2"
             >
               Sign In
             </button>
          </div>
        )}

        <nav className="space-y-1 flex-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat as any)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center justify-between ${
                activeCategory === cat 
                  ? 'bg-indigo-50 text-indigo-700' 
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{cat}</span>
              {cat !== 'All' && cat !== 'Today' && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${activeCategory === cat ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                  {tasks.filter(t => t.category === cat && !t.completed).length}
                </span>
              )}
            </button>
          ))}
          
          <div className="pt-6 pb-2">
            <h3 className="px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">Shared Lists</h3>
          </div>
          {taskLists.map(list => (
            <button
              key={list.id}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-all duration-200"
            >
              {list.title}
            </button>
          ))}
          <button
            onClick={() => {
              const title = prompt('Enter list title:');
              if (title && user) {
                const newList: TaskList = {
                  id: crypto.randomUUID(),
                  title,
                  ownerId: user.id,
                  memberIds: [user.id]
                };
                setTaskLists(prev => [...prev, newList]);
                socketRef.current?.emit('list_created', newList);
              }
            }}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-all duration-200 flex items-center gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            New List
          </button>
        </nav>

        <div className="mt-auto space-y-4">
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100/50">
             <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-3 flex items-center gap-2">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                 <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.96l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.96 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.96l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 5.618-5.618.682a1 1 0 000 1.898l5.618.682.682 5.618a1 1 0 001.898 0l.682-5.618 5.618-.682a1 1 0 000-1.898l-5.618-.682-.682-5.618z" />
               </svg>
               AI Assistant
             </h4>
             <button 
               onClick={handleSmartPlan}
               disabled={isPlanning}
               className="w-full text-left text-sm text-indigo-700 hover:text-indigo-900 flex items-center gap-2 group transition-colors mb-2"
             >
               {isPlanning ? (
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-75"></div>
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-150"></div>
                 </div>
               ) : (
                 <>
                   <span>Smart Plan My Day</span>
                   <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity ml-auto">
                     <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                   </svg>
                 </>
               )}
             </button>
             <button 
               onClick={handlePrioritize}
               disabled={isPrioritizing}
               className="w-full text-left text-sm text-indigo-700 hover:text-indigo-900 flex items-center gap-2 group transition-colors"
             >
               {isPrioritizing ? (
                 <div className="flex items-center gap-2">
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce"></div>
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-75"></div>
                   <div className="w-2 h-2 bg-indigo-600 rounded-full animate-bounce delay-150"></div>
                 </div>
               ) : (
                 <>
                   <Zap className="w-4 h-4" />
                   <span>Prioritize Tasks</span>
                 </>
               )}
             </button>
          </div>

          {user && (
            <button 
              onClick={handleLogout}
              className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-red-600 transition-colors flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              Sign Out
            </button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full bg-[#f8fafc]">
        {/* Header (Mobile) */}
        <header className="md:hidden bg-white border-b p-4 flex items-center justify-between sticky top-0 z-20">
          <span className="font-bold text-gray-800">Orbit</span>
          <div className="flex items-center gap-2">
            {!user ? (
               <button onClick={() => setIsAuthOpen(true)} className="text-sm font-medium text-blue-600">Sign In</button>
            ) : (
               <img src={user.avatarUrl} alt="Avatar" className="w-8 h-8 rounded-full border" />
            )}
            <select 
              value={activeCategory}
              onChange={(e) => setActiveCategory(e.target.value as any)}
              className="text-sm border-none bg-transparent font-medium text-gray-600 focus:ring-0"
            >
               {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="space-y-1 flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-bold text-gray-900 tracking-tight">
                  {activeCategory === 'All' ? 'My Orbit' : activeCategory}
                </h2>
                <p className="text-gray-500 font-medium">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              {onlineUsers.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Users className="w-4 h-4" />
                  <span>{onlineUsers.length} online</span>
                </div>
              )}
            </div>

            {activeCategory === 'Today Plan' ? (
              <TodayPlan 
                tasks={tasks} 
                aiSuggestion={aiSuggestion} 
                onReplan={handleSmartPlan} 
              />
            ) : aiSuggestion && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-blue-100 relative overflow-hidden animate-fadeIn">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-blue-500"></div>
                <div className="flex justify-between items-start mb-3">
                   <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                     <div className="p-1 bg-blue-100 rounded-md">
                       <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-600">
                         <path fillRule="evenodd" d="M9.315 7.584C12.195 3.883 16.695 1.5 21.75 1.5a.75.75 0 01.75.75c0 5.056-2.383 9.555-6.084 12.436h.67a.75.75 0 01.75.75v4.963a.75.75 0 01-.75.75H20.67a.75.75 0 01.75.75v2.463a.75.75 0 01-.75.75h-2.463a.75.75 0 01-.75-.75V20.67a.75.75 0 01.75-.75h.67v-4.963a.75.75 0 01.75-.75h.67l-6.936-6.626zM5 19.5a.75.75 0 01.75-.75h2.463a.75.75 0 01.75.75v2.463a.75.75 0 01-.75.75H5.75a.75.75 0 01-.75-.75V19.5zm3.963-.75H13.5V13.5H8.963v5.25z" clipRule="evenodd" />
                       </svg>
                     </div>
                     Smart Plan
                   </h3>
                   <button onClick={() => setAiSuggestion(null)} className="text-gray-400 hover:text-gray-600">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                       <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                     </svg>
                   </button>
                </div>
                <div className="text-gray-600 mb-4 text-sm leading-relaxed">
                  {aiSuggestion.explanation}
                </div>
                
                {aiSuggestion.timeBlocks && aiSuggestion.timeBlocks.length > 0 && (
                  <div className="mb-4 space-y-2">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Suggested Schedule</h4>
                    <div className="space-y-2">
                      {aiSuggestion.timeBlocks.map((block, idx) => {
                        const task = tasks.find(t => t.id === block.taskId);
                        if (!task) return null;
                        return (
                          <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-blue-50/50 border border-blue-100/50">
                            <div className="text-xs font-medium text-blue-800 w-24 flex-shrink-0">
                              {block.startTime} - {block.endTime}
                            </div>
                            <div className="text-sm text-gray-700 font-medium truncate">
                              {task.title}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {aiSuggestion.orderedTaskIds.length > 0 && (
                  <button 
                    onClick={applyOptimizedOrder}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-all shadow-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                    </svg>
                    Apply Order
                  </button>
                )}
              </div>
            )}

            <div className="pb-28 space-y-3">
              {filteredTasks.length === 0 ? (
                <div className="text-center py-20 opacity-50">
                   <div className="w-20 h-20 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto mb-6 border border-gray-100 rotate-3">
                     <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 text-gray-300">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                     </svg>
                   </div>
                   <p className="text-gray-400 font-medium">Ready when you are</p>
                </div>
              ) : (
                filteredTasks.map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={toggleTask} 
                    onDelete={deleteTask}
                    onUpdate={updateTask}
                    currentUser={user}
                    onlineUsers={onlineUsers}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Floating Input Area */}
        <div className="absolute bottom-0 left-0 w-full px-4 md:px-8 pb-6 pt-12 bg-gradient-to-t from-[#f8fafc] via-[#f8fafc] to-transparent pointer-events-none">
           <div className="max-w-3xl mx-auto pointer-events-auto">
             <SmartInput onAddTask={addTask} />
           </div>
        </div>
      </main>
    </div>
  );
}
