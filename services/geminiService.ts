import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Task, TaskCategory, ErrandPlan, Place, Priority } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function parseTaskInput(input: string): Promise<Partial<Task>> {
  const modelId = "gemini-3-flash-preview";
  const now = new Date().toISOString();
  
  const response = await ai.models.generateContent({
    model: modelId,
    contents: `Current date-time is ${now}. Analyze this task input: "${input}". 
    Extract:
    - title: The main task description.
    - category: The most suitable category.
    - subTasks: Any mentioned sub-steps as an array.
    - dueDate: A specific date if mentioned (convert relative dates like 'tomorrow', 'next friday', 'in 3 days' to ISO YYYY-MM-DD).
    - priority: The inferred priority (High, Medium, Low) based on urgency or language used.
    - estimatedTime: The estimated time to complete the task in minutes (e.g., "30 mins", "1 hour" -> 60).
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { 
            type: Type.STRING, 
            enum: Object.values(TaskCategory) 
          },
          dueDate: { 
            type: Type.STRING, 
            description: "ISO 8601 date string (YYYY-MM-DD) if a specific date is mentioned, otherwise omit." 
          },
          priority: {
            type: Type.STRING,
            enum: Object.values(Priority)
          },
          estimatedTime: {
            type: Type.NUMBER,
            description: "Estimated time to complete the task in minutes."
          },
          subTasks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                completed: { type: Type.BOOLEAN }
              }
            }
          }
        },
        required: ["title", "category"]
      } as Schema
    }
  });

  const text = response.text;
  if (!text) throw new Error("No response from AI");
  
  const data = JSON.parse(text);
  
  let dueDateTimestamp: number | undefined = undefined;
  if (data.dueDate) {
    const parsedDate = new Date(data.dueDate);
    if (!isNaN(parsedDate.getTime())) {
      dueDateTimestamp = parsedDate.getTime() + 12 * 60 * 60 * 1000;
    }
  }
  
  return {
    title: data.title,
    category: data.category as TaskCategory,
    dueDate: dueDateTimestamp,
    priority: data.priority as Priority,
    estimatedTime: data.estimatedTime,
    subTasks: data.subTasks?.map((st: any) => ({
      ...st,
      id: crypto.randomUUID(),
      completed: false
    })) || []
  };
}

export async function suggestSubtasks(taskTitle: string): Promise<string[]> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `List 3-5 concrete, actionable substeps to complete the task: "${taskTitle}". Return only a JSON array of strings.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  return JSON.parse(response.text || "[]");
}

export async function organizeErrands(tasks: Task[], currentLocation?: { lat: number, lng: number }): Promise<ErrandPlan> {
   const errandTasks = tasks.filter(t => t.category === TaskCategory.ERRANDS || t.category === TaskCategory.GROCERY);
   
   if (errandTasks.length === 0) {
     return { explanation: "No errands or grocery items found to organize.", orderedTaskIds: [] };
   }

   const locationStr = currentLocation ? `My current location is ${currentLocation.lat}, ${currentLocation.lng}.` : "";
   
   // Send ID and Title so AI can return IDs
   const taskList = errandTasks.map(t => `ID: ${t.id}, Task: ${t.title}`).join("\n");

   const response = await ai.models.generateContent({
     model: "gemini-3-flash-preview",
     contents: `I have these errands:\n${taskList}\n\n${locationStr}\nSuggest an efficient order to do these. Return a JSON object with a brief 'explanation' and an array 'orderedTaskIds' containing the IDs in the optimized order.`,
     config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          explanation: { type: Type.STRING },
          orderedTaskIds: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["explanation", "orderedTaskIds"]
      } as Schema
     }
   });

   const text = response.text;
   if (!text) throw new Error("Failed to generate plan");

   return JSON.parse(text) as ErrandPlan;
}

export async function prioritizeTasks(tasks: Task[]): Promise<Task[]> {
  const activeTasks = tasks.filter(t => !t.completed);
  if (activeTasks.length === 0) return tasks;

  const taskList = activeTasks.map(t => 
    `ID: ${t.id}, Title: ${t.title}, Priority: ${t.priority || 'None'}, Est. Time: ${t.estimatedTime || 'Unknown'} mins, Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'None'}`
  ).join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze these tasks and recommend an optimal order for completion based on due dates, priority levels, and estimated time. Return a JSON object with an array 'orderedTaskIds' containing the IDs in the optimized order.\n\nTasks:\n${taskList}`,
    config: {
     responseMimeType: "application/json",
     responseSchema: {
       type: Type.OBJECT,
       properties: {
         orderedTaskIds: {
           type: Type.ARRAY,
           items: { type: Type.STRING }
         }
       },
       required: ["orderedTaskIds"]
     } as Schema
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate prioritization");

  const data = JSON.parse(text);
  const orderedIds = data.orderedTaskIds as string[];
  
  const orderedTasks = orderedIds.map(id => activeTasks.find(t => t.id === id)).filter(Boolean) as Task[];
  const remainingActive = activeTasks.filter(t => !orderedIds.includes(t.id));
  const completedTasks = tasks.filter(t => t.completed);

  return [...orderedTasks, ...remainingActive, ...completedTasks];
}

export async function suggestPlaces(query: string, location: { lat: number, lng: number }): Promise<Place[]> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Suggest 3 places to go or buy things related to: "${query}".`,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: { latitude: location.lat, longitude: location.lng } as any
        }
      }
    }
  });

  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!chunks) return [];

  return chunks
    .filter(c => c.maps)
    .map(c => ({
      id: crypto.randomUUID(),
      name: c.maps?.title || 'Unknown Place',
      address: (c.maps?.placeAnswerSources?.reviewSnippets?.[0] as any)?.source || 'Unknown Address',
      uri: c.maps?.uri
    }));
}

export async function smartPlanDay(tasks: Task[], currentLocation?: { lat: number, lng: number }, calendarEvents?: any[]): Promise<ErrandPlan> {
  const activeTasks = tasks.filter(t => !t.completed);
  
  if (activeTasks.length === 0) {
    return { explanation: "You have no pending tasks to plan! Enjoy your day.", orderedTaskIds: [] };
  }

  const locationStr = currentLocation ? `My current location is ${currentLocation.lat}, ${currentLocation.lng}.` : "";
  const now = new Date().toLocaleString();
  
  const taskList = activeTasks.map(t => 
    `ID: ${t.id}, Task: ${t.title}, Category: ${t.category}, Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'None'}, Est. Time: ${t.estimatedTime || 30} mins`
  ).join("\n");

  const calendarStr = calendarEvents && calendarEvents.length > 0 
    ? `\nHere are my existing calendar events for today (DO NOT schedule tasks during these times):\n${calendarEvents.map(e => `- ${e.summary}: ${new Date(e.start).toLocaleTimeString()} to ${new Date(e.end).toLocaleTimeString()}`).join('\n')}`
    : "\nI have no calendar events today, my schedule is completely open.";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Current time: ${now}. I have these tasks:\n${taskList}\n${locationStr}${calendarStr}\n\nCreate a smart schedule for me today. Prioritize urgent items and group similar tasks. Fit tasks into available free time blocks, avoiding my existing calendar events. Return a JSON object with a brief 'explanation' of the plan, an array 'orderedTaskIds' for the suggested order, and an array 'timeBlocks' assigning a specific 'startTime' and 'endTime' (e.g., "09:00 AM", "10:30 AM") to each 'taskId'. Ensure you leave a 10-15 minute buffer between tasks.`,
    config: {
     responseMimeType: "application/json",
     responseSchema: {
       type: Type.OBJECT,
       properties: {
         explanation: { type: Type.STRING },
         orderedTaskIds: {
           type: Type.ARRAY,
           items: { type: Type.STRING }
         },
         timeBlocks: {
           type: Type.ARRAY,
           items: {
             type: Type.OBJECT,
             properties: {
               taskId: { type: Type.STRING },
               startTime: { type: Type.STRING },
               endTime: { type: Type.STRING }
             },
             required: ["taskId", "startTime", "endTime"]
           }
         }
       },
       required: ["explanation", "orderedTaskIds"]
     } as Schema
    }
  });

  const text = response.text;
  if (!text) throw new Error("Failed to generate plan");

  return JSON.parse(text) as ErrandPlan;
}