/**
 * RUNDOM 代理服务器
 * 转发API请求 + 定时签到签退
 */
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const API_HOST = 'run-lb.tanmasports.com';
const APPKEY = '389885588s0648fa';
const SECRET2 = '56E39A1658455588885690425C0FD16055A21676';

const MIME = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.svg': 'image/svg+xml'
};

// ========== 签名算法 ==========
function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}

function computeSign(params) {
    const { query = null, body = null } = params;
    let signStr = '';

    // GET 请求：排序查询参数拼接
    if (query !== null) {
        const sortedKeys = Object.keys(query).sort();
        for (const key of sortedKeys) {
            const value = query[key] === null ? '' : String(query[key]);
            if (value !== '') signStr += key + value;
        }
    }

    signStr += APPKEY + SECRET2;

    // POST 请求：拼接 body
    if (body !== null) signStr += JSON.stringify(body);

    // 特殊字符处理
    let replaced = false;
    const specialChars = [' ', '~', '!', '(', ')', "'"];
    for (const ch of specialChars) {
        if (signStr.includes(ch)) {
            signStr = signStr.split(ch).join('');
            replaced = true;
        }
    }
    if (replaced) signStr = encodeURIComponent(signStr);

    let sign = md5(signStr).toUpperCase();
    if (replaced) sign += 'encodeutf8';
    return sign;
}

// ========== 定时任务存储 ==========
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
        const result = await apiPost('/v1/clubactivity/signInOrSignBack', {
            activityId: Number(taskData.activityId),
            latitude: String(taskData.location.lat),
            longitude: String(taskData.location.lng),
            signType: '1',
            studentId: Number(taskData.studentId)
        }, taskData.token);
        console.log('[定时签到] 结果:', JSON.stringify(result));

        // 签到后30分钟自动签退
        const signOutTimer = setTimeout(async () => {
            console.log('[定时签退] 执行中...');
            const result2 = await apiPost('/v1/clubactivity/signInOrSignBack', {
                activityId: Number(taskData.activityId),
                latitude: String(taskData.location.lat),
                longitude: String(taskData.location.lng),
                signType: '2',
                studentId: Number(taskData.studentId)
            }, taskData.token);
            console.log('[定时签退] 结果:', JSON.stringify(result2));
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

// ========== 直连 API 请求 ==========
function makeRequest(apiPath, method, headers, jsonBody) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: 443,
            path: apiPath,
            method,
            headers
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) {
                    console.log(`[API] JSON 解析失败:`, data.substring(0, 100));
                    reject(new Error('Invalid JSON response'));
                }
            });
        });
        req.on('error', (e) => reject(e));
        req.setTimeout(10000, () => {
            req.destroy();
            reject(new Error('timeout'));
        });
        if (jsonBody) req.write(jsonBody);
        req.end();
    });
}

function apiPost(apiPath, body, token) {
    const jsonBody = JSON.stringify(body);
    const sign = computeSign({ body });
    const headers = {
        'Content-Type': 'application/json; charset=UTF-8',
        'sign': sign,
        'token': token || '',
        'appkey': APPKEY
    };
    return makeRequest(apiPath, 'POST', headers, jsonBody);
}

function apiGet(apiPath, query, token) {
    const sign = computeSign({ query });
    const headers = {
        'Content-Type': 'application/json; charset=UTF-8',
        'sign': sign,
        'token': token || '',
        'appkey': APPKEY
    };
    const qs = Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    const fullPath = qs ? `${apiPath}?${qs}` : apiPath;
    return makeRequest(fullPath, 'GET', headers, null);
}

// ========== 静态文件 ==========
function serveStatic(req, res) {
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    const ext = path.extname(filePath);
    const contentType = MIME[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

function jsonResponse(res, data) {
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
}

// ========== 路由 ==========
const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        res.end();
        return;
    }

    // 健康检查
    if (req.url === '/api/health') {
        return jsonResponse(res, { status: 'ok', mode: '直连 API' });
    }

    // ========== 代理 GET 请求 ==========
    if (req.method === 'GET' && req.url.startsWith('/v1/')) {
        const urlObj = new URL(req.url, 'http://localhost');
        const apiPath = urlObj.pathname;
        const query = Object.fromEntries(urlObj.searchParams);
        const token = query._token || '';
        delete query._token;

        apiGet(apiPath, query, token)
            .then(data => jsonResponse(res, data))
            .catch(e => {
                console.error('GET proxy error:', e.message);
                jsonResponse(res, { code: -1, msg: '请求失败: ' + e.message });
            });
        return;
    }

    // ========== 代理 POST 请求 ==========
    if (req.method === 'POST' && req.url.startsWith('/v1/')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const token = data._token || '';
                delete data._token;

                const result = await apiPost(req.url, data, token);
                jsonResponse(res, result);
            } catch (e) {
                console.error('POST proxy error:', e.message);
                jsonResponse(res, { code: -1, msg: '请求失败: ' + e.message });
            }
        });
        return;
    }

    // ========== 定时任务 API ==========
    if (req.url.startsWith('/api/schedule/')) {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);

                if (req.url === '/api/schedule/start') {
                    const { userId, token, studentId, activityId, signInTime, location } = data;
                    const taskId = `task_${userId}_${Date.now()}`;

                    const now = new Date();
                    const signInDate = new Date(signInTime);
                    const signInDelay = signInDate.getTime() - now.getTime();

                    if (signInDelay <= 0) {
                        return jsonResponse(res, { code: -1, msg: '签到时间已过' });
                    }

                    const signOutDate = new Date(signInDate.getTime() + 30 * 60 * 1000);

                    scheduleSignTask(taskId, {
                        userId, token, studentId, activityId, signInTime: signInDate.toISOString(), location
                    }, signInDelay);

                    saveTasks();

                    return jsonResponse(res, {
                        code: 10000,
                        msg: '定时任务已设置',
                        taskId,
                        signInTime: signInDate.toLocaleString(),
                        signOutTime: signOutDate.toLocaleString()
                    });
                }

                if (req.url === '/api/schedule/stop') {
                    const { taskId } = data;
                    const task = scheduledTasks.get(taskId);
                    if (task) {
                        clearTimeout(task.signInTimer);
                        if (task.signOutTimer) clearTimeout(task.signOutTimer);
                        scheduledTasks.delete(taskId);
                        saveTasks();
                        return jsonResponse(res, { code: 10000, msg: '定时任务已停止' });
                    }
                    return jsonResponse(res, { code: -1, msg: '任务不存在' });
                }

                if (req.url === '/api/schedule/status') {
                    const { userId } = data;
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
                    return jsonResponse(res, { code: 10000, tasks: userTasks });
                }

                jsonResponse(res, { code: -1, msg: '未知API' });
            } catch (e) {
                jsonResponse(res, { code: -1, msg: '请求格式错误' });
            }
        });
        return;
    }

    serveStatic(req, res);
});

server.listen(PORT, () => {
    console.log(`RUNDOM server running at http://localhost:${PORT}`);
});
