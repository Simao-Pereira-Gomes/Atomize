#!/usr/bin/env node

import { chmodSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const cliPath = join(__dirname, '..', 'dist', 'cli', 'index.js');

if (process.platform !== 'win32') {
  if (existsSync(cliPath)) {
    try {
      chmodSync(cliPath, 0o755);
      console.log('Made CLI executable (Unix)');
    } catch (error) {
      console.warn('Could not make CLI executable:', error.message);
    }
  }
} else {
  console.log('Windows detected - npm will handle CLI setup');
}