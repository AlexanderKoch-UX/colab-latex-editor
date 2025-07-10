const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');
const Groq = require('groq-sdk');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Initialize Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Database connection
let db;

async function initDatabase() {
  return new Promise((resolve, reject) => {
    // Create SQLite database file in the project directory
    db = new sqlite3.Database('./documents.db', (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err.message);
        reject(err);
        return;
      }
      
      console.log('Connected to SQLite database');
      
      // Create documents table if it doesn't exist
      db.run(`
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          password_hash TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('Error creating documents table:', err.message);
          reject(err);
          return;
        }
        
        // Create document_versions table for version history
        db.run(`
          CREATE TABLE IF NOT EXISTS document_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id TEXT NOT NULL,
            content TEXT NOT NULL,
            change_description TEXT,
            user_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (document_id) REFERENCES documents (id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating document_versions table:', err.message);
            reject(err);
            return;
          }
          
          console.log('Documents and versions tables ready');
          resolve();
        });
      });
    });
  });
}

// Helper functions for database operations
async function createDocument(id, title, content, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO documents (id, title, content, password_hash) VALUES (?, ?, ?, ?)',
      [id, title, content || '', passwordHash],
      function(err) {
        if (err) {
          console.error('Error creating document:', err.message);
          reject(err);
          return;
        }
        console.log('Document created with ID:', id);
        resolve();
      }
    );
  });
}

async function getDocument(id) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM documents WHERE id = ?',
      [id],
      (err, row) => {
        if (err) {
          console.error('Error getting document:', err.message);
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
}

async function updateDocument(id, content) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, id],
      function(err) {
        if (err) {
          console.error('Error updating document:', err.message);
          reject(err);
          return;
        }
        console.log('Document updated:', id);
        resolve();
      }
    );
  });
}

async function updateDocumentPassword(id, passwordHash) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE documents SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, id],
      function(err) {
        if (err) {
          console.error('Error updating document password:', err.message);
          reject(err);
          return;
        }
        console.log('Document password updated:', id);
        resolve();
      }
    );
  });
}

// Version management functions
async function saveDocumentVersion(documentId, content, changeDescription = 'Auto-save', userId = null) {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO document_versions (document_id, content, change_description, user_id) VALUES (?, ?, ?, ?)',
      [documentId, content, changeDescription, userId],
      function(err) {
        if (err) {
          console.error('Error saving document version:', err.message);
          reject(err);
          return;
        }
        console.log('Document version saved:', documentId, 'Version ID:', this.lastID);
        resolve(this.lastID);
      }
    );
  });
}

async function getDocumentVersions(documentId, limit = 50) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT ?',
      [documentId, limit],
      (err, rows) => {
        if (err) {
          console.error('Error getting document versions:', err.message);
          reject(err);
          return;
        }
        resolve(rows || []);
      }
    );
  });
}

async function getDocumentVersion(versionId) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM document_versions WHERE id = ?',
      [versionId],
      (err, row) => {
        if (err) {
          console.error('Error getting document version:', err.message);
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
}

async function cleanupOldVersions(documentId, keepCount = 100) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM document_versions 
       WHERE document_id = ? 
       AND id NOT IN (
         SELECT id FROM document_versions 
         WHERE document_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?
       )`,
      [documentId, documentId, keepCount],
      function(err) {
        if (err) {
          console.error('Error cleaning up old versions:', err.message);
          reject(err);
          return;
        }
        console.log('Cleaned up old versions for document:', documentId, 'Deleted:', this.changes);
        resolve();
      }
    );
  });
}

// Database health check
async function checkDatabaseConnection() {
  return new Promise((resolve) => {
    db.get('SELECT 1', (err) => {
      if (err) {
        console.warn('Database connection check failed:', err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// Periodic database health check
setInterval(async () => {
  const isConnected = await checkDatabaseConnection();
  if (!isConnected) {
    console.log('Database connection check failed');
  }
}, 60000); // Check every minute

// Ensure directories exist
async function ensureDirectories() {
  await fs.ensureDir('temp');
  await fs.ensureDir('downloads');
}

// Document storage for real-time collaboration
const activeDocuments = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Test event handler
  socket.on('test-event', (data) => {
    console.log('Test event received:', data);
    socket.emit('test-response', { message: 'Hello from server' });
  });

  socket.on('join-document', async (data) => {
    const { documentId, password } = data;
    console.log('User attempting to join document:', documentId, 'Socket ID:', socket.id);
    
    try {
      // Verify document exists and password is correct
      const document = await getDocument(documentId);
      
      if (!document) {
        console.log('Document not found:', documentId);
        socket.emit('error', { message: 'Document not found' });
        return;
      }
      console.log('Document found:', document.title);
      
      // Check password if document is protected
      if (document.password_hash) {
        if (!password || !await bcrypt.compare(password, document.password_hash)) {
          console.log('Invalid password for document:', documentId);
          socket.emit('error', { message: 'Invalid password' });
          return;
        }
      }
      
      // Join document room
      socket.join(documentId);
      socket.documentId = documentId;
      console.log('User joined document room:', documentId);
      
      // Initialize document in memory if not exists
      if (!activeDocuments.has(documentId)) {
        activeDocuments.set(documentId, {
          content: document.content || '',
          users: new Set(),
          lastModified: new Date(),
          saveTimeout: null
        });
        console.log('Initialized document in memory:', documentId);
      }
      
      // Add user to document
      activeDocuments.get(documentId).users.add(socket.id);
      
      // Get document versions for undo/redo functionality
      const versions = await getDocumentVersions(documentId, 20);
      
      // Send current document content with version history
      const contentToSend = {
        content: activeDocuments.get(documentId).content,
        title: document.title,
        hasPassword: !!document.password_hash,
        versions: versions.map(v => ({
          id: v.id,
          content: v.content,
          changeDescription: v.change_description,
          createdAt: v.created_at
        }))
      };
      console.log('Sending document content to user:', contentToSend);
      socket.emit('document-content', contentToSend);
      
      // Notify other users
      socket.to(documentId).emit('user-joined', { userId: socket.id });
      
    } catch (error) {
      console.error('Error joining document:', error);
      socket.emit('error', { message: 'Failed to join document' });
    }
  });

  socket.on('content-change', (data) => {
    const { documentId, content, operation } = data;
    
    if (socket.documentId !== documentId) return;
    
    // Update document in memory
    if (activeDocuments.has(documentId)) {
      const doc = activeDocuments.get(documentId);
      const previousContent = doc.content;
      doc.content = content;
      doc.lastModified = new Date();
      
      // Save version if content has significantly changed
      const shouldSaveVersion = shouldCreateVersion(previousContent, content, operation);
      if (shouldSaveVersion) {
        saveDocumentVersion(documentId, content, getChangeDescription(operation), socket.id)
          .then(() => {
            // Clean up old versions periodically
            if (Math.random() < 0.1) { // 10% chance
              cleanupOldVersions(documentId, 100);
            }
          })
          .catch(err => console.error('Error saving version:', err));
      }
      
      // Auto-save to database every 5 seconds (debounced)
      clearTimeout(doc.saveTimeout);
      doc.saveTimeout = setTimeout(() => {
        saveDocumentToDatabase(documentId, content);
        console.log('Auto-saved document:', documentId);
      }, 5000);
    }
    
    // Broadcast to other users in the same document
    socket.to(documentId).emit('content-change', { content, operation, userId: socket.id });
  });

  socket.on('compile-request', async (data) => {
    const { documentId } = data;
    console.log('Compile request received for document:', documentId);
    
    if (socket.documentId !== documentId) {
      console.log('Document ID mismatch. Socket document:', socket.documentId, 'Requested:', documentId);
      return;
    }
    
    try {
      console.log('Starting LaTeX compilation...');
      await compileLatex(documentId, socket);
    } catch (error) {
      console.error('Compilation error:', error);
      socket.emit('compile-error', { message: 'Compilation failed' });
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    if (socket.documentId && activeDocuments.has(socket.documentId)) {
      const doc = activeDocuments.get(socket.documentId);
      doc.users.delete(socket.id);
      
      // Save document to database
      saveDocumentToDatabase(socket.documentId, doc.content);
      
      // Remove document from memory if no users
      if (doc.users.size === 0) {
        activeDocuments.delete(socket.documentId);
      }
      
      // Notify other users
      socket.to(socket.documentId).emit('user-left', { userId: socket.id });
    }
  });
});

// API Routes
app.post('/api/documents', async (req, res) => {
  try {
    const { title, password } = req.body;
    const documentId = uuidv4();
    console.log('Creating new document:', { title, documentId, hasPassword: !!password });
    
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    
    await createDocument(documentId, title, '', passwordHash);
    
    console.log('Document created successfully:', documentId);
    res.json({ documentId, title });
  } catch (error) {
    console.error('Error creating document:', error);
    res.status(500).json({ error: 'Failed to create document' });
  }
});

app.get('/api/documents/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await getDocument(id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({
      id: document.id,
      title: document.title,
      created_at: document.created_at,
      updated_at: document.updated_at
    });
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

// Update document password
app.put('/api/documents/:id/password', async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    
    console.log('Password update request for document:', id);
    
    // Get the document
    const document = await getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check current password if document is protected
    if (document.password_hash) {
      if (!currentPassword || !await bcrypt.compare(currentPassword, document.password_hash)) {
        console.log('Invalid current password for document:', id);
        return res.status(401).json({ error: 'Invalid current password' });
      }
    }
    
    // Hash new password if provided
    let newPasswordHash = null;
    if (newPassword) {
      newPasswordHash = await bcrypt.hash(newPassword, 10);
    }
    
    // Update password in database
    await updateDocumentPassword(id, newPasswordHash);
    
    console.log('Password updated successfully for document:', id);
    res.json({ 
      success: true, 
      message: newPassword ? 'Password set successfully' : 'Password removed successfully' 
    });
    
  } catch (error) {
    console.error('Error updating document password:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// Get document versions
app.get('/api/documents/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    
    // Verify document exists
    const document = await getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const versions = await getDocumentVersions(id, limit);
    res.json({ versions });
    
  } catch (error) {
    console.error('Error fetching document versions:', error);
    res.status(500).json({ error: 'Failed to fetch versions' });
  }
});

// Get specific version content
app.get('/api/documents/:id/versions/:versionId', async (req, res) => {
  try {
    const { id, versionId } = req.params;
    
    // Verify document exists
    const document = await getDocument(id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    const version = await getDocumentVersion(versionId);
    if (!version || version.document_id !== id) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    res.json({ version });
    
  } catch (error) {
    console.error('Error fetching document version:', error);
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// AI Chat API
app.post('/api/ai-chat', async (req, res) => {
  try {
    const { message, currentContent, documentId } = req.body;
    
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'Groq API key not configured' });
    }

    console.log('AI Chat request:', { message, contentLength: currentContent?.length, documentId });

    // Create system prompt for LaTeX assistance
    const systemPrompt = `Du bist ein erfahrener LaTeX-Experte und Assistent. Du hilfst Benutzern bei:

1. LaTeX-Code-Verbesserungen und -Korrekturen
2. Vollständige LaTeX-Dokument-Generierung basierend auf Beschreibungen
3. LaTeX-Syntax-Hilfe und Erklärungen

Wenn du Änderungen am LaTeX-Code vorschlägst:
- Gib eine klare Erklärung, was du änderst und warum
- Stelle sicher, dass der Code syntaktisch korrekt ist
- Verwende bewährte LaTeX-Praktiken
- Behalte die Struktur und den Stil des ursprünglichen Dokuments bei, wenn möglich

Antworte auf Deutsch und sei hilfreich und präzise.`;

    // Create user prompt with context
    let userPrompt = `Aktueller LaTeX-Code:\n\`\`\`latex\n${currentContent || 'Kein Code vorhanden'}\n\`\`\`\n\nBenutzeranfrage: ${message}`;

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
      temperature: 0.3,
      max_tokens: 2048
    });

    const aiResponse = completion.choices[0]?.message?.content;
    
    if (!aiResponse) {
      return res.status(500).json({ error: 'No response from AI' });
    }

    console.log('AI Response received, length:', aiResponse.length);

    // Check if the response contains LaTeX code suggestions
    const latexCodeMatch = aiResponse.match(/```latex\n([\s\S]*?)\n```/);
    let suggestedContent = null;
    let description = aiResponse;

    if (latexCodeMatch) {
      suggestedContent = latexCodeMatch[1];
      // Remove the code block from the description
      description = aiResponse.replace(/```latex\n[\s\S]*?\n```/, '').trim();
      
      // If description is empty after removing code, create a generic one
      if (!description) {
        description = 'AI-Vorschlag für Ihren LaTeX-Code';
      }
    }

    res.json({
      response: aiResponse,
      suggestedContent: suggestedContent,
      description: description
    });

  } catch (error) {
    console.error('AI Chat error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to process AI request' 
    });
  }
});

// Compile LaTeX function
async function compileLatex(documentId, socket) {
  console.log('compileLatex called for document:', documentId);
  
  const doc = activeDocuments.get(documentId);
  if (!doc) {
    console.log('Document not found in active documents');
    socket.emit('compile-error', { message: 'Document not found' });
    return;
  }
  
  console.log('Document content length:', doc.content.length);
  
  // Use free online LaTeX compilation services (no Puppeteer fallback for Docker)
  const services = [
    { name: 'LaTeX.Online', func: compileWithLatexOnline },
    { name: 'LaTeX.codecogs', func: compileWithCodecogs },
    { name: 'QuickLaTeX', func: compileWithQuickLatex },
    { name: 'Simple HTML Preview', func: compileWithHtmlPreview }
  ];
  
  for (const service of services) {
    try {
      console.log(`Trying ${service.name}...`);
      await service.func(documentId, doc.content, socket);
      return; // Success, exit
    } catch (error) {
      console.log(`${service.name} failed:`, error.message);
      continue; // Try next service
    }
  }
  
  // All services failed
  console.error('All online compilation services failed');
  socket.emit('compile-error', { 
    message: 'PDF compilation failed. All online services are currently unavailable. Please try again later.' 
  });
}

// Method 1: LaTeX.Online - Free LaTeX compilation service
async function compileWithLatexOnline(documentId, content, socket) {
  const axios = require('axios');
  const FormData = require('form-data');
  
  try {
    console.log('Trying LaTeX.Online service...');
    
    const form = new FormData();
    form.append('file', content, {
      filename: 'document.tex',
      contentType: 'text/plain'
    });
    
    const response = await axios.post('https://latex.ytotech.com/builds/sync', form, {
      headers: { 
        ...form.getHeaders(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      responseType: 'arraybuffer',
      timeout: 60000, // Increased timeout
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });
    
    console.log('LaTeX.Online response status:', response.status);
    console.log('LaTeX.Online response size:', response.data.length);
    
    // LaTeX.Online returns 201 for successful compilation
    if ((response.status === 200 || response.status === 201) && response.data.length > 1000) {
      const outputPdf = path.join('downloads', `${documentId}.pdf`);
      await fs.writeFile(outputPdf, response.data);
      
      console.log('LaTeX.Online compilation successful');
      socket.emit('compile-success', { 
        pdfUrl: `/downloads/${documentId}.pdf`,
        message: 'Document compiled successfully (LaTeX.Online)'
      });
    } else {
      throw new Error(`Invalid response: status=${response.status}, size=${response.data.length}`);
    }
  } catch (error) {
    console.error('LaTeX.Online error:', error.message);
    throw new Error('LaTeX.Online service failed');
  }
}

// Method 2: Overleaf API (if available)
async function compileWithOverleafAPI(documentId, content, socket) {
  // Note: This would require Overleaf API access
  throw new Error('Overleaf API not available');
}

// Method 3: LaTeX.codecogs - Free LaTeX to image/PDF service
async function compileWithCodecogs(documentId, content, socket) {
  const axios = require('axios');
  
  try {
    // Extract just the document content (remove preamble for codecogs)
    let cleanContent = content;
    const documentMatch = content.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (documentMatch) {
      cleanContent = documentMatch[1].trim();
    }
    
    // If content is too long, skip codecogs
    if (cleanContent.length > 2000) {
      throw new Error('Content too long for Codecogs');
    }
    
    // Codecogs LaTeX service - use PNG format which is more reliable
    const encodedLatex = encodeURIComponent(cleanContent);
    const url = `https://latex.codecogs.com/png.latex?\\dpi{150}\\bg_white ${encodedLatex}`;
    
    console.log('Trying Codecogs with URL length:', url.length);
    
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/png,image/*,*/*'
      }
    });
    
    console.log('Codecogs response status:', response.status);
    console.log('Codecogs response size:', response.data.length);
    
    if (response.status === 200 && response.data.length > 500) {
      const outputFile = path.join('downloads', `${documentId}.png`);
      await fs.writeFile(outputFile, response.data);
      
      socket.emit('compile-success', { 
        pdfUrl: `/downloads/${documentId}.png`,
        message: 'Document compiled successfully (Codecogs - PNG Preview)'
      });
    } else {
      throw new Error('Codecogs returned invalid response');
    }
  } catch (error) {
    console.error('Codecogs error:', error.message);
    throw new Error('Codecogs service failed');
  }
}

// Method 4: QuickLaTeX - Free LaTeX compilation
async function compileWithQuickLatex(documentId, content, socket) {
  const axios = require('axios');
  
  try {
    // Extract just the document content for QuickLaTeX
    let cleanContent = content;
    const documentMatch = content.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
    if (documentMatch) {
      cleanContent = documentMatch[1].trim();
    }
    
    // Skip if content is too complex
    if (cleanContent.length > 1000) {
      throw new Error('Content too complex for QuickLaTeX');
    }
    
    console.log('Trying QuickLaTeX with content length:', cleanContent.length);
    
    // QuickLaTeX API - simplified approach
    const formData = new URLSearchParams();
    formData.append('formula', cleanContent);
    formData.append('fsize', '14px');
    formData.append('fcolor', '000000');
    formData.append('mode', '0');
    formData.append('out', '1');
    formData.append('remhost', 'quicklatex.com');
    
    const response = await axios.post('https://quicklatex.com/latex3.f', formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 30000
    });
    
    console.log('QuickLaTeX response status:', response.status);
    console.log('QuickLaTeX response preview:', response.data.substring(0, 200));
    
    if (response.status === 200 && response.data.includes('http')) {
      // QuickLaTeX returns a URL to the generated image
      const lines = response.data.split('\n');
      const imageUrl = lines.find(line => line.includes('http') && (line.includes('.png') || line.includes('.gif')));
      
      if (imageUrl) {
        console.log('QuickLaTeX image URL found:', imageUrl.trim());
        
        // Download the image
        const imageResponse = await axios.get(imageUrl.trim(), {
          responseType: 'arraybuffer',
          timeout: 30000
        });
        
        const outputFile = path.join('downloads', `${documentId}_quicklatex.png`);
        await fs.writeFile(outputFile, imageResponse.data);
        
        socket.emit('compile-success', { 
          pdfUrl: `/downloads/${documentId}_quicklatex.png`,
          message: 'Document compiled successfully (QuickLaTeX - Image Preview)'
        });
        return;
      }
    }
    
    throw new Error('QuickLaTeX returned invalid response');
  } catch (error) {
    console.error('QuickLaTeX error:', error.message);
    throw new Error('QuickLaTeX service failed');
  }
}

// Method 5: Simple HTML Preview - Last resort fallback
async function compileWithHtmlPreview(documentId, content, socket) {
  console.log('Using HTML preview fallback...');
  
  try {
    // Convert LaTeX to HTML
    const html = convertLatexToHtml(content);
    
    // Save as HTML file that can be viewed in browser
    const outputHtml = path.join('downloads', `${documentId}.html`);
    await fs.writeFile(outputHtml, html);
    
    // Also create a simple "PDF-like" message
    const pdfMessage = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LaTeX Preview</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; text-align: center; }
        .message { background: #f0f8ff; padding: 20px; border-radius: 10px; margin: 20px 0; }
        .preview-link { display: inline-block; background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; margin: 10px; }
    </style>
</head>
<body>
    <div class="message">
        <h2>LaTeX Preview Ready</h2>
        <p>PDF compilation services are currently unavailable.</p>
        <p>Your document has been converted to HTML preview:</p>
        <a href="${documentId}.html" class="preview-link" target="_blank">View HTML Preview</a>
    </div>
</body>
</html>`;
    
    const outputPdf = path.join('downloads', `${documentId}.pdf.html`);
    await fs.writeFile(outputPdf, pdfMessage);
    
    socket.emit('compile-success', { 
      pdfUrl: `/downloads/${documentId}.pdf.html`,
      message: 'Document converted to HTML preview (PDF services unavailable)'
    });
    
  } catch (error) {
    console.error('HTML preview fallback error:', error);
    throw error;
  }
}

// Convert LaTeX to HTML (simplified)
function convertLatexToHtml(latexContent) {
  let html = latexContent;
  
  // Basic LaTeX to HTML conversion
  html = html.replace(/\\documentclass\{[^}]*\}/g, '');
  html = html.replace(/\\usepackage(\[[^\]]*\])?\{[^}]*\}/g, '');
  html = html.replace(/\\begin\{document\}/g, '');
  html = html.replace(/\\end\{document\}/g, '');
  
  // Replace title, author, date
  html = html.replace(/\\title\{([^}]*)\}/g, '<h1 style="text-align: center;">$1</h1>');
  html = html.replace(/\\author\{([^}]*)\}/g, '<p style="text-align: center; font-style: italic;">$1</p>');
  html = html.replace(/\\date\{([^}]*)\}/g, '<p style="text-align: center;">$1</p>');
  html = html.replace(/\\maketitle/g, '');
  html = html.replace(/\\today/g, new Date().toLocaleDateString());
  
  // Replace sections
  html = html.replace(/\\section\{([^}]*)\}/g, '<h2>$1</h2>');
  html = html.replace(/\\subsection\{([^}]*)\}/g, '<h3>$1</h3>');
  html = html.replace(/\\subsubsection\{([^}]*)\}/g, '<h4>$1</h4>');
  
  // Replace text formatting
  html = html.replace(/\\textbf\{([^}]*)\}/g, '<strong>$1</strong>');
  html = html.replace(/\\textit\{([^}]*)\}/g, '<em>$1</em>');
  html = html.replace(/\\emph\{([^}]*)\}/g, '<em>$1</em>');
  
  // Replace lists
  html = html.replace(/\\begin\{itemize\}/g, '<ul>');
  html = html.replace(/\\end\{itemize\}/g, '</ul>');
  html = html.replace(/\\begin\{enumerate\}/g, '<ol>');
  html = html.replace(/\\end\{enumerate\}/g, '</ol>');
  html = html.replace(/\\item/g, '<li>');
  
  // Replace line breaks
  html = html.replace(/\\\\/g, '<br>');
  html = html.replace(/\\newline/g, '<br>');
  
  // Clean up and wrap paragraphs
  html = html.replace(/\n\s*\n/g, '</p><p>');
  html = html.replace(/^\s+|\s+$/g, '');
  
  // Wrap in HTML structure
  const fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LaTeX Document</title>
    <style>
        body {
            font-family: 'Times New Roman', serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px;
            color: #333;
        }
        h1 { margin-bottom: 20px; font-size: 24px; }
        h2 { margin-top: 30px; margin-bottom: 15px; font-size: 20px; }
        h3 { margin-top: 25px; margin-bottom: 10px; font-size: 18px; }
        h4 { margin-top: 20px; margin-bottom: 8px; font-size: 16px; }
        p { margin: 15px 0; text-align: justify; }
        ul, ol { margin: 15px 0; padding-left: 30px; }
        li { margin: 8px 0; }
    </style>
</head>
<body>
    <div>${html}</div>
</body>
</html>`;
  
  return fullHtml;
}





// Helper functions for version management
function shouldCreateVersion(previousContent, newContent, operation) {
  // Don't create versions for very small changes or rapid typing
  if (!previousContent || !newContent) return true;
  
  const contentDiff = Math.abs(newContent.length - previousContent.length);
  const timeSinceLastVersion = Date.now() - (global.lastVersionTime || 0);
  
  // Create version if:
  // 1. Significant content change (more than 50 characters)
  // 2. Or it's been more than 30 seconds since last version
  // 3. Or it's a special operation (paste, AI suggestion, etc.)
  if (contentDiff > 50 || 
      timeSinceLastVersion > 30000 || 
      (operation && typeof operation === 'object' && operation.origin === 'paste') ||
      (operation && operation === 'ai-suggestion-applied')) {
    global.lastVersionTime = Date.now();
    return true;
  }
  
  return false;
}

function getChangeDescription(operation) {
  if (!operation) return 'Content change';
  
  if (typeof operation === 'string') {
    switch (operation) {
      case 'ai-suggestion-applied': return 'AI suggestion applied';
      case 'compile': return 'Document compiled';
      default: return 'Content change';
    }
  }
  
  if (typeof operation === 'object' && operation.origin) {
    switch (operation.origin) {
      case 'paste': return 'Content pasted';
      case 'cut': return 'Content cut';
      case 'undo': return 'Undo operation';
      case 'redo': return 'Redo operation';
      default: return 'Content change';
    }
  }
  
  return 'Content change';
}

// Save document to database
async function saveDocumentToDatabase(documentId, content) {
  try {
    await updateDocument(documentId, content);
  } catch (error) {
    console.error('Error saving document:', error);
  }
}

// Periodic save for active documents
setInterval(async () => {
  for (const [documentId, doc] of activeDocuments.entries()) {
    if (doc.users.size > 0) {
      await saveDocumentToDatabase(documentId, doc.content);
    }
  }
}, 30000); // Save every 30 seconds

// Start server
const PORT = process.env.PORT || 3000;

async function startServer() {
  await initDatabase();
  await ensureDirectories();
  
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Access the application at http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  
  // Save all active documents
  for (const [documentId, doc] of activeDocuments.entries()) {
    try {
      await saveDocumentToDatabase(documentId, doc.content);
      console.log(`Saved document ${documentId} before shutdown`);
    } catch (error) {
      console.error(`Failed to save document ${documentId}:`, error.message);
    }
  }
  
  // Close database connection
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database connection:', err.message);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  
  // Save all active documents
  for (const [documentId, doc] of activeDocuments.entries()) {
    try {
      await saveDocumentToDatabase(documentId, doc.content);
      console.log(`Saved document ${documentId} before shutdown`);
    } catch (error) {
      console.error(`Failed to save document ${documentId}:`, error.message);
    }
  }
  
  // Close database connection
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database connection:', err.message);
      } else {
        console.log('Database connection closed');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});