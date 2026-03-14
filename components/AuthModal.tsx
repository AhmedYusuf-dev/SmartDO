import React, { useEffect, useState } from 'react';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
}

const saveUserToAirtable = async (user: User) => {
  try {
    const res = await fetch('/api/saveUser', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      console.warn('Failed to sync with Airtable via API:', errorData.error || res.statusText);
    } else {
      console.log('Successfully synced with Airtable');
    }
  } catch (err) {
    console.error('Airtable sync error:', err);
  }
};

export default function AuthModal({ isOpen, onClose, onAuthSuccess }: AuthModalProps) {
  const [error, setError] = useState<string | null>(null);

  const [isEmailMode, setIsEmailMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [isSignup, setIsSignup] = useState(false);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && !origin.endsWith('.vercel.app')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS' && event.data.user) {
        await saveUserToAirtable(event.data.user);
        onAuthSuccess(event.data.user);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess]);

  if (!isOpen) return null;

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // For Vercel/static deployments, we use localStorage to simulate a backend
      const usersStr = localStorage.getItem('smartdo_users') || '[]';
      const users: User[] = JSON.parse(usersStr);

      if (isSignup) {
        if (users.find(u => u.email === email)) {
          throw new Error('User already exists');
        }
        const newUser: User = {
          id: crypto.randomUUID(),
          email,
          name: username,
          avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}`
        };
        users.push(newUser);
        localStorage.setItem('smartdo_users', JSON.stringify(users));
        await saveUserToAirtable(newUser);
        onAuthSuccess(newUser);
      } else {
        const user = users.find(u => u.email === email);
        if (!user) {
          throw new Error('User not found. Please sign up first.');
        }
        // In a real app, verify password here
        await saveUserToAirtable(user);
        onAuthSuccess(user);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      
      if (!clientId) {
        throw new Error('VITE_GOOGLE_CLIENT_ID is not set in environment variables.');
      }

      // Use the frontend callback HTML file for Vercel compatibility
      const redirectUri = `${window.location.origin}/auth/callback.html`;
      
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'token', // Use implicit flow (token) instead of code for frontend-only auth
        scope: 'openid email profile https://www.googleapis.com/auth/calendar.readonly',
        prompt: 'consent'
      });
      
      const finalUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;

      const authWindow = window.open(
        finalUrl,
        'oauth_popup',
        'width=600,height=700'
      );

      if (!authWindow) {
        setError('Please allow popups for this site to connect your account.');
      }
    } catch (err: any) {
      console.error('OAuth error:', err);
      setError(`Failed to initiate login: ${err.message}`);
    }
  };

  const testAirtable = async () => {
    try {
      const res = await fetch('/api/test-airtable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName: 'Users' })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ Airtable connected successfully!');
      } else {
        alert(`❌ Airtable Error: ${data.error}\n\nDetails: ${data.details}`);
      }
    } catch (err: any) {
      alert(`❌ Error: ${err.message}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col relative">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
          </svg>
        </button>

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4 shadow-lg shadow-indigo-200">
              S
            </div>
            <h2 className="text-2xl font-bold text-gray-800">
              Welcome to SmartDo
            </h2>
            <p className="text-gray-500 text-sm mt-2">
              Sign in to sync your tasks and collaborate in real-time.
            </p>
            <button onClick={testAirtable} className="mt-4 text-xs text-indigo-600 hover:underline">
              Test Airtable Connection
            </button>
          </div>

          <div className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm border border-red-100 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            {isEmailMode ? (
              <form onSubmit={handleEmailAuth} className="space-y-4">
                {isSignup && (
                  <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-xl"
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-xl"
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-gray-300 rounded-xl"
                  required
                />
                <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700">
                  {isSignup ? 'Sign Up' : 'Sign In'}
                </button>
                <button type="button" onClick={() => setIsSignup(!isSignup)} className="w-full text-sm text-indigo-600">
                  {isSignup ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
                </button>
                <button type="button" onClick={() => setIsEmailMode(false)} className="w-full text-sm text-gray-500">
                  Back to Google Login
                </button>
              </form>
            ) : (
              <>
                <button
                  onClick={handleGoogleLogin}
                  className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-xl font-medium hover:bg-gray-50 transition-colors flex items-center justify-center gap-3 shadow-sm"
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                  Continue with Google
                </button>
                <button onClick={() => setIsEmailMode(true)} className="w-full text-sm text-gray-500">
                  Or sign in with email
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}