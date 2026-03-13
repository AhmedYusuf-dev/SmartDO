import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { Task, TaskList, User } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

  app.post('/api/auth/signup', (req, res) => {
    const { email, password, username } = req.body;
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const user = { id: crypto.randomUUID(), email, name: username, avatarUrl: `https://ui-avatars.com/api/?name=${username}` };
    users.push(user);
    res.json({ user });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    // In a real app, verify password here
    res.json({ user });
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
