import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import Airtable from 'airtable';
import type { Task, TaskList, User } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Airtable
let base: Airtable.Base | null = null;
const airtableApiKey = process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY;
const airtableBaseId = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;

if (airtableApiKey && airtableBaseId) {
  base = new Airtable({ apiKey: airtableApiKey }).base(airtableBaseId);
  console.log('Airtable initialized successfully in server');
} else {
  console.warn('Airtable credentials not found in server environment');
}

async function saveUserToAirtable(user: User) {
  if (!base) {
    console.warn('Airtable not initialized, skipping saveUserToAirtable');
    return;
  }
  try {
    // Check if user already exists
    const existingRecords = await base('Users').select({
      filterByFormula: `{Email}='${user.email}'`,
      maxRecords: 1
    }).firstPage();

    if (existingRecords && existingRecords.length > 0) {
      console.log(`User ${user.email} already exists in Airtable`);
      return;
    }

    await base('Users').create([
      {
        fields: {
          'ID': user.id,
          'Name': user.name,
          'Email': user.email,
          'Avatar URL': user.avatarUrl || ''
        }
      }
    ]);
    console.log(`Saved user ${user.email} to Airtable`);
  } catch (error) {
    console.error('Error saving to Airtable:', error);
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

  app.get('/api/auth/google/url', (req, res) => {
    const clientRedirectUri = req.query.redirect_uri as string;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID || '',
      redirect_uri: clientRedirectUri,
      response_type: 'code',
      scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
      access_type: 'online',
      prompt: 'consent'
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.json({ url: authUrl });
  });

  // In-memory user store
  const users: User[] = [];

  app.get('/api/debug/env', (req, res) => {
    res.json({
      hasAirtableKey: !!(process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY),
      hasAirtableBase: !!(process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID),
      hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasViteGoogleClientId: !!process.env.VITE_GOOGLE_CLIENT_ID
    });
  });

  app.get('/api/debug/airtable', async (req, res) => {
    const apiKey = process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY;
    const baseId = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;
    if (!apiKey || !baseId) return res.json({ error: 'Missing credentials' });
    try {
      const response = await fetch(`https://api.airtable.com/v0/meta/bases/${baseId}/tables`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      const data = await response.json();
      res.json({ status: response.status, data });
    } catch (e: any) {
      res.json({ error: e.message });
    }
  });

  app.post('/api/test-airtable', async (req, res) => {
    const apiKey = process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY;
    const baseId = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;
    const tableName = req.body.tableName || 'Users';

    if (!apiKey || !baseId) {
      return res.status(400).json({ success: false, error: 'Missing Airtable credentials in environment variables.' });
    }

    try {
      const url = `https://api.airtable.com/v0/${baseId}/${tableName}?maxRecords=1`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ 
          success: false, 
          status: response.status,
          error: errData.error?.message || response.statusText,
          type: errData.error?.type,
          details: 'This usually means the Base ID is wrong, the API Token lacks permissions, or the Table Name is incorrect.'
        });
      }
      
      const data = await response.json();
      return res.json({ success: true, message: `Successfully connected to table '${tableName}'!`, records: data.records });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  app.post('/api/saveUser', async (req, res) => {
    console.log('Received request to /api/saveUser', req.body);
    const { user } = req.body;
    const apiKey = process.env.VITE_AIRTABLE_API_KEY || process.env.AIRTABLE_API_KEY;
    const baseId = process.env.VITE_AIRTABLE_BASE_ID || process.env.AIRTABLE_BASE_ID;

    if (!apiKey || !baseId) {
      console.error('Airtable credentials not configured in server environment');
      return res.status(500).json({ error: 'Airtable credentials not configured' });
    }

    try {
      const url = `https://api.airtable.com/v0/${baseId}/Users`;
      console.log(`Checking if user exists at ${url}`);
      const checkRes = await fetch(`${url}?filterByFormula={Email}='${encodeURIComponent(user.email)}'`, {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      
      if (!checkRes.ok) {
        const errText = await checkRes.text();
        console.error('Failed to check Airtable:', checkRes.status, errText);
        throw new Error(`Failed to check Airtable: ${checkRes.status} ${errText}`);
      }
      
      const checkData = await checkRes.json();
      if (checkData.records && checkData.records.length > 0) {
        console.log('User already exists in Airtable');
        return res.status(200).json({ message: 'User already exists' });
      }
      
      console.log('Creating new user in Airtable');
      const createRes = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [{
            fields: {
              'ID': user.id,
              'Name': user.name,
              'Email': user.email,
              'Avatar URL': user.avatarUrl || ''
            }
          }]
        })
      });
      
      if (!createRes.ok) {
        const errText = await createRes.text();
        console.error('Failed to save to Airtable:', createRes.status, errText);
        throw new Error(`Failed to save to Airtable: ${createRes.status} ${errText}`);
      }
      
      console.log('Successfully saved user to Airtable');
      res.status(200).json({ message: 'Successfully saved user to Airtable' });
    } catch (err: any) {
      console.error('Airtable sync error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/signup', async (req, res) => {
    try {
      const { email, password, username } = req.body;
      if (users.find(u => u.email === email)) {
        return res.status(400).json({ message: 'User already exists' });
      }
      const user = { id: crypto.randomUUID(), email, name: username, avatarUrl: `https://ui-avatars.com/api/?name=${username}` };
      users.push(user);
      
      // Save to Airtable
      await saveUserToAirtable(user);
      
      res.json({ user });
    } catch (error: any) {
      console.error('Signup error:', error);
      res.status(500).json({ message: 'Internal server error during signup' });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      const user = users.find(u => u.email === email);
      if (!user) {
        return res.status(400).json({ message: 'User not found' });
      }
      // In a real app, verify password here
      res.json({ user });
    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ message: 'Internal server error during login' });
    }
  });

  app.post('/api/user/places', (req, res) => {
    const { userId, place } = req.body;
    const user = users.find(u => u.id === userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    if (!user.savedPlaces) user.savedPlaces = [];
    user.savedPlaces.push(place);
    res.json({ user });
  });

  app.get('/api/user/places/:userId', (req, res) => {
    const user = users.find(u => u.id === req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ places: user.savedPlaces || [] });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code, state } = req.query;
    const redirectUri = state as string;

    try {
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID || '',
          client_secret: GOOGLE_CLIENT_SECRET || '',
          code: code as string,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        })
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(tokenData.error_description || 'Failed to get tokens');
      }

      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });

      const userData = await userResponse.json();

      const user = {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        avatarUrl: userData.picture,
        accessToken: tokenData.access_token
      };

      // Save to Airtable
      await saveUserToAirtable(user);

      res.send(`
        <html>
          <body>
            <script>
              if (window.opener) {
                window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS', user: ${JSON.stringify(user)} }, '*');
                window.close();
              } else {
                window.location.href = '/';
              }
            </script>
            <p>Authentication successful. This window should close automatically.</p>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('OAuth Error:', error);
      res.status(500).send('Authentication failed');
    }
  });

  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // In-memory storage for demo purposes
  let tasks: Task[] = [];
  let taskLists: TaskList[] = [];
  let onlineUsers: User[] = [];

  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send initial state
    socket.emit('init', { tasks, taskLists, users: onlineUsers });

    socket.on('join', (user: User) => {
      if (!onlineUsers.find(u => u.id === user.id)) {
        onlineUsers.push(user);
        io.emit('users_updated', onlineUsers);
      }
    });

    socket.on('task_created', (task: Task) => {
      tasks.push(task);
      socket.broadcast.emit('task_created', task);
    });

    socket.on('task_updated', (taskUpdate: Partial<Task> & { id: string }) => {
      tasks = tasks.map(t => t.id === taskUpdate.id ? { ...t, ...taskUpdate } : t);
      socket.broadcast.emit('task_updated', taskUpdate);
    });

    socket.on('task_deleted', (taskId: string) => {
      tasks = tasks.filter(t => t.id !== taskId);
      socket.broadcast.emit('task_deleted', taskId);
    });

    socket.on('list_created', (list: TaskList) => {
      taskLists.push(list);
      socket.broadcast.emit('list_created', list);
    });

    socket.on('list_updated', (listUpdate: Partial<TaskList> & { id: string }) => {
      taskLists = taskLists.map(l => l.id === listUpdate.id ? { ...l, ...listUpdate } : l);
      socket.broadcast.emit('list_updated', listUpdate);
    });

    socket.on('list_deleted', (listId: string) => {
      taskLists = taskLists.filter(l => l.id !== listId);
      socket.broadcast.emit('list_deleted', listId);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
