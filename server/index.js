require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const categoriesRouter = require('./routes/categories');
const transactionsRouter = require('./routes/transactions');
const tasksRouter = require('./routes/tasks');
const summaryRouter = require('./routes/summary');
const calendarRouter = require('./routes/calendar');
const connectionsRouter = require('./routes/connections');
const integrationsRouter = require('./routes/integrations');

const app = express();
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30日
    httpOnly: true,
    sameSite: 'lax',
  },
}));

app.use('/api/auth', authRouter);
app.use('/api/categories', requireAuth, categoriesRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/tasks', requireAuth, tasksRouter);
app.use('/api/summary', requireAuth, summaryRouter);
app.use('/api/calendar', requireAuth, calendarRouter);
app.use('/api/connections', requireAuth, connectionsRouter);
app.use('/api/integrations', integrationsRouter); // 外部サービスはトークン認証（requireAuthは使わない）

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.sqlMessage || err.message || 'サーバーエラーが発生しました' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`life-manager server listening on http://localhost:${port}`);
});
