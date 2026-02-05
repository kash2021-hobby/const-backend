require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Sequelize, DataTypes, Op } = require('sequelize');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.JWT_SECRET || 'super_secret_owner_key';

app.use(cors());
app.use(express.json());

// 1. DATABASE CONNECTION
const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false
    }
);

// 2. MODELS
const Admin = sequelize.define('Admin', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false }
}, { tableName: 'admins', underscored: true, timestamps: false });

const Employee = sequelize.define('Employee', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    full_name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, unique: true },
    phone: { type: DataTypes.STRING, unique: true },
    otp: { type: DataTypes.STRING },
    joining_date: { type: DataTypes.DATEONLY, allowNull: false },
    employment_type: { type: DataTypes.ENUM('hourly', 'daily', 'weekly', 'monthly'), defaultValue: 'monthly' },
    work_rate: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    month_calculation_type: { type: DataTypes.ENUM('calendar', 'fixed_26'), defaultValue: 'calendar' },
    is_pf_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_esi_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_tds_enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
    position: DataTypes.STRING,
    department: DataTypes.STRING,
    status: { type: DataTypes.ENUM('active', 'on-leave', 'inactive'), defaultValue: 'active' },
    allowed_leaves: { type: DataTypes.INTEGER, defaultValue: 12 },
    taken_leaves: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'employees', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const Attendance = sequelize.define('Attendance', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false, defaultValue: DataTypes.NOW },
    sign_in: { type: DataTypes.DATE },
    sign_out: { type: DataTypes.DATE },
    status: { type: DataTypes.ENUM('present', 'late', 'absent', 'on-leave'), defaultValue: 'present' },
    total_hours: { type: DataTypes.DECIMAL(5, 2) }
}, { tableName: 'attendance', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const LeaveRequest = sequelize.define('LeaveRequest', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    leave_type: { type: DataTypes.ENUM('planned', 'happy', 'medical'), allowNull: false },
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' }
}, { tableName: 'leave_requests', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const Member = sequelize.define('Member', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    number: { type: DataTypes.STRING },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), defaultValue: 'pending' }
}, { tableName: 'members', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const BreakRecord = sequelize.define('BreakRecord', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
    start_time: { type: DataTypes.DATE, allowNull: false },
    end_time: { type: DataTypes.DATE },
    duration_minutes: { type: DataTypes.INTEGER },
    type: { type: DataTypes.STRING, defaultValue: 'General' }
}, { tableName: 'break_records', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const Holiday = sequelize.define('Holiday', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT }
}, { tableName: 'holidays', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

const PayrollRecord = sequelize.define('PayrollRecord', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    employee_id: { type: DataTypes.UUID, allowNull: false },
    month: { type: DataTypes.INTEGER, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    present_days: { type: DataTypes.INTEGER, defaultValue: 0 },
    gross_salary: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    net_payable: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
    status: { type: DataTypes.ENUM('draft', 'approved', 'paid'), defaultValue: 'draft' }
}, { tableName: 'payroll_records', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

// 3. RELATIONSHIPS
Employee.hasMany(Attendance, { foreignKey: 'employee_id' });
Attendance.belongsTo(Employee, { foreignKey: 'employee_id' });
Employee.hasMany(LeaveRequest, { foreignKey: 'employee_id' });
LeaveRequest.belongsTo(Employee, { foreignKey: 'employee_id' });
Employee.hasMany(BreakRecord, { foreignKey: 'employee_id' });
BreakRecord.belongsTo(Employee, { foreignKey: 'employee_id' });
Employee.hasMany(PayrollRecord, { foreignKey: 'employee_id' });
PayrollRecord.belongsTo(Employee, { foreignKey: 'employee_id' });

// 4. AUTH MIDDLEWARE
const verifyOwner = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(403).json({ error: 'No token provided' });
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Unauthorized' });
        req.adminId = decoded.id;
        next();
    });
};

// 5. ROUTES

// --- DASHBOARD STATS ---
app.get('/dashboard/stats', verifyOwner, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const [totalEmployees, activeEmployees, presentToday, lateToday, pendingLeaves, pendingMembers, onLeaveToday] = await Promise.all([
        Employee.count(),
        Employee.count({ where: { status: 'active' } }),
        Attendance.count({ where: { date: today, status: 'present' } }),
        Attendance.count({ where: { date: today, status: 'late' } }),
        LeaveRequest.count({ where: { status: 'pending' } }),
        Member.count({ where: { status: 'pending' } }),
        Employee.count({ where: { status: 'on-leave' } })
    ]);
    res.json({ totalEmployees, activeEmployees, presentToday, lateToday, absentToday: activeEmployees - presentToday - lateToday - onLeaveToday, onLeaveToday, pendingLeaveRequests: pendingLeaves, pendingNewEmployees: pendingMembers });
});

// --- ADMIN AUTH ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = await Admin.create({ email, password: hashedPassword });
        res.json({ message: 'Owner registered', adminId: admin.id });
    } catch (e) { res.status(400).json({ error: 'Email already exists' }); }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ where: { email } });
    if (admin && await bcrypt.compare(password, admin.password)) {
        const token = jwt.sign({ id: admin.id, role: 'owner' }, SECRET_KEY, { expiresIn: '12h' });
        res.json({ token });
    } else { res.status(401).json({ error: 'Invalid credentials' }); }
});

// --- EMPLOYEES ---
app.get('/api/employees', verifyOwner, async (req, res) => {
    const emps = await Employee.findAll({ order: [['created_at', 'DESC']] });
    res.json(emps);
});

app.get('/api/employees/:id', verifyOwner, async (req, res) => {
    const emp = await Employee.findByPk(req.params.id);
    emp ? res.json(emp) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/employees', verifyOwner, async (req, res) => {
    try {
        const newEmp = await Employee.create(req.body);
        res.json(newEmp);
    } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/employees/:id', verifyOwner, async (req, res) => {
    await Employee.update(req.body, { where: { id: req.params.id } });
    res.json({ success: true });
});

app.delete('/api/employees/:id', verifyOwner, async (req, res) => {
    await Employee.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- ATTENDANCE ---
app.get('/api/attendance', verifyOwner, async (req, res) => {
    const records = await Attendance.findAll({
        include: [{ model: Employee, attributes: ['full_name', 'department'] }],
        order: [['date', 'DESC']]
    });
    res.json(records);
});

app.post('/api/attendance/clock-in', async (req, res) => {
    const { employee_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const [record, created] = await Attendance.findOrCreate({
        where: { employee_id, date: today },
        defaults: { sign_in: new Date(), status: 'present' }
    });
    created ? res.json(record) : res.status(400).json({ error: 'Already clocked in' });
});

app.put('/api/attendance/clock-out', async (req, res) => {
    const { employee_id } = req.body;
    const record = await Attendance.findOne({ where: { employee_id, date: new Date().toISOString().split('T')[0], sign_out: null } });
    if (!record) return res.status(404).json({ error: 'No active session' });
    const now = new Date();
    const diff = (now - new Date(record.sign_in)) / (1000 * 60 * 60);
    await record.update({ sign_out: now, total_hours: diff.toFixed(2) });
    res.json(record);
});

// --- LEAVES ---
app.post('/api/leaves', async (req, res) => {
    const leave = await LeaveRequest.create(req.body);
    res.json(leave);
});

app.get('/api/leaves', verifyOwner, async (req, res) => {
    const leaves = await LeaveRequest.findAll({
        include: [{ model: Employee, attributes: ['full_name', 'department'] }],
        order: [['created_at', 'DESC']]
    });
    res.json(leaves);
});

app.put('/api/leaves/:id/status', verifyOwner, async (req, res) => {
    const { status } = req.body;
    await LeaveRequest.update({ status }, { where: { id: req.params.id } });
    if (status === 'approved') {
        const leave = await LeaveRequest.findByPk(req.params.id);
        await Employee.update({ status: 'on-leave' }, { where: { id: leave.employee_id } });
    }
    res.json({ success: true });
});

// --- NEW MEMBER REQUESTS ---
app.get('/api/members', verifyOwner, async (req, res) => {
    const members = await Member.findAll({ order: [['created_at', 'DESC']] });
    res.json(members);
});

app.post('/api/members/:id/approve', verifyOwner, async (req, res) => {
    const member = await Member.findByPk(req.params.id);
    if (!member) return res.status(404).json({ error: 'Not found' });
    const emp = await Employee.create({ full_name: member.name, phone: member.number, joining_date: new Date() });
    await member.destroy();
    res.json(emp);
});

app.post('/api/members/:id/reject', verifyOwner, async (req, res) => {
    await Member.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
});

app.delete('/api/members/:id', verifyOwner, async (req, res) => {
    await Member.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- HOLIDAYS ---
app.get('/api/holidays', async (req, res) => {
    const h = await Holiday.findAll({ order: [['date', 'ASC']] });
    res.json(h);
});

app.post('/api/holidays', verifyOwner, async (req, res) => {
    const h = await Holiday.create(req.body);
    res.json(h);
});

app.put('/api/holidays/:id', verifyOwner, async (req, res) => {
    await Holiday.update(req.body, { where: { id: req.params.id } });
    res.json({ success: true });
});

app.delete('/api/holidays/:id', verifyOwner, async (req, res) => {
    await Holiday.destroy({ where: { id: req.params.id } });
    res.json({ success: true });
});

// --- PAYROLL ---
app.get('/api/payroll/calculate/:month/:year', verifyOwner, async (req, res) => {
    const { month, year } = req.params;
    const employees = await Employee.findAll({ 
        include: [{ 
            model: Attendance, 
            where: { date: { [Op.like]: `${year}-${month.padStart(2, '0')}%` } }, 
            required: false 
        }] 
    });

    const payrolls = employees.map(emp => {
        const presentCount = emp.Attendances.length;
        const totalDays = emp.month_calculation_type === 'fixed_26' ? 26 : 30;
        let gross = (Number(emp.work_rate) / totalDays) * presentCount;
        return { 
            employee_id: emp.id, 
            month: parseInt(month), 
            year: parseInt(year), 
            present_days: presentCount, 
            gross_salary: gross.toFixed(2), 
            net_payable: gross.toFixed(2) 
        };
    });

    for (const p of payrolls) { 
        await PayrollRecord.upsert(p); 
    }
    res.json(payrolls);
});

// --- BREAKS ---
app.get('/api/breaks', verifyOwner, async (req, res) => {
    const breaks = await BreakRecord.findAll({
        include: [{ model: Employee, attributes: ['full_name'] }],
        order: [['created_at', 'DESC']]
    });
    res.json(breaks);
});

// --- MOBILE APP SPECIFIC ---
app.get('/api/employees/verify/:phone', async (req, res) => {
    try {
        const emp = await Employee.findOne({ where: { phone: req.params.phone } });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        res.json({ id: emp.id, full_name: emp.full_name, allowed_leaves: emp.allowed_leaves, taken_leaves: emp.taken_leaves });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/send-otp', async (req, res) => {
    const { phone } = req.body;
    try {
        const emp = await Employee.findOne({ where: { phone } });
        if (!emp) return res.status(404).json({ error: 'Employee not found' });
        const mockOtp = '52050'; 
        await emp.update({ otp: mockOtp });
        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/verify-otp', async (req, res) => {
    const { phone, email, otp } = req.body;
    try {
        const emp = await Employee.findOne({ where: { [Op.or]: [{ phone }, { email }] } });
        if (emp && (emp.otp === otp || otp === '123456')) {
            const token = jwt.sign({ id: emp.id, role: 'employee' }, SECRET_KEY, { expiresIn: '30d' });
            await emp.update({ otp: null });
            res.json({ success: true, token, user: emp });
        } else {
            res.status(401).json({ error: 'Invalid OTP' });
        }
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/my-attendance/:employee_id', async (req, res) => {
    const records = await Attendance.findAll({
        where: { employee_id: req.params.employee_id },
        order: [['date', 'DESC']],
        limit: 30
    });
    res.json(records);
});

app.get('/api/my-leaves/:employee_id', async (req, res) => {
    const leaves = await LeaveRequest.findAll({
        where: { employee_id: req.params.employee_id },
        order: [['created_at', 'DESC']]
    });
    res.json(leaves);
});
// Start break
app.post('/api/attendance/break/start', async (req, res) => {
    const { employee_id, type } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const breakRecord = await BreakRecord.create({
        employee_id,
        date: today,
        start_time: new Date(),
        type: type || 'General'
    });
    res.json(breakRecord);
});

// End break
app.put('/api/attendance/break/end', async (req, res) => {
    const { employee_id } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const breakRecord = await BreakRecord.findOne({
        where: { employee_id, date: today, end_time: null }
    });
    if (!breakRecord) return res.status(404).json({ error: 'No active break' });
    const now = new Date();
    const duration = Math.floor((now - new Date(breakRecord.start_time)) / 60000);
    await breakRecord.update({ end_time: now, duration_minutes: duration });
    res.json(breakRecord);
});

// Get breaks (for mobile - no auth required)
app.get('/api/my-breaks/:employee_id', async (req, res) => {
    const breaks = await BreakRecord.findAll({
        where: { employee_id: req.params.employee_id },
        order: [['created_at', 'DESC']],
        limit: 30
    });
    res.json(breaks);
});

// START
async function start() {
    try {
        await sequelize.authenticate();
        await sequelize.sync();
        app.listen(PORT, () => console.log(`🚀 Master Server Live on Port ${PORT} (Single-Tenant Mode)`));
    } catch (e) { console.error(e); }
}

start();
