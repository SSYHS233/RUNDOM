/**
 * 轨迹生成模块 V2
 * 基于 unirun-web-main 的 genTrackPoints 算法
 * 使用地图多边形线段插值，生成更真实的轨迹
 */
class TrackGeneratorV2 {
    constructor() {
        this.MIN_PACE = 6;  // min/km
        this.MAX_PACE = 10; // min/km
    }

    /**
     * 根据地图数据生成轨迹点
     * @param {number} distance - 目标距离（米）
     * @param {string} mapId - 地图ID
     * @param {number} durationMinutes - 目标时间（分钟）
     * @returns {string} JSON字符串，格式: ["lng-lat-time-accuracy", ...]
     */
    genTrackPoints(distance, mapId, durationMinutes) {
        const targetDistance = Number(distance);
        if (!Number.isFinite(targetDistance) || targetDistance <= 0) return '[]';

        const coords = mapLoader.getMapData(mapId)
            .map(point => point.split(',').map(Number))
            .filter(pair => pair.length === 2 && pair.every(num => !Number.isNaN(num)));
        if (coords.length < 2) return '[]';

        // 去重
        const sanitized = [];
        coords.forEach((point, index) => {
            const prev = coords[index - 1];
            if (index === 0 || Math.abs(point[0] - prev[0]) > 1e-9 || Math.abs(point[1] - prev[1]) > 1e-9) {
                sanitized.push(point);
            }
        });

        // 如果首尾相同，去掉最后一个
        if (sanitized.length > 1 &&
            Math.abs(sanitized[0][0] - sanitized[sanitized.length - 1][0]) <= 1e-9 &&
            Math.abs(sanitized[0][1] - sanitized[sanitized.length - 1][1]) <= 1e-9) {
            sanitized.pop();
        }
        if (sanitized.length < 2) return '[]';

        // 计算边界
        const bounds = sanitized.reduce((acc, [lng, lat]) => {
            acc.minLng = Math.min(acc.minLng, lng);
            acc.maxLng = Math.max(acc.maxLng, lng);
            acc.minLat = Math.min(acc.minLat, lat);
            acc.maxLat = Math.max(acc.maxLat, lat);
            return acc;
        }, { minLng: Infinity, maxLng: -Infinity, minLat: Infinity, maxLat: -Infinity });

        // Haversine 距离计算
        const getDistance = (start, end) => {
            const [lng1, lat1] = start;
            const [lng2, lat2] = end;
            const dLat = ((lat2 - lat1) * Math.PI) / 180;
            const dLng = ((lng2 - lng1) * Math.PI) / 180;
            const lat1Rad = (lat1 * Math.PI) / 180;
            const lat2Rad = (lat2 * Math.PI) / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLng / 2) ** 2;
            return 6378137 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        };

        // 构建线段
        const segments = [];
        for (let i = 0; i < sanitized.length; i++) {
            const from = sanitized[i];
            const to = sanitized[(i + 1) % sanitized.length];
            const length = getDistance(from, to);
            if (length >= 0.5) segments.push({ from, to, length });
        }
        if (segments.length === 0) return '[]';

        // 配速和时间
        const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
        const pace = clamp(
            Number(durationMinutes) > 0 ? durationMinutes / (targetDistance / 1000) : 7.6 + Math.random() * 1.2,
            this.MIN_PACE, this.MAX_PACE
        );
        const durationMs = Math.round((targetDistance / 1000) * pace * 60 * 1000);
        const baseSpeed = 1000 / (pace * 60); // m/s
        const baseSpacing = clamp(targetDistance / 1200, 4, 8);
        const maxTotalPoints = 4000;
        const jitter = 0.000001;
        const bboxPad = 0.00001;

        const addJitter = ([lng, lat]) => [
            clamp(lng + (Math.random() - 0.5) * 2 * jitter, bounds.minLng - bboxPad, bounds.maxLng + bboxPad),
            clamp(lat + (Math.random() - 0.5) * 2 * jitter, bounds.minLat - bboxPad, bounds.maxLat + bboxPad)
        ];

        // 起始点
        let segIndex = Math.floor(Math.random() * segments.length);
        let segOffset = Math.random() * Math.max(1, segments[segIndex].length * 0.6);
        let lastPoint = addJitter([
            segments[segIndex].from[0] + (segments[segIndex].to[0] - segments[segIndex].from[0]) * clamp(segOffset / segments[segIndex].length, 0, 1),
            segments[segIndex].from[1] + (segments[segIndex].to[1] - segments[segIndex].from[1]) * clamp(segOffset / segments[segIndex].length, 0, 1)
        ]);

        let elapsedMs = 0;
        let generatedDistance = 0;
        let currentSpeed = baseSpeed;
        const startTimestamp = Date.now() - durationMs - Math.round(Math.random() * 60000);
        const genAccuracy = () => (5 + Math.random() * 10).toFixed(1);
        const result = [`${lastPoint[0]}-${lastPoint[1]}-${startTimestamp}-${genAccuracy()}`];

        while (generatedDistance < targetDistance && result.length < maxTotalPoints) {
            const remainingDistance = targetDistance - generatedDistance;
            let advance = Math.min(remainingDistance, baseSpacing * (0.9 + Math.random() * 0.35));

            while (advance > 0) {
                const segment = segments[segIndex];
                const remainingOnSeg = segment.length - segOffset;
                const stepOnSegment = Math.min(advance, remainingOnSeg);
                segOffset += stepOnSegment;
                advance -= stepOnSegment;

                if (segOffset >= segment.length - 1e-6) {
                    segIndex = (segIndex + 1) % segments.length;
                    segOffset = 0;
                }
            }

            const segment = segments[segIndex];
            const point = addJitter([
                segment.from[0] + (segment.to[0] - segment.from[0]) * clamp(segOffset / segment.length, 0, 1),
                segment.from[1] + (segment.to[1] - segment.from[1]) * clamp(segOffset / segment.length, 0, 1)
            ]);
            const traveled = getDistance(lastPoint, point);
            generatedDistance += traveled;

            const remainingTime = Math.max(2000, durationMs - elapsedMs);
            const neededSpeed = remainingDistance > 0 ? remainingDistance / (remainingTime / 1000) : baseSpeed;
            const targetSpeed = clamp(
                (baseSpeed * 0.6 + neededSpeed * 0.4) * (0.95 + Math.random() * 0.1),
                baseSpeed * 0.8, baseSpeed * 1.2
            );
            currentSpeed = clamp(currentSpeed * 0.65 + targetSpeed * 0.35, baseSpeed * 0.75, baseSpeed * 1.25);
            elapsedMs += (traveled / Math.max(0.5, currentSpeed)) * 1000;

            const pointTimestamp = startTimestamp + Math.round(elapsedMs);
            result.push(`${point[0]}-${point[1]}-${pointTimestamp}-${genAccuracy()}`);
            lastPoint = point;
        }

        return JSON.stringify(result);
    }

    /**
     * 计算配速（分钟/公里）
     */
    calcPace(distanceMeters, durationMinutes) {
        if (!distanceMeters || !durationMinutes) return 0;
        return durationMinutes / (distanceMeters / 1000);
    }

    /**
     * 格式化配速显示
     */
    formatPace(distanceMeters, durationMinutes) {
        const pace = this.calcPace(distanceMeters, durationMinutes);
        if (pace <= 0) return "0'00''/km";
        const minutes = Math.floor(pace);
        const seconds = Math.round((pace - minutes) * 60);
        return `${minutes}'${String(seconds).padStart(2, '0')}''/km`;
    }

    /**
     * 验证配速是否在合理范围内
     */
    isPaceValid(distanceMeters, durationMinutes) {
        const pace = this.calcPace(distanceMeters, durationMinutes);
        return pace >= this.MIN_PACE && pace <= this.MAX_PACE;
    }

    /**
     * 生成随机距离（避免整十数）
     */
    randomDistance(min, max) {
        const lo = Math.max(1000, Math.trunc(min));
        const hi = Math.max(lo, Math.trunc(max));
        for (let i = 0; i < 64; i++) {
            const v = lo + Math.floor(Math.random() * (hi - lo + 1));
            if (v % 10 !== 0) return v;
        }
        return lo + 1;
    }

    /**
     * 根据距离计算建议时间（分钟）
     */
    suggestTime(distanceMeters) {
        const km = distanceMeters / 1000;
        const pace = this.MIN_PACE + Math.random() * (this.MAX_PACE - this.MIN_PACE);
        return Math.round(km * pace);
    }
}

window.trackGenV2 = new TrackGeneratorV2();
