export const TaskCategory = {
  MY_DAY: 'My Day',
  GROCERY: 'Grocery',
  ERRANDS: 'Errands',
  WORK: 'Work',
  HOME: 'Home',
  WISHLIST: 'Wishlist'
} as const;
export type TaskCategory = typeof TaskCategory[keyof typeof TaskCategory];

export const Priority = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low'
} as const;
export type Priority = typeof Priority[keyof typeof Priority];

export const ReminderType = {
  TIME: 'time',
  LOCATION: 'location',
  DEPENDENCY: 'dependency'
} as const;
export type ReminderType = typeof ReminderType[keyof typeof ReminderType];

export interface Reminder {
  id: string;
  type: ReminderType;
  value: string | number; // timestamp, location string, or task ID
  enabled: boolean;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  dueDate?: number;
  priority?: Priority;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  category: TaskCategory;
  createdAt: number;
  dueDate?: number;
  subTasks?: SubTask[];
  notes?: string;
  
  // New properties for prioritization and collaboration
  priority?: Priority;
  estimatedTime?: number; // in minutes
  reminders?: Reminder[];
  assigneeId?: string;
  comments?: Comment[];
  taskListId?: string; // Optional: if it belongs to a shared list

  // For shopping items
  priceEstimate?: string;
  productLink?: string;
  // For errands
  locationName?: string;
  coordinates?: { lat: number; lng: number };
}

export interface TaskList {
  id: string;
  title: string;
  ownerId: string;
  memberIds: string[]; // IDs of users who have access
}

export interface MapSearchResult {
  uri?: string;
  title?: string;
  address?: string;
  rating?: number;
}

export interface RoutePlan {
  steps: string[];
  totalTime: string;
  mapLink: string;
}

export interface GiftIdea {
  name: string;
  reason: string;
  price?: string;
  link?: string;
}

export interface TimeBlock {
  taskId: string;
  startTime: string; // e.g., "09:00 AM"
  endTime: string;   // e.g., "10:00 AM"
}

export interface ErrandPlan {
  explanation: string;
  orderedTaskIds: string[];
  timeBlocks?: TimeBlock[];
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string; // ISO string
  end: string;   // ISO string
}

export interface Place {
  id: string;
  name: string;
  address: string;
  rating?: number;
  uri?: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  accessToken?: string;
  savedPlaces?: Place[];
}