import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const STATE_FILE = path.join(DATA_DIR, 'session-state.json');

export class LocalStorageManager {
  constructor() {
    this.saveTimeout = null;
    this._ensureDir();
  }

  _ensureDir() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create data directory:', err.message);
    }
  }

  loadState() {
    try {
      if (!fs.existsSync(STATE_FILE)) return null;
      const data = fs.readFileSync(STATE_FILE, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      console.warn('Could not read existing state file:', err.message);
      return null;
    }
  }

  scheduleSave(stateData) {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      this.saveStateNow(stateData);
    }, 1000); // 1-second debounce
  }

  saveStateNow(stateData) {
    try {
      this._ensureDir();
      const serialized = JSON.stringify(stateData, null, 2);
      fs.writeFileSync(STATE_FILE, serialized, 'utf8');
    } catch (err) {
      console.error('Failed to save session state:', err.message);
    }
  }
}
