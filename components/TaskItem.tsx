import React, { useState } from 'react';
import { Task, SubTask, Priority, Comment, User, Place } from '../types';
import { Clock, AlertCircle, MessageSquare, Send, User as UserIcon, MapPin, Bookmark } from 'lucide-react';
import { suggestPlaces } from '../services/geminiService';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Task>) => void;
  currentUser?: { id: string, name: string } | null;
  onlineUsers?: User[];
  onSavePlace?: (place: Place) => void;
}

const TaskItem: React.FC<TaskItemProps> = ({ task, onToggle, onDelete, onUpdate, currentUser, onlineUsers = [], onSavePlace }) => {
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [newSubTaskTitle, setNewSubTaskTitle] = useState('');
  const [newComment, setNewComment] = useState('');
  const [suggestedPlaces, setSuggestedPlaces] = useState<Place[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [editingSubTaskId, setEditingSubTaskId] = useState<string | null>(null);

  const hasNotes = task.notes && task.notes.trim().length > 0;
  const subTasks = task.subTasks || [];

  const handleFindPlaces = async () => {
    setIsSearching(true);
    try {
      const places = await suggestPlaces(task.title, { lat: 40.7128, lng: -74.0060 });
      setSuggestedPlaces(places);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddSubTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubTaskTitle.trim()) return;

    const newSubTask: SubTask = {
      id: crypto.randomUUID(),
      title: newSubTaskTitle,
      completed: false
    };

    onUpdate(task.id, { subTasks: [...subTasks, newSubTask] });
    setNewSubTaskTitle('');
  };

  const toggleSubTask = (subTaskId: string) => {
    const updatedSubTasks = subTasks.map(st => 
      st.id === subTaskId ? { ...st, completed: !st.completed } : st
    );
    onUpdate(task.id, { subTasks: updatedSubTasks });
  };

  const deleteSubTask = (subTaskId: string) => {
    const updatedSubTasks = subTasks.filter(st => st.id !== subTaskId);
    onUpdate(task.id, { subTasks: updatedSubTasks });
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentUser) return;

    const comment: Comment = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      userName: currentUser.name,
      text: newComment,
      createdAt: Date.now()
    };

    onUpdate(task.id, { comments: [...(task.comments || []), comment] });
    setNewComment('');
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Reset time for accurate date comparison
    today.setHours(0,0,0,0);
    tomorrow.setHours(0,0,0,0);
    const d = new Date(date);
    d.setHours(0,0,0,0);

    if (d.getTime() === today.getTime()) return "Today";
    if (d.getTime() === tomorrow.getTime()) return "Tomorrow";
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const createGoogleCalendarLink = () => {
    const baseUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE";
    const text = `&text=${encodeURIComponent(task.title)}`;
    const details = `&details=${encodeURIComponent(task.notes || "")}`;
    
    let dates = "";
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      // Format YYYYMMDD
      const dateStr = d.toISOString().replace(/-|:|\.\d\d\d/g, "").substring(0, 8);
      // All day event assumption for simplicity: YYYYMMDD/YYYYMMDD (next day)
      const nextDay = new Date(task.dueDate + 86400000);
      const nextDayStr = nextDay.toISOString().replace(/-|:|\.\d\d\d/g, "").substring(0, 8);
      dates = `&dates=${dateStr}/${nextDayStr}`;
    } else {
      // Default to next hour if no date set
      const now = new Date();
      const nowStr = now.toISOString().replace(/-|:|\.\d\d\d/g, "").substring(0, 15) + "Z";
      const hourLater = new Date(now.getTime() + 60*60*1000);
      const hourLaterStr = hourLater.toISOString().replace(/-|:|\.\d\d\d/g, "").substring(0, 15) + "Z";
      dates = `&dates=${nowStr}/${hourLaterStr}`;
    }

    return `${baseUrl}${text}${details}${dates}`;
  };

  const dateLabel = formatDate(task.dueDate);

  return (
    <div className="group bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-all border border-transparent hover:border-gray-100">
      <div className="flex items-start gap-3">
        {/* Main Task Checkbox */}
        <button 
          onClick={() => onToggle(task.id)}
          className={`mt-1 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.completed 
              ? 'bg-indigo-500 border-indigo-500 text-white' 
              : 'border-gray-300 hover:border-indigo-400'
          }`}
        >
          {task.completed && (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
              <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
            </svg>
          )}
        </button>
        
        <div className="flex-1">
          {/* Main Title */}
          <h3 className={`font-medium text-gray-800 transition-all ${task.completed ? 'line-through text-gray-400' : ''}`}>
            {task.title}
          </h3>
          
          {/* Subtasks List */}
          {subTasks.length > 0 && (
            <div className="mt-3 space-y-2">
              {subTasks.map(st => (
                <div key={st.id} className="flex items-center gap-2 group/sub relative p-1 hover:bg-gray-50 rounded">
                  <div className="flex items-center gap-3 w-full">
                     <button 
                      onClick={(e) => { e.stopPropagation(); toggleSubTask(st.id); }}
                      className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${
                         st.completed
                          ? 'bg-indigo-400 border-indigo-400 text-white'
                          : 'border-gray-300 hover:border-indigo-300'
                      }`}
                    >
                       {st.completed && (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-2.5 h-2.5">
                           <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
                         </svg>
                       )}
                    </button>
                    
                    {editingSubTaskId === st.id ? (
                      <input
                        type="text"
                        value={st.title}
                        onChange={(e) => {
                          const updatedSubTasks = subTasks.map(s => s.id === st.id ? { ...s, title: e.target.value } : s);
                          onUpdate(task.id, { subTasks: updatedSubTasks });
                        }}
                        onBlur={() => setEditingSubTaskId(null)}
                        onKeyDown={(e) => e.key === 'Enter' && setEditingSubTaskId(null)}
                        className="text-sm flex-1 bg-white border border-indigo-300 rounded px-1 outline-none"
                        autoFocus
                      />
                    ) : (
                      <span 
                        onClick={() => setEditingSubTaskId(st.id)}
                        className={`text-sm flex-1 cursor-pointer ${st.completed ? 'line-through text-gray-400' : 'text-gray-600'}`}
                      >
                        {st.title}
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      {st.dueDate && (
                        <span className="text-[10px] text-gray-400">{new Date(st.dueDate).toLocaleDateString()}</span>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSubTask(st.id); }}
                        className="opacity-0 group-hover/sub:opacity-100 text-gray-300 hover:text-red-400 p-0.5 transition-opacity"
                        title="Delete step"
                      >
                         <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                           <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                         </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2 mt-2 flex-wrap">
             <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">
               {task.category}
             </span>
             
             {task.priority && (
               <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                 task.priority === Priority.HIGH ? 'bg-red-100 text-red-700' :
                 task.priority === Priority.MEDIUM ? 'bg-orange-100 text-orange-700' :
                 'bg-green-100 text-green-700'
               }`}>
                 <AlertCircle className="w-3 h-3" />
                 {task.priority}
               </span>
             )}

             {task.estimatedTime && (
               <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium flex items-center gap-1">
                 <Clock className="w-3 h-3" />
                 {task.estimatedTime}m
               </span>
             )}

             {/* Assignee Selection */}
             <div className="relative group/assignee">
               <button className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 transition-colors ${
                 task.assigneeId 
                   ? 'bg-purple-50 text-purple-600 hover:bg-purple-100' 
                   : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
               }`}>
                 <UserIcon className="w-3 h-3" />
                 {task.assigneeId ? (onlineUsers.find(u => u.id === task.assigneeId)?.name || 'Unknown') : 'Assign'}
               </button>
               <div className="absolute left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 hidden group-hover/assignee:block w-40">
                 <button 
                   onClick={() => onUpdate(task.id, { assigneeId: undefined })}
                   className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                 >
                   Unassigned
                 </button>
                 {onlineUsers.map(u => (
                   <button 
                     key={u.id}
                     onClick={() => onUpdate(task.id, { assigneeId: u.id })}
                     className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                   >
                     <img src={u.avatarUrl} alt={u.name} className="w-4 h-4 rounded-full" />
                     {u.name}
                   </button>
                 ))}
               </div>
             </div>
             
             {/* Date Badge */}
             {dateLabel && (
               <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                 dateLabel === "Today" ? 'bg-amber-100 text-amber-700' : 
                 dateLabel === "Tomorrow" ? 'bg-indigo-50 text-indigo-600' : 
                 'bg-gray-100 text-gray-500'
               }`}>
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
                   <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                 </svg>
                 {dateLabel}
               </span>
             )}

             {(hasNotes || (subTasks.length > 0 && !isNotesOpen)) && (
               <div className="flex items-center gap-2">
                 {hasNotes && !isNotesOpen && (
                   <div className="flex items-center text-gray-400" title="Has notes">
                     <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                       <path fillRule="evenodd" d="M10 2c-1.716 0-3.408.106-5.07.31C3.806 2.45 3 3.414 3 4.517V17.25a.75.75 0 001.075.676L10 15.082l5.925 2.844A.75.75 0 0017 17.25V4.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0010 2z" clipRule="evenodd" />
                     </svg>
                   </div>
                 )}
                 {subTasks.length > 0 && !isNotesOpen && (
                   <div className="text-xs text-gray-400 font-medium">
                     {subTasks.filter(s => s.completed).length}/{subTasks.length}
                   </div>
                 )}
                 {task.comments && task.comments.length > 0 && !isNotesOpen && (
                   <div className="flex items-center gap-1 text-xs text-gray-400 font-medium">
                     <MessageSquare className="w-3.5 h-3.5" />
                     {task.comments.length}
                   </div>
                 )}
               </div>
             )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => setIsNotesOpen(!isNotesOpen)}
            className={`p-1 rounded hover:bg-gray-100 transition-colors ${isNotesOpen ? 'text-indigo-500 bg-indigo-50' : 'text-gray-300 hover:text-indigo-500'}`}
            title={isNotesOpen ? "Close details" : "View details"}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </button>
          <button 
            onClick={() => onDelete(task.id)}
            className="p-1 rounded hover:bg-gray-100 text-gray-300 hover:text-red-500 transition-colors"
            title="Delete task"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>
      
      {isNotesOpen && (
        <div className="mt-4 pl-1 border-t border-gray-100 pt-3 animate-fadeIn space-y-4">
           {/* Subtasks Management */}
           <div className="space-y-2">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Steps</h4>
             
             {/* Add Subtask Form */}
             <form onSubmit={handleAddSubTask} className="flex items-center gap-2 pl-1">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-500">
                  <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                </svg>
                <input
                  type="text"
                  value={newSubTaskTitle}
                  onChange={(e) => setNewSubTaskTitle(e.target.value)}
                  placeholder="Add a step..."
                  className="flex-1 text-sm bg-transparent border-b border-gray-200 focus:border-indigo-500 outline-none py-1 placeholder-gray-400 transition-colors"
                />
             </form>
           </div>

           {/* Date & Calendar */}
           <div className="space-y-2">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Details</h4>
              <div className="flex flex-wrap items-center gap-3">
                <input 
                  type="date"
                  value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdate(task.id, { dueDate: val ? new Date(val).getTime() : undefined });
                  }}
                  className="text-sm p-2 rounded border border-gray-200 focus:border-indigo-500 outline-none text-gray-700"
                />
                
                <select
                  value={task.priority || ''}
                  onChange={(e) => onUpdate(task.id, { priority: e.target.value as Priority || undefined })}
                  className="text-sm p-2 rounded border border-gray-200 focus:border-indigo-500 outline-none text-gray-700 bg-white"
                >
                  <option value="">No Priority</option>
                  <option value={Priority.HIGH}>High Priority</option>
                  <option value={Priority.MEDIUM}>Medium Priority</option>
                  <option value={Priority.LOW}>Low Priority</option>
                </select>

                <div className="flex items-center border border-gray-200 rounded focus-within:border-indigo-500 bg-white overflow-hidden">
                  <input
                    type="number"
                    min="5"
                    step="5"
                    placeholder="Est. mins"
                    value={task.estimatedTime || ''}
                    onChange={(e) => onUpdate(task.id, { estimatedTime: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="text-sm p-2 w-24 outline-none text-gray-700"
                  />
                  <span className="text-sm text-gray-500 pr-2 bg-gray-50 h-full flex items-center">min</span>
                </div>
                
                <a 
                  href={createGoogleCalendarLink()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-3 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" />
                  </svg>
                  Add to Google Calendar
                </a>
              </div>
           </div>

           {/* Notes */}
           <div className="space-y-2">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Notes</h4>
             <textarea
              value={task.notes || ''}
              onChange={(e) => onUpdate(task.id, { notes: e.target.value })}
              placeholder="Add details..."
              className="w-full text-sm text-gray-700 bg-yellow-50/30 focus:bg-white border border-transparent focus:border-indigo-200 rounded-md p-3 focus:ring-2 focus:ring-indigo-100 transition-all resize-none placeholder-gray-400 outline-none"
              rows={3}
            />
           </div>

           {/* Comments */}
           <div className="space-y-3">
             <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider pl-1">Comments</h4>
             
             {task.comments && task.comments.length > 0 && (
               <div className="space-y-2 pl-1 max-h-40 overflow-y-auto custom-scrollbar">
                 {task.comments.map(comment => (
                   <div key={comment.id} className="bg-gray-50 rounded-lg p-2 text-sm">
                     <div className="flex justify-between items-center mb-1">
                       <span className="font-medium text-gray-700">{comment.userName}</span>
                       <span className="text-xs text-gray-400">
                         {new Date(comment.createdAt).toLocaleDateString()}
                       </span>
                     </div>
                     <p className="text-gray-600">{comment.text}</p>
                   </div>
                 ))}
               </div>
             )}

             {currentUser ? (
               <form onSubmit={handleAddComment} className="flex items-center gap-2 pl-1">
                 <input
                   type="text"
                   value={newComment}
                   onChange={(e) => setNewComment(e.target.value)}
                   placeholder="Add a comment..."
                   className="flex-1 text-sm bg-gray-50 border border-gray-200 focus:border-indigo-500 rounded-lg px-3 py-2 outline-none placeholder-gray-400 transition-colors"
                 />
                 <button 
                   type="submit"
                   disabled={!newComment.trim()}
                   className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                 >
                   <Send className="w-4 h-4" />
                 </button>
               </form>
             ) : (
               <p className="text-xs text-gray-500 pl-1 italic">Sign in to add comments.</p>
             )}
           </div>
        </div>
      )}
    </div>
  );
};

export default TaskItem;