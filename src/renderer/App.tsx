import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { LoginView } from './views/LoginView';
import { MainView } from './views/MainView';

const App: React.FC = () => {
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    if (typeof window.electronAPI === 'undefined') {
      setApiError('electronAPI が見つかりません。preload スクリプトを確認してください。');
      return;
    }
    setApiReady(true);
  }, []);

  if (apiError) {
    return (
      <div style={{ color: 'red', padding: 32, fontFamily: 'monospace', fontSize: 14 }}>
        <h2>起動エラー</h2>
        <p>{apiError}</p>
        <p>開発者ツール (Cmd+Option+I) のコンソールタブを確認してください。</p>
      </div>
    );
  }

  if (!apiReady) {
    return (
      <div style={{ color: '#888', padding: 32, fontFamily: 'monospace' }}>
        初期化中...
      </div>
    );
  }

  return isAuthenticated ? <MainView /> : <LoginView />;
};

export default App;
