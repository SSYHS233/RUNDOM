/**
 * RUNDOM API 通信模块（直连模式）
 */
class RundomApi {
    constructor() {
        this.token = '';
        this.userId = 0;
        this.studentId = 0;
        this.schoolId = 0;
        this.baseUrl = 'https://run-lb.tanmasports.com';
        this.appkey = '389885588s0648fa';
        this.secret2 = '56E39A1658455588885690425C0FD16055A21676';
    }

    async _post(path, body) {
        const sign = this._genSign({ body });
        const res = await fetch(this.baseUrl + path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'sign': sign,
                'token': this.token || '',
                'appkey': this.appkey
            },
            body: JSON.stringify(body)
        });
        return await res.json();
    }

    async _get(path, query = {}) {
        const sign = this._genSign({ query });
        const params = new URLSearchParams(query);
        const url = this.baseUrl + path + (params.toString() ? '?' + params.toString() : '');
        const res = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'sign': sign,
                'token': this.token || '',
                'appkey': this.appkey
            }
        });
        return await res.json();
    }

    _genSign({ query = null, body = null }) {
        let signStr = '';

        if (query !== null) {
            const sortedKeys = Object.keys(query).sort();
            for (const key of sortedKeys) {
                const value = query[key] === null ? '' : String(query[key]);
                if (value !== '') signStr += key + value;
            }
        }

        signStr += this.appkey + this.secret2;

        if (body !== null) signStr += JSON.stringify(body);

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

    // 登录
    async login(phone, password) {
        const body = {
            appVersion: '1.8.5', brand: 'Apple', deviceToken: '',
            deviceType: '2', mobileType: 'iPhone',
            password: md5(password), sysVersion: '18.6', userPhone: phone
        };
        const data = await this._post('/v1/auth/login/password', body);
        if (data.code === 10000 && data.response) {
            this.token = data.response.oauthToken?.token || '';
            this.userId = data.response.userId || 0;
            this.studentId = data.response.studentId || 0;
            this.schoolId = data.response.schoolId || 0;
        }
        return data;
    }

    // 上传跑步记录
    async uploadRecord(recordBody) {
        return await this._post('/v1/unirun/save/run/record/new', recordBody);
    }

    // ========== 查询类 (GET) ==========

    async getTokenInfo() {
        return await this._get('/v1/auth/query/token');
    }

    async getRunStandard(schoolId) {
        return await this._get('/v1/unirun/query/runStandard', { schoolId });
    }

    async getRunRecords(pageNum = 1, pageSize = 15) {
        return await this._get('/v1/unirun/query/student/all/run/record', { pageNum, pageSize });
    }

    async getRunInfo(userId, yearSemester) {
        return await this._get('/v1/unirun/query/runInfo', { userId, yearSemester: yearSemester || '' });
    }

    async getJoinNum(schoolId, studentId) {
        return await this._get('/v1/clubactivity/getJoinNum', { schoolId, studentId });
    }

    // ========== 俱乐部 ==========

    // 当前签到任务
    async getSignInTask() {
        return await this._get('/v1/clubactivity/getSignInTf', { studentId: this.studentId });
    }

    // 活动列表（按日期查询）
    async queryClubInfo(queryTime, pageNo = 1, pageSize = 15) {
        return await this._get('/v1/clubactivity/queryActivityList', {
            pageNo, pageSize, queryTime,
            schoolId: this.schoolId, studentId: this.studentId
        });
    }

    // 我的活动列表
    async queryMyActivities(pageNo = 1, pageSize = 20) {
        return await this._get('/v1/clubactivity/queryMyActivityList', {
            pageNo, pageSize, studentId: this.studentId
        });
    }

    // 我的任务（学期）
    async queryMyClubTask() {
        return await this._get('/v1/clubactivity/queryMySemesterClubActivity');
    }

    // 签到记录
    async queryMyClubRecord(pageNo = 1, pageSize = 15) {
        return await this._get('/v1/clubactivity/getStudentClubRecord', {
            pageNo, pageSize, studentId: this.studentId
        });
    }

    // 报名
    async joinClub(activityId) {
        return await this._get('/v1/clubactivity/joinClubActivity', {
            activityId, studentId: this.studentId
        });
    }

    // 取消报名
    async cancelClub(activityId) {
        return await this._get('/v1/clubactivity/cancelActivity', {
            activityId, studentId: this.studentId
        });
    }

    // 有效签到统计
    async countValidSignUp() {
        return await this._get('/v1/clubactivity/countValidSignUp', { studentId: this.studentId });
    }

    // 签到/签退
    async signInOrSignBack(activityId, lat, lng, signType) {
        return await this._post('/v1/clubactivity/signInOrSignBack', {
            activityId: Number(activityId),
            latitude: String(lat),
            longitude: String(lng),
            signType: String(signType),
            studentId: Number(this.studentId)
        });
    }
}

window.api = new RundomApi();
