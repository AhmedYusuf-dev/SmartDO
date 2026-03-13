import React from 'react';
import { Task, ErrandPlan } from '../types';
import { RefreshCw, MapPin, Clock } from 'lucide-react';

interface TodayPlanProps {
  tasks: Task[];
  aiSuggestion: ErrandPlan | null;
  onReplan: () => void;
}

const TodayPlan: React.FC<TodayPlanProps> = ({ tasks, aiSuggestion, onReplan }) => {
  if (!aiSuggestion) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">No plan generated for today yet.</p>
        <button 
          onClick={onReplan}
          className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Generate Plan
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Today's Plan</h2>
        <button 
          onClick={onReplan}
          className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Replan
        </button>
      </div>
      
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <p className="text-gray-600 mb-6">{aiSuggestion.explanation}</p>
        
        <div className="space-y-4">
          {aiSuggestion.timeBlocks?.map((block, idx) => {
            const task = tasks.find(t => t.id === block.taskId);
            if (!task) return null;
            
            return (
              <div key={idx} className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                  <Clock className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-semibold text-gray-700">{block.startTime}</span>
                  <span className="text-xs text-gray-400">{block.endTime}</span>
                </div>
                
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900">{task.title}</h4>
                  {task.locationName && (
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <MapPin className="w-3 h-3" />
                      {task.locationName}
                    </div>
                  )}
                  <p className="text-sm text-gray-600 mt-1">{task.notes}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TodayPlan;
