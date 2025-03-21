import {
    enableLogs,
    disableLogs,
    enableTimeCollection,
    getTimeData,
    printSummary,
    clearTimeData
} from "../../../src/utils/PerformanceLogger.js";

/**
 * 性能日志系统示例
 * 
 * 这个示例展示了如何使用性能日志系统来开启/关闭日志输出
 * 以及如何收集和分析性能数据
 */

// 默认情况下日志是关闭的，需要手动开启
enableLogs();

// 如果需要收集时间数据以便进行分析，可以启用时间收集
enableTimeCollection();

// 在任何地方，如果需要关闭所有日志输出（例如在生产环境）
// disableLogs();

// 在渲染循环的最后，可以打印性能摘要
function printPerformanceSummary() {
    printSummary();

    // 或者获取原始数据进行自定义分析
    const data = getTimeData();
    console.log("原始性能数据:", data);

    // 分析完成后可以清除数据，开始新的收集周期
    clearTimeData();
}

/**
 * 使用说明:
 * 
 * 1. 在应用初始化时:
 *    import { enableLogs } from "postprocessing";
 *    enableLogs();  // 开启日志
 * 
 * 2. 在需要关闭日志时:
 *    import { disableLogs } from "postprocessing";
 *    disableLogs();  // 关闭所有日志输出
 * 
 * 3. 收集性能数据进行分析:
 *    import { enableTimeCollection, printSummary } from "postprocessing";
 *    enableTimeCollection();  // 开始收集数据
 *    
 *    // 在一段时间后或渲染几帧后
 *    printSummary();  // 打印性能统计
 * 
 * 4. 为了避免内存持续增长，可以定期清除收集的数据:
 *    import { clearTimeData } from "postprocessing";
 *    clearTimeData();  // 清除已收集的数据
 */

// 示例导出，在实际使用中可能不需要
export {
    enableLogs,
    disableLogs,
    printPerformanceSummary
}; 