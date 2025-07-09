# Quick Setup Guide

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v14+) - [Download here](https://nodejs.org/)
- **MySQL** database server - [Download here](https://dev.mysql.com/downloads/)
- **LaTeX distribution** with `pdflatex`:
  - Windows: [MiKTeX](https://miktex.org/download)
  - macOS: [MacTeX](https://www.tug.org/mactex/)
  - Linux: `sudo apt-get install texlive-full`

### 2. Database Setup
```sql
-- Login to MySQL as root
mysql -u root -p

-- Create database
CREATE DATABASE latex_editor;

-- Or run the provided script
source setup-database.sql
```

### 3. Configuration
Edit `.env` file with your database credentials:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=latex_editor
```

### 4. Install Dependencies
```bash
npm install
```

### 5. Verify Setup
```bash
npm run check
```

### 6. Start Application
```bash
# Development mode (auto-restart on changes)
npm run dev

# Production mode
npm start

# Or use the batch files on Windows
dev.bat    # Development
start.bat  # Production
```

### 7. Access Application
Open your browser and go to: `http://localhost:3000`

## 📋 Features Checklist

✅ **Create New Documents** - Click "Create New Document"  
✅ **Real-time Collaboration** - Multiple users can edit simultaneously  
✅ **Password Protection** - Set optional passwords when creating documents  
✅ **PDF Compilation** - Click "Compile PDF" to generate PDFs  
✅ **PDF Download** - Download compiled PDFs  
✅ **Shareable Links** - Copy and share document links  
✅ **No User Registration** - Jump right in without accounts  
✅ **Auto-save** - Documents save automatically every 30 seconds  

## 🔧 Troubleshooting

### Common Issues

**"Database connection failed"**
- Ensure MySQL is running
- Check credentials in `.env`
- Verify database exists

**"pdflatex command not found"**
- Install LaTeX distribution
- Ensure `pdflatex` is in your PATH
- Restart terminal/server after installation

**"Port already in use"**
- Change PORT in `.env` file
- Kill processes using the port: `netstat -ano | findstr :3000`

**Compilation errors**
- Check LaTeX syntax
- Ensure required packages are installed
- View error messages in browser console

## 📁 Project Structure

```
colab-latex-editor/
├── public/              # Frontend files
│   ├── index.html      # Main page
│   ├── styles.css      # Styling
│   └── app.js         # Frontend logic
├── temp/               # Temporary compilation files
├── downloads/          # Generated PDFs
├── server.js          # Main server
├── .env              # Configuration
├── package.json      # Dependencies
└── README.md         # Full documentation
```

## 🎯 Usage Examples

### Creating a Document
1. Click "Create New Document"
2. Enter title: "My Research Paper"
3. Set password: "secret123" (optional)
4. Click "Create Document"

### Sharing a Document
1. Click "Copy Link" in the editor
2. Share the URL: `http://localhost:3000?doc=abc123`
3. Share password separately if protected

### Collaborative Editing
- Multiple users join with same document ID
- Changes sync in real-time
- User count shows in header

## 🔒 Security Features

- Passwords hashed with bcrypt
- SQL injection protection
- XSS prevention
- Input validation

## 📞 Support

If you encounter issues:
1. Run `npm run check` to verify setup
2. Check console logs for errors
3. Review the troubleshooting section
4. Ensure all prerequisites are installed

Happy LaTeX editing! 🎉