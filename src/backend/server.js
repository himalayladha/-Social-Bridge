import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { connectWhatsApp, connectInstagram } from './automation.js';
import { startScheduler } from './scheduler.js';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const configPath = path.join(process.cwd(), 'config.json');
const dbPath = path.join(process.cwd(), 'db.json');

// Ensure configuration databases exist
if (!fs.existsSync(configPath)) {
  const configExample = path.join(process.cwd(), 'config.json.example');
  if (fs.existsSync(configExample)) {
    fs.copyFileSync(configExample, configPath);
    console.log('[INFO] config.json initialized from template.');
  } else {
    fs.writeFileSync(configPath, JSON.stringify({ clients: [], checkIntervalMinutes: 60, schedulerEnabled: false, runHeadless: true, onlyToday: false }, null, 2));
    console.log('[INFO] config.json initialized with default settings.');
  }
}

if (!fs.existsSync(dbPath)) {
  const dbExample = path.join(process.cwd(), 'db.json.example');
  if (fs.existsSync(dbExample)) {
    fs.copyFileSync(dbExample, dbPath);
    console.log('[INFO] db.json initialized from template.');
  } else {
    fs.writeFileSync(dbPath, JSON.stringify({ history: [], whatsappConnected: false, instagramConnected: false }, null, 2));
    console.log('[INFO] db.json initialized with default database.');
  }
}

// Manage SSE connections
const clients = new Set();

/**
 * Broadcast logs to all connected SSE clients and save them
 */
function log(message, type = 'info') {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, message, type };

  console.log(`[${type.toUpperCase()}] ${message}`);

  const payload = `data: ${JSON.stringify(logEntry)}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

// Helper to update connection status in db.json
function updateConnectionStatus(service, isConnected) {
  try {
    const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    if (service === 'whatsapp') {
      data.whatsappConnected = isConnected;
    } else if (service === 'instagram') {
      data.instagramConnected = isConnected;
    }
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Failed to update connection status in db.json', e);
  }
}

// Start scheduler
const scheduler = startScheduler(
  log,
  configPath,
  dbPath,
  () => {
    // onUpdateConfig callback: can broadcast status or logs
    log('Configuration loaded or updated.');
  }
);

// --- API ENDPOINTS ---

// Server-Sent Events for live logs
app.get('/api/logs', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  clients.add(res);

  // Send an initial handshake log
  res.write(`data: ${JSON.stringify({ timestamp: new Date().toISOString(), message: 'Connected to live log stream', type: 'info' })}\n\n`);

  req.on('close', () => {
    clients.delete(res);
  });
});

// Fetch current status, config, and run history
app.get('/api/status', (req, res) => {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    // Check if session directories exist as a secondary check
    const waDirExists = fs.existsSync(path.join(process.cwd(), '.sessions', 'whatsapp'));
    const igDirExists = fs.existsSync(path.join(process.cwd(), '.sessions', 'instagram'));

    res.json({
      config,
      history: db.history || [],
      whatsappConnected: waDirExists && (db.whatsappConnected || false),
      instagramConnected: igDirExists && (db.instagramConnected || false)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update configurations
app.post('/api/settings', (req, res) => {
  try {
    const newConfig = req.body;
    const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const updated = {
      ...currentConfig,
      clients: Array.isArray(newConfig.clients) ? newConfig.clients.map(c => ({
        instagram: (c.instagram || '').trim(),
        whatsapp: (c.whatsapp || '').trim(),
        lastSentPost: c.lastSentPost || ''
      })).filter(c => c.instagram && c.whatsapp) : [],
      checkIntervalMinutes: parseInt(newConfig.checkIntervalMinutes) || 60,
      schedulerEnabled: newConfig.schedulerEnabled ?? false,
      runHeadless: newConfig.runHeadless ?? false,
      onlyToday: newConfig.onlyToday ?? true
    };

    fs.writeFileSync(configPath, JSON.stringify(updated, null, 2));
    
    // Notify scheduler
    scheduler.update();

    log(`Settings updated: ${updated.clients.length} clients, Interval=${updated.checkIntervalMinutes}m, Scheduler=${updated.schedulerEnabled ? 'Enabled' : 'Disabled'}`);
    res.json({ success: true, config: updated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Connect WhatsApp (launch browser for QR code scanning)
app.post('/api/connect/whatsapp', async (req, res) => {
  try {
    // Return immediately to frontend and let the browser launch in background
    // (This prevents frontend request timeout, but since the call is fast we can await it as well)
    // To ensure the user gets immediate feedback, we will await the operation as they scan QR code
    log('Starting WhatsApp connection flow...');
    const result = await connectWhatsApp(log);
    
    updateConnectionStatus('whatsapp', result);
    
    if (result) {
      log('WhatsApp connected successfully!', 'success');
      res.json({ success: true, message: 'WhatsApp successfully connected.' });
    } else {
      log('WhatsApp connection failed or was closed.', 'error');
      res.json({ success: false, message: 'WhatsApp connection failed or was closed.' });
    }
  } catch (error) {
    updateConnectionStatus('whatsapp', false);
    log(`WhatsApp connection error: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Connect Instagram (launch browser for login)
app.post('/api/connect/instagram', async (req, res) => {
  try {
    log('Starting Instagram connection flow...');
    const result = await connectInstagram(log);
    
    updateConnectionStatus('instagram', result);

    if (result) {
      log('Instagram connected successfully!', 'success');
      res.json({ success: true, message: 'Instagram successfully connected.' });
    } else {
      log('Instagram connection failed or was closed.', 'error');
      res.json({ success: false, message: 'Instagram connection failed or was closed.' });
    }
  } catch (error) {
    updateConnectionStatus('instagram', false);
    log(`Instagram connection error: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Disconnect WhatsApp (clear session)
app.post('/api/disconnect/whatsapp', (req, res) => {
  try {
    log('Disconnecting WhatsApp account (clearing session)...');
    const waSessionDir = path.join(process.cwd(), '.sessions', 'whatsapp');
    if (fs.existsSync(waSessionDir)) {
      fs.rmSync(waSessionDir, { recursive: true, force: true });
    }
    updateConnectionStatus('whatsapp', false);
    log('WhatsApp account disconnected and session cleared.', 'success');
    res.json({ success: true, message: 'WhatsApp successfully disconnected.' });
  } catch (error) {
    log(`Failed to disconnect WhatsApp: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Disconnect Instagram (clear session)
app.post('/api/disconnect/instagram', (req, res) => {
  try {
    log('Disconnecting Instagram account (clearing session)...');
    const igSessionDir = path.join(process.cwd(), '.sessions', 'instagram');
    if (fs.existsSync(igSessionDir)) {
      fs.rmSync(igSessionDir, { recursive: true, force: true });
    }
    updateConnectionStatus('instagram', false);
    log('Instagram account disconnected and session cleared.', 'success');
    res.json({ success: true, message: 'Instagram successfully disconnected.' });
  } catch (error) {
    log(`Failed to disconnect Instagram: ${error.message}`, 'error');
    res.status(500).json({ error: error.message });
  }
});

// Trigger manual run immediately
app.post('/api/run', async (req, res) => {
  log('Manual execution triggered by user.');
  
  // We trigger manual execution asynchronously to avoid locking HTTP response
  scheduler.triggerManual()
    .then((result) => {
      if (result.success) {
        log('Manual execution finished successfully.', 'success');
      } else {
        log(`Manual execution failed: ${result.error || result.reason}`, 'error');
      }
    })
    .catch((err) => {
      log(`Manual execution system error: ${err.message}`, 'error');
    });

  res.json({ success: true, message: 'Manual run started in background. Monitor the live logs feed.' });
});

// Serve frontend build in production
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA routing fallback
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
});
