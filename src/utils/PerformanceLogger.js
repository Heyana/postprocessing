/**
 * 性能日志工具类
 * 提供全局控制的性能测量和日志功能
 */

const theEnabled = true;
export class PerformanceLogger {

    /**
     * 单例实例
     * @type {PerformanceLogger}
     * @private
     */
    static instance = null;

    /**
     * 获取单例实例
     * @return {PerformanceLogger} 日志实例
     */
    static getInstance() {
        if (PerformanceLogger.instance === null) {
            PerformanceLogger.instance = new PerformanceLogger();
        }
        return PerformanceLogger.instance;
    }

    /**
     * 创建一个新的性能日志实例
     * @param {Boolean} enabled - 是否启用日志
     */
    constructor(enabled = theEnabled) {
        /**
         * 是否启用日志
         * @type {Boolean}
         * @private
         */
        this.enabled = enabled;

        /**
         * 计时器标记
         * @type {Map<String, Number>}
         * @private
         */
        this.timers = new Map();

        /**
         * 是否记录时间数据
         * @type {Boolean}
         * @private
         */
        this.collectTimes = false;

        /**
         * 记录的时间数据
         * @type {Map<String, Array<Number>>}
         * @private
         */
        this.timeData = new Map();
    }

    /**
     * 启用日志
     */
    enable() {
        this.enabled = true;
    }

    /**
     * 禁用日志
     */
    disable() {
        this.enabled = false;
    }

    /**
     * 启用时间数据收集，用于性能分析
     */
    enableTimeCollection() {
        this.collectTimes = true;
    }

    /**
     * 禁用时间数据收集
     */
    disableTimeCollection() {
        this.collectTimes = false;
    }

    /**
     * 获取收集的时间数据
     * @return {Object} 时间数据
     */
    getTimeData() {
        const result = {};
        for (const [key, times] of this.timeData.entries()) {
            if (times.length > 0) {
                const sum = times.reduce((a, b) => a + b, 0);
                result[key] = {
                    count: times.length,
                    total: sum,
                    average: sum / times.length,
                    min: Math.min(...times),
                    max: Math.max(...times)
                };
            }
        }
        return result;
    }

    /**
     * 清除收集的时间数据
     */
    clearTimeData() {
        this.timeData.clear();
    }

    /**
     * 开始计时
     * @param {String} label - 计时标签
     */
    time(label) {
        if (!this.enabled) return;

        console.time(label);
        this.timers.set(label, performance.now());
    }

    /**
     * 结束计时并打印结果
     * @param {String} label - 计时标签
     */
    timeEnd(label) {
        if (!this.enabled) return;

        console.timeEnd(label);

        // 记录时间数据
        if (this.collectTimes && this.timers.has(label)) {
            const startTime = this.timers.get(label);
            const endTime = performance.now();
            const duration = endTime - startTime;

            if (!this.timeData.has(label)) {
                this.timeData.set(label, []);
            }

            this.timeData.get(label).push(duration);
            this.timers.delete(label);
        }
    }

    /**
     * 打印日志
     * @param {...any} args - 日志参数
     */
    log(...args) {
        if (!this.enabled) return;
        console.log(...args);
    }

    /**
     * 打印警告
     * @param {...any} args - 警告参数
     */
    warn(...args) {
        if (!this.enabled) return;
        console.warn(...args);
    }

    /**
     * 打印错误
     * @param {...any} args - 错误参数
     */
    error(...args) {
        // 错误始终打印，不受启用状态影响
        console.error(...args);
    }

    /**
     * 打印性能摘要
     */
    printSummary() {
        if (!this.enabled || !this.collectTimes) return;

        console.group('性能日志摘要');
        const data = this.getTimeData();

        for (const [key, stats] of Object.entries(data)) {
            console.log(
                `${key}: ${stats.count}次调用, 平均: ${stats.average.toFixed(2)}ms, ` +
                `总计: ${stats.total.toFixed(2)}ms, 最小: ${stats.min.toFixed(2)}ms, ` +
                `最大: ${stats.max.toFixed(2)}ms`
            );
        }

        console.groupEnd();
    }
}

// 创建全局实例并导出
const logger = PerformanceLogger.getInstance();

// 导出便捷函数
export const enableLogs = () => logger.enable();
export const disableLogs = () => logger.disable();
export const enableTimeCollection = () => logger.enableTimeCollection();
export const disableTimeCollection = () => logger.disableTimeCollection();
export const getTimeData = () => logger.getTimeData();
export const clearTimeData = () => logger.clearTimeData();
export const printSummary = () => logger.printSummary();

// 导出日志方法
export const timeLog = (label) => logger.time(label);
export const timeEndLog = (label) => logger.timeEnd(label);
export const log = (...args) => logger.log(...args);
export const warn = (...args) => logger.warn(...args);
export const error = (...args) => logger.error(...args);

// 默认导出
export default logger; 