import {
    BasicDepthPacking,
    Camera,
    Material,
    Scene,
    WebGLRenderTarget
} from "three";

import { Pass } from "./Pass.js";

/**
 * 增强版的Three.js Pass兼容层，更好地处理各种Pass类型和缓冲区传递
 * 
 * @implements {Initializable}
 * @implements {Resizable}
 * @implements {Disposable}
 */
export class EnhancedThreeCompatPass extends Pass {

    /**
     * 构造一个新的Three.js Pass兼容层
     *
     * @param {Object} threePass - Three.js原生的Pass实例
     * @param {String} [name="EnhancedThreeCompatPass"] - Pass的名称
     * @param {String} [passType="generic"] - Pass的类型，用于特殊处理（可选值："ssr", "bloom", "generic"）
     */
    constructor(threePass, name = "EnhancedThreeCompatPass", passType = "generic") {
        super(name);

        /**
         * 被包装的Three.js原生Pass
         *
         * @type {Object}
         * @private
         */
        this.threePass = threePass;

        /**
         * Pass类型，用于特殊处理
         * 
         * @type {String}
         * @private 
         */
        this.passType = passType;

        /**
         * 从原始Three.js Pass中继承一些关键属性
         */
        this.enabled = threePass.enabled;
        this.needsSwap = threePass.needsSwap;
        this.renderToScreen = false;

        /**
         * 调试标志
         */
        this.debug = false;
    }

    /**
     * 设置渲染到屏幕的标志
     *
     * @type {Boolean}
     */
    set renderToScreen(value) {
        super.renderToScreen = value;
        if (this.threePass) {
            this.threePass.renderToScreen = value;
        }
    }

    get renderToScreen() {
        return super.renderToScreen;
    }

    /**
     * 设置调试模式
     * 
     * @param {Boolean} enabled - 是否启用调试
     */
    setDebug(enabled) {
        this.debug = enabled;
    }

    /**
     * 设置尺寸
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        console.log('Log-- ', width, height, 'width, height');
        this.threePass.setSize(width, height);
    }

    /**
     * 初始化Pass
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Boolean} alpha - 渲染器是否使用alpha通道
     * @param {Number} frameBufferType - 主帧缓冲区的类型
     */
    initialize(renderer, alpha, frameBufferType) {
        // Three.js的原生Pass没有initialize方法，只需要确保renderer可用
        if (this.threePass) {
            // 一些Three.js Pass可能需要renderer，尝试注入
            if (typeof this.threePass.setRenderer === "function") {
                this.threePass.setRenderer(renderer);
            }
        }
    }

    /**
     * 设置深度纹理
     * 
     * @param {Texture} depthTexture - 深度纹理
     * @param {DepthPackingStrategies} [depthPacking=BasicDepthPacking] - 深度打包方式
     */
    setDepthTexture(depthTexture, depthPacking = BasicDepthPacking) {
        // 尝试传递深度纹理，如果原生Pass支持的话
        if (this.threePass && typeof this.threePass.setDepthTexture === "function") {
            this.threePass.setDepthTexture(depthTexture, depthPacking);
        } else if (this.passType === "ssr" && this.threePass) {
            // 特殊处理SSRPass - 如果没有setDepthTexture方法，但是是SSR类型
            if (!this.threePass.setDepthTexture) {
                console.warn("SSRPass没有setDepthTexture方法，将尝试直接设置深度纹理");
                if (this.threePass.ssrMaterial && this.threePass.ssrMaterial.uniforms["tDepth"]) {
                    this.threePass.ssrMaterial.uniforms["tDepth"].value = depthTexture;
                }
                if (this.threePass.depthRenderMaterial && this.threePass.depthRenderMaterial.uniforms["tDepth"]) {
                    this.threePass.depthRenderMaterial.uniforms["tDepth"].value = depthTexture;
                }
            }
        }
    }

    /**
     * 根据Pass类型处理输入/输出缓冲区
     * 
     * @private
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲区
     */
    setupBuffers(renderer, inputBuffer, outputBuffer) {
        // 根据Pass类型进行不同处理
        switch (this.passType) {
            case "ssr":
                // SSRPass特殊处理
                if (this.threePass.beautyRenderTarget) {
                    // 在保持原有深度纹理的同时，确保颜色缓冲区使用输入缓冲区
                    // 而不是完全替换beautyRenderTarget，这样可以保留深度信息
                    if (inputBuffer.depthTexture && this.threePass.setDepthTexture) {
                        // 如果输入缓冲区有深度纹理且Pass支持设置深度纹理
                        this.threePass.setDepthTexture(inputBuffer.depthTexture);
                    } else {
                        // 仅更新颜色纹理引用，保留原有深度纹理
                        const originalDepthTexture = this.threePass.beautyRenderTarget.depthTexture;
                        // 临时保存原始beautyRenderTarget以便后续恢复
                        const originalBeautyTarget = this.threePass.beautyRenderTarget;

                        // 使用输入缓冲区作为beautyRenderTarget
                        this.threePass.beautyRenderTarget = inputBuffer;

                        // 确保SSR材质使用正确的深度纹理
                        if (this.threePass.ssrMaterial) {
                            if (inputBuffer.depthTexture) {
                                this.threePass.ssrMaterial.uniforms['tDepth'].value = inputBuffer.depthTexture;
                            } else if (originalDepthTexture) {
                                // 如果输入缓冲区没有深度纹理，继续使用原始深度纹理
                                this.threePass.ssrMaterial.uniforms['tDepth'].value = originalDepthTexture;
                            }
                        }
                    }
                }
                break;

            case "bloom":
                // 处理SelectiveBloom效果（如果需要特殊处理）
                // 这里可以根据实际情况添加逻辑
                break;

            default:
                // 通用处理
                // 尝试找到常见的输入纹理字段
                if (this.threePass.uniforms && this.threePass.uniforms.tDiffuse) {
                    this.threePass.uniforms.tDiffuse.value = inputBuffer.texture;
                }
                break;
        }
    }

    /**
     * 渲染Pass
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 包含上一个Pass结果的帧缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 作为输出的渲染目标，除非此Pass直接渲染到屏幕
     * @param {Number} [deltaTime] - 上一帧与当前帧之间的时间差（秒）
     * @param {Boolean} [stencilTest] - 指示模板测试是否处于活动状态
     * @param {DepthPass} [depthPass] - 可选的共享深度Pass，用于优化多个效果
     */
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {
        // 如果Pass被禁用，直接将输入复制到输出
        if (!this.enabled) {
            renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
            renderer.copyFramebufferToTexture(0, outputBuffer.texture);
            return;
        }

        // 保存当前渲染器状态
        const currentRenderTarget = renderer.getRenderTarget();

        // 设置缓冲区
        this.setupBuffers(renderer, inputBuffer, outputBuffer);

        // 设置写入和读取缓冲区
        const writeBuffer = this.renderToScreen ? null : outputBuffer;
        const readBuffer = inputBuffer;
        const maskActive = stencilTest || false;

        // 配置原生Pass的渲染目标
        this.threePass.renderToScreen = this.renderToScreen;

        // if (this.debug) {
        //     console.log(`渲染 ${this.name} (${this.passType}):`, {
        //         inputBuffer,
        //         outputBuffer,
        //         renderToScreen: this.renderToScreen
        //     });
        // }

        // 调用Three.js Pass的render方法
        try {
            this.threePass.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
        } catch (error) {
            console.error(`渲染 ${this.name} 时出错:`, error);
        }

        // 恢复原始渲染器状态
        renderer.setRenderTarget(currentRenderTarget);
    }

    /**
     * 销毁Pass
     */
    dispose() {
        if (this.threePass && typeof this.threePass.dispose === "function") {
            this.threePass.dispose();
        }

        super.dispose();
    }
} 