import { WebGLRenderTarget, Vector2, RGBADepthPacking, ShaderMaterial, Uniform, Mesh, BoxGeometry, MeshBasicMaterial } from "three";
import { Pass } from "./Pass.js";
import { ClearPass } from "./ClearPass.js";
import { MRTMaterial } from "../materials/MRTMaterial.js";
import { ShaderPass } from "./ShaderPass.js";
import { Resolution } from "../core/Resolution.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";
import { Color } from "three";

/**
 * 一个在WebGL2环境下使用MRT技术同时渲染颜色和深度的通道。
 * 此通道可以替代RenderPass和DepthPass，减少场景渲染次数。
 */
export class MRTRenderPass extends Pass {

    /**
     * 构造一个新的MRT渲染通道。
     *
     * @param {Scene} scene - 要渲染的场景。
     * @param {Camera} camera - 要使用的相机。
     * @param {Object} [options] - 选项。
     * @param {Number} [options.resolutionScale=1.0] - 分辨率缩放。
     * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - 水平分辨率。
     * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - 垂直分辨率。
     * @param {Boolean} [options.shouldClear=true] - 是否在渲染前清除渲染目标。
     */
    constructor(scene, camera, {
        resolutionScale = 1.0,
        resolutionX = Resolution.AUTO_SIZE,
        resolutionY = Resolution.AUTO_SIZE,
        shouldClear = true
    } = {}) {
        super("MRTRenderPass", scene, camera);

        this.needsSwap = true;

        /**
         * 标识这是一个MRT渲染通道。
         * @type {Boolean}
         */
        this.isMRTRenderPass = true;

        /**
         * 是否支持WebGL2
         * @type {Boolean}
         */
        this.isWebGL2Supported = false;

        /**
         * 是否支持MRT
         * @type {Boolean}
         */
        this.isMRTSupported = false;

        /**
         * 深度打包方式。
         * @type {Number}
         */
        this.depthPacking = RGBADepthPacking;

        /**
         * 清除通道。
         * @type {ClearPass}
         * @private
         */
        this.clearPass = new ClearPass();
        // 将清除颜色改为黑色（而不是调试用的蓝色），确保alpha为1.0而不是0.1
        this.clearPass.overrideClearColor = new Color(0.0, 0.0, 0.0, 1.0);

        /**
         * MRT渲染目标。
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetMRT = null;

        /**
         * 分辨率。
         * @type {Resolution}
         */
        this.resolution = new Resolution(this, resolutionX, resolutionY, resolutionScale);
        this.resolution.addEventListener("change", (e) => this.setSize(
            this.resolution.baseWidth,
            this.resolution.baseHeight
        ));

        /**
         * 场景渲染完成标志。
         * @type {Boolean}
         * @private
         */
        this._sceneRendered = false;

        /**
         * MRT材质实例
         * @type {MRTMaterial}
         * @private
         */
        this._mrtMaterial = new MRTMaterial();

        /**
         * 用于复制的简单着色器材质
         * @type {ShaderMaterial}
         * @private
         */
        this._copyMaterial = new ShaderMaterial({
            uniforms: {
                inputBuffer: new Uniform(null)
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D inputBuffer;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(inputBuffer, vUv);
                }
            `
        });

        /**
         * 复制通道
         * @type {ShaderPass}
         * @private
         */
        this._copyPass = null;

        /**
         * 是否在渲染前清除渲染目标
         * @type {Boolean}
         */
        this.shouldClear = shouldClear;
    }

    /**
     * 执行初始化任务。
     *
     * @param {WebGLRenderer} renderer - 渲染器。
     * @param {Boolean} alpha - 渲染器是否使用alpha通道。
     * @param {Number} frameBufferType - 主帧缓冲区的类型。
     * @returns {Boolean} 初始化是否成功。
     */
    initialize(renderer, alpha, frameBufferType) {
        if (!renderer) {
            console.error("MRTRenderPass: 渲染器未定义，无法初始化");
            return false;
        }

        // 检查WebGL2支持
        this.isWebGL2Supported = renderer.capabilities.isWebGL2;

        // 配置MRTMaterial使用正确的着色器模式
        if (this._mrtMaterial) {
            console.log(`MRTRenderPass: 配置MRTMaterial着色器模式，WebGL2=${this.isWebGL2Supported}`);
            this._mrtMaterial.updateShaderMode(this.isWebGL2Supported);
        } else {
            console.warn("MRTRenderPass: MRTMaterial实例未创建");
        }

        if (!this.isWebGL2Supported) {
            console.warn("MRTRenderPass需要WebGL2支持，将回退到标准渲染。");
            return false;
        }

        // 检查MRT支持
        try {
            // 使用新的API创建一个测试MRT
            const testMRT = new WebGLRenderTarget(1, 1, {
                count: 2
            });
            console.log('Log-- ', testMRT, 'testMRT');

            if (!testMRT || !testMRT.textures || !Array.isArray(testMRT.textures)) {
                console.warn("WebGL2环境不支持多渲染目标(MRT)，将回退到标准渲染。");
                if (testMRT) testMRT.dispose();
                this.isMRTSupported = false;
                return false;
            }
            testMRT.dispose();
            this.isMRTSupported = true;
            console.log("MRTRenderPass: 多渲染目标(MRT)支持已确认");
        } catch (e) {
            console.error("MRT初始化失败:", e);
            this.isMRTSupported = false;
            return false;
        }

        // 创建渲染目标
        const success = this.createRenderTargets();

        // 检查深度纹理是否创建成功
        if (!this.depthTexture) {
            console.warn("MRTRenderPass: 深度纹理创建失败");
            return false;
        }

        return success;
    }

    /**
     * 创建MRT渲染目标。
     * @private
     * @returns {Boolean} 创建是否成功
     */
    createRenderTargets() {
        const resolution = this.resolution;
        const width = resolution.width, height = resolution.height;

        if (this.renderTargetMRT === null) {
            try {
                if (!this.isWebGL2Supported || !this.isMRTSupported) {
                    console.warn("WebGL2或MRT不受支持，无法创建MRT渲染目标");
                    return false;
                }

                // 创建新版MRT渲染目标，包含2个附件：颜色和深度
                this.renderTargetMRT = new WebGLRenderTarget(width, height, {
                    count: 2, // 指定有2个渲染目标
                    depthBuffer: true,
                    stencilBuffer: false
                });

                // 配置颜色纹理
                this.renderTargetMRT.textures[0].name = "MRT.Color";
                // 手动设置颜色纹理尺寸属性
                this.renderTargetMRT.textures[0].width = width;
                this.renderTargetMRT.textures[0].height = height;

                // 配置深度纹理
                this.renderTargetMRT.textures[1].name = "MRT.Depth";
                this.renderTargetMRT.textures[1].minFilter = this.renderTargetMRT.textures[1].magFilter = 1003; // NearestFilter
                // 手动设置深度纹理尺寸属性
                this.renderTargetMRT.textures[1].width = width;
                this.renderTargetMRT.textures[1].height = height;

                console.log(`MRTRenderPass: 创建新的MRT渲染目标，尺寸: ${width}x${height}`);
                console.log(`MRTRenderPass: 手动设置颜色纹理尺寸: ${this.renderTargetMRT.textures[0].width}x${this.renderTargetMRT.textures[0].height}`);

                // 验证纹理已成功创建
                if (!this.renderTargetMRT.textures[1]) {
                    console.error("MRT深度纹理创建失败");
                    return false;
                }

                return true;
            } catch (e) {
                console.error("创建MRT渲染目标失败:", e);
                this.renderTargetMRT = null;
                return false;
            }
        } else {
            // 调整现有渲染目标的大小
            this.renderTargetMRT.setSize(width, height);

            // 手动更新纹理尺寸属性
            if (this.renderTargetMRT.textures[0]) {
                this.renderTargetMRT.textures[0].width = width;
                this.renderTargetMRT.textures[0].height = height;
            }

            if (this.renderTargetMRT.textures[1]) {
                this.renderTargetMRT.textures[1].width = width;
                this.renderTargetMRT.textures[1].height = height;
            }

            console.log(`MRTRenderPass: 调整MRT渲染目标尺寸: ${width}x${height}`);
            return true;
        }
    }

    /**
     * 颜色纹理。
     * @type {Texture}
     */
    get colorTexture() {
        return this.renderTargetMRT ? this.renderTargetMRT.textures[0] : null;
    }

    /**
     * 深度纹理。
     * @type {Texture}
     */
    get depthTexture() {
        // 确保MRT渲染目标和纹理有效
        if (!this.renderTargetMRT || !this.renderTargetMRT.textures) {
            return null;
        }

        // 检查深度纹理是否存在
        const texture = this.renderTargetMRT.textures[1];
        if (!texture) {
            console.warn("MRTRenderPass: 深度纹理不存在");
            return null;
        }

        return texture;
    }

    /**
     * 渲染场景。
     *
     * @param {WebGLRenderer} renderer - 渲染器。
     * @param {WebGLRenderTarget} inputBuffer - 包含上一个通道结果的帧缓冲区。
     * @param {WebGLRenderTarget} outputBuffer - 作为输出渲染目标的帧缓冲区，除非此通道渲染到屏幕。
     * @param {Number} [deltaTime] - 上一帧与当前帧之间的时间（秒）。
     * @param {Boolean} [stencilTest] - 指示是否激活模板掩码。
     */
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
        timeLog("MRTRenderPass.render");

        // 确保渲染器支持WebGL2
        if (!this.isWebGL2Supported) {
            console.warn("MRTRenderPass需要WebGL2支持，跳过渲染。");
            timeEndLog("MRTRenderPass.render");
            return;
        }

        // 确保渲染目标已创建
        if (this.renderTargetMRT === null) {
            const success = this.createRenderTargets();

            // 如果仍然创建失败，则跳过渲染
            if (!success || this.renderTargetMRT === null) {
                console.warn("MRT渲染目标创建失败，跳过渲染。");
                timeEndLog("MRTRenderPass.render");
                return;
            }
        }

        const scene = this.scene;
        const camera = this.camera;
        const background = scene.background;

        // 获取场景中第一个子对象的类名（如果存在）
        let childClassName = "无子对象";
        if (scene && scene.children && scene.children.length > 0) {
            childClassName = scene.children[0].constructor.name;
        }
        log(`MRTRenderPass 渲染场景, 第一个子对象类型: ${childClassName}`);

        // 渲染场景到MRT渲染目标
        try {
            // 验证渲染目标纹理尺寸
            if (this.renderTargetMRT && this.renderTargetMRT.width && this.renderTargetMRT.height) {
                console.log(`MRTRenderPass: 准备渲染场景到MRT目标，尺寸: ${this.renderTargetMRT.width}x${this.renderTargetMRT.height}`);
            } else {
                console.warn("MRTRenderPass: MRT渲染目标尺寸无效");
            }

            // 验证场景对象
            if (!scene || !scene.isScene) {
                console.error("MRTRenderPass: 无效的场景对象");
                this._sceneRendered = false;
                timeEndLog("MRTRenderPass.render");
                return;
            }

            // 保存原始背景，设置新背景显示测试
            const originalBackground = scene.background;
            if (!originalBackground) {
                // 如果场景没有背景，添加一个测试背景（红色）以便于调试
                console.log("MRTRenderPass: 添加测试背景");
                scene.background = new Color(0.5, 0.0, 0.0);
            }

            // 设置渲染目标
            renderer.setRenderTarget(this.renderTargetMRT);

            // 使用MRT材质渲染场景
            console.log("MRTRenderPass: 使用MRT材质渲染场景");

            // WebGL2环境下，确保drawBuffers设置正确
            if (renderer.capabilities.isWebGL2) {
                // 获取WebGL上下文
                const gl = renderer.getContext();

                // 检查这是否是一个带有textures数组的WebGLMultipleRenderTargets
                if (this.renderTargetMRT && this.renderTargetMRT.textures && this.renderTargetMRT.textures.length > 1) {
                    try {
                        // 根据参考示例，另一种解决方法是在复杂渲染前禁用颜色写入
                        // 我们不在这里应用，因为我们需要颜色输出
                        // 但在不需要渲染到所有附件时，可以使用:
                        // renderer.state.buffers.color.setMask(false);

                        // 配置drawBuffers，仅使用前两个输出
                        // 颜色输出 -> COLOR_ATTACHMENT0
                        // 深度输出 -> COLOR_ATTACHMENT1
                        console.log(`MRTRenderPass: 配置drawBuffers，激活 ${this.renderTargetMRT.textures.length} 个缓冲区`);

                        // 注意：确保在renderer.setRenderTarget之后调用drawBuffers
                        gl.drawBuffers([
                            gl.COLOR_ATTACHMENT0,
                            gl.COLOR_ATTACHMENT1
                        ]);

                        // 显示当前绘制缓冲区的最大数量
                        const maxDrawBuffers = gl.getParameter(gl.MAX_DRAW_BUFFERS);
                        console.log(`MRTRenderPass: 此设备支持的最大绘制缓冲区数: ${maxDrawBuffers}`);
                    } catch (e) {
                        console.error("MRTRenderPass: 设置drawBuffers失败:", e);
                    }
                } else {
                    console.log("MRTRenderPass: 不是MRT或者纹理数组不可用，使用默认drawBuffer");
                }
            }

            // 清除目标
            if (this.shouldClear) {
                console.log("MRTRenderPass: 清除渲染目标");
                this.clearPass.render(renderer, this.renderTargetMRT);
            } else {
                console.log("MRTRenderPass: 跳过清除操作");
            }

            // 渲染场景
            console.log(`MRTRenderPass: 渲染场景 '${this.scene.name || "未命名场景"}' 使用相机 '${this.camera.name || "未命名相机"}'`);

            // 添加调试标记以验证渲染过程
            const debugTestObject = this.scene.getObjectByName("MRTRenderTestCube");
            if (!debugTestObject) {
                // 只有首次渲染时添加测试对象
                const testMaterial = new MeshBasicMaterial({ color: 0xff0000 });
                const testGeometry = new BoxGeometry(0.5, 0.5, 0.5);
                const testCube = new Mesh(testGeometry, testMaterial);
                testCube.name = "MRTRenderTestCube";
                testCube.position.set(0, 0, -3);
                this.camera.add(testCube);
                console.log("MRTRenderPass: 添加了测试立方体到相机");
            }

            // 渲染场景
            renderer.render(this.scene, this.camera);

            // 重置渲染目标
            renderer.setRenderTarget(null);

            // 恢复原始背景
            if (!originalBackground) {
                scene.background = originalBackground;
            }

            // 标记场景已渲染
            this._sceneRendered = true;
            console.log("MRTRenderPass: 场景渲染完成");

            // 调试代码：检查颜色纹理内容
            console.log("MRTRenderPass: 渲染后纹理信息:");
            console.log(`  - 颜色纹理ID: ${this.colorTexture ? this.colorTexture.id : "null"}`);
            console.log(`  - 深度纹理ID: ${this.depthTexture ? this.depthTexture.id : "null"}`);

            // 添加验证代码，创建一个临时的FramebufferTexture来读取渲染目标内容
            try {
                if (renderer && this.colorTexture && renderer.readRenderTargetPixels && this.renderTargetMRT) {
                    // 创建临时缓冲区读取中心像素
                    const pixelBuffer = new Uint8Array(4);
                    const x = Math.floor(this.renderTargetMRT.width / 2);
                    const y = Math.floor(this.renderTargetMRT.height / 2);

                    // 读取渲染目标中心像素
                    renderer.readRenderTargetPixels(this.renderTargetMRT, x, y, 1, 1, pixelBuffer);
                    console.log(`MRTRenderPass: 中心像素颜色 RGBA: ${pixelBuffer[0]},${pixelBuffer[1]},${pixelBuffer[2]},${pixelBuffer[3]}`);

                    // 检查是否全黑（如果是全黑，可能意味着场景没有正确渲染）
                    if (pixelBuffer[0] === 0 && pixelBuffer[1] === 0 && pixelBuffer[2] === 0) {
                        console.warn("MRTRenderPass: 中心像素是黑色，场景可能没有正确渲染!");
                    } else {
                        console.log("MRTRenderPass: 检测到非黑色像素，场景可能已正确渲染");
                    }
                }
            } catch (e) {
                console.error("MRTRenderPass: 读取渲染目标像素失败:", e);
            }

            // 确保纹理尺寸属性与渲染目标一致
            if (this.renderTargetMRT && this.renderTargetMRT.width && this.renderTargetMRT.height) {
                const width = this.renderTargetMRT.width;
                const height = this.renderTargetMRT.height;

                // 确保颜色纹理尺寸正确
                if (this.colorTexture) {
                    this.colorTexture.width = width;
                    this.colorTexture.height = height;
                    console.log(`MRTRenderPass: 已更新颜色纹理尺寸为: ${width}x${height}`);
                }

                // 确保深度纹理尺寸正确
                if (this.depthTexture) {
                    this.depthTexture.width = width;
                    this.depthTexture.height = height;
                    console.log(`MRTRenderPass: 已更新深度纹理尺寸为: ${width}x${height}`);
                }
            }

            // 验证渲染纹理是否有效
            if (this.colorTexture && this.colorTexture.width && this.colorTexture.height) {
                console.log(`MRTRenderPass: 颜色纹理尺寸: ${this.colorTexture.width}x${this.colorTexture.height}`);
            } else {
                console.warn("MRTRenderPass: 渲染后颜色纹理尺寸无效");
            }
        } catch (e) {
            console.error("MRT渲染失败:", e);
            this._sceneRendered = false;
            timeEndLog("MRTRenderPass.render");
            return;
        }

        // 验证深度纹理是否有效
        if (!this.depthTexture) {
            console.warn("MRTRenderPass: 深度纹理无效，MRT渲染可能失败");
        }

        // 如果需要交换，将颜色纹理复制到输出缓冲区
        if (this.needsSwap && outputBuffer !== null) {
            timeLog("MRTRenderPass.copyColor");
            try {
                // 确保颜色纹理存在
                if (this.colorTexture) {
                    const colorTextureId = this.colorTexture.id || "未知";
                    // 再次确认颜色纹理尺寸与渲染目标一致
                    if (!this.colorTexture.width || !this.colorTexture.height) {
                        if (this.renderTargetMRT) {
                            this.colorTexture.width = this.renderTargetMRT.width;
                            this.colorTexture.height = this.renderTargetMRT.height;
                            console.log(`MRTRenderPass: 复制前修正颜色纹理尺寸为: ${this.colorTexture.width}x${this.colorTexture.height}`);
                        }
                    }

                    const width = this.colorTexture.width || 0;
                    const height = this.colorTexture.height || 0;
                    console.log(`MRTRenderPass: 复制颜色纹理(ID: ${colorTextureId})到输出缓冲区，尺寸: ${width}x${height}`);

                    // WebGL2环境中，配置gl.drawBuffers以确保只使用第一个附件
                    if (renderer.capabilities.isWebGL2) {
                        // 一种方式是在复制前切换MRT材质到复制模式
                        if (this._mrtMaterial) {
                            // 切换到复制模式
                            this._mrtMaterial.useCopyMode();

                            // 初始化ShaderPass（如果需要）
                            if (!this._copyPass) {
                                this._copyPass = new ShaderPass(this._mrtMaterial);
                                const alpha = renderer.getContext().getContextAttributes().alpha;
                                const frameBufferType = outputBuffer.textures ? outputBuffer.textures[0].type : outputBuffer.texture.type;
                                this._copyPass.initialize(renderer, alpha, frameBufferType);
                            }

                            // 设置输入缓冲区纹理
                            this._mrtMaterial.setInputBuffer(this.colorTexture);

                            // 在复制前确保只激活第一个绘制缓冲区
                            const gl = renderer.getContext();
                            if (outputBuffer.textures && outputBuffer.textures.length > 1) {
                                // 如果输出缓冲区也是MRT，只使用第一个附件
                                console.log("MRTRenderPass: 复制到MRT输出缓冲区，只使用第一个附件");
                                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                            }

                            // 执行复制操作
                            this._copyPass.render(renderer, null, outputBuffer);

                            // 复制完成后恢复drawBuffers（如果需要）
                            if (outputBuffer.textures && outputBuffer.textures.length > 1) {
                                // 如果是MRT，恢复所有绘制缓冲区
                                gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
                            }

                            // 复制完成后恢复正常模式
                            this._mrtMaterial.useNormalMode();
                        } else {
                            console.warn("MRTRenderPass: 找不到MRTMaterial实例，无法执行复制");
                        }
                    } else {
                        // WebGL1环境使用原来的方法
                        if (!this._copyPass) {
                            console.log("MRTRenderPass: 创建新的复制通道");
                            this._copyPass = new ShaderPass(this._copyMaterial);
                            // 禁用颜色写入，避免WebGL警告
                            this._copyMaterial.colorWrite = false;
                            // 确保复制通道已初始化
                            const alpha = renderer.getContext().getContextAttributes().alpha;
                            const frameBufferType = outputBuffer.textures ? outputBuffer.textures[0].type : outputBuffer.texture.type;
                            this._copyPass.initialize(renderer, alpha, frameBufferType);
                        }

                        // 设置输入缓冲区纹理
                        this._copyMaterial.uniforms.inputBuffer.value = this.colorTexture;

                        // 执行复制
                        console.log("MRTRenderPass: 开始复制颜色纹理到输出缓冲区...");
                        this._copyPass.render(renderer, null, outputBuffer);
                    }

                    console.log("MRTRenderPass: 复制操作完成");

                    // 验证输出缓冲区是否有效
                    if (outputBuffer) {
                        console.log(`MRTRenderPass: 颜色复制完成，输出缓冲区尺寸: ${outputBuffer.width}x${outputBuffer.height}`);
                    } else {
                        console.warn("MRTRenderPass: 输出缓冲区无效，无法完成复制");
                    }
                } else {
                    console.warn("MRTRenderPass: 颜色纹理不存在，无法复制到输出缓冲区");
                }
            } catch (e) {
                console.error("复制MRT结果失败:", e);
            }
            timeEndLog("MRTRenderPass.copyColor");
        } else if (this.needsSwap) {
            log(`MRTRenderPass: 不需要交换 或 输出缓冲区为null (outputBuffer=${outputBuffer !== null})`);
        }

        timeEndLog("MRTRenderPass.render");
    }

    /**
     * 更新通道的大小。
     *
     * @param {Number} width - 宽度。
     * @param {Number} height - 高度。
     */
    setSize(width, height) {
        this.resolution.setBaseSize(width, height);

        // 更新渲染目标大小
        if (this.renderTargetMRT !== null) {
            const w = this.resolution.width, h = this.resolution.height;
            this.renderTargetMRT.setSize(w, h);
        }
    }

    /**
     * 销毁渲染目标和资源。
     */
    dispose() {
        if (this.renderTargetMRT) {
            this.renderTargetMRT.dispose();
            this.renderTargetMRT = null;
        }

        // 调用父类的dispose方法
        super.dispose();
    }
} 