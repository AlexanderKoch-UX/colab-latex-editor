# Collaborative LaTeX Editor with AI Assistant

A real-time collaborative LaTeX editor with AI-powered assistance that allows multiple users to edit documents simultaneously with live PDF compilation and password protection.

## Features

- ✅ **Create New LaTeX Documents**: Start fresh documents with customizable titles
- ✅ **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- ✅ **AI LaTeX Assistant**: Powered by Groq AI for code improvements, document generation, and syntax help
- ✅ **GitHub-style Diff Review**: Review AI suggestions with side-by-side comparison before applying
- ✅ **Password Protection**: Secure documents with optional passwords
- ✅ **Live PDF Compilation**: Compile LaTeX to PDF with one click
- ✅ **PDF Download**: Download compiled PDFs directly
- ✅ **Shareable Links**: Share document links with others
- ✅ **No User Registration**: Jump right in without creating accounts
- ✅ **Auto-save**: Documents are automatically saved every 30 seconds
- ✅ **In-Memory Fallback**: Works without database for development/testing
- ✅ **Auto-Compile Control**: Click ⚡ Auto button to enable/disable

## New AI Features

### AI Chat Interface
- Fixed floating action button (FAB) in bottom-right corner
- Chat interface for natural language LaTeX assistance
- Support for German language interactions

### AI Capabilities
- **LaTeX Code Improvements**: Analyze and improve existing LaTeX code
- **Document Generation**: Create complete LaTeX documents from descriptions
- **Syntax Help**: Explain LaTeX syntax and provide guidance
- **Error Correction**: Identify and fix LaTeX compilation errors

### Diff Review System
- GitHub-style side-by-side comparison
- Approve or decline AI suggestions
- Undo functionality (Ctrl+Z) after applying changes
- Visual highlighting of additions and deletions

## Prerequisites

Before running the application, make sure you have:

1. **Node.js** (v14 or higher)
2. **MySQL** database server
3. **Groq API Key** (free at [console.groq.com](https://console.groq.com/))

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd colab-latex-editor
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=latex_editor

# Groq AI Configuration
GROQ_API_KEY=your_groq_api_key_here

# Server Configuration
PORT=3000
```

4. Get a Groq API Key:
   - Visit [Groq Console](https://console.groq.com/)
   - Sign up for a free account
   - Create an API key
   - Add it to your `.env` file

5. Set up MySQL database:
   - Create a MySQL database with the name specified in `DB_NAME`
   - The application will automatically create the required tables

6. Start the server:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Usage

### Using the AI Assistant
1. Click the AI assistant button (bottom-right corner) while editing a document
2. Type your request in German or English, for example:
   - "Erstelle ein LaTeX-Dokument für einen wissenschaftlichen Artikel"
   - "Verbessere meinen LaTeX-Code"
   - "Erkläre mir diese LaTeX-Syntax"
   - "Füge eine Tabelle mit 3 Spalten hinzu"
3. Review AI suggestions in the diff modal
4. Approve or decline changes

### AI Assistant Examples

#### Code Improvement
```
User: "Verbessere meinen LaTeX-Code und mache ihn professioneller"
AI: Analyzes current code and suggests improvements for formatting, structure, and best practices
```

#### Document Generation
```
User: "Erstelle ein LaTeX-Dokument für eine Bachelorarbeit mit Titelseite, Inhaltsverzeichnis und Kapiteln"
AI: Generates a complete document structure with proper formatting
```

#### Syntax Help
```
User: "Wie erstelle ich eine Tabelle mit Rahmen?"
AI: Provides explanation and example code for creating bordered tables
```

## License

MIT License - see LICENSE file for details
