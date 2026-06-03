import fs from 'fs';
import { runAutomation } from './automation.js';

let timer = null;
let isRunning = false;

export function startScheduler(logCallback, configPath, dbPath, onUpdateConfig) {
  
  const appendHistory = (entry) => {
    try {
      const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
      data.history = data.history || [];
      data.history.unshift(entry);
      if (data.history.length > 100) {
        data.history = data.history.slice(0, 100);
      }
      fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to update run history in db.json', e);
    }
  };

  const runCheck = async () => {
    if (isRunning) {
      logCallback('An automation run is already in progress, skipping scheduler trigger.');
      return;
    }

    // Reload settings
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      logCallback(`Scheduler failed to read config: ${e.message}`, 'error');
      return;
    }

    isRunning = true;
    try {
      logCallback('Scheduler starting automated check...');
      const result = await runAutomation(config, logCallback);

      let configChanged = false;
      if (Array.isArray(result)) {
        for (const res of result) {
          const clientTarget = config.clients.find(c => c.instagram === res.client.instagram && c.whatsapp === res.client.whatsapp);
          if (res.status === 'success') {
            if (clientTarget) {
              clientTarget.lastSentPost = res.shortcode;
              configChanged = true;
            }
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'success',
              shortcode: res.shortcode,
              caption: res.caption,
              message: `Client @${res.client.instagram}: Automated sharing completed successfully.`
            });
          } else if (res.status === 'skipped') {
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'skipped',
              shortcode: res.shortcode || '',
              caption: '',
              message: `Client @${res.client.instagram}: Skipped - ${res.reason}`
            });
          } else if (res.status === 'failed') {
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'failed',
              shortcode: '',
              caption: '',
              message: `Client @${res.instagram || (res.client && res.client.instagram)}: Failed - ${res.error}`
            });
          }
        }
      }

      if (configChanged) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        onUpdateConfig();
      }
    } catch (err) {
      logCallback(`Scheduler run failed: ${err.message}`, 'error');
      appendHistory({
        timestamp: new Date().toISOString(),
        status: 'failed',
        shortcode: '',
        caption: '',
        message: `Run failed: ${err.message}`
      });
    } finally {
      isRunning = false;
      // Reschedule
      scheduleNext();
    }
  };

  const scheduleNext = () => {
    if (timer) clearTimeout(timer);

    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return;
    }

    if (!config.schedulerEnabled) {
      logCallback('Scheduler is disabled.');
      return;
    }

    let intervalMs = config.checkIntervalMinutes * 60 * 1000;
    // Safety check: minimum 1 minute interval to prevent spam/ban
    if (intervalMs < 60000) intervalMs = 60000;

    logCallback(`Next automated check scheduled in ${config.checkIntervalMinutes} minutes.`);
    timer = setTimeout(runCheck, intervalMs);
  };

  const triggerManualRun = async () => {
    if (isRunning) {
      logCallback('A run is already in progress.', 'warn');
      return { success: false, reason: 'Already running' };
    }

    let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    isRunning = true;

    try {
      logCallback('Starting manual check...');
      const result = await runAutomation(config, logCallback);

      let configChanged = false;
      if (Array.isArray(result)) {
        for (const res of result) {
          const clientTarget = config.clients.find(c => c.instagram === res.client.instagram && c.whatsapp === res.client.whatsapp);
          if (res.status === 'success') {
            if (clientTarget) {
              clientTarget.lastSentPost = res.shortcode;
              configChanged = true;
            }
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'success',
              shortcode: res.shortcode,
              caption: res.caption,
              message: `Client @${res.client.instagram}: Manual check completed successfully.`
            });
          } else if (res.status === 'skipped') {
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'skipped',
              shortcode: res.shortcode || '',
              caption: '',
              message: `Client @${res.client.instagram}: Skipped - ${res.reason}`
            });
          } else if (res.status === 'failed') {
            appendHistory({
              timestamp: new Date().toISOString(),
              status: 'failed',
              shortcode: '',
              caption: '',
              message: `Client @${res.instagram || (res.client && res.client.instagram)}: Failed - ${res.error}`
            });
          }
        }
      }

      if (configChanged) {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        onUpdateConfig();
      }
      return { success: true, result };
    } catch (err) {
      logCallback(`Manual check failed: ${err.message}`, 'error');
      appendHistory({
        timestamp: new Date().toISOString(),
        status: 'failed',
        shortcode: '',
        caption: '',
        message: `Manual check failed: ${err.message}`
      });
      return { success: false, error: err.message };
    } finally {
      isRunning = false;
      // Reschedule if enabled
      if (config.schedulerEnabled) {
        scheduleNext();
      }
    }
  };

  // Initialize
  let config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (config.schedulerEnabled) {
    logCallback('Scheduler is enabled. Triggering initial run in 10 seconds...');
    timer = setTimeout(runCheck, 10000);
  } else {
    logCallback('Scheduler is currently disabled.');
  }

  return {
    update: () => {
      logCallback('Scheduler settings updated.');
      scheduleNext();
    },
    triggerManual: triggerManualRun
  };
}
