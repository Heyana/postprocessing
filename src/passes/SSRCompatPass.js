import { Pass } from "./Pass.js";
import { Color } from "three";

/**
 * SSR专用兼容层Pass
 * 针对SelectiveSSRPass和OptimizedSelectiveSSRPass进行了专门优化
 * 
 * 优化要点：
 * 1. 减少通用包装开销
 * 2. 预分配渲染目标，避免频繁创建/销毁
 * 3. 智能缓冲区复用
 * 4. 批量状态管理
 */
export class SSRCompatPass extends Pass {

    /**
     * 构造SSR专用兼容Pass
     * 
     * @param {OptimizedSelectiveSSRPass|SelectiveSSRPass} ssrPass - SSR Pass实例
     * @param {String} [name="SSRCompatPass"] - Pass名称
     */
    constructor(ssrPass, name = "SSRCompatPass") {
        super(name);

        /**
         * 被包装的SSR Pass
         * @type {OptimizedSelectiveSSRPass|SelectiveSSRPass}
         */
        this.ssrPass = ssrPass;

        /**
         * 标识这是一个SSR兼容Pass
         * @type {Boolean}
         */
        this.isSSRCompatPass = true;

        // 从SSR Pass继承关键属性
        this.enabled = true;
        this.needsSwap = false; // SSR Pass通常不需要swap
        this.renderToScreen = false;

        // 性能监控
        this.performanceStats = {
            renderTime: 0,
            frameCount: 0,
            avgRenderTime: 0
        };

        // 状态缓存
        this.stateCache = {
            lastInputBuffer: null,
            lastOutputBuffer: null,
            lastCameraMatrix: null,
            lastProjectionMatrix: null
        };

        // 预分配向量用于矩阵比较（避免GC）
        this.tempMatrix1 = null;
        this.tempMatrix2 = null;

        console.log(`SSRCompatPass: 创建SSR专用兼容层 - ${name}`);
    }

    /**
     * 设置渲染到屏幕的标志
     * @type {Boolean}
     */
    set renderToScreen(value) {
        super.renderToScreen = value;
        if (this.ssrPass) {
            this.ssrPass.renderToScreen = value;
        }
    }

    get renderToScreen() {
        return super.renderToScreen;
    }

    /**
     * 检查相机矩阵是否发生变化（用于优化）
     * @param {Camera} camera - 相机对象
     * @returns {Boolean} 是否发生变化
     * @private
     */
    _checkCameraMatrixChanged(camera) {
        if (!this.tempMatrix1) {
            this.tempMatrix1 = camera.matrixWorld.clone();
            this.tempMatrix2 = camera.projectionMatrix.clone();
            return true;
        }

        const worldChanged = !this.tempMatrix1.equals(camera.matrixWorld);
        const projectionChanged = !this.tempMatrix2.equals(camera.projectionMatrix);

        if (worldChanged) {
            this.tempMatrix1.copy(camera.matrixWorld);
        }
        if (projectionChanged) {
            this.tempMatrix2.copy(camera.projectionMatrix);
        }

        return worldChanged || projectionChanged;
    }

    /**
     * 批量保存渲染器状态
     * @param {WebGLRenderer} renderer - 渲染器
     * @returns {Object} 保存的状态
     * @private
     */
    _batchSaveState(renderer) {
        const tempColor = new Color();
        return {
            renderTarget: renderer.getRenderTarget(),
            autoClear: renderer.autoClear,
            shadowMapAutoUpdate: renderer.shadowMap.autoUpdate,
            clearColor: renderer.getClearColor(tempColor).clone(),
            clearAlpha: renderer.getClearAlpha()
        };
    }

    /**
     * 批量恢复渲染器状态
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Object} state - 要恢复的状态
     * @private
     */
    _batchRestoreState(renderer, state) {
        renderer.setRenderTarget(state.renderTarget);
        renderer.autoClear = state.autoClear;
        renderer.shadowMap.autoUpdate = state.shadowMapAutoUpdate;
        renderer.setClearColor(state.clearColor);
        renderer.setClearAlpha(state.clearAlpha);
    }

    /**
     * 智能缓冲区设置（避免不必要的状态切换）
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲区
     * @private
     */
    _smartBufferSetup(renderer, inputBuffer, outputBuffer) {
        // 检查是否需要更新缓冲区引用
        const inputChanged = this.stateCache.lastInputBuffer !== inputBuffer;
        const outputChanged = this.stateCache.lastOutputBuffer !== outputBuffer;

        if (inputChanged || outputChanged) {
            // 只有在缓冲区真正改变时才更新SSR Pass的引用
            if (this.ssrPass.setupBuffers && typeof this.ssrPass.setupBuffers === 'function') {
                this.ssrPass.setupBuffers(renderer, inputBuffer, outputBuffer);
            }

            // 更新缓存
            this.stateCache.lastInputBuffer = inputBuffer;
            this.stateCache.lastOutputBuffer = outputBuffer;

            console.log(`SSRCompatPass: 智能缓冲区设置完成`);
        }
    }

    /**
     * 设置尺寸（传递给SSR Pass）
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        if (this.ssrPass && typeof this.ssrPass.setSize === 'function') {
            this.ssrPass.setSize(width, height);
            console.log(`SSRCompatPass: 设置尺寸 ${width}x${height}`);
        }
    }

    /**
     * 初始化Pass（传递给SSR Pass）
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Boolean} alpha - 渲染器是否使用alpha通道
     * @param {Number} frameBufferType - 主帧缓冲区的类型
     */
    initialize(renderer, alpha, frameBufferType) {
        if (this.ssrPass && typeof this.ssrPass.initialize === 'function') {
            this.ssrPass.initialize(renderer, alpha, frameBufferType);
        }
        console.log(`SSRCompatPass: 初始化完成`);
    }

    /**
     * 设置深度纹理（传递给SSR Pass）
     * @param {Texture} depthTexture - 深度纹理
     * @param {Number} depthPacking - 深度打包方式
     */
    setDepthTexture(depthTexture, depthPacking) {
        if (this.ssrPass && typeof this.ssrPass.setDepthTexture === 'function') {
            this.ssrPass.setDepthTexture(depthTexture, depthPacking);
        }
    }

    /**
     * 渲染Pass
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲区
     * @param {Number} deltaTime - 帧时间差
     * @param {Boolean} stencilTest - 是否启用模板测试
     * @param {DepthPass} depthPass - 深度Pass
     * @param {Object} effectPassOpts - 效果Pass选项
     */
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass, effectPassOpts) {

        // 性能监控开始
        const startTime = performance.now();

        // 如果Pass被禁用，快速返回
        if (!this.enabled) {
            return;
        }

        // 批量保存状态
        const savedState = this._batchSaveState(renderer);

        try {
            // 智能缓冲区设置
            this._smartBufferSetup(renderer, inputBuffer, outputBuffer);

            // 检查相机变化
            const cameraChanged = this._checkCameraMatrixChanged(this.ssrPass.camera);
            if (cameraChanged && this.ssrPass.markSceneChanged) {
                this.ssrPass.markSceneChanged();
            }

            // 设置写入和读取缓冲区
            const writeBuffer = this.renderToScreen ? null : outputBuffer;
            const readBuffer = inputBuffer;

            // 配置SSR Pass的渲染目标
            this.ssrPass.renderToScreen = this.renderToScreen;

            // 调用SSR Pass的render方法
            this.ssrPass.render(
                renderer,
                writeBuffer,
                readBuffer,
                deltaTime,
                stencilTest || false,
                depthPass,
                effectPassOpts
            );

        } catch (error) {
            console.error(`SSRCompatPass 渲染错误:`, error);
        } finally {
            // 批量恢复状态
            this._batchRestoreState(renderer, savedState);
        }

        // 性能监控结束
        const renderTime = performance.now() - startTime;
        this._updatePerformanceStats(renderTime);
    }

    /**
     * 更新性能统计
     * @param {Number} renderTime - 本帧渲染时间
     * @private
     */
    _updatePerformanceStats(renderTime) {
        this.performanceStats.renderTime = renderTime;
        this.performanceStats.frameCount++;

        // 计算移动平均值
        const alpha = 0.1; // 平滑因子
        this.performanceStats.avgRenderTime =
            this.performanceStats.avgRenderTime * (1 - alpha) + renderTime * alpha;

        // 每100帧输出一次性能统计
        if (this.performanceStats.frameCount % 100 === 0) {
            console.log(`SSRCompatPass 性能统计: 平均渲染时间 ${this.performanceStats.avgRenderTime.toFixed(2)}ms`);
        }
    }

    /**
     * 获取性能统计信息
     * @returns {Object} 性能统计数据
     */
    getPerformanceStats() {
        const ssrStats = this.ssrPass.getPerformanceStats ?
            this.ssrPass.getPerformanceStats() : {};

        return {
            compatPassStats: {
                avgRenderTime: this.performanceStats.avgRenderTime,
                frameCount: this.performanceStats.frameCount,
                lastRenderTime: this.performanceStats.renderTime
            },
            ssrPassStats: ssrStats
        };
    }

    /**
     * 设置SSR Pass的分辨率缩放（如果支持）
     * @param {Number} scale - 分辨率缩放比例
     */
    setSSRResolutionScale(scale) {
        if (this.ssrPass && 'ssrResolutionScale' in this.ssrPass) {
            this.ssrPass.ssrResolutionScale = scale;
            console.log(`SSRCompatPass: 设置SSR分辨率缩放为 ${scale}`);
        } else {
            console.warn(`SSRCompatPass: SSR Pass不支持分辨率缩放`);
        }
    }

    /**
     * 启用/禁用自适应分辨率（如果支持）
     * @param {Boolean} enabled - 是否启用
     * @param {Number} targetFPS - 目标帧率
     */
    setAdaptiveResolution(enabled, targetFPS = 60) {
        if (this.ssrPass && 'adaptiveResolution' in this.ssrPass) {
            this.ssrPass.adaptiveResolution = enabled;
            if ('targetFPS' in this.ssrPass) {
                this.ssrPass.targetFPS = targetFPS;
            }
            console.log(`SSRCompatPass: ${enabled ? '启用' : '禁用'}自适应分辨率，目标帧率 ${targetFPS}`);
        } else {
            console.warn(`SSRCompatPass: SSR Pass不支持自适应分辨率`);
        }
    }

    /**
     * 强制刷新SSR（如果支持）
     */
    forceRefresh() {
        if (this.ssrPass) {
            if (typeof this.ssrPass.forceRefreshNormals === 'function') {
                this.ssrPass.forceRefreshNormals();
            }
            if (typeof this.ssrPass.markSceneChanged === 'function') {
                this.ssrPass.markSceneChanged();
            }
            console.log(`SSRCompatPass: 强制刷新SSR`);
        }
    }

    /**
     * 获取SSR Pass的选择管理接口
     * @returns {Object} 选择管理接口
     */
    getSelectionAPI() {
        if (!this.ssrPass) return null;

        return {
            addToSelection: (obj) => this.ssrPass.addToSelection?.(obj),
            removeFromSelection: (obj) => this.ssrPass.removeFromSelection?.(obj),
            clearSelection: () => this.ssrPass.clearSelection?.(),
            toggleSelection: (obj) => this.ssrPass.toggleSelection?.(obj),
            getSelectionItems: () => this.ssrPass.getSelectionItems?.() || [],
            setMetalnessThreshold: (threshold) => this.ssrPass.setMetalnessThreshold?.(threshold)
        };
    }

    /**
     * 设置输出模式（如果支持）
     * @param {Number} mode - 输出模式
     */
    setOutputMode(mode) {
        if (this.ssrPass && typeof this.ssrPass.setOutputMode === 'function') {
            this.ssrPass.setOutputMode(mode);
        } else if (this.ssrPass && 'output' in this.ssrPass) {
            this.ssrPass.output = mode;
        }
    }

    /**
     * 获取可用的输出模式
     * @returns {Object} 输出模式枚举
     */
    getOutputModes() {
        if (this.ssrPass && this.ssrPass.constructor.OUTPUT) {
            return this.ssrPass.constructor.OUTPUT;
        }
        return null;
    }

    /**
     * 销毁Pass
     */
    dispose() {
        if (this.ssrPass && typeof this.ssrPass.dispose === 'function') {
            this.ssrPass.dispose();
        }

        // 清理缓存
        this.stateCache = {};
        this.performanceStats = {};

        if (this.tempMatrix1) {
            this.tempMatrix1 = null;
        }
        if (this.tempMatrix2) {
            this.tempMatrix2 = null;
        }

        console.log(`SSRCompatPass: 销毁完成`);
        super.dispose();
    }
}
