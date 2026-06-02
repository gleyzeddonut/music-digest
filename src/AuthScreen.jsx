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
