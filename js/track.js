/**
 * 轨迹生成模块
 * 生成带有时间戳的轨迹点，模拟真实跑步数据
 */
class TrackGenerator {
    constructor() {
        // 配置参数
        this.config = {
            avgSpeed: 3.0,        // 平均速度 m/s（约10.8km/h，慢跑速度）
            speedVariance: 0.3,   // 速度波动范围
            sampleInterval: 3000  // 采样间隔 ms
        };
    }

    /**
     * 根据路径生成轨迹点
     * @param {Array} path - 节点ID数组
     * @param {number} targetTime - 目标时间（秒）
     * @returns {Array} 轨迹点数组
     */
    generateTrackPoints(path, targetTime) {
        if (!path || path.length < 2) return [];

        const trackPoints = [];
        const startTime = Date.now() - (targetTime * 1000); // 开始时间（毫秒时间戳）

        // 计算路径总距离
        let totalDistance = 0;
        const segments = [];
        for (let i = 0; i < path.length - 1; i++) {
            const from = graph.getNode(path[i]);
            const to = graph.getNode(path[i + 1]);
            if (!from || !to) continue;
            const dist = graph.haversine(from.lat, from.lng, to.lat, to.lng);
            segments.push({ from, to, dist });
            totalDistance += dist;
        }

        // 计算每个轨迹点的时间
        let currentTime = startTime;
        let accumulatedDist = 0;

        // 第一个点
        const firstNode = graph.getNode(path[0]);
        if (firstNode) {
            trackPoints.push({
                lat: firstNode.lat,
                lng: firstNode.lng,
                time: currentTime,
                speed: 0
            });
        }

        // 生成中间轨迹点
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const segTime = (seg.dist / totalDistance) * targetTime; // 该段占用的时间

            // 在该段内生成多个采样点
            const pointCount = Math.max(2, Math.ceil(segTime / (this.config.sampleInterval / 1000)));
            for (let j = 1; j <= pointCount; j++) {
                const ratio = j / pointCount;
                const lat = seg.from.lat + (seg.to.lat - seg.from.lat) * ratio;
                const lng = seg.from.lng + (seg.to.lng - seg.from.lng) * ratio;

                // 添加随机偏移，模拟GPS漂移
                const jitter = 0.00002;
                const jitterLat = lat + (Math.random() - 0.5) * jitter;
                const jitterLng = lng + (Math.random() - 0.5) * jitter;

                // 计算速度（带波动）
                const baseSpeed = seg.dist / segTime;
                const speed = baseSpeed + (Math.random() - 0.5) * this.config.speedVariance;

                currentTime += (segTime / pointCount) * 1000;

                trackPoints.push({
                    lat: jitterLat,
                    lng: jitterLng,
                    time: Math.round(currentTime),
                    speed: Math.max(0.5, speed)
                });
            }
        }

        return trackPoints;
    }

    /**
     * 格式化轨迹点为API所需格式
     * @param {Array} trackPoints - 轨迹点数组
     * @returns {string} JSON字符串
     */
    formatForApi(trackPoints) {
        const points = trackPoints.map(p => ({
            lat: p.lat.toFixed(6),
            lng: p.lng.toFixed(6),
            time: p.time,
            speed: p.speed.toFixed(1)
        }));
        return JSON.stringify(points);
    }
}

window.trackGenerator = new TrackGenerator();
