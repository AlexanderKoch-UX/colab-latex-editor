const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const fs = require('fs');
require('dotenv').config();

async function checkSetup() {
    console.log('🔍 Checking Collaborative LaTeX Editor Setup...\n');
    
    let allGood = true;
    
    // Check .env file
    console.log('1. Checking .env configuration...');
    if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME) {
        console.log('   ❌ .env file is missing required database configuration');
        console.log('   Please update .env with your database credentials');
        allGood = false;
    } else {
        console.log('   ✅ .env file configured');
    }
    
    // Check database connection
    console.log('\n2. Checking database connection...');
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });
        
        await db.execute('SELECT 1');
        await db.end();
        console.log('   ✅ Database connection successful');
    } catch (error) {
        console.log('   ❌ Database connection failed:', error.message);
        console.log('   Please check your database credentials and ensure MySQL is running');
        allGood = false;
    }
    
    // Check LaTeX installation
    console.log('\n3. Checking LaTeX installation...');
    exec('pdflatex --version', (error, stdout, stderr) => {
        if (error) {
            console.log('   ❌ pdflatex not found');
            console.log('   Please install a LaTeX distribution (TeX Live, MiKTeX, or MacTeX)');
            allGood = false;
        } else {
            console.log('   ✅ pdflatex found');
            console.log('   Version:', stdout.split('\n')[0]);
        }
        
        // Check directories
        console.log('\n4. Checking required directories...');
        const dirs = ['temp', 'downloads'];
        dirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`   ✅ Created ${dir} directory`);
            } else {
                console.log(`   ✅ ${dir} directory exists`);
            }
        });
        
        // Final result
        console.log('\n' + '='.repeat(50));
        if (allGood) {
            console.log('🎉 Setup check completed successfully!');
            console.log('You can now run: npm start');
        } else {
            console.log('⚠️  Please fix the issues above before starting the application');
        }
        console.log('='.repeat(50));
    });
}

checkSetup().catch(console.error);