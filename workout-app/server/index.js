require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { ensureDeviceUser } = require('./middleware/auth');
const deviceRouter = require('./routes/device');
const exercisesRouter = require('./routes/exercises');
const workoutsRouter = require('./routes/workouts');
const summaryRouter = require('./routes/summary');
const hubRouter = require('./routes/hub');

const app = express();
app.use(express.json());
// SESSION_SECRET はハブ（APP-1）の .env と同じ値にすること（device_id Cookie の
// 署名をハブと共有するため。ポートを跨いでも同じ端末として識別できる）。
app.use(cookieParser(process.env.SESSION_SECRET));

app.use('/api/device', ensureDeviceUser, deviceRouter);
app.use('/api/exercises', ensureDeviceUser, exercisesRouter);
app.use('/api/workouts', ensureDeviceUser, workoutsRouter);
app.use('/api/summary', ensureDeviceUser, summaryRouter);
app.use('/api/hub', ensureDeviceUser, hubRouter);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.sqlMessage || err.message || 'サーバーエラーが発生しました' });
});

const port = Number(process.env.PORT || 3100);
app.listen(port, () => {
  console.log(`workout-manager server listening on http://localhost:${port}`);
});
