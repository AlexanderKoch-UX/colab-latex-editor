class LatexEditor {
    constructor() {
        console.log('LatexEditor constructor called');
        console.log('io available:', typeof io);
        
        if (typeof io === 'undefined') {
            console.error('Socket.IO not loaded!');
            alert('Socket.IO library not loaded. Please refresh the page.');
            return;
        }
        
        this.socket = io();
        console.log('Socket created:', this.socket);
        this.editor = null;
        this.currentDocumentId = null;
        this.currentPassword = null;
        this.documentHasPassword = false;
        this.isConnected = false;
        this.usersOnline = new Set();
        
        // Version management
        this.versionHistory = [];
        this.versionIndex = -1;
        this.isRestoringVersion = false;
        this.lastSavedContent = '';
        this.versionSaveTimer = null;
        this.autoCompileEnabled = false;
        this.autoCompileTimeout = null;
        this.autoCompileDelay = 2000; // 2 seconds delay after last change
        this.autoCompileCountdown = null;
        
        // AI Chat properties
        this.aiChatOpen = false;
        this.currentAiSuggestion = null;
        this.originalContent = null;
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupSocketListeners();
        this.setupAiChatListeners();
        this.loadRecentDocuments();
        this.checkUrlForDocument();
    }

    initializeElements() {
        // Screens
        this.homeScreen = document.getElementById('home-screen');
        this.editorScreen = document.getElementById('editor-screen');
        this.loadingScreen = document.getElementById('loading-screen');
        
        console.log('Elements initialized:');
        console.log('homeScreen:', !!this.homeScreen);
        console.log('editorScreen:', !!this.editorScreen);
        console.log('loadingScreen:', !!this.loadingScreen);
        
        // Modals
        this.createModal = document.getElementById('create-modal');
        this.passwordModal = document.getElementById('password-modal');
        this.setPasswordModal = document.getElementById('set-password-modal');
        
        // Buttons
        this.createDocBtn = document.getElementById('create-doc-btn');
        this.joinDocBtn = document.getElementById('join-doc-btn');
        this.setPasswordBtn = document.getElementById('set-password-btn');
        this.autoCompileBtn = document.getElementById('auto-compile-btn');
        this.compileBtn = document.getElementById('compile-btn');
        this.downloadBtn = document.getElementById('download-btn');
        this.backHomeBtn = document.getElementById('back-home-btn');
        this.copyLinkBtn = document.getElementById('copy-link-btn');
        
        // Forms
        this.createForm = document.getElementById('create-form');
        this.passwordForm = document.getElementById('password-form');
        this.setPasswordForm = document.getElementById('set-password-form');
        
        // Inputs
        this.documentIdInput = document.getElementById('document-id-input');
        this.docTitleInput = document.getElementById('doc-title');
        this.docPasswordInput = document.getElementById('doc-password');
        this.passwordInput = document.getElementById('password-input');
        this.currentPasswordInput = document.getElementById('current-password-input');
        this.newPasswordInput = document.getElementById('new-password-input');
        this.confirmPasswordInput = document.getElementById('confirm-password-input');
        
        // Display elements
        this.documentTitle = document.getElementById('document-title');
        this.documentIdDisplay = document.getElementById('document-id-display');
        this.usersCount = document.getElementById('users-count');
        this.compileStatus = document.getElementById('compile-status');
        this.pdfContainer = document.getElementById('pdf-container');
        this.recentDocumentsList = document.getElementById('recent-documents-list');
        
        // AI Chat elements
        this.aiChatFab = document.getElementById('ai-chat-fab');
        this.aiChatPanel = document.getElementById('ai-chat-panel');
        this.aiChatClose = document.getElementById('ai-chat-close');
        this.aiChatMessages = document.getElementById('ai-chat-messages');
        this.aiChatInput = document.getElementById('ai-chat-input');
        this.aiChatSend = document.getElementById('ai-chat-send');
        
        // AI Diff elements
        this.aiDiffModal = document.getElementById('ai-diff-modal');
        this.aiDiffClose = document.getElementById('ai-diff-close');
        this.aiDiffDescriptionText = document.getElementById('ai-diff-description-text');
        this.aiDiffOriginal = document.getElementById('ai-diff-original');
        this.aiDiffSuggested = document.getElementById('ai-diff-suggested');
        this.aiDiffApprove = document.getElementById('ai-diff-approve');
        this.aiDiffDecline = document.getElementById('ai-diff-decline');
    }

    setupEventListeners() {
        // Modal controls
        const closeButtons = document.querySelectorAll('.close');
        closeButtons.forEach(btn => {
            btn.onclick = (e) => {
                const modal = e.target.closest('.modal');
                this.closeModal(modal);
            };
        });
        document.getElementById('cancel-join').onclick = () => this.closeModal(this.passwordModal);
        document.getElementById('cancel-set-password').onclick = () => this.closeModal(this.setPasswordModal);
        
        // Button events
        this.createDocBtn.onclick = () => this.showModal(this.createModal);
        this.joinDocBtn.onclick = () => this.joinDocument();
        this.setPasswordBtn.onclick = () => this.showSetPasswordModal();
        this.autoCompileBtn.onclick = () => this.toggleAutoCompile();
        this.compileBtn.onclick = () => this.compileDocument();
        this.downloadBtn.onclick = () => this.downloadPDF();
        this.backHomeBtn.onclick = () => this.goHome();
        this.copyLinkBtn.onclick = () => this.copyDocumentLink();
        
        // Form submissions
        this.createForm.onsubmit = (e) => this.createDocument(e);
        this.passwordForm.onsubmit = (e) => this.submitPassword(e);
        this.setPasswordForm.onsubmit = (e) => this.setDocumentPassword(e);
        
        // Enter key for document ID input
        this.documentIdInput.onkeypress = (e) => {
            if (e.key === 'Enter') this.joinDocument();
        };
        
        // Close modals when clicking outside
        window.onclick = (e) => {
            if (e.target === this.createModal) this.closeModal(this.createModal);
            if (e.target === this.passwordModal) this.closeModal(this.passwordModal);
            if (e.target === this.setPasswordModal) this.closeModal(this.setPasswordModal);
        };
    }

    setupSocketListeners() {
        this.socket.on('connect', () => {
            this.isConnected = true;
            console.log('Connected to server, socket ID:', this.socket.id);
            
            // Test if socket events are working
            this.socket.emit('test-event', { message: 'Hello from client' });
        });

        this.socket.on('test-response', (data) => {
            console.log('Test response received:', data);
        });

        this.socket.on('disconnect', () => {
            this.isConnected = false;
            this.showToast('Connection lost. Trying to reconnect...', 'warning');
        });

        this.socket.on('document-content', (data) => {
            console.log('=== DOCUMENT CONTENT EVENT RECEIVED ===');
            console.log('Data received:', data);
            console.log('Editor screen element:', this.editorScreen);
            
            try {
                // Force show editor screen immediately
                console.log('Forcing editor screen to show...');
                this.showScreen(this.editorScreen);
                
                // Wait a bit for screen transition, then set up editor
                setTimeout(() => {
                    console.log('Setting up document content...');
                    
                    // Set document info
                    if (this.documentTitle) {
                        this.documentTitle.textContent = data.title;
                        console.log('Document title set to:', data.title);
                    }
                    
                    if (this.documentIdDisplay) {
                        this.documentIdDisplay.textContent = `ID: ${this.currentDocumentId}`;
                        console.log('Document ID set to:', this.currentDocumentId);
                    }
                    
                    // Set password status
                    this.documentHasPassword = data.hasPassword || false;
                    
                    // Save to recent documents when successfully joining
                    this.saveDocumentToRecent(this.currentDocumentId, data.title, this.documentHasPassword);
                    
                    // Load document versions for undo/redo
                    this.versionHistory = data.versions || [];
                    this.versionIndex = -1; // -1 means current content
                    this.lastSavedContent = data.content;
                    
                    // Save initial version if we have content
                    if (data.content && data.content.trim()) {
                        setTimeout(() => {
                            this.saveCurrentVersion();
                        }, 1000);
                    }
                    
                    // Initialize or update editor
                    if (this.editor) {
                        console.log('Updating existing editor');
                        this.editor.setValue(data.content);
                    } else {
                        console.log('Creating new CodeMirror editor');
                        this.initializeCodeMirror(data.content);
                    }
                    
                    // Update user count
                    this.usersOnline.add(this.socket.id);
                    this.updateUsersCount();
                    
                    // Update password button text
                    this.updatePasswordButtonText();
                    
                    console.log('=== DOCUMENT SETUP COMPLETE ===');
                }, 200);
                
            } catch (error) {
                console.error('Error in document-content handler:', error);
            }
        });

        this.socket.on('content-change', (data) => {
            if (this.editor && data.userId !== this.socket.id) {
                const currentCursor = this.editor.getCursor();
                this.editor.setValue(data.content);
                this.editor.setCursor(currentCursor);
            }
        });

        this.socket.on('user-joined', (data) => {
            this.usersOnline.add(data.userId);
            this.updateUsersCount();
            this.showToast('A user joined the document', 'success');
        });

        this.socket.on('user-left', (data) => {
            this.usersOnline.delete(data.userId);
            this.updateUsersCount();
            this.showToast('A user left the document', 'warning');
        });

        this.socket.on('compile-success', (data) => {
            this.compileStatus.textContent = 'Compilation successful';
            this.compileStatus.className = 'compile-status success';
            this.compileBtn.disabled = false;
            this.compileBtn.textContent = 'Compile PDF';
            
            this.downloadBtn.style.display = 'inline-block';
            this.downloadBtn.onclick = () => window.open(data.pdfUrl, '_blank');
            
            // Show PDF in preview
            this.pdfContainer.innerHTML = `<iframe id="pdf-frame" src="${data.pdfUrl}"></iframe>`;
            
            this.showToast('PDF compiled successfully!', 'success');
        });

        this.socket.on('compile-error', (data) => {
            this.compileStatus.textContent = 'Compilation failed';
            this.compileStatus.className = 'compile-status error';
            this.compileBtn.disabled = false;
            this.compileBtn.textContent = 'Compile PDF';
            
            this.showToast(`Compilation error: ${data.message}`, 'error');
        });

        this.socket.on('error', (data) => {
            console.log('Socket error received:', data);
            this.hideLoading();
            
            if (data.message === 'Invalid password') {
                this.showModal(this.passwordModal);
            } else {
                this.showToast(data.message, 'error');
                this.goHome();
            }
        });
    }

    checkUrlForDocument() {
        const urlParams = new URLSearchParams(window.location.search);
        const docId = urlParams.get('doc');
        
        if (docId) {
            this.documentIdInput.value = docId;
            this.joinDocument();
        }
    }

    async createDocument(e) {
        e.preventDefault();
        
        const title = this.docTitleInput.value.trim();
        const password = this.docPasswordInput.value.trim();
        
        if (!title) {
            this.showToast('Please enter a document title', 'error');
            return;
        }
        
        this.showLoading();
        console.log('Creating document with title:', title);
        
        try {
            const response = await fetch('/api/documents', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title, password: password || null })
            });
            
            const data = await response.json();
            console.log('Document creation response:', data);
            
            if (response.ok) {
                this.currentDocumentId = data.documentId;
                this.currentPassword = password || null;
                this.closeModal(this.createModal);
                console.log('Joining document with ID:', data.documentId);
                
                // Save to recent documents
                this.saveDocumentToRecent(data.documentId, title, !!password);
                
                this.joinDocumentWithId(data.documentId, password);
                
                // Update URL
                window.history.pushState({}, '', `?doc=${data.documentId}`);
            } else {
                throw new Error(data.error);
            }
        } catch (error) {
            this.hideLoading();
            console.error('Error creating document:', error);
            this.showToast(`Error creating document: ${error.message}`, 'error');
        }
    }

    joinDocument() {
        const documentId = this.documentIdInput.value.trim();
        
        if (!documentId) {
            this.showToast('Please enter a document ID', 'error');
            return;
        }
        
        this.currentDocumentId = documentId;
        this.showLoading();
        
        // Update URL
        window.history.pushState({}, '', `?doc=${documentId}`);
        
        this.joinDocumentWithId(documentId);
    }

    joinDocumentWithId(documentId, password = null) {
        console.log('Attempting to join document:', documentId, 'with password:', password ? 'yes' : 'no');
        console.log('Socket connected:', this.socket.connected);
        
        if (!this.socket.connected) {
            console.log('Socket not connected, waiting for connection...');
            this.socket.on('connect', () => {
                console.log('Socket connected, now joining document');
                this.socket.emit('join-document', {
                    documentId,
                    password
                });
            });
        } else {
            this.socket.emit('join-document', {
                documentId,
                password
            });
        }
    }

    submitPassword(e) {
        e.preventDefault();
        const password = this.passwordInput.value.trim();
        
        if (!password) {
            this.showToast('Please enter a password', 'error');
            return;
        }
        
        this.closeModal(this.passwordModal);
        this.showLoading();
        this.joinDocumentWithId(this.currentDocumentId, password);
    }

    showSetPasswordModal() {
        if (!this.currentDocumentId) {
            this.showToast('No document is currently open', 'error');
            return;
        }
        
        // Clear form fields
        this.currentPasswordInput.value = '';
        this.newPasswordInput.value = '';
        this.confirmPasswordInput.value = '';
        
        this.showModal(this.setPasswordModal);
    }

    async setDocumentPassword(e) {
        e.preventDefault();
        
        const currentPassword = this.currentPasswordInput.value.trim();
        const newPassword = this.newPasswordInput.value.trim();
        const confirmPassword = this.confirmPasswordInput.value.trim();
        
        // Validate passwords match if new password is provided
        if (newPassword && newPassword !== confirmPassword) {
            this.showToast('New passwords do not match', 'error');
            return;
        }
        
        if (!this.currentDocumentId) {
            this.showToast('No document is currently open', 'error');
            return;
        }
        
        // Show loading state on the submit button
        const submitBtn = this.setPasswordForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating...';
        
        try {
            const response = await fetch(`/api/documents/${this.currentDocumentId}/password`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword: currentPassword || null,
                    newPassword: newPassword || null
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.closeModal(this.setPasswordModal);
                
                if (newPassword) {
                    this.showToast('Document password has been set successfully', 'success');
                    this.currentPassword = newPassword;
                    this.documentHasPassword = true;
                } else {
                    this.showToast('Document password has been removed successfully', 'success');
                    this.currentPassword = null;
                    this.documentHasPassword = false;
                }
                
                // Update button text to reflect password status
                this.updatePasswordButtonText();
                
            } else {
                throw new Error(data.error || 'Failed to update password');
            }
        } catch (error) {
            console.error('Error setting password:', error);
            this.showToast(`Error: ${error.message}`, 'error');
        } finally {
            // Reset submit button
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }

    updatePasswordButtonText() {
        if (this.setPasswordBtn) {
            if (this.documentHasPassword || this.currentPassword) {
                this.setPasswordBtn.innerHTML = '<span>🔒</span><span>Change Password</span>';
                this.setPasswordBtn.title = 'Change or remove document password';
            } else {
                this.setPasswordBtn.innerHTML = '<span>🔓</span><span>Set Password</span>';
                this.setPasswordBtn.title = 'Set document password';
            }
        }
    }

    // Version management methods
    saveCurrentVersion() {
        if (!this.editor || this.isRestoringVersion) return;
        
        const currentContent = this.editor.getValue();
        
        // Don't save if content hasn't changed significantly
        if (currentContent === this.lastSavedContent) return;
        
        // Add current content to version history
        this.versionHistory.unshift({
            id: Date.now(),
            content: currentContent,
            changeDescription: 'User edit',
            createdAt: new Date().toISOString()
        });
        
        // Keep only last 50 versions in memory
        if (this.versionHistory.length > 50) {
            this.versionHistory = this.versionHistory.slice(0, 50);
        }
        
        this.lastSavedContent = currentContent;
        this.versionIndex = -1; // Reset to current
        
        console.log('Version saved, total versions:', this.versionHistory.length);
    }

    async performUndo() {
        if (!this.editor || !this.currentDocumentId) return;
        
        console.log('Performing undo, current version index:', this.versionIndex);
        
        // If we're at current content, save it first
        if (this.versionIndex === -1 && this.versionHistory.length > 0) {
            this.versionIndex = 0;
        } else if (this.versionIndex < this.versionHistory.length - 1) {
            this.versionIndex++;
        } else {
            this.showToast('No more versions to undo', 'info');
            return;
        }
        
        const version = this.versionHistory[this.versionIndex];
        if (version) {
            this.isRestoringVersion = true;
            this.editor.setValue(version.content);
            this.isRestoringVersion = false;
            
            this.showToast(`Undo: ${version.changeDescription}`, 'info');
            console.log('Restored to version index:', this.versionIndex);
        }
    }

    async performRedo() {
        if (!this.editor || !this.currentDocumentId) return;
        
        console.log('Performing redo, current version index:', this.versionIndex);
        
        if (this.versionIndex > 0) {
            this.versionIndex--;
            const version = this.versionHistory[this.versionIndex];
            
            this.isRestoringVersion = true;
            this.editor.setValue(version.content);
            this.isRestoringVersion = false;
            
            this.showToast(`Redo: ${version.changeDescription}`, 'info');
            console.log('Restored to version index:', this.versionIndex);
        } else if (this.versionIndex === 0) {
            // Go back to current content
            this.versionIndex = -1;
            this.isRestoringVersion = true;
            this.editor.setValue(this.lastSavedContent);
            this.isRestoringVersion = false;
            
            this.showToast('Redo: Back to current version', 'info');
        } else {
            this.showToast('No more versions to redo', 'info');
        }
    }

    async refreshVersionHistory() {
        if (!this.currentDocumentId) return;
        
        try {
            const response = await fetch(`/api/documents/${this.currentDocumentId}/versions?limit=20`);
            const data = await response.json();
            
            if (response.ok) {
                this.versionHistory = data.versions || [];
                this.versionIndex = -1;
                console.log('Version history refreshed:', this.versionHistory.length, 'versions');
            }
        } catch (error) {
            console.error('Error refreshing version history:', error);
        }
    }

    initializeCodeMirror(content = '') {
        console.log('Initializing CodeMirror with content length:', content.length);
        
        const textarea = document.getElementById('latex-editor');
        console.log('Textarea element found:', !!textarea);
        
        if (!textarea) {
            console.error('Textarea element not found! Cannot initialize CodeMirror.');
            return;
        }
        
        try {
            // Destroy existing editor if it exists
            if (this.editor) {
                console.log('Destroying existing editor');
                this.editor.toTextArea();
                this.editor = null;
            }
            
            this.editor = CodeMirror.fromTextArea(textarea, {
                mode: 'stex',
                theme: 'monokai',
                lineNumbers: true,
                lineWrapping: true,
                autoCloseBrackets: true,
                matchBrackets: true,
                indentUnit: 2,
                tabSize: 2,
                extraKeys: {
                    'Ctrl-S': () => this.compileDocument(),
                    'Cmd-S': () => this.compileDocument(),
                    'Ctrl-Z': () => this.performUndo(),
                    'Cmd-Z': () => this.performUndo(),
                    'Ctrl-Shift-Z': () => this.performRedo(),
                    'Cmd-Shift-Z': () => this.performRedo(),
                    'Ctrl-Y': () => this.performRedo(),
                    'Cmd-Y': () => this.performRedo()
                }
            });
            
            console.log('CodeMirror editor created successfully:', !!this.editor);
            
            // Set content or default template
            if (content.trim()) {
                this.editor.setValue(content);
            } else {
                const template = `\\documentclass{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{amsfonts}
\\usepackage{amssymb}

\\title{My Document}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}

Write your content here...

\\end{document}`;
                this.editor.setValue(template);
            }
            
            // Set up real-time collaboration and auto-save
            this.editor.on('change', (instance, changeObj) => {
                if (changeObj.origin !== 'setValue' && changeObj.origin !== 'compile' && !this.isRestoringVersion) {
                    const content = instance.getValue();
                    
                    // Reset version index when user makes new changes
                    if (this.versionIndex !== -1) {
                        this.versionIndex = -1;
                    }
                    
                    // Save version after a delay (debounced)
                    if (this.versionSaveTimer) {
                        clearTimeout(this.versionSaveTimer);
                    }
                    this.versionSaveTimer = setTimeout(() => {
                        this.saveCurrentVersion();
                    }, 3000); // Save version after 3 seconds of inactivity
                    
                    // Show saving indicator
                    this.showSavingIndicator();
                    
                    // Send changes to other users
                    this.socket.emit('content-change', {
                        documentId: this.currentDocumentId,
                        content,
                        operation: changeObj
                    });
                    
                    // Handle auto-compile
                    this.handleAutoCompile();
                }
            });
            
            // Force refresh to ensure proper display
            setTimeout(() => {
                if (this.editor) {
                    this.editor.refresh();
                    console.log('CodeMirror refreshed');
                }
            }, 100);
            
        } catch (error) {
            console.error('Error initializing CodeMirror:', error);
        }
    }

    compileDocument() {
        console.log('Compile button clicked');
        console.log('Current document ID:', this.currentDocumentId);
        
        if (!this.currentDocumentId) {
            console.error('No document ID available');
            this.showToast('No document loaded', 'error');
            return;
        }
        
        if (!this.socket.connected) {
            console.error('Socket not connected');
            this.showToast('Connection lost. Please refresh the page.', 'error');
            return;
        }
        
        // Cancel any pending auto-compile
        if (this.autoCompileTimeout) {
            clearTimeout(this.autoCompileTimeout);
            this.autoCompileTimeout = null;
        }
        if (this.autoCompileCountdown) {
            clearInterval(this.autoCompileCountdown);
            this.autoCompileCountdown = null;
        }
        
        console.log('Starting compilation...');
        this.compileBtn.disabled = true;
        this.compileBtn.textContent = 'Compiling...';
        this.compileStatus.textContent = 'Compiling document...';
        this.compileStatus.className = 'compile-status compiling';
        
        // Save current content before compiling
        if (this.editor) {
            const content = this.editor.getValue();
            console.log('Sending content for compilation, length:', content.length);
            
            // Update the document content first
            this.socket.emit('content-change', {
                documentId: this.currentDocumentId,
                content,
                operation: { origin: 'compile' }
            });
        }
        
        // Request compilation
        this.socket.emit('compile-request', {
            documentId: this.currentDocumentId
        });
        
        console.log('Compile request sent');
    }

    toggleAutoCompile() {
        this.autoCompileEnabled = !this.autoCompileEnabled;
        
        if (this.autoCompileEnabled) {
            this.autoCompileBtn.classList.add('active');
            this.autoCompileBtn.title = 'Auto-compile enabled - PDF will update automatically';
            this.showToast('Auto-compile enabled', 'success');
        } else {
            this.autoCompileBtn.classList.remove('active');
            this.autoCompileBtn.title = 'Auto-compile disabled - Click to enable';
            this.showToast('Auto-compile disabled', 'info');
            
            // Clear any pending auto-compile
            if (this.autoCompileTimeout) {
                clearTimeout(this.autoCompileTimeout);
                this.autoCompileTimeout = null;
            }
            if (this.autoCompileCountdown) {
                clearInterval(this.autoCompileCountdown);
                this.autoCompileCountdown = null;
            }
            
            // Reset compile status
            if (this.compileStatus) {
                this.compileStatus.textContent = 'Ready to compile';
                this.compileStatus.className = 'compile-status';
            }
        }
        
        console.log('Auto-compile toggled:', this.autoCompileEnabled);
    }

    handleAutoCompile() {
        if (!this.autoCompileEnabled) {
            return;
        }
        
        // Clear existing timeouts
        if (this.autoCompileTimeout) {
            clearTimeout(this.autoCompileTimeout);
        }
        if (this.autoCompileCountdown) {
            clearInterval(this.autoCompileCountdown);
        }
        
        // Start countdown display
        let remainingTime = this.autoCompileDelay / 1000;
        
        const updateCountdown = () => {
            if (this.compileStatus && this.autoCompileEnabled) {
                this.compileStatus.textContent = `Auto-compile in ${remainingTime}s...`;
                this.compileStatus.className = 'compile-status pending';
            }
            remainingTime--;
        };
        
        // Initial countdown display
        updateCountdown();
        
        // Update countdown every second
        this.autoCompileCountdown = setInterval(updateCountdown, 1000);
        
        // Set timeout for actual compilation
        this.autoCompileTimeout = setTimeout(() => {
            if (this.autoCompileCountdown) {
                clearInterval(this.autoCompileCountdown);
                this.autoCompileCountdown = null;
            }
            
            if (this.autoCompileEnabled) {
                console.log('Auto-compiling document...');
                this.compileDocument();
            }
        }, this.autoCompileDelay);
    }

    downloadPDF() {
        if (this.currentDocumentId) {
            window.open(`/downloads/${this.currentDocumentId}.pdf`, '_blank');
        }
    }

    copyDocumentLink() {
        const link = `${window.location.origin}?doc=${this.currentDocumentId}`;
        
        if (navigator.clipboard) {
            navigator.clipboard.writeText(link).then(() => {
                this.showToast('Document link copied to clipboard!', 'success');
            });
        } else {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = link;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            this.showToast('Document link copied to clipboard!', 'success');
        }
    }

    goHome() {
        this.currentDocumentId = null;
        this.currentPassword = null;
        this.documentHasPassword = false;
        this.usersOnline.clear();
        
        // Reset version management
        this.versionHistory = [];
        this.versionIndex = -1;
        this.isRestoringVersion = false;
        this.lastSavedContent = '';
        if (this.versionSaveTimer) {
            clearTimeout(this.versionSaveTimer);
            this.versionSaveTimer = null;
        }
        
        // Reset auto-compile state
        this.autoCompileEnabled = false;
        if (this.autoCompileTimeout) {
            clearTimeout(this.autoCompileTimeout);
            this.autoCompileTimeout = null;
        }
        if (this.autoCompileCountdown) {
            clearInterval(this.autoCompileCountdown);
            this.autoCompileCountdown = null;
        }
        if (this.autoCompileBtn) {
            this.autoCompileBtn.classList.remove('active');
            this.autoCompileBtn.title = 'Toggle auto-compile on changes';
        }
        
        if (this.editor) {
            this.editor.toTextArea();
            this.editor = null;
        }
        
        this.showScreen(this.homeScreen);
        this.downloadBtn.style.display = 'none';
        this.pdfContainer.innerHTML = '<div class="pdf-placeholder"><p>Click "Compile PDF" to generate preview</p></div>';
        
        // Clear URL
        window.history.pushState({}, '', '/');
        
        // Reset form
        this.docTitleInput.value = '';
        this.docPasswordInput.value = '';
        this.documentIdInput.value = '';
        this.passwordInput.value = '';
        
        // Reset password button
        this.updatePasswordButtonText();
        
        // Refresh recent documents list
        this.loadRecentDocuments();
    }

    showEditor() {
        console.log('Showing editor screen');
        this.showScreen(this.editorScreen);
        this.usersOnline.add(this.socket.id);
        this.updateUsersCount();
        console.log('Editor screen should now be visible');
    }

    showScreen(screen) {
        console.log('showScreen called with:', screen ? screen.id : 'null');
        
        if (!screen) {
            console.error('Screen is null or undefined');
            return;
        }
        
        // Force hide all screens first
        const allScreens = document.querySelectorAll('.screen');
        allScreens.forEach(s => {
            s.classList.remove('active');
            s.style.display = 'none';
            console.log('Hidden screen:', s.id);
        });
        
        // Show the target screen
        screen.classList.add('active');
        
        // Force display based on screen type
        if (screen.id === 'home-screen') {
            screen.style.display = 'flex';
        } else if (screen.id === 'editor-screen') {
            screen.style.display = 'flex';
        } else if (screen.id === 'loading-screen') {
            screen.style.display = 'flex';
        } else {
            screen.style.display = 'block';
        }
        
        console.log('Activated screen:', screen.id, 'Display:', screen.style.display);
        
        // Verify the change
        setTimeout(() => {
            const activeScreens = document.querySelectorAll('.screen.active');
            console.log('Active screens after change:', Array.from(activeScreens).map(s => s.id));
            console.log('Visible screens:', Array.from(allScreens).filter(s => 
                window.getComputedStyle(s).display !== 'none'
            ).map(s => s.id));
        }, 100);
    }

    showModal(modal) {
        modal.style.display = 'block';
    }

    closeModal(modal) {
        modal.style.display = 'none';
    }

    showLoading() {
        this.showScreen(this.loadingScreen);
    }

    hideLoading() {
        // Will be handled by other show methods
    }

    updateUsersCount() {
        const count = this.usersOnline.size;
        this.usersCount.textContent = `${count} user${count !== 1 ? 's' : ''} online`;
    }

    showSavingIndicator() {
        // Clear existing timeout
        if (this.savingTimeout) {
            clearTimeout(this.savingTimeout);
        }
        
        // Show saving indicator
        const usersCount = document.getElementById('users-count');
        if (usersCount) {
            const originalText = usersCount.textContent;
            usersCount.textContent = 'Saving...';
            usersCount.style.color = '#ffc107';
            
            // Hide after 2 seconds
            this.savingTimeout = setTimeout(() => {
                usersCount.textContent = originalText;
                usersCount.style.color = '';
            }, 2000);
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        document.getElementById('toast-container').appendChild(toast);
        
        // Trigger animation
        setTimeout(() => toast.classList.add('show'), 100);
        
        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }

    // AI Chat functionality
    setupAiChatListeners() {
        // FAB click to toggle chat
        this.aiChatFab.onclick = () => this.toggleAiChat();
        
        // Close chat
        this.aiChatClose.onclick = () => this.closeAiChat();
        
        // Send message
        this.aiChatSend.onclick = () => this.sendAiMessage();
        
        // Enter key to send message
        this.aiChatInput.onkeypress = (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendAiMessage();
            }
        };
        
        // Diff modal controls
        this.aiDiffClose.onclick = () => this.closeAiDiffModal();
        this.aiDiffApprove.onclick = () => this.approveAiSuggestion();
        this.aiDiffDecline.onclick = () => this.declineAiSuggestion();
        
        // Close diff modal when clicking outside
        this.aiDiffModal.onclick = (e) => {
            if (e.target === this.aiDiffModal) {
                this.closeAiDiffModal();
            }
        };
    }

    toggleAiChat() {
        if (this.aiChatOpen) {
            this.closeAiChat();
        } else {
            this.openAiChat();
        }
    }

    openAiChat() {
        this.aiChatPanel.classList.add('active');
        this.aiChatOpen = true;
        this.aiChatInput.focus();
    }

    closeAiChat() {
        this.aiChatPanel.classList.remove('active');
        this.aiChatOpen = false;
    }

    async sendAiMessage() {
        const message = this.aiChatInput.value.trim();
        if (!message) return;

        // Add user message to chat
        this.addChatMessage(message, 'user');
        this.aiChatInput.value = '';

        // Show loading message
        const loadingMessage = this.addChatMessage('Denke nach...', 'ai', true);

        try {
            // Get current document content
            const currentContent = this.editor ? this.editor.getValue() : '';
            
            // Send request to server
            const response = await fetch('/api/ai-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: message,
                    currentContent: currentContent,
                    documentId: this.currentDocumentId
                })
            });

            const data = await response.json();

            // Remove loading message
            loadingMessage.remove();

            if (data.error) {
                this.addChatMessage(`Fehler: ${data.error}`, 'ai');
                return;
            }

            // Add AI response
            this.addChatMessage(data.response, 'ai');

            // If there's a suggested change, show diff modal
            if (data.suggestedContent && data.suggestedContent !== currentContent) {
                this.showAiDiffModal(data.description || 'AI-Vorschlag', currentContent, data.suggestedContent);
            }

        } catch (error) {
            console.error('AI Chat error:', error);
            loadingMessage.remove();
            this.addChatMessage('Entschuldigung, es gab einen Fehler bei der Kommunikation mit dem AI-Assistenten.', 'ai');
        }
    }

    addChatMessage(content, type, isLoading = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `${type}-message${isLoading ? ' loading' : ''}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.innerHTML = content.replace(/\n/g, '<br>');
        
        messageDiv.appendChild(contentDiv);
        this.aiChatMessages.appendChild(messageDiv);
        
        // Scroll to bottom
        this.aiChatMessages.scrollTop = this.aiChatMessages.scrollHeight;
        
        return messageDiv;
    }

    showAiDiffModal(description, originalContent, suggestedContent) {
        this.currentAiSuggestion = {
            description: description,
            original: originalContent,
            suggested: suggestedContent
        };

        this.aiDiffDescriptionText.textContent = description;
        this.aiDiffOriginal.textContent = originalContent;
        this.aiDiffSuggested.textContent = suggestedContent;

        // Highlight differences
        this.highlightDifferences();

        this.aiDiffModal.style.display = 'block';
    }

    highlightDifferences() {
        const original = this.currentAiSuggestion.original;
        const suggested = this.currentAiSuggestion.suggested;

        // Simple line-by-line diff
        const originalLines = original.split('\n');
        const suggestedLines = suggested.split('\n');

        let originalHtml = '';
        let suggestedHtml = '';

        const maxLines = Math.max(originalLines.length, suggestedLines.length);

        for (let i = 0; i < maxLines; i++) {
            const origLine = originalLines[i] || '';
            const suggLine = suggestedLines[i] || '';

            if (origLine !== suggLine) {
                if (origLine && !suggLine) {
                    // Line removed
                    originalHtml += `<span class="diff-line-removed">${this.escapeHtml(origLine)}</span>\n`;
                } else if (!origLine && suggLine) {
                    // Line added
                    suggestedHtml += `<span class="diff-line-added">${this.escapeHtml(suggLine)}</span>\n`;
                } else {
                    // Line modified
                    originalHtml += `<span class="diff-line-removed">${this.escapeHtml(origLine)}</span>\n`;
                    suggestedHtml += `<span class="diff-line-added">${this.escapeHtml(suggLine)}</span>\n`;
                }
            } else {
                // Line unchanged
                originalHtml += this.escapeHtml(origLine) + '\n';
                suggestedHtml += this.escapeHtml(suggLine) + '\n';
            }
        }

        this.aiDiffOriginal.innerHTML = originalHtml;
        this.aiDiffSuggested.innerHTML = suggestedHtml;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    closeAiDiffModal() {
        this.aiDiffModal.style.display = 'none';
        this.currentAiSuggestion = null;
    }

    approveAiSuggestion() {
        if (!this.currentAiSuggestion || !this.editor) return;

        // Save current version before applying AI suggestion
        this.saveCurrentVersion();
        
        // Reset version index when applying AI suggestion
        this.versionIndex = -1;

        // Apply the suggested content
        this.isRestoringVersion = true;
        this.editor.setValue(this.currentAiSuggestion.suggested);
        this.isRestoringVersion = false;

        // Emit content change to other users
        if (this.currentDocumentId) {
            this.socket.emit('content-change', {
                documentId: this.currentDocumentId,
                content: this.currentAiSuggestion.suggested,
                operation: 'ai-suggestion-applied'
            });
        }

        this.showToast('AI-Vorschlag wurde übernommen. Strg+Z zum Rückgängigmachen.', 'success');
        this.closeAiDiffModal();

        // Add undo message to chat
        this.addChatMessage('✅ Änderungen wurden übernommen! Sie können die Änderungen mit Strg+Z rückgängig machen.', 'ai');
    }

    declineAiSuggestion() {
        this.showToast('AI-Vorschlag wurde abgelehnt.', 'info');
        this.closeAiDiffModal();
        
        // Add decline message to chat
        this.addChatMessage('❌ Vorschlag wurde abgelehnt. Kann ich Ihnen auf andere Weise helfen?', 'ai');
    }

    // LocalStorage utility methods
    getRecentDocuments() {
        try {
            const stored = localStorage.getItem('recentDocuments');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error reading recent documents from localStorage:', error);
            return [];
        }
    }

    saveDocumentToRecent(documentId, title, hasPassword = false) {
        try {
            let recentDocs = this.getRecentDocuments();
            
            // Remove existing entry if it exists
            recentDocs = recentDocs.filter(doc => doc.id !== documentId);
            
            // Add new entry at the beginning
            recentDocs.unshift({
                id: documentId,
                title: title,
                hasPassword: hasPassword,
                lastAccessed: new Date().toISOString(),
                accessCount: (recentDocs.find(doc => doc.id === documentId)?.accessCount || 0) + 1
            });
            
            // Keep only the last 10 documents
            recentDocs = recentDocs.slice(0, 10);
            
            localStorage.setItem('recentDocuments', JSON.stringify(recentDocs));
            this.loadRecentDocuments();
        } catch (error) {
            console.error('Error saving document to recent list:', error);
        }
    }

    removeDocumentFromRecent(documentId) {
        try {
            let recentDocs = this.getRecentDocuments();
            recentDocs = recentDocs.filter(doc => doc.id !== documentId);
            localStorage.setItem('recentDocuments', JSON.stringify(recentDocs));
            this.loadRecentDocuments();
        } catch (error) {
            console.error('Error removing document from recent list:', error);
        }
    }

    loadRecentDocuments() {
        const recentDocs = this.getRecentDocuments();
        
        if (!this.recentDocumentsList) {
            return;
        }
        
        if (recentDocs.length === 0) {
            this.recentDocumentsList.innerHTML = `
                <div class="no-documents">
                    <p>No recent documents found. Create or join a document to get started!</p>
                </div>
            `;
            return;
        }
        
        this.recentDocumentsList.innerHTML = recentDocs.map(doc => {
            const lastAccessed = new Date(doc.lastAccessed);
            const timeAgo = this.getTimeAgo(lastAccessed);
            
            return `
                <div class="document-card" data-document-id="${doc.id}">
                    <button class="remove-btn" data-document-id="${doc.id}" title="Remove from recent">×</button>
                    <h3>${this.escapeHtml(doc.title)}</h3>
                    <div class="document-id">ID: ${doc.id}</div>
                    <div class="document-meta">
                        <span class="last-accessed">Last accessed: ${timeAgo}</span>
                        ${doc.hasPassword ? '<span class="has-password">🔒 Protected</span>' : ''}
                    </div>
                </div>
            `;
        }).join('');
        
        // Add click event listeners to document cards
        this.recentDocumentsList.querySelectorAll('.document-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('remove-btn')) {
                    e.stopPropagation();
                    const docId = e.target.getAttribute('data-document-id');
                    this.removeDocumentFromRecent(docId);
                    return;
                }
                
                const docId = card.getAttribute('data-document-id');
                this.joinRecentDocument(docId);
            });
        });
    }

    joinRecentDocument(documentId) {
        this.currentDocumentId = documentId;
        this.documentIdInput.value = documentId;
        this.showLoading();
        
        // Update URL
        window.history.pushState({}, '', `?doc=${documentId}`);
        
        this.joinDocumentWithId(documentId);
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) {
            return 'Just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 2592000) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else {
            return date.toLocaleDateString();
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new LatexEditor();
});