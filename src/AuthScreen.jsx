// AuthScreen.jsx
// Sign in / create account gate. Shown before onboarding and the dashboard when
// there's no active Supabase session. A session is required because every
// edge-function call (Claude, scrapers, email) now attaches the user's token.

import React, { useState } from 'react';
import { api } from './api.js';

export function AuthScreen({ onAuthed }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isSignup = mode === 'signup';

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const res = isSignup
        ? await api.signup(email.trim(), password)
        : await api.login(email.trim(), password);

      if (res.authenticated) {
        onAuthed();
      } else if (res.needsConfirmation) {
        setNotice('Almost there — check your inbox and click the confirmation link. It opens the app and signs you in.');
        setMode('signin');
        setPassword('');
      } else {
        setError('Could not sign in. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }

  async function spotifyLogin() {
    if (busy) return;
    setError('');
    setNotice('');
    try {
      const url = await api.spotifyLoginUrl();
      window.open(url); // Electron opens external URLs in the default browser
    } catch (err) {
      setError(err.message || 'Could not start Spotify sign-in');
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card fade-in">
        <div className="auth-eyebrow">
          <span className="welcome-pulse" />
          Music Digest
        </div>
        <h1 className="auth-title">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="auth-sub">
          {isSignup
            ? 'Your daily digest is delivered to this email.'
            : 'Sign in to run digests and get your email.'}
        </p>

        <form onSubmit={submit} className="auth-form">
          <label className="auth-label">
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="auth-input"
            />
          </label>
          <label className="auth-label">
            Password
            <input
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              required
              minLength={isSignup ? 8 : undefined}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={isSignup ? 'At least 8 characters' : '••••••••'}
              className="auth-input"
            />
          </label>

          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-notice">{notice}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <div className="auth-divider"><span>or</span></div>
        <button type="button" className="auth-spotify" onClick={spotifyLogin} disabled={busy}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path fill="currentColor" d="M12 2a10 10 0 100 20 10 10 0 000-20zm4.586 14.424a.624.624 0 01-.858.208c-2.35-1.436-5.31-1.76-8.794-.964a.624.624 0 11-.277-1.217c3.81-.87 7.083-.496 9.72 1.115a.624.624 0 01.209.858zm1.223-2.722a.78.78 0 01-1.072.257c-2.69-1.653-6.792-2.132-9.973-1.166a.78.78 0 11-.453-1.493c3.633-1.102 8.153-.568 11.24 1.327a.78.78 0 01.258 1.068zm.105-2.835C14.692 8.95 9.39 8.775 6.29 9.716a.936.936 0 11-.543-1.79c3.558-1.08 9.413-.872 13.122 1.33a.936.936 0 01-.954 1.61z"/>
          </svg>
          Sign in with Spotify
        </button>

        <div className="auth-switch">
          {isSignup ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="auth-link"
            onClick={() => { setMode(isSignup ? 'signin' : 'signup'); setError(''); setNotice(''); }}
          >
            {isSignup ? 'Sign in' : 'Create one'}
          </button>
        </div>
      </div>
    </div>
  );
}
