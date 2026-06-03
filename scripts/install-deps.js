import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';

const nodeModulesPath = path.join(process.cwd(), 'node_modules');

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
