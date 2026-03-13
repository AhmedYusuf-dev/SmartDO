import { Task, TaskCategory } from "../types";

// Mock data to simulate external APIs
const MOCK_GOOGLE_TASKS = [
  { title: "Review Q3 Marketing Report", category: TaskCategory.WORK, completed: false },
  { title: "Call insurance company", category: TaskCategory.ERRANDS, completed: false },
  { title: "Buy birthday gift for Sarah", category: TaskCategory.WISHLIST, completed: false },
  { title: "Weekly sync with design team", category: TaskCategory.WORK, completed: true },
];

const MOCK_MS_TODO_TASKS = [
  { title: "Update Windows license", category: TaskCategory.WORK, completed: false },
  { title: "Pick up dry cleaning", category: TaskCategory.ERRANDS, completed: false },
  { title: "Grocery shopping: Milk, Eggs, Bread", category: TaskCategory.GROCERY, completed: false },
  { title: "Schedule dentist appointment", category: TaskCategory.MY_DAY, completed: false },
];

export async function fetchExternalTasks(provider: 'google' | 'microsoft'): Promise<Partial<Task>[]> {
  // Simulate network latency
  await new Promise(resolve => setTimeout(resolve, 1500));

  if (provider === 'google') {
    return MOCK_GOOGLE_TASKS;
  } else {
    return MOCK_MS_TODO_TASKS;
  }
}