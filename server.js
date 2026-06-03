const express = require('express');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 8080;
const CF_WORKER_URL = process.env.CF_WORKER_URL || '';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });
        res.sendStatus(200);
    } else {
        next();
    }
});

// 静态文件
app.use(express.static(path.join(__dirname)));

// API 代理
app.all('/v1/*', async (req, res) => {
    const apiUrl = CF_WORKER_URL || 'https://run-lb.tanmasports.com';
    const backendUrl = apiUrl + req.originalUrl;

    const newHeaders = { ...req.headers };
    delete newHeaders.host;

    const init = {
        method: req.method,
        headers: newHeaders,
        body: req.method === 'GET' ? null : JSON.stringify(req.body)
    };

    try {
        const response = await fetch(backendUrl, init);
        const body = await response.text();

        res.set({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': '*'
        });

        res.status(response.status).send(body);
    } catch (error) {
        console.error(`Error during fetch: ${error.message}`);
        res.status(500).json({ code: -1, msg: '请求失败: ' + error.message });
    }
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: CF_WORKER_URL ? 'CF Worker 中转' : '直连 API'
    });
});

// 定时任务存储
const scheduledTasks = new Map();
const TASKS_FILE = path.join(__dirname, 'data', 'scheduled_tasks.json');

function loadTasks() {
    try {
        if (fs.existsSync(TASKS_FILE)) {
            return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
        }
    } catch (e) {}
    return [];
}

function saveTasks() {
    const tasks = [];
    scheduledTasks.forEach((task, taskId) => {
        tasks.push({
            taskId,
            userId: task.userId,
            token: task.token,
            studentId: task.studentId,
            activityId: task.activityId,
            signInTime: task.signInTime,
            location: task.location
        });
    });
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
        fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
    }
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

function restoreTasks() {
    const tasks = loadTasks();
    const now = new Date();

    tasks.forEach(task => {
        const signInDate = new Date(task.signInTime);
        const signInDelay = signInDate.getTime() - now.getTime();

        if (signInDelay > 0) {
            console.log(`恢复定时任务: ${task.taskId}, 签到时间: ${signInDate.toLocaleString()}`);
            scheduleSignTask(task.taskId, task, signInDelay);
        }
    });
}

function scheduleSignTask(taskId, taskData, signInDelay) {
    const signInTimer = setTimeout(async () => {
        console.log('[定时签到] 执行中...');
        try {
            const response = await fetch('https://run-lb.tanmasports.com/v1/clubactivity/signInOrSignBack', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'sign': taskData.sign || '',
                    'token': taskData.token || '',
                    'appkey': taskData.appkey || ''
                },
                body: JSON.stringify({
                    activityId: Number(taskData.activityId),
                    latitude: String(taskData.location.lat),
                    longitude: String(taskData.location.lng),
                    signType: '1',
                    studentId: Number(taskData.studentId)
                })
            });
            const result = await response.json();
            console.log('[定时签到] 结果:', JSON.stringify(result));
        } catch (e) {
            console.error('[定时签到] 失败:', e.message);
        }

        // 签到后30分钟自动签退
        const signOutTimer = setTimeout(async () => {
            console.log('[定时签退] 执行中...');
            try {
                const response = await fetch('https://run-lb.tanmasports.com/v1/clubactivity/signInOrSignBack', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json; charset=UTF-8',
                        'sign': taskData.sign || '',
                        'token': taskData.token || '',
                        'appkey': taskData.appkey || ''
                    },
                    body: JSON.stringify({
                        activityId: Number(taskData.activityId),
                        latitude: String(taskData.location.lat),
                        longitude: String(taskData.location.lng),
                        signType: '2',
                        studentId: Number(taskData.studentId)
                    })
                });
                const result = await response.json();
                console.log('[定时签退] 结果:', JSON.stringify(result));
            } catch (e) {
                console.error('[定时签退] 失败:', e.message);
            }
            scheduledTasks.delete(taskId);
            saveTasks();
        }, 30 * 60 * 1000);

        const t = scheduledTasks.get(taskId);
        if (t) t.signOutTimer = signOutTimer;
    }, signInDelay);

    scheduledTasks.set(taskId, {
        signInTimer,
        userId: taskData.userId,
        token: taskData.token,
        studentId: taskData.studentId,
        activityId: taskData.activityId,
        signInTime: taskData.signInTime,
        location: taskData.location
    });
}

restoreTasks();

// 定时任务 API
app.post('/api/schedule/start', (req, res) => {
    const { userId, token, studentId, activityId, signInTime, location, sign, appkey } = req.body;
    const taskId = `task_${userId}_${Date.now()}`;

    const now = new Date();
    const signInDate = new Date(signInTime);
    const signInDelay = signInDate.getTime() - now.getTime();

    if (signInDelay <= 0) {
        return res.json({ code: -1, msg: '签到时间已过' });
    }

    const signOutDate = new Date(signInDate.getTime() + 30 * 60 * 1000);

    scheduleSignTask(taskId, {
        userId, token, studentId, activityId, signInTime: signInDate.toISOString(), location, sign, appkey
    }, signInDelay);

    saveTasks();

    res.json({
        code: 10000,
        msg: '定时任务已设置',
        taskId,
        signInTime: signInDate.toLocaleString(),
        signOutTime: signOutDate.toLocaleString()
    });
});

app.post('/api/schedule/stop', (req, res) => {
    const { taskId } = req.body;
    const task = scheduledTasks.get(taskId);
    if (task) {
        clearTimeout(task.signInTimer);
        if (task.signOutTimer) clearTimeout(task.signOutTimer);
        scheduledTasks.delete(taskId);
        saveTasks();
        return res.json({ code: 10000, msg: '定时任务已停止' });
    }
    res.json({ code: -1, msg: '任务不存在' });
});

app.post('/api/schedule/status', (req, res) => {
    const { userId } = req.body;
    const userTasks = [];
    scheduledTasks.forEach((task, taskId) => {
        if (task.userId === userId) {
            const signInDate = new Date(task.signInTime);
            const signOutDate = new Date(signInDate.getTime() + 30 * 60 * 1000);
            userTasks.push({
                taskId,
                signInTime: signInDate.toLocaleString(),
                signOutTime: signOutDate.toLocaleString(),
                activityId: task.activityId,
                location: task.location
            });
        }
    });
    res.json({ code: 10000, tasks: userTasks });
});

app.listen(port, () => {
    console.log(`RUNDOM server running at http://localhost:${port}`);
});
