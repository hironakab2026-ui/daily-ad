require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { ensureDeviceUser } = require('./middleware/auth');
const deviceRouter = require('./routes/device');
const categoriesRouter = require('./routes/categories');
const transactionsRouter = require('./routes/transactions');
const tasksRouter = require('./routes/tasks');
const summaryRouter = require('./routes/summary');
const calendarRouter = require('./routes/calendar');
const connectionsRouter = require('./routes/connections');
const integrationsRouter = require('./routes/integrations');

const app = express();
app.use(express.json());
app.use(cookieParser(process.env.SESSION_SECRET));

app.use('/api/device', ensureDeviceUser, deviceRouter);
app.use('/api/categories', ensureDeviceUser, categoriesRouter);
app.use('/api/transactions', ensureDeviceUser, transactionsRouter);
app.use('/api/tasks', ensureDeviceUser, tasksRouter);
app.use('/api/summary', ensureDeviceUser, summaryRouter);
app.use('/api/calendar', ensureDeviceUser, calendarRouter);
app.use('/api/connections', ensureDeviceUser, connectionsRouter);
app.use('/api/integrations', integrationsRouter); // 外部サービスはトークン認証（端末Cookieは使わない）

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.sqlMessage || err.message || 'サーバーエラーが発生しました' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`life-manager server listening on http://localhost:${port}`);
});
