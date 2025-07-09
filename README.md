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

## Prerequisites

Before running the application, make sure you have:

1. **Node.js** (v14 or higher)
2. **MySQL** database server
3. **LaTeX distribution** (TeX Live, MiKTeX, or MacTeX) with `pdflatex` command available

### Installing LaTeX

#### Windows (MiKTeX)
1. Download MiKTeX from https://miktex.org/download
2. Install and ensure `pdflatex` is in your PATH

#### macOS (MacTeX)
```bash
brew install --cask mactex
```

#### Linux (TeX Live)
```bash
# Ubuntu/Debian
sudo apt-get install texlive-full

# CentOS/RHEL
sudo yum install texlive-scheme-full
```

## Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd colab-latex-editor
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up MySQL database**
```bash
# Login to MySQL
mysql -u root -p

# Run the setup script
source setup-database.sql
```

4. **Configure environment variables**
Edit the `.env` file with your database credentials:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=latex_editor
```

5. **Start the application**
```bash
# Development mode (with auto-restart)
npm run dev

# Production mode
npm start
```

6. **Access the application**
Open your browser and go to `http://localhost:3000`

## Usage

### Creating a New Document

1. Click "Create New Document" on the home page
2. Enter a document title
3. Optionally set a password for protection
4. Click "Create Document"

### Joining an Existing Document

1. Enter the document ID in the "Join Document" field
2. Click "Join Document"
3. If password-protected, enter the password when prompted

### Collaborative Editing

- Multiple users can edit the same document simultaneously
- Changes are synchronized in real-time
- User count is displayed in the editor header

### Compiling to PDF

1. Click the "Compile PDF" button in the editor
2. The PDF will appear in the preview panel
3. Use "Download PDF" to save the compiled document

### Sharing Documents

1. Click "Copy Link" to copy the shareable URL
2. Share the link with collaborators
3. If password-protected, share the password separately

## Project Structure

```
colab-latex-editor/
├── public/                 # Frontend files
│   ├── index.html         # Main HTML file
│   ├── styles.css         # Styling
│   └── app.js            # Frontend JavaScript
├── temp/                  # Temporary LaTeX compilation files
├── downloads/             # Compiled PDF files
├── server.js             # Main server file
├── package.json          # Node.js dependencies
├── .env                  # Environment configuration
├── setup-database.sql    # Database setup script
└── README.md            # This file
```

## API Endpoints

### POST /api/documents
Create a new document
```json
{
  "title": "Document Title",
  "password": "optional_password"
}
```

### GET /api/documents/:id
Get document information (without content)

### WebSocket Events

#### Client to Server
- `join-document`: Join a document room
- `content-change`: Send content changes
- `compile-request`: Request PDF compilation

#### Server to Client
- `document-content`: Receive document content
- `content-change`: Receive content changes from other users
- `user-joined`: User joined notification
- `user-left`: User left notification
- `compile-success`: Compilation successful
- `compile-error`: Compilation failed

## Security Features

- Password hashing using bcrypt
- Input validation and sanitization
- SQL injection prevention with prepared statements
- XSS protection through proper escaping

## Troubleshooting

### LaTeX Compilation Issues

1. **"pdflatex command not found"**
   - Ensure LaTeX is installed and `pdflatex` is in your PATH
   - Restart the server after installing LaTeX

2. **Compilation errors**
   - Check the LaTeX syntax in your document
   - Ensure all required packages are installed

### Database Connection Issues

1. **"Database connection failed"**
   - Verify MySQL is running
   - Check database credentials in `.env`
   - Ensure the database exists

### Port Issues

1. **"Port already in use"**
   - Change the PORT in `.env` file
   - Kill any processes using the port

## Development

### Adding New Features

1. **Frontend**: Modify files in the `public/` directory
2. **Backend**: Update `server.js` for new API endpoints or socket events
3. **Database**: Add migrations to `setup-database.sql`

### Code Structure

- **Real-time collaboration**: Handled by Socket.IO
- **Document storage**: MySQL database with in-memory caching
- **PDF compilation**: Uses child_process to execute pdflatex
- **File management**: Temporary files cleaned up after compilation

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the console logs for error messages
3. Ensure all prerequisites are properly installed