require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes } = require('sequelize');
 // Optional if you hardcode creds below
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_owner_key'; // CHANGE THIS IN PRODUCTION

// 1. SETUP EXPRESS APP
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${req.method}] ${req.url}`);
    next();
});

console.log('==== ENV DEBUG START ====');
console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
console.log('DB_PASSWORD EXISTS:', !!process.env.DB_PASSWORD);
console.log('PORT:', process.env.PORT);
console.log('==== ENV DEBUG END ====');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'kashyapnandan2021@gmail.com', // <--- REPLACE THIS
    pass: process.env.EMAIL_PASS      // <--- REPLACE THIS
  }
});
// 2. SETUP DATABASE CONNECTION (All in one place)
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER ,
    process.env.DB_PASSWORD ,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

// 3. DEFINE MODEL (Employee Schema)
const Employee = sequelize.define('Employee', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    full_name: { type: DataTypes.STRING, allowNull: false },
    dob: { type: DataTypes.DATEONLY },
    joining_date: { type: DataTypes.DATEONLY, allowNull: false },
    employment_type: { 
        type: DataTypes.ENUM('hourly', 'daily', 'weekly'), 
        allowNull: false 
    },
    work_rate: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    position: DataTypes.STRING,
    department: DataTypes.STRING,
    shift: { type: DataTypes.ENUM('morning', 'evening', 'night', 'custom') },
    phone: DataTypes.STRING,
    allowed_leaves: { 
        type: DataTypes.INTEGER, 
        defaultValue: 12 
    },
    taken_leaves: { 
        type: DataTypes.INTEGER, 
        defaultValue: 0 
    },
    status: { 
        type: DataTypes.ENUM('active', 'on-leave', 'inactive'), 
        defaultValue: 'active' 
    }
}, {
    tableName: 'employees',
    underscored: true,
    timestamps: true,       // Keep timestamps enabled...
    updatedAt: false,       // ...BUT tell Sequelize "updated_at" does not exist
    createdAt: 'created_at'
});
const Attendance = sequelize.define('Attendance', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false,
        defaultValue: DataTypes.NOW
    },
    sign_in: {
        type: DataTypes.DATE // Stores date and time
    },
    sign_out: {
        type: DataTypes.DATE
    },
    status: {
        type: DataTypes.ENUM('present', 'late', 'absent', 'on-leave'),
        defaultValue: 'present'
    },
    total_hours: {
        type: DataTypes.DECIMAL(5, 2)
    }
}, {
    tableName: 'attendance',
    timestamps: true,       // Keep timestamps enabled...
    updatedAt: false,       // ...BUT tell Sequelize "updated_at" does not exist
    createdAt: 'created_at'
});
// === DATABASE RELATIONSHIPS ===
// This allows you to fetch an Attendance record AND see who the Employee is automatically
Employee.hasMany(Attendance, { foreignKey: 'employee_id' });
Attendance.belongsTo(Employee, { foreignKey: 'employee_id' });

const LeaveRequest = sequelize.define('LeaveRequest', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    leave_type: {
        type: DataTypes.ENUM('planned', 'happy', 'medical'), 
        allowNull: false
    },
    start_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    end_date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    reason: {
        type: DataTypes.TEXT
    },
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
    }
}, {
    tableName: 'leave_requests',
   timestamps: true,       // Keep timestamps enabled...
    updatedAt: false,       // ...BUT tell Sequelize "updated_at" does not exist
    createdAt: 'created_at'
});

// === RELATIONSHIPS (Add this near your other relationships) ===
Employee.hasMany(LeaveRequest, { foreignKey: 'employee_id' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id' });

const Holiday = sequelize.define('Holiday', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT
    }
}, {
    tableName: 'holidays',
    timestamps: true,       // Keep timestamps enabled...
    updatedAt: false,       // ...BUT tell Sequelize "updated_at" does not exist
    createdAt: 'created_at'
});
const NewMember = sequelize.define('NewMember', {
    id: {
        type: DataTypes.CHAR(36),
        primaryKey: true,
        defaultValue: DataTypes.UUIDV4
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    number: {
        type: DataTypes.STRING,
        allowNull: false
    }
}, {
    tableName: 'new_member',
    timestamps: true,
    updatedAt: false, // Matches the SQL above (no updated_at column)
    createdAt: 'created_at'
});
const Admin = sequelize.define('Admin', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: 'admins',
    timestamps: false  // This tells Sequelize NOT to look for or create created_at/updated_at
});

const BreakRecord = sequelize.define('BreakRecord', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },
    employee_id: {
        type: DataTypes.UUID,
        allowNull: false
    },
    date: {
        type: DataTypes.DATEONLY,
        defaultValue: DataTypes.NOW
    },
    start_time: {
        type: DataTypes.DATE, // Timestamp when break started
        allowNull: false
    },
    end_time: {
        type: DataTypes.DATE // Timestamp when break ended
    },
    duration_minutes: {
        type: DataTypes.INTEGER // Calculated total minutes of the break
    },
    type: {
        type: DataTypes.STRING, // Optional: "Lunch", "Tea", etc.
        defaultValue: 'General'
    }
}, {
    tableName: 'break_records',
    timestamps: true,
    updatedAt: false,
    createdAt: 'created_at',
    underscored: true
});

// === ADD RELATIONSHIPS ===
Employee.hasMany(BreakRecord, { foreignKey: 'employee_id' });
BreakRecord.belongsTo(Employee, { foreignKey: 'employee_id' });
// MIDDLEWARE: Verifies if the user is the Owner
const verifyOwner = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ error: 'No token provided' });

    // Remove "Bearer " prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

    jwt.verify(cleanToken, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized: Invalid Token' });
        req.adminId = decoded.id;
        next();
    });
};

// 5. API ROUTES
// Get All
// === AUTH ROUTES ===

app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    // 1. Check if user exists
    const user = await Employee.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'Email not found in our system.' });
    }

    // 2. Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // 3. Save OTP to database (You need an 'otp' column in your Employee table)
    // If you don't have an 'otp' column, create it, or store it in a temporary table.
    user.otp = otp;
    await user.save();

    // 4. Send Email
    const mailOptions = {
      from: 'Attendance App',
      to: email,
      subject: 'Your Login OTP',
      text: `Your OTP for login is: ${otp}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ error: 'Failed to send email' });
      }
      res.json({ message: 'OTP sent successfully!' });
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- API 2: VERIFY OTP & LOGIN ---
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    // 1. Find User
    const user = await Employee.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 2. Verify OTP
    // Ensure you handle data types (string vs number) correctly
    if (String(user.otp) !== String(otp)) {
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // 3. Clear OTP after success (Optional but recommended)
    user.otp = null;
    await user.save();

    // 4. Return User Data (Success)
    res.json({ message: 'Login successful', user });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. REGISTER OWNER (Run this ONCE in Postman to create your account)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        // Encrypt password
        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = await Admin.create({ email, password: hashedPassword });
        res.json({ message: 'Owner account created', adminId: admin.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. LOGIN (Use this to get your Access Token)
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const admin = await Admin.findOne({ where: { email } });
        
        // Check if user exists AND password matches
        if (!admin || !(await bcrypt.compare(password, admin.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Generate Token
        const token = jwt.sign({ id: admin.id, role: 'owner' }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ message: 'Login successful', token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/employees', verifyOwner, async (req, res) => {
    try {
        const employees = await Employee.findAll({ order: [['created_at', 'DESC']] });
        res.json(employees);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/employees/verify/:phone', async (req, res) => {
    const employee = await Employee.findOne({ where: { phone: req.params.phone } });
    employee ? res.json(employee) : res.status(404).json({ error: 'Not found' });
});
// Create
app.post('/api/employees', async (req, res) => {
    try {
        const newEmp = await Employee.create(req.body);
        res.status(201).json({ message: 'Created', data: newEmp });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update
app.put('/api/employees/:id', async (req, res) => {
    try {
        const [updated] = await Employee.update(req.body, { where: { id: req.params.id } });
        if (updated) {
            const emp = await Employee.findByPk(req.params.id);
            res.json({ message: 'Updated', data: emp });
        } else {
            res.status(404).json({ error: 'Not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete
app.delete('/api/employees/:id', async (req, res) => {
    try {
        const deleted = await Employee.destroy({ where: { id: req.params.id } });
        deleted ? res.json({ message: 'Deleted' }) : res.status(404).json({ error: 'Not found' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/attendance/clock-in', async (req, res) => {
    try {
        const { employee_id } = req.body;

        // 1. Check if they already clocked in today
        const existing = await Attendance.findOne({
            where: {
                employee_id: employee_id,
                date: new Date() // Checks for today's date
            }
        });

        if (existing) {
            return res.status(400).json({ error: 'Employee already clocked in today' });
        }

        // 2. Create the Clock In Record
        const newRecord = await Attendance.create({
            employee_id: employee_id,
            date: new Date(),
            sign_in: new Date(), // Current timestamp
            status: 'present'
        });

        res.status(201).json({ message: 'Clocked In Successfully', data: newRecord });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/attendance/clock-out', async (req, res) => {
    try {
        const { employee_id } = req.body;

        // 1. Find the open attendance record for today (where sign_out is NULL)
        const record = await Attendance.findOne({
            where: {
                employee_id: employee_id,
                date: new Date(),
                sign_out: null // Only find records where they haven't left yet
            }
        });

        if (!record) {
            return res.status(404).json({ error: 'No active clock-in found for today' });
        }

        // 2. Calculate Hours Worked
        const now = new Date();
        const signInTime = new Date(record.sign_in);
        const diffMs = now - signInTime; 
        const totalHours = (diffMs / (1000 * 60 * 60)).toFixed(2); // Convert ms to hours

        // 3. Update the record
        record.sign_out = now;
        record.total_hours = totalHours;
        await record.save();

        res.json({ message: 'Clocked Out Successfully', total_hours: totalHours, data: record });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/attendance', async (req, res) => {
    try {
        const logs = await Attendance.findAll({
            include: [{
                model: Employee,
                attributes: ['full_name', 'position', 'department'] // Only pick specific fields
            }],
            order: [['date', 'DESC'], ['sign_in', 'DESC']]
        });
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/leaves', async (req, res) => {
    try {
        const { employee_id, leave_type, start_date, end_date, reason } = req.body;

        // Basic validation: Ensure End Date is not before Start Date
        if (new Date(end_date) < new Date(start_date)) {
            return res.status(400).json({ error: 'End date cannot be before start date' });
        }

        const newLeave = await LeaveRequest.create({
            employee_id,
            leave_type,
            start_date,
            end_date,
            reason,
            status: 'pending' // Default status
        });

        res.status(201).json({ message: 'Leave request submitted', data: newLeave });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/leaves', async (req, res) => {
    try {
        const requests = await LeaveRequest.findAll({
            include: [{
                model: Employee,
                attributes: ['full_name', 'department', 'position'] // Show who asked for leave
            }],
            order: [['created_at', 'DESC']] // Newest requests first
        });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/leaves/:id/status', async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // Expecting 'approved' or 'rejected'

        const leaveRequest = await LeaveRequest.findByPk(id);

        if (!leaveRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }

        leaveRequest.status = status;
        await leaveRequest.save();

        res.json({ message: `Leave request ${status}`, data: leaveRequest });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/holidays', async (req, res) => {
    try {
        const holidays = await Holiday.findAll({
            order: [['date', 'ASC']] // Show upcoming holidays in order
        });
        res.json(holidays);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/holidays', async (req, res) => {
    try {
        const { name, date, description } = req.body;
        
        const newHoliday = await Holiday.create({
            name,
            date,
            description
        });

        res.status(201).json({ message: 'Holiday added', data: newHoliday });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.get('/api/members', async (req, res) => {
    try {
        const members = await NewMember.findAll({
            order: [['created_at', 'DESC']]
        });
        res.json(members);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.delete('/api/members/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const deleted = await NewMember.destroy({
            where: { id: id }
        });

        if (deleted) {
            res.json({ message: 'Member deleted successfully' });
        } else {
            res.status(404).json({ error: 'Member not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/members', async (req, res) => {
    try {
        const { name, number } = req.body;
        
        // Basic validation
        if (!name || !number) {
            return res.status(400).json({ error: 'Name and Number are required' });
        }

        const member = await NewMember.create({ name, number });
        res.status(201).json({ message: 'Member added successfully', data: member });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.post('/api/attendance/break/start', async (req, res) => {
    try {
        const { employee_id, type } = req.body;

        // 1. Check if they are already on a break (an open record exists)
        const activeBreak = await BreakRecord.findOne({
            where: {
                employee_id,
                date: new Date(),
                end_time: null
            }
        });

        if (activeBreak) {
            return res.status(400).json({ error: 'You are already on a break!' });
        }

        // 2. Start the break
        const newBreak = await BreakRecord.create({
            employee_id,
            start_time: new Date(),
            date: new Date(),
            type: type || 'General'
        });

        res.status(201).json({ message: 'Break started', data: newBreak });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
app.put('/api/attendance/break/end', async (req, res) => {
    try {
        const { employee_id } = req.body;

        // 1. Find the active break
        const activeBreak = await BreakRecord.findOne({
            where: {
                employee_id,
                date: new Date(),
                end_time: null
            }
        });

        if (!activeBreak) {
            return res.status(404).json({ error: 'No active break found to end' });
        }

        // 2. Calculate duration
        const now = new Date();
        const startTime = new Date(activeBreak.start_time);
        const diffMs = now - startTime;
        const minutes = Math.floor(diffMs / 60000); // Convert ms to minutes

        // 3. Update record
        activeBreak.end_time = now;
        activeBreak.duration_minutes = minutes;
        await activeBreak.save();

        res.json({ message: 'Break ended', duration_minutes: minutes, data: activeBreak });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// 3. Get Today's Breaks (Public - No Login Required)
app.get('/api/breaks', async (req, res) => {
    try {
        const breaks = await BreakRecord.findAll({
            include: [{ model: Employee, attributes: ['full_name'] }],
            order: [['start_time', 'DESC']]
        });
        res.json(breaks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});
async function startServer() {
    try {
        await sequelize.authenticate();
        console.log(">> 2. Database Connection Established!");
        
        // This is where the magic happens for Hostinger
        await sequelize.sync({ alter: true });
        console.log(">> 3. Database Synced.");

    } catch (err) {
        // If DB fails, we LOG the error but DON'T kill the app
        console.error(">> ❌ DATABASE ERROR:", err.message);
        console.log(">> Starting server in limited mode (No DB)...");
    }

    // This ensures the 503 error disappears
    app.listen(PORT, () => {
        console.log(`>> 4. Server is live on port ${PORT}`);
    });
}

startServer();
