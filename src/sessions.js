const fs = require('fs');
const path = require('path');

const SESSIONS_DIR = path.join(__dirname, '..', 'sessions');
const PROJECTS_FILE = path.join(SESSIONS_DIR, 'recent_projects.json');

// Ensure sessions directory exists
if (!fs.existsSync(SESSIONS_DIR)) {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

// Current active workspace directory (defaults to parent folder where app runs)
let activeCwd = path.resolve(__dirname, '..');

function getActiveCwd() {
  return activeCwd;
}

function setActiveCwd(newCwd) {
  const resolved = path.resolve(newCwd);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Directory does not exist: ${newCwd}`);
  }
  activeCwd = resolved;
  saveProject(resolved);
  return resolved;
}

// Save workspace folder to recent projects list
function saveProject(projectPath) {
  try {
    let projects = [];
    if (fs.existsSync(PROJECTS_FILE)) {
      projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    }
    
    // Filter duplicates and prepend recent
    projects = [projectPath, ...projects.filter(p => p !== projectPath)];
    
    // Limit to recent 10 projects
    if (projects.length > 10) {
      projects = projects.slice(0, 10);
    }
    
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2));
  } catch (err) {
    console.error('Error saving recent project:', err.message);
  }
}

function listRecentProjects() {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'));
    }
  } catch (e) {
    // Ignore errors
  }
  return [activeCwd];
}

function listSessions() {
  try {
    const files = fs.readdirSync(SESSIONS_DIR);
    const sessions = [];

    for (const file of files) {
      if (file.startsWith('session-') && file.endsWith('.json')) {
        try {
          const filePath = path.join(SESSIONS_DIR, file);
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          sessions.push({
            id: data.id,
            title: data.title || 'Untitled Chat',
            created: data.created,
            updated: data.updated,
            model: data.model,
            provider: data.provider,
            cwd: data.cwd
          });
        } catch (e) {
          // Ignore corrupt session files
        }
      }
    }

    // Sort by updated time (newest first)
    return sessions.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  } catch (err) {
    console.error('Failed to list sessions:', err);
    return [];
  }
}

function getSession(id) {
  const filePath = path.join(SESSIONS_DIR, `session-${id}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveSession(id, sessionData) {
  const filePath = path.join(SESSIONS_DIR, `session-${id}.json`);
  const now = new Date().toISOString();

  let existing = {};
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {}
  }

  const updatedSession = {
    id,
    title: sessionData.title || existing.title || 'New Session',
    created: existing.created || now,
    updated: now,
    cwd: sessionData.cwd || existing.cwd || activeCwd,
    provider: sessionData.provider || existing.provider || '',
    model: sessionData.model || existing.model || '',
    messages: sessionData.messages || existing.messages || []
  };

  fs.writeFileSync(filePath, JSON.stringify(updatedSession, null, 2));
  return updatedSession;
}

function deleteSession(id) {
  const filePath = path.join(SESSIONS_DIR, `session-${id}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

module.exports = {
  getActiveCwd,
  setActiveCwd,
  listRecentProjects,
  listSessions,
  getSession,
  saveSession,
  deleteSession
};
