/** @ignore */
import { PerspectiveCamera } from "three";
export { version } from "../package.json";
export * from "./core";
export * from "./loaders";
export * from "./effects";
export * from "./passes";
export * from "./materials";
export * from "./textures";
export * from "./utils";
export * from "./enums";

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

