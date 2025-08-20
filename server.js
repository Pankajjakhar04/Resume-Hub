// Express Server with MongoDB Integration
const express = require('express');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const path = require('path');
const bcrypt = require('bcrypt');
const { connectToMongoDB, ObjectId } = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(fileUpload());

// Serve static files
app.use(express.static(path.join(__dirname)));

// Connect to MongoDB
let db;
connectToMongoDB()
  .then((database) => {
    db = database;
    console.log('MongoDB connected successfully');
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// API Routes

// User Registration
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists
    const existingUser = await db.collection('users').findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user
    const newUser = {
      name,
      email,
      password: hashedPassword,
      role: 'user',
      createdAt: new Date()
    };
    
    const result = await db.collection('users').insertOne(newUser);
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = newUser;
    res.status(201).json({ ...userWithoutPassword, id: result.insertedId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Server error during registration' });
  }
});

// User Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = await db.collection('users').findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ ...userWithoutPassword, id: user._id });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// Save Resume
app.post('/api/resumes', async (req, res) => {
  try {
    const { userId, fileName, description, fileContent } = req.body;
    
    // Create new resume
    const newResume = {
      userId,
      fileName,
      description,
      fileContent,
      uploadedAt: new Date()
    };
    
    const result = await db.collection('resumes').insertOne(newResume);
    res.status(201).json({ ...newResume, id: result.insertedId });
  } catch (error) {
    console.error('Resume save error:', error);
    res.status(500).json({ message: 'Server error while saving resume' });
  }
});

// Get User Resumes
app.get('/api/users/:userId/resumes', async (req, res) => {
  try {
    const userId = req.params.userId;
    
    const resumes = await db.collection('resumes')
      .find({ userId, archived: { $ne: true } }) // Exclude archived resumes
      .sort({ uploadedAt: -1 })
      .toArray();
    
    // Map _id to id for consistency with frontend
    const formattedResumes = resumes.map(resume => ({
      ...resume,
      id: resume._id
    }));
    
    res.json(formattedResumes);
  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(500).json({ message: 'Server error while fetching resumes' });
  }
});

// Admin: Get All Users
app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await db.collection('users')
      .find({ role: { $ne: 'admin' } })
      .project({ password: 0 })
      .toArray();
    
    // Map _id to id for consistency with frontend
    const formattedUsers = users.map(user => ({
      ...user,
      id: user._id
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error while fetching users' });
  }
});

// Admin: Get All Resumes with User Info
app.get('/api/admin/resumes', async (req, res) => {
  try {
    const resumes = await db.collection('resumes')
      .find({ archived: { $ne: true } }) // Exclude archived resumes
      .sort({ uploadedAt: -1 })
      .toArray();
    
    // Get all users for joining
    const users = await db.collection('users').find({}).toArray();
    const usersMap = {};
    users.forEach(user => {
      usersMap[user._id] = user;
    });
    
    // Join resume with user info
    const resumesWithUsers = resumes.map(resume => {
      const user = usersMap[resume.userId] || { name: 'Unknown User', email: 'Unknown Email' };
      return {
        ...resume,
        id: resume._id,
        userName: user.name,
        userEmail: user.email
      };
    });
    
    res.json(resumesWithUsers);
  } catch (error) {
    console.error('Get all resumes error:', error);
    res.status(500).json({ message: 'Server error while fetching all resumes' });
  }
});

// Initialize Admin User
async function initializeAdmin() {
  try {
    if (!db) {
      console.log('Database not connected yet, skipping admin initialization');
      return;
    }
    
    const adminExists = await db.collection('users').findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const result = await db.collection('users').insertOne({
        name: 'Admin User',
        email: 'admin@resumehub.com',
        password: hashedPassword,
        role: 'admin',
        createdAt: new Date()
      });
      console.log('Admin user created successfully with ID:', result.insertedId);
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.error('Admin initialization error:', error);
  }
}

// Check Admin Status Endpoint
app.get('/api/admin/status', async (req, res) => {
  try {
    const adminExists = await db.collection('users').findOne({ role: 'admin' });
    res.json({ 
      adminExists: !!adminExists,
      message: adminExists ? 'Admin user exists' : 'No admin user found'
    });
  } catch (error) {
    console.error('Admin status check error:', error);
    res.status(500).json({ message: 'Server error while checking admin status' });
  }
});

// Manual Admin Creation Endpoint (for testing)
app.post('/api/admin/create', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if admin already exists
    const adminExists = await db.collection('users').findOne({ role: 'admin' });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin user already exists' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password || 'admin123', 10);
    
    // Create admin user
    const result = await db.collection('users').insertOne({
      name: name || 'Admin User',
      email: email || 'admin@resumehub.com',
      password: hashedPassword,
      role: 'admin',
      createdAt: new Date()
    });
    
    console.log('Admin user created manually with ID:', result.insertedId);
    res.status(201).json({ 
      message: 'Admin user created successfully',
      id: result.insertedId,
      email: email || 'admin@resumehub.com'
    });
  } catch (error) {
    console.error('Manual admin creation error:', error);
    res.status(500).json({ message: 'Server error while creating admin user' });
  }
});

// Archive Resume (Move to Recycle Bin)
app.put('/api/resumes/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update resume to mark as archived
    const result = await db.collection('resumes').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          archived: true, 
          archivedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    
    res.json({ message: 'Resume archived successfully' });
  } catch (error) {
    console.error('Archive resume error:', error);
    res.status(500).json({ message: 'Server error while archiving resume' });
  }
});

// Delete Resume Permanently
app.delete('/api/resumes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete resume permanently
    const result = await db.collection('resumes').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    
    res.json({ message: 'Resume deleted permanently' });
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ message: 'Server error while deleting resume' });
  }
});

// Admin Archive Resume
app.put('/api/admin/resumes/:id/archive', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update resume to mark as archived
    const result = await db.collection('resumes').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          archived: true, 
          archivedAt: new Date() 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    
    res.json({ message: 'Resume archived successfully' });
  } catch (error) {
    console.error('Admin archive resume error:', error);
    res.status(500).json({ message: 'Server error while archiving resume' });
  }
});

// Admin Delete Resume
app.delete('/api/admin/resumes/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete resume permanently
    const result = await db.collection('resumes').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    
    res.json({ message: 'Resume deleted successfully' });
  } catch (error) {
    console.error('Admin delete resume error:', error);
    res.status(500).json({ message: 'Server error while deleting resume' });
  }
});

// Admin Delete User
app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if user exists and is not an admin
    const user = await db.collection('users').findOne({ _id: new ObjectId(id) });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete admin users' });
    }
    
    // Delete all resumes associated with this user
    const resumeResult = await db.collection('resumes').deleteMany({ userId: id });
    console.log(`Deleted ${resumeResult.deletedCount} resumes for user ${id}`);
    
    // Delete the user
    const userResult = await db.collection('users').deleteOne({ _id: new ObjectId(id) });
    
    if (userResult.deletedCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ 
      message: 'User and all associated resumes deleted successfully',
      deletedResumes: resumeResult.deletedCount
    });
  } catch (error) {
    console.error('Admin delete user error:', error);
    res.status(500).json({ message: 'Server error while deleting user' });
  }
});

// Get User's Archived Resumes
app.get('/api/users/:userId/resumes/archived', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const archivedResumes = await db.collection('resumes')
      .find({ userId, archived: true }) // Only archived resumes
      .sort({ archivedAt: -1 })
      .toArray();
    
    const formattedResumes = archivedResumes.map(resume => ({
      ...resume,
      id: resume._id
    }));
    
    res.json(formattedResumes);
  } catch (error) {
    console.error('Get archived resumes error:', error);
    res.status(500).json({ message: 'Server error while fetching archived resumes' });
  }
});

// Restore Archived Resume
app.put('/api/resumes/:id/restore', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Update resume to unarchive
    const result = await db.collection('resumes').updateOne(
      { _id: new ObjectId(id) },
      { 
        $unset: { 
          archived: "", 
          archivedAt: "" 
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ message: 'Resume not found' });
    }
    
    res.json({ message: 'Resume restored successfully' });
  } catch (error) {
    console.error('Restore resume error:', error);
    res.status(500).json({ message: 'Server error while restoring resume' });
  }
});

// Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'code.html'));
});

// Catch-all route for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'code.html'));
});

// Start server
connectToMongoDB()
  .then(async (database) => {
    db = database;
    console.log('MongoDB connected successfully');
    
    // Initialize admin user before starting server
    await initializeAdmin();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log('Admin initialization completed');
    });
  })
  .catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  });