import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const [config, setConfig] = useState({
    clients: [],
    checkIntervalMinutes: 60,
    schedulerEnabled: false,
    runHeadless: false,
    onlyToday: true
  });
  
  const [newInstagram, setNewInstagram] = useState('');
  const [newWhatsapp, setNewWhatsapp] = useState('');

  const handleAddClient = (e) => {
    e.preventDefault();
    if (!newInstagram.trim() || !newWhatsapp.trim()) return;

    setConfig((prev) => ({
      ...prev,
      clients: [
        ...(prev.clients || []),
        {
          instagram: newInstagram.trim().replace(/^@/, ''),
          whatsapp: newWhatsapp.trim(),
          lastSentPost: ''
        }
      ]
    }));
    setNewInstagram('');
    setNewWhatsapp('');
  };

  const handleDeleteClient = (indexToDelete) => {
    setConfig((prev) => ({
      ...prev,
      clients: (prev.clients || []).filter((_, idx) => idx !== indexToDelete)
    }));
  };
  
  const [whatsappConnected, setWhatsappConnected] = useState(false);
  const [instagramConnected, setInstagramConnected] = useState(false);
  const [history, setHistory] = useState([]);
  const [logs, setLogs] = useState([]);
  
  const [loadingAction, setLoadingAction] = useState(null); // 'whatsapp', 'instagram', 'run', 'save'
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [historyFilter, setHistoryFilter] = useState('all'); // 'all', 'success', 'skipped', 'failed'

  const terminalEndRef = useRef(null);

  // Load initial status
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/status`);
      const data = await res.json();
      if (res.ok) {
        setConfig(data.config);
        setHistory(data.history);
        setWhatsappConnected(data.whatsappConnected);
        setInstagramConnected(data.instagramConnected);
      } else {
        setErrorMsg(data.error || 'Failed to fetch status.');
      }
    } catch (err) {
      setErrorMsg('Failed to connect to backend.');
    }
  };

  useEffect(() => {
    fetchStatus();

    // Listen to live logs stream
    const eventSource = new EventSource(`${API_BASE}/api/logs`);
    eventSource.onmessage = (event) => {
      try {
        const logEntry = JSON.parse(event.data);
        setLogs((prev) => {
          // Limit logs count to 400 entries to prevent memory leak
          const updated = [...prev, logEntry];
          if (updated.length > 400) {
            return updated.slice(updated.length - 400);
          }
          return updated;
        });
      } catch (err) {
        console.error('Error parsing live log', err);
      }
    };

    eventSource.onerror = () => {
      console.warn('Logs event source disconnected. Reconnecting...');
    };

    return () => {
      eventSource.close();
    };
  }, []);



  // Handle setting updates
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setLoadingAction('save');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Settings saved and applied successfully!');
        setConfig(data.config);
        fetchStatus();
      } else {
        setErrorMsg(data.error || 'Failed to save settings.');
      }
    } catch (err) {
      setErrorMsg('Network error while saving settings.');
    } finally {
      setLoadingAction(null);
    }
  };

  // Connect WhatsApp
  const handleConnectWhatsApp = async () => {
    setLoadingAction('whatsapp');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/connect/whatsapp`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('WhatsApp connected successfully!');
      } else {
        setErrorMsg(data.message || 'WhatsApp login failed or closed.');
      }
    } catch (err) {
      setErrorMsg('Network error connecting to WhatsApp.');
    } finally {
      setLoadingAction(null);
      fetchStatus();
    }
  };

  // Connect Instagram
  const handleConnectInstagram = async () => {
    setLoadingAction('instagram');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/connect/instagram`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Instagram connected successfully!');
      } else {
        setErrorMsg(data.message || 'Instagram login failed or closed.');
      }
    } catch (err) {
      setErrorMsg('Network error connecting to Instagram.');
    } finally {
      setLoadingAction(null);
      fetchStatus();
    }
  };
  
  // Disconnect WhatsApp
  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm('Are you sure you want to log out of WhatsApp? This will clear your WhatsApp Web session cookies on this machine.')) return;
    setLoadingAction('disconnect-whatsapp');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/disconnect/whatsapp`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('WhatsApp disconnected and session cleared successfully!');
      } else {
        setErrorMsg(data.message || 'Failed to disconnect WhatsApp.');
      }
    } catch (err) {
      setErrorMsg('Network error disconnecting WhatsApp.');
    } finally {
      setLoadingAction(null);
      fetchStatus();
    }
  };

  // Disconnect Instagram
  const handleDisconnectInstagram = async () => {
    if (!window.confirm('Are you sure you want to log out of Instagram? This will clear your Instagram session cookies on this machine.')) return;
    setLoadingAction('disconnect-instagram');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_BASE}/api/disconnect/instagram`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Instagram disconnected and session cleared successfully!');
      } else {
        setErrorMsg(data.message || 'Failed to disconnect Instagram.');
      }
    } catch (err) {
      setErrorMsg('Network error disconnecting Instagram.');
    } finally {
      setLoadingAction(null);
      fetchStatus();
    }
  };

  // Trigger Manual Run
  const handleTriggerRun = async () => {
    setLoadingAction('run');
    setErrorMsg('');
    setSuccessMsg('');
    try {
      // First auto-save settings to the backend so the run works with current UI configuration
      const saveRes = await fetch(`${API_BASE}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok || !saveData.success) {
        throw new Error(saveData.error || 'Failed to auto-save settings before running.');
      }

      const res = await fetch(`${API_BASE}/api/run`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('Settings saved and manual check started in the background. Check logs below.');
      } else {
        setErrorMsg(data.error || 'Failed to trigger automation.');
      }
    } catch (err) {
      setErrorMsg(err.message || 'Network error triggering check.');
    } finally {
      setLoadingAction(null);
      // Wait a short time then refresh status/history
      setTimeout(fetchStatus, 4000);
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="logo-container">
          <span className="logo-icon">🤖</span>
          <div className="logo-text">
            <h1>Social-Bridge</h1>
            <p>Instagram to WhatsApp Post Automator</p>
          </div>
        </div>
        
        <div className="system-status" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <div className={`badge ${instagramConnected ? 'connected' : 'disconnected'}`}>
            <span className="badge-dot"></span>
            Instagram: {instagramConnected ? 'Connected' : 'Disconnected'}
          </div>
          <div className={`badge ${whatsappConnected ? 'connected' : 'disconnected'}`}>
            <span className="badge-dot"></span>
            WhatsApp: {whatsappConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
      </header>

      {/* Alerts */}
      {errorMsg && (
        <div className="panel" style={{ borderColor: 'var(--color-error)', background: 'rgba(239, 68, 68, 0.05)', marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ color: '#f87171', fontWeight: 600 }}>⚠️ Error: {errorMsg}</div>
        </div>
      )}
      {successMsg && (
        <div className="panel" style={{ borderColor: 'var(--color-success)', background: 'rgba(16, 185, 129, 0.05)', marginBottom: '1.5rem', padding: '1rem' }}>
          <div style={{ color: '#34d399', fontWeight: 600 }}>✅ Success: {successMsg}</div>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-row" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <span className="metric-title">Clients Configured</span>
          <span className="metric-value">{config.clients ? config.clients.length : 0}</span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Instagram Scraper</span>
          <span className="metric-value" style={{ color: instagramConnected ? 'var(--color-success)' : 'var(--color-error)' }}>
            {instagramConnected ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-title">WhatsApp Sender</span>
          <span className="metric-value" style={{ color: whatsappConnected ? 'var(--color-success)' : 'var(--color-error)' }}>
            {whatsappConnected ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="metric-card">
          <span className="metric-title">Scheduler Status</span>
          <span className="metric-value" style={{ color: config.schedulerEnabled ? 'var(--color-success)' : 'var(--color-text-muted)', fontSize: '1.25rem', paddingTop: '0.25rem' }}>
            {config.schedulerEnabled ? `Active (Every ${config.checkIntervalMinutes}m)` : 'Disabled (Manual)'}
          </span>
        </div>
      </div>

      {/* Grid: Connect Accounts & Settings */}
      <div className="dashboard-grid">
        
        {/* Left Column: Account Access & Quick Run */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <section className="panel" style={{ flex: 1 }}>
            <div className="panel-header">
              <h2 className="panel-title">🔑 Account Access Control</h2>
            </div>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              Launch browser windows to log in once. Session cookies allow subsequent automated runs to proceed seamlessly.
            </p>

            <div className="connections-section" style={{ gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              {/* Instagram Card */}
              <div className={`connection-card instagram ${instagramConnected ? 'connected' : ''}`}>
                <div className="connection-icon-wrapper">
                  <span className="connection-icon">📸</span>
                  <span className="connection-status-lbl">{instagramConnected ? 'Active' : 'Inactive'}</span>
                </div>
                <span className="connection-name">Instagram Scraper</span>
                {instagramConnected ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-instagram" 
                      onClick={handleConnectInstagram}
                      disabled={loadingAction === 'instagram' || loadingAction === 'disconnect-instagram'}
                      style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      {loadingAction === 'instagram' ? <span className="spinner"></span> : 'Reconnect'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      onClick={handleDisconnectInstagram}
                      disabled={loadingAction === 'instagram' || loadingAction === 'disconnect-instagram'}
                      style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fecdd3' }}
                    >
                      {loadingAction === 'disconnect-instagram' ? <span className="spinner"></span> : 'Logout'}
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-instagram" 
                    onClick={handleConnectInstagram}
                    disabled={loadingAction === 'instagram'}
                  >
                    {loadingAction === 'instagram' ? <span className="spinner"></span> : 'Connect Account'}
                  </button>
                )}
              </div>

              {/* WhatsApp Card */}
              <div className={`connection-card whatsapp ${whatsappConnected ? 'connected' : ''}`}>
                <div className="connection-icon-wrapper">
                  <span className="connection-icon">💬</span>
                  <span className="connection-status-lbl">{whatsappConnected ? 'Active' : 'Inactive'}</span>
                </div>
                <span className="connection-name">WhatsApp Sender</span>
                {whatsappConnected ? (
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-whatsapp" 
                      onClick={handleConnectWhatsApp}
                      disabled={loadingAction === 'whatsapp' || loadingAction === 'disconnect-whatsapp'}
                      style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem' }}
                    >
                      {loadingAction === 'whatsapp' ? <span className="spinner"></span> : 'Reconnect'}
                    </button>
                    <button 
                      type="button"
                      className="btn" 
                      onClick={handleDisconnectWhatsApp}
                      disabled={loadingAction === 'whatsapp' || loadingAction === 'disconnect-whatsapp'}
                      style={{ flex: 1, padding: '0.6rem 0.8rem', fontSize: '0.85rem', backgroundColor: 'rgba(239, 68, 68, 0.15)', borderColor: 'rgba(239, 68, 68, 0.3)', color: '#fecdd3' }}
                    >
                      {loadingAction === 'disconnect-whatsapp' ? <span className="spinner"></span> : 'Logout'}
                    </button>
                  </div>
                ) : (
                  <button 
                    className="btn btn-whatsapp" 
                    onClick={handleConnectWhatsApp}
                    disabled={loadingAction === 'whatsapp'}
                  >
                    {loadingAction === 'whatsapp' ? <span className="spinner"></span> : 'Connect Account'}
                  </button>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <button 
                type="button" 
                className="btn btn-primary" 
                style={{ width: '100%', padding: '0.9rem' }}
                onClick={handleTriggerRun}
                disabled={loadingAction === 'run' || !instagramConnected || !whatsappConnected}
                title={(!instagramConnected || !whatsappConnected) ? 'Connect accounts first' : 'Run check immediately'}
              >
                {loadingAction === 'run' ? <span className="spinner"></span> : '🚀 Run Automation Now'}
              </button>
            </div>
          </section>
        </div>

        {/* Right Column: Settings & Client Manager */}
        <section className="panel">
          <div className="panel-header">
            <h2 className="panel-title">⚙️ Control Panel Settings</h2>
          </div>
          <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
            
            {/* Clients Management */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '1rem' }}>
              <label style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-main)', marginBottom: '0.5rem', display: 'block' }}>
                👥 Active Clients ({config.clients ? config.clients.length : 0})
              </label>

              {/* Client List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.75rem', maxHeight: '140px', overflowY: 'auto', paddingRight: '0.25rem' }}>
                {(!config.clients || config.clients.length === 0) ? (
                  <div style={{ color: 'var(--color-text-dim)', fontStyle: 'italic', fontSize: '0.8rem', padding: '0.75rem', background: 'rgba(255,255,255,0.01)', borderRadius: '6px', border: '1px dashed rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    No clients configured. Add one below.
                  </div>
                ) : (
                  config.clients.map((client, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px', fontSize: '0.85rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%)', display: 'flex', alignItems: 'center', justify: 'center', fontWeight: 'bold', color: '#fff', fontSize: '0.75rem' }}>
                          {client.instagram.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, color: '#fff' }}>@{client.instagram}</div>
                          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>Group: {client.whatsapp}</div>
                        </div>
                      </div>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteClient(idx)}
                        style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.95rem' }}
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>

              {/* Add Client Form */}
              <div style={{ display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.04)' }}>
                <input 
                  type="text" 
                  placeholder="Instagram handle" 
                  className="input-control" 
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', height: 'auto', flex: 1 }}
                  value={newInstagram}
                  onChange={(e) => setNewInstagram(e.target.value)}
                />
                <input 
                  type="text" 
                  placeholder="WhatsApp Group" 
                  className="input-control" 
                  style={{ fontSize: '0.8rem', padding: '0.4rem 0.6rem', height: 'auto', flex: 1 }}
                  value={newWhatsapp}
                  onChange={(e) => setNewWhatsapp(e.target.value)}
                />
                <button 
                  type="button" 
                  className="btn btn-primary" 
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', height: 'auto' }}
                  onClick={handleAddClient}
                >
                  ➕ Add
                </button>
              </div>
            </div>

            {/* Check Frequency */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="checkIntervalMinutes" style={{ fontSize: '0.8rem' }}>Check Frequency (Minutes)</label>
                <input 
                  type="number" 
                  id="checkIntervalMinutes"
                  name="checkIntervalMinutes" 
                  className="input-control" 
                  min="5"
                  value={config.checkIntervalMinutes}
                  onChange={handleInputChange}
                  required
                />
              </div>
            </div>

            {/* Toggles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <div className="switch-group" style={{ padding: '0.3rem 0' }}>
                <div className="switch-label-wrapper">
                  <span className="switch-label" style={{ fontSize: '0.85rem' }}>Enable Automated Scheduler</span>
                </div>
                <label className="switch" style={{ width: '40px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    name="schedulerEnabled"
                    checked={config.schedulerEnabled}
                    onChange={handleInputChange}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="switch-group" style={{ padding: '0.3rem 0' }}>
                <div className="switch-label-wrapper">
                  <span className="switch-label" style={{ fontSize: '0.85rem' }}>Run Headless Browser</span>
                </div>
                <label className="switch" style={{ width: '40px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    name="runHeadless"
                    checked={config.runHeadless}
                    onChange={handleInputChange}
                  />
                  <span className="slider"></span>
                </label>
              </div>

              <div className="switch-group" style={{ padding: '0.3rem 0' }}>
                <div className="switch-label-wrapper">
                  <span className="switch-label" style={{ fontSize: '0.85rem' }}>Check Calendar Date (Only Today's)</span>
                </div>
                <label className="switch" style={{ width: '40px', height: '20px' }}>
                  <input 
                    type="checkbox" 
                    name="onlyToday"
                    checked={config.onlyToday}
                    onChange={handleInputChange}
                  />
                  <span className="slider"></span>
                </label>
              </div>
            </div>

            <div className="control-row" style={{ marginTop: 'auto', paddingTop: '0.5rem' }}>
              <button 
                type="submit" 
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={loadingAction === 'save'}
              >
                {loadingAction === 'save' ? <span className="spinner"></span> : 'Save Configuration Changes'}
              </button>
            </div>
          </form>
        </section>
      </div>

      {/* Bottom Grid: Live Execution Feed & History */}
      <div className="dashboard-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
        
        {/* Log Feed Panel */}
        <section className="panel" style={{ minHeight: '350px' }}>
          <div className="panel-header">
            <h2 className="panel-title">💻 Live Execution Feed</h2>
            <button className="btn btn-outline" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }} onClick={clearLogs}>
              Clear Logs
            </button>
          </div>
          <div className="terminal" style={{ minHeight: '250px', maxHeight: '280px', flexGrow: 1 }}>
            <div className="terminal-header">
              <div className="terminal-dots">
                <span className="terminal-dot"></span>
                <span className="terminal-dot"></span>
                <span className="terminal-dot"></span>
              </div>
              <span>social-bridge-service.log</span>
            </div>
            <div className="terminal-body" style={{ overflowY: 'auto', maxHeight: '230px' }}>
              {logs.length === 0 ? (
                <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>Terminal idle. Awaiting events...</span>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={`log-entry ${log.type}`}>
                    <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className="log-msg">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* History Panel */}
        <section className="panel" style={{ minHeight: '350px' }}>
          <div className="panel-header">
            <h2 className="panel-title">📜 Run History</h2>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <button 
                type="button"
                className={`filter-badge ${historyFilter === 'all' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => setHistoryFilter('all')}
              >
                All
              </button>
              <button 
                type="button"
                className={`filter-badge ${historyFilter === 'success' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => setHistoryFilter('success')}
              >
                Success
              </button>
              <button 
                type="button"
                className={`filter-badge ${historyFilter === 'failed' ? 'active' : ''}`}
                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                onClick={() => setHistoryFilter('failed')}
              >
                Failed
              </button>
            </div>
          </div>

          <div className="table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
            {history.length === 0 ? (
              <div className="empty-state" style={{ padding: '2rem 0' }}>No history records found.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Status</th>
                    <th>Post</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {history
                    .filter(item => historyFilter === 'all' || item.status === historyFilter)
                    .map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', padding: '0.5rem' }}>
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td style={{ padding: '0.5rem' }}>
                          <span className={`status-indicator ${item.status}`} style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: '0.5rem', fontSize: '0.8rem' }}>
                          {item.shortcode ? (
                            <a 
                              href={`https://instagram.com/p/${item.shortcode}`} 
                              target="_blank" 
                              rel="noreferrer"
                              className="post-link"
                            >
                              {item.shortcode}
                            </a>
                          ) : (
                            <span style={{ color: 'var(--color-text-dim)' }}>-</span>
                          )}
                        </td>
                        <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', padding: '0.5rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.message}>
                          {item.message}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>
    </div>
  );
}
