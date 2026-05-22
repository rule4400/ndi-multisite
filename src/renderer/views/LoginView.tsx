import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { api } from '../bridge/api';
import { UserRole } from '../../shared/types';

export const LoginView: React.FC = () => {
  const [isFirstRun, setIsFirstRun] = useState(false);
  const [password, setPassword] = useState('');
  const [fullPw, setFullPw] = useState('');
  const [viewPw, setViewPw] = useState('');
  const [setupDone, setSetupDone] = useState(false);
  const { login, isLoading, error, setPassword: savePassword } = useAuthStore();

  useEffect(() => {
    api.isFirstRun().then(setIsFirstRun);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(password);
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullPw || !viewPw) return;
    await savePassword('full' as UserRole, fullPw);
    await savePassword('viewonly' as UserRole, viewPw);
    setSetupDone(true);
    setIsFirstRun(false);
  };

  if (isFirstRun && !setupDone) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="w-full max-w-md p-8 rounded-2xl bg-gray-900 shadow-2xl">
          <h1 className="text-2xl font-bold text-white mb-2">初回設定</h1>
          <p className="text-white/60 text-sm mb-6">
            Full Access と View Only のパスワードを設定してください。
          </p>
          <form onSubmit={handleSetup} className="space-y-4">
            <div>
              <label className="block text-sm text-white/70 mb-1">Full Access パスワード</label>
              <input
                type="password"
                value={fullPw}
                onChange={e => setFullPw(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:border-blue-500 outline-none"
                required
                minLength={4}
              />
            </div>
            <div>
              <label className="block text-sm text-white/70 mb-1">View Only パスワード</label>
              <input
                type="password"
                value={viewPw}
                onChange={e => setViewPw(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:border-blue-500 outline-none"
                required
                minLength={4}
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
            >
              設定を保存してログイン
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="w-full max-w-sm p-8 rounded-2xl bg-gray-900 shadow-2xl">
        <h1 className="text-2xl font-bold text-white mb-1">NDI Multisite</h1>
        <p className="text-white/50 text-sm mb-6">パスワードを入力してください</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="パスワード"
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-gray-800 text-white border border-white/10 focus:border-blue-500 outline-none"
          />

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold transition-colors"
          >
            {isLoading ? 'ログイン中...' : 'ログイン'}
          </button>
        </form>
      </div>
    </div>
  );
};
