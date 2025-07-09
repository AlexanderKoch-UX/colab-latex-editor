# Collaborative LaTeX Editor

A real-time collaborative LaTeX editor that allows multiple users to edit documents simultaneously with live PDF compilation and password protection.

## Features

- ✅ **Create New LaTeX Documents**: Start fresh documents with customizable titles
- ✅ **Real-time Collaboration**: Multiple users can edit the same document simultaneously
- ✅ **Password Protection**: Secure documents with optional passwords
- ✅ **Live PDF Compilation**: Compile LaTeX to PDF with one click
- ✅ **PDF Download**: Download compiled PDFs directly
- ✅ **Shareable Links**: Share document links with others
- ✅ **No User Registration**: Jump right in without creating accounts
- ✅ **Auto-save**: Documents are automatically saved every 30 seconds
- ✅ **In-Memory Fallback**: Works without database for development/testing
- ✅ **Auto-Compile Control**: Click ⚡ Auto button to enable/disable

## Prerequisites

Before running the application, make sure you have:

1. **Node.js** (v14 or higher)
2. **MySQL** database server
3. **LaTeX distribution** (TeX Live, MiKTeX, or MacTeX) with `pdflatex` command available

**Configure environment variables**
Edit the `.env` file with your database credentials:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=latex_editor
```

## License

MIT License - see LICENSE file for details
