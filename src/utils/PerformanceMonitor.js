/**
 * 高级性能监控工具
 * 专为后处理管线性能分析设计
 */
export class PerformanceMonitor {

    /**
     * 创建性能监控器
     * @param {Object} options - 配置选项
     */
    constructor(options = {}) {

        // 基础配置
        this.enabled = options.enabled !== false;
        this.maxSamples = options.maxSamples || 60;
        this.updateInterval = options.updateInterval || 1000; // ms

        // 性能数据
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        this.deltaTime = 0;

        // 历史数据
        this.fpsHistory = [];
        this.renderTimeHistory = [];
        this.memoryHistory = [];

        // 渲染时间统计
        this.renderTimes = {
            frame: [], // 整帧渲染时间
            ssr: [],   // SSR Pass时间
            blur: [],  // 模糊Pass时间
            composite: [] // 合成时间
        };

        // 内存使用统计
        this.memoryUsage = {
            used: 0,
            total: 0,
            limit: 0
        };

        // GPU统计（如果支持）
        this.gpuStats = {
            drawCalls: 0,
            triangles: 0,
            geometries: 0,
            textures: 0
        };

        // 性能阈值
        this.thresholds = {
            fps: {
                good: options.fpsGood || 55,
                warning: options.fpsWarning || 45,
                critical: options.fpsCritical || 30
            },
            renderTime: {
                good: options.renderGood || 8,      // ms
                warning: options.renderWarning || 12,
                critical: options.renderCritical || 20
            },
            memory: {
                warning: options.memoryWarning || 100,  // MB
                critical: options.memoryCritical || 200
            }
        };

        // 警报系统
        this.alerts = [];
        this.alertCallbacks = [];

        // 自动报告
        this.autoReportInterval = null;
        if (options.autoReport) {
            this.startAutoReport(options.reportInterval || 5000);
        }

        console.log('PerformanceMonitor: 初始化完成');
    }

    /**
     * 更新帧统计
     * @param {Number} deltaTime - 帧时间差（可选）
     */
    update(deltaTime = null) {
        if (!this.enabled) return;

        const currentTime = performance.now();

        if (deltaTime === null) {
            deltaTime = currentTime - this.lastTime;
        }

        this.deltaTime = deltaTime;
        this.frameCount++;

        // 每秒更新一次FPS
        if (currentTime - this.lastTime >= this.updateInterval) {
            this.fps = (this.frameCount * 1000) / (currentTime - this.lastTime);
            this.frameCount = 0;
            this.lastTime = currentTime;

            // 更新历史数据
            this._updateHistory();

            // 检查性能警报
            this._checkAlerts();
        }
    }

    /**
     * 记录渲染时间
     * @param {String} type - 渲染类型 ('frame', 'ssr', 'blur', 'composite')
     * @param {Number} time - 渲染时间（毫秒）
     */
    recordRenderTime(type, time) {
        if (!this.enabled || !this.renderTimes[type]) return;

        this.renderTimes[type].push(time);

        // 保持数组大小
        if (this.renderTimes[type].length > this.maxSamples) {
            this.renderTimes[type].shift();
        }
    }

    /**
     * 开始计时
     * @param {String} label - 计时标签
     * @returns {Function} 结束计时的函数
     */
    startTimer(label) {
        if (!this.enabled) return () => { };

        const startTime = performance.now();

        return () => {
            const endTime = performance.now();
            const duration = endTime - startTime;
            this.recordRenderTime(label, duration);
            return duration;
        };
    }

    /**
     * 记录GPU统计
     * @param {Object} stats - GPU统计数据
     */
    recordGPUStats(stats) {
        if (!this.enabled) return;

        Object.assign(this.gpuStats, stats);
    }

    /**
     * 更新内存使用统计
     */
    updateMemoryUsage() {
        if (!this.enabled || !performance.memory) return;

        this.memoryUsage = {
            used: performance.memory.usedJSHeapSize / (1024 * 1024), // MB
            total: performance.memory.totalJSHeapSize / (1024 * 1024),
            limit: performance.memory.jsHeapSizeLimit / (1024 * 1024)
        };
    }

    /**
     * 更新历史数据
     * @private
     */
    _updateHistory() {
        // 更新FPS历史
        this.fpsHistory.push(this.fps);
        if (this.fpsHistory.length > this.maxSamples) {
            this.fpsHistory.shift();
        }

        // 更新渲染时间历史
        const avgRenderTime = this.getAverageRenderTime('frame');
        this.renderTimeHistory.push(avgRenderTime);
        if (this.renderTimeHistory.length > this.maxSamples) {
            this.renderTimeHistory.shift();
        }

        // 更新内存历史
        this.updateMemoryUsage();
        if (this.memoryUsage.used > 0) {
            this.memoryHistory.push(this.memoryUsage.used);
            if (this.memoryHistory.length > this.maxSamples) {
                this.memoryHistory.shift();
            }
        }
    }

    /**
     * 检查性能警报
     * @private
     */
    _checkAlerts() {
        const alerts = [];

        // FPS警报
        if (this.fps < this.thresholds.fps.critical) {
            alerts.push({
                type: 'fps',
                level: 'critical',
                message: `FPS严重不足: ${this.fps.toFixed(1)}`,
                value: this.fps,
                threshold: this.thresholds.fps.critical
            });
        } else if (this.fps < this.thresholds.fps.warning) {
            alerts.push({
                type: 'fps',
                level: 'warning',
                message: `FPS偏低: ${this.fps.toFixed(1)}`,
                value: this.fps,
                threshold: this.thresholds.fps.warning
            });
        }

        // 渲染时间警报
        const avgRenderTime = this.getAverageRenderTime('frame');
        if (avgRenderTime > this.thresholds.renderTime.critical) {
            alerts.push({
                type: 'renderTime',
                level: 'critical',
                message: `渲染时间过长: ${avgRenderTime.toFixed(2)}ms`,
                value: avgRenderTime,
                threshold: this.thresholds.renderTime.critical
            });
        } else if (avgRenderTime > this.thresholds.renderTime.warning) {
            alerts.push({
                type: 'renderTime',
                level: 'warning',
                message: `渲染时间偏高: ${avgRenderTime.toFixed(2)}ms`,
                value: avgRenderTime,
                threshold: this.thresholds.renderTime.warning
            });
        }

        // 内存警报
        if (this.memoryUsage.used > this.thresholds.memory.critical) {
            alerts.push({
                type: 'memory',
                level: 'critical',
                message: `内存使用过高: ${this.memoryUsage.used.toFixed(1)}MB`,
                value: this.memoryUsage.used,
                threshold: this.thresholds.memory.critical
            });
        } else if (this.memoryUsage.used > this.thresholds.memory.warning) {
            alerts.push({
                type: 'memory',
                level: 'warning',
                message: `内存使用偏高: ${this.memoryUsage.used.toFixed(1)}MB`,
                value: this.memoryUsage.used,
                threshold: this.thresholds.memory.warning
            });
        }

        // 触发警报回调
        if (alerts.length > 0) {
            this.alerts = alerts;
            this.alertCallbacks.forEach(callback => {
                try {
                    callback(alerts);
                } catch (error) {
                    console.error('PerformanceMonitor: 警报回调执行失败', error);
                }
            });
        } else {
            this.alerts = [];
        }
    }

    /**
     * 获取平均渲染时间
     * @param {String} type - 渲染类型
     * @returns {Number} 平均时间（毫秒）
     */
    getAverageRenderTime(type = 'frame') {
        const times = this.renderTimes[type];
        if (!times || times.length === 0) return 0;
        return times.reduce((sum, time) => sum + time, 0) / times.length;
    }

    /**
     * 获取最大渲染时间
     * @param {String} type - 渲染类型
     * @returns {Number} 最大时间（毫秒）
     */
    getMaxRenderTime(type = 'frame') {
        const times = this.renderTimes[type];
        if (!times || times.length === 0) return 0;
        return Math.max(...times);
    }

    /**
     * 获取最小渲染时间
     * @param {String} type - 渲染类型
     * @returns {Number} 最小时间（毫秒）
     */
    getMinRenderTime(type = 'frame') {
        const times = this.renderTimes[type];
        if (!times || times.length === 0) return 0;
        return Math.min(...times);
    }

    /**
     * 获取性能等级
     * @returns {String} 'good', 'warning', 'critical'
     */
    getPerformanceLevel() {
        if (this.alerts.some(alert => alert.level === 'critical')) {
            return 'critical';
        }
        if (this.alerts.some(alert => alert.level === 'warning')) {
            return 'warning';
        }
        return 'good';
    }

    /**
     * 获取完整统计数据
     * @returns {Object} 统计数据
     */
    getStats() {
        return {
            // 基础性能指标
            fps: this.fps,
            deltaTime: this.deltaTime,
            performanceLevel: this.getPerformanceLevel(),

            // 渲染时间统计
            renderTime: {
                frame: {
                    avg: this.getAverageRenderTime('frame'),
                    max: this.getMaxRenderTime('frame'),
                    min: this.getMinRenderTime('frame'),
                    current: this.renderTimes.frame[this.renderTimes.frame.length - 1] || 0
                },
                ssr: {
                    avg: this.getAverageRenderTime('ssr'),
                    max: this.getMaxRenderTime('ssr'),
                    min: this.getMinRenderTime('ssr'),
                    current: this.renderTimes.ssr[this.renderTimes.ssr.length - 1] || 0
                },
                blur: {
                    avg: this.getAverageRenderTime('blur'),
                    max: this.getMaxRenderTime('blur'),
                    min: this.getMinRenderTime('blur'),
                    current: this.renderTimes.blur[this.renderTimes.blur.length - 1] || 0
                },
                composite: {
                    avg: this.getAverageRenderTime('composite'),
                    max: this.getMaxRenderTime('composite'),
                    min: this.getMinRenderTime('composite'),
                    current: this.renderTimes.composite[this.renderTimes.composite.length - 1] || 0
                }
            },

            // 内存统计
            memory: {
                ...this.memoryUsage,
                efficiency: this.memoryUsage.total > 0 ?
                    (this.memoryUsage.used / this.memoryUsage.total) : 0
            },

            // GPU统计
            gpu: { ...this.gpuStats },

            // 历史数据
            history: {
                fps: [...this.fpsHistory],
                renderTime: [...this.renderTimeHistory],
                memory: [...this.memoryHistory]
            },

            // 警报信息
            alerts: [...this.alerts],

            // 阈值设置
            thresholds: { ...this.thresholds }
        };
    }

    /**
     * 添加警报回调
     * @param {Function} callback - 警报回调函数
     */
    addAlertCallback(callback) {
        if (typeof callback === 'function') {
            this.alertCallbacks.push(callback);
        }
    }

    /**
     * 移除警报回调
     * @param {Function} callback - 要移除的回调函数
     */
    removeAlertCallback(callback) {
        const index = this.alertCallbacks.indexOf(callback);
        if (index !== -1) {
            this.alertCallbacks.splice(index, 1);
        }
    }

    /**
     * 开始自动报告
     * @param {Number} interval - 报告间隔（毫秒）
     */
    startAutoReport(interval = 5000) {
        this.stopAutoReport();

        this.autoReportInterval = setInterval(() => {
            this.printReport();
        }, interval);

        console.log(`PerformanceMonitor: 开始自动报告，间隔 ${interval}ms`);
    }

    /**
     * 停止自动报告
     */
    stopAutoReport() {
        if (this.autoReportInterval) {
            clearInterval(this.autoReportInterval);
            this.autoReportInterval = null;
        }
    }

    /**
     * 打印性能报告
     */
    printReport() {
        if (!this.enabled) return;

        const stats = this.getStats();

        console.group('🔍 性能监控报告');

        console.log(`📊 基础指标:`);
        console.log(`  FPS: ${stats.fps.toFixed(1)} (${stats.performanceLevel})`);
        console.log(`  帧时间: ${stats.deltaTime.toFixed(2)}ms`);

        console.log(`⏱️ 渲染时间:`);
        console.log(`  整帧: ${stats.renderTime.frame.avg.toFixed(2)}ms (平均)`);
        console.log(`  SSR: ${stats.renderTime.ssr.avg.toFixed(2)}ms (平均)`);
        console.log(`  模糊: ${stats.renderTime.blur.avg.toFixed(2)}ms (平均)`);
        console.log(`  合成: ${stats.renderTime.composite.avg.toFixed(2)}ms (平均)`);

        console.log(`💾 内存使用:`);
        console.log(`  已用: ${stats.memory.used.toFixed(1)}MB`);
        console.log(`  总计: ${stats.memory.total.toFixed(1)}MB`);
        console.log(`  效率: ${(stats.memory.efficiency * 100).toFixed(1)}%`);

        if (stats.alerts.length > 0) {
            console.warn(`⚠️ 性能警报:`);
            stats.alerts.forEach(alert => {
                console.warn(`  ${alert.message}`);
            });
        }

        console.groupEnd();
    }

    /**
     * 重置统计数据
     */
    reset() {
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.fps = 0;
        this.deltaTime = 0;

        // 清空历史数据
        this.fpsHistory = [];
        this.renderTimeHistory = [];
        this.memoryHistory = [];

        // 清空渲染时间统计
        Object.keys(this.renderTimes).forEach(key => {
            this.renderTimes[key] = [];
        });

        // 清空警报
        this.alerts = [];

        console.log('PerformanceMonitor: 统计数据已重置');
    }

    /**
     * 启用性能监控
     */
    enable() {
        this.enabled = true;
        console.log('PerformanceMonitor: 已启用');
    }

    /**
     * 禁用性能监控
     */
    disable() {
        this.enabled = false;
        this.stopAutoReport();
        console.log('PerformanceMonitor: 已禁用');
    }

    /**
     * 销毁监控器
     */
    dispose() {
        this.stopAutoReport();
        this.alertCallbacks = [];
        this.reset();
        this.enabled = false;

        console.log('PerformanceMonitor: 已销毁');
    }

    /**
     * 创建性能图表数据
     * @param {String} type - 数据类型 ('fps', 'renderTime', 'memory')
     * @returns {Object} 图表数据
     */
    getChartData(type) {
        const labels = Array.from({ length: this.maxSamples }, (_, i) => i + 1);

        switch (type) {
            case 'fps':
                return {
                    labels,
                    datasets: [{
                        label: 'FPS',
                        data: this.fpsHistory,
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.1
                    }]
                };

            case 'renderTime':
                return {
                    labels,
                    datasets: [
                        {
                            label: '整帧',
                            data: this.renderTimeHistory,
                            borderColor: 'rgb(255, 99, 132)',
                            backgroundColor: 'rgba(255, 99, 132, 0.2)',
                            tension: 0.1
                        },
                        {
                            label: 'SSR',
                            data: this.renderTimes.ssr.slice(-this.maxSamples),
                            borderColor: 'rgb(54, 162, 235)',
                            backgroundColor: 'rgba(54, 162, 235, 0.2)',
                            tension: 0.1
                        }
                    ]
                };

            case 'memory':
                return {
                    labels,
                    datasets: [{
                        label: '内存使用 (MB)',
                        data: this.memoryHistory,
                        borderColor: 'rgb(153, 102, 255)',
                        backgroundColor: 'rgba(153, 102, 255, 0.2)',
                        tension: 0.1
                    }]
                };

            default:
                return null;
        }
    }
}
