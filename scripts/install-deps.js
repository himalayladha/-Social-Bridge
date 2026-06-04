import { existsSync, copyFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const nodeModulesPath = path.join(process.cwd(), 'node_modules');
const configPath = path.join(process.cwd(), 'config.json');
const dbPath = path.join(process.cwd(), 'db.json');

// Auto-initialize config.json if not present
if (!existsSync(configPath)) {
  const configExample = path.join(process.cwd(), 'config.json.example');
  if (existsSync(configExample)) {
    console.log('[Social-Bridge] config.json not found. Initializing from template...');
    copyFileSync(configExample, configPath);
  } else {
    writeFileSync(configPath, JSON.stringify({ clients: [], checkIntervalMinutes: 60, schedulerEnabled: false, runHeadless: true, onlyToday: false }, null, 2));
  }
}

// Auto-initialize db.json if not present
if (!existsSync(dbPath)) {
  const dbExample = path.join(process.cwd(), 'db.json.example');
  if (existsSync(dbExample)) {
    console.log('[Social-Bridge] db.json not found. Initializing from template...');
    copyFileSync(dbExample, dbPath);
  } else {
    writeFileSync(dbPath, JSON.stringify({ history: [], whatsappConnected: false, instagramConnected: false }, null, 2));
  }
}

if (!existsSync(nodeModulesPath)) {
  console.log('\n[Social-Bridge] node_modules not found. Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('\n[Social-Bridge] Installing Playwright Chromium browser binaries...');
    execSync('npx playwright install chromium', { stdio: 'inherit' });
    console.log('\n[Social-Bridge] Installation complete!\n');
  } catch (error) {
    console.error('\n[Social-Bridge] Installation failed:', error.message);
    process.exit(1);
  }
} else {
  console.log('[Social-Bridge] Dependencies (node_modules) already exist. Skipping installation step.');
}
