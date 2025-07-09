const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/downloads', express.static('downloads'));

// Database connection
let db;
async function initDatabase() {
  try {
    db = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME
    });
    
    // Create tables if they don't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id VARCHAR(36) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        password_hash VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    console.log('Database connected and tables created');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }
}

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
      const [rows] = await db.execute(
        'SELECT * FROM documents WHERE id = ?',
        [documentId]
      );
      
      if (rows.length === 0) {
        console.log('Document not found:', documentId);
        socket.emit('error', { message: 'Document not found' });
        return;
      }
      
      const document = rows[0];
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
      
      // Send current document content
      const contentToSend = {
        content: activeDocuments.get(documentId).content,
        title: document.title
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
      doc.content = content;
      doc.lastModified = new Date();
      
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
    
    await db.execute(
      'INSERT INTO documents (id, title, content, password_hash) VALUES (?, ?, ?, ?)',
      [documentId, title, '', passwordHash]
    );
    
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
    const [rows] = await db.execute(
      'SELECT id, title, created_at, updated_at FROM documents WHERE id = ?',
      [id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ error: 'Failed to fetch document' });
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
  
  const tempDir = path.join('temp', documentId);
  await fs.ensureDir(tempDir);
  console.log('Temp directory created:', tempDir);
  
  const texFile = path.join(tempDir, 'document.tex');
  const pdfFile = path.join(tempDir, 'document.pdf');
  const outputPdf = path.join('downloads', `${documentId}.pdf`);
  
  // Write LaTeX content to file
  await fs.writeFile(texFile, doc.content);
  console.log('LaTeX file written:', texFile);
  
  // Compile LaTeX
  const command = `pdflatex -interaction=nonstopmode -output-directory="${tempDir}" "${texFile}"`;
  console.log('Executing command:', command);
  
  exec(command, async (error, stdout, stderr) => {
    console.log('pdflatex stdout:', stdout);
    console.log('pdflatex stderr:', stderr);
    
    if (error) {
      console.error('LaTeX compilation error:', error);
      socket.emit('compile-error', { message: stderr || error.message });
      return;
    }
    
    try {
      // Check if PDF was created
      const pdfExists = await fs.pathExists(pdfFile);
      console.log('PDF file exists:', pdfExists);
      
      if (pdfExists) {
        // Copy PDF to downloads directory
        await fs.copy(pdfFile, outputPdf);
        console.log('PDF copied to downloads:', outputPdf);
        
        socket.emit('compile-success', { 
          pdfUrl: `/downloads/${documentId}.pdf`,
          message: 'Document compiled successfully'
        });
      } else {
        console.log('PDF file was not generated');
        socket.emit('compile-error', { message: 'PDF generation failed. Check LaTeX syntax.' });
      }
    } catch (copyError) {
      console.error('Error copying PDF:', copyError);
      socket.emit('compile-error', { message: 'Failed to save PDF' });
    }
    
    // Clean up temp files (but keep for debugging for now)
    // try {
    //   await fs.remove(tempDir);
    // } catch (cleanupError) {
    //   console.error('Cleanup error:', cleanupError);
    // }
  });
}

// Save document to database
async function saveDocumentToDatabase(documentId, content) {
  try {
    await db.execute(
      'UPDATE documents SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [content, documentId]
    );
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