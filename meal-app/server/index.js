require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { requireAuth } = require('./middleware/auth');
const authRouter = require('./routes/auth');
const mealsRouter = require('./routes/meals');
const weightsRouter = require('./routes/weights');
const targetsRouter = require('./routes/targets');
const hubRouter = require('./routes/hub');
const summaryRouter = require('./routes/summary');
const foodsRouter = require('./routes/foods');

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
app.use('/api/meals', requireAuth, mealsRouter);
app.use('/api/weights', requireAuth, weightsRouter);
app.use('/api/targets', requireAuth, targetsRouter);
app.use('/api/hub-connection', requireAuth, hubRouter);
app.use('/api/summary', requireAuth, summaryRouter);
app.use('/api/foods', requireAuth, foodsRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.sqlMessage || err.message || 'サーバーエラーが発生しました' });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`meal-app server listening on http://localhost:${port}`);
});
