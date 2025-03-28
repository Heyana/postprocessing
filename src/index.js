/** @ignore */
export { version } from "../package.json";
export * from "./core";
export * from "./loaders";
export * from "./effects";
export * from "./passes";
export * from "./materials";
export * from "./textures";
export * from "./utils";
export * from "./enums";

export * from './libs'
// 特别导出性能日志工具，方便使用
export {
    enableLogs,
    disableLogs,
    enableTimeCollection,
    disableTimeCollection,
    getTimeData,
    clearTimeData,
    printSummary
} from "./utils/PerformanceLogger.js";


export {
    ThreeCompatPass
} from "./passes/ThreeCompatPass.js";

// 在效果导出部分添加SSREffect
export * from "./effects/SSREffect.js";

// 查找导出部分，添加以下两行：
export { SharpenEffect } from "./effects/SharpenEffect.js";
export { AdaptiveSharpenEffect } from "./effects/AdaptiveSharpenEffect.js";
export { DenoiseEffect } from "./effects/DenoiseEffect.js";
