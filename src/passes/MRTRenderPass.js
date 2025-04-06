import { OverrideMaterialManager } from "../core/OverrideMaterialManager.js";
import { ClearPass } from "./ClearPass.js";
import { Pass } from "./Pass.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";
import {
    WebGLMultipleRenderTargets,
    Vector2,
    ShaderMaterial,
    GLSL3,
    FrontSide,
    NoBlending
} from "three";

/**
 * 多渲染目标(MRT)渲染通道
 * 
 * 此通道可以将场景渲染到多个渲染目标(如颜色、法线、深度等)
 * 
 * 这个通道使用一个 {@link ClearPass} 来清除目标缓冲区
 */
export class MRTRenderPass extends Pass {
    isMRTRenderPass = true;

    // 定义支持的通道类型常量
    static CHANNEL_COLOR = "color";         // 颜色通道
    static CHANNEL_NORMAL = "normal";       // 法线通道
    static CHANNEL_DEPTH = "depth";         // 深度通道
    static CHANNEL_POSITION = "position";   // 世界位置通道
    static CHANNEL_PBR = "pbr";             // PBR属性通道(粗糙度/金属度/AO)
    static CHANNEL_ROUGHNESS = "roughness"; // 粗糙度单独通道
    static CHANNEL_METALNESS = "metalness"; // 金属度单独通道
    static CHANNEL_AO = "ao";               // 环境光遮蔽单独通道
    static CHANNEL_MOTION = "motion";       // 运动向量通道
    static CHANNEL_EMISSION = "emission";   // 自发光通道
    static CHANNEL_ID = "id";               // 对象ID通道
    static CHANNEL_MASK = "mask";           // 遮罩通道
    static CHANNEL_SHADOW = "shadow";       // 阴影通道
    static CHANNEL_VELOCITY = "velocity";   // 速度通道(与motion类似但计算方式不同)
    static CHANNEL_CUSTOM = "custom";       // 自定义通道

    // 默认通道配置
    static DEFAULT_CHANNELS = [
        MRTRenderPass.CHANNEL_COLOR,
        MRTRenderPass.CHANNEL_NORMAL,
        MRTRenderPass.CHANNEL_DEPTH
    ];

    /**
     * 构造新的多渲染目标渲染通道
     * 
     * @param {Scene} scene - 要渲染的场景
     * @param {Camera} camera - 用于渲染场景的相机
     * @param {Object} [options] - 渲染选项
     * @param {Number} [options.outputCount=2] - 输出渲染目标的数量
     * @param {Array} [options.channels] - 要生成的通道类型数组，如 ['color', 'normal', 'depth']
     * @param {Object} [options.formats] - 各个渲染目标的格式设置
     * @param {Material} [overrideMaterial=null] - 覆盖材质
     */
    constructor(scene, camera, options = {}, overrideMaterial = null) {
        super("MRTRenderPass", scene, camera);

        this.needsSwap = false;

        // 用户指定的通道类型数组
        this.channels = options.channels || MRTRenderPass.DEFAULT_CHANNELS;

        // 默认输出数量为通道数量或2(如果未指定)
        this.outputCount = options.outputCount || Math.max(2, this.channels.length);
        this.formats = options.formats || null;

        /**
         * MRT渲染目标
         * 
         * @type {WebGLMultipleRenderTargets}
         * @private
         */
        this.renderTargets = null;

        /**
         * 清除通道
         * 
         * @type {ClearPass}
         * @readonly
         */
        this.clearPass = new ClearPass();

        /**
         * 覆盖材质管理器
         * 
         * @type {OverrideMaterialManager}
         * @private
         */
        this.overrideMaterialManager = (overrideMaterial === null) ? null : new OverrideMaterialManager(overrideMaterial);

        /**
         * 是否忽略场景背景
         * 
         * @type {Boolean}
         */
        this.ignoreBackground = false;

        /**
         * 是否跳过阴影贴图自动更新
         * 
         * @type {Boolean}
         */
        this.skipShadowMapUpdate = false;

        /**
         * 要渲染的对象选择
         * 
         * @type {Selection}
         * @readonly
         */
        this.selection = null;

        // 渲染目标数组，将被渲染结果填充
        this.buffers = [];

        // 通道映射表，存储通道索引与类型的对应关系
        this.channelMap = new Map();

        // 创建MRT专用材质
        this.createMRTMaterial();
    }

    set mainScene(value) {
        this.scene = value;
    }

    set mainCamera(value) {
        this.camera = value;
    }

    get renderToScreen() {
        return super.renderToScreen;
    }

    set renderToScreen(value) {
        super.renderToScreen = value;
        this.clearPass.renderToScreen = value;
    }

    /**
     * 当前覆盖材质
     * 
     * @type {Material}
     */
    get overrideMaterial() {
        const manager = this.overrideMaterialManager;
        return (manager !== null) ? manager.material : null;
    }

    set overrideMaterial(value) {
        const manager = this.overrideMaterialManager;

        if (value !== null) {
            if (manager !== null) {
                manager.setMaterial(value);
            } else {
                this.overrideMaterialManager = new OverrideMaterialManager(value);
            }
        } else if (manager !== null) {
            manager.dispose();
            this.overrideMaterialManager = null;
        }
    }

    /**
     * 是否应在渲染前清除目标缓冲区
     * 
     * @type {Boolean}
     */
    get clear() {
        return this.clearPass.enabled;
    }

    set clear(value) {
        this.clearPass.enabled = value;
    }

    /**
     * 初始化多渲染目标
     * 
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    initRenderTargets(renderer, width, height) {
        if (this.renderTargets !== null) {
            this.renderTargets.dispose();
        }

        const size = renderer.getSize(new Vector2());
        const pixelRatio = renderer.getPixelRatio();
        const effectiveWidth = width || (size.width * pixelRatio);
        const effectiveHeight = height || (size.height * pixelRatio);

        // 检查尺寸是否有效
        if (effectiveWidth <= 0 || effectiveHeight <= 0) {
            console.warn("MRTRenderPass: 尝试创建尺寸为零的渲染目标", effectiveWidth, effectiveHeight);
            return null;
        }

        // 检测WebGL2功能和限制
        const gl = renderer.getContext();
        const isWebGL2 = gl instanceof WebGL2RenderingContext;
        const maxDrawBuffers = isWebGL2 ? gl.getParameter(gl.MAX_DRAW_BUFFERS) : 1;

        // 调整输出数量不超过设备支持的最大数量
        const effectiveOutputCount = Math.min(this.outputCount, maxDrawBuffers);

        if (effectiveOutputCount < this.outputCount) {
            console.warn(`MRTRenderPass: 设备仅支持${maxDrawBuffers}个渲染目标，而不是请求的${this.outputCount}个`);
            this.outputCount = effectiveOutputCount;
        }

        // 创建多渲染目标
        try {
            this.renderTargets = new WebGLMultipleRenderTargets(
                effectiveWidth,
                effectiveHeight,
                this.outputCount
            );

            // 如果有格式设置，应用到每个渲染目标
            if (this.formats) {
                for (let i = 0; i < this.outputCount; i++) {
                    if (this.formats[i]) {
                        const format = this.formats[i];
                        const texture = this.renderTargets.texture[i];

                        // 检查并设置格式
                        if (format.format !== undefined) {
                            // 确保格式兼容性
                            texture.format = format.format;
                        }
                        if (format.type !== undefined) texture.type = format.type;
                        if (format.colorSpace !== undefined) texture.colorSpace = format.colorSpace;
                        if (format.minFilter !== undefined) texture.minFilter = format.minFilter;
                        if (format.magFilter !== undefined) texture.magFilter = format.magFilter;
                    }
                }
            }

            // 给每个纹理命名
            for (let i = 0; i < this.outputCount; i++) {
                this.renderTargets.texture[i].name = `MRTRenderPass.Target${i}`;

                // 检查纹理是否正确初始化
                if (!this.renderTargets.texture[i].image ||
                    this.renderTargets.texture[i].image.width <= 0 ||
                    this.renderTargets.texture[i].image.height <= 0) {
                    console.warn(`MRTRenderPass: 纹理${i}初始化失败或尺寸为零`);
                }
            }

            return this.renderTargets;
        } catch (e) {
            console.error("MRTRenderPass: 初始化渲染目标时出错", e);
            return null;
        }
    }

    /**
     * 获取渲染目标纹理
     * 
     * @param {Number} index - 纹理索引
     * @returns {Texture} 指定索引的渲染目标纹理
     */
    getTexture(index = 0) {
        if (this.renderTargets === null) {
            return null;
        }
        return this.renderTargets.texture[index];
    }

    /**
     * 根据通道类型获取对应的渲染目标纹理
     * 
     * @param {String} channelType - 通道类型，如 'color', 'normal', 'depth' 等
     * @returns {Texture} 对应通道类型的渲染目标纹理，如果未找到则返回null
     */
    getChannelTexture(channelType) {
        if (this.renderTargets === null || !this.channelMap.has(channelType)) {
            return null;
        }
        const index = this.channelMap.get(channelType);
        return this.renderTargets.texture[index];
    }

    /**
     * 检查是否存在特定类型的通道
     * 
     * @param {String} channelType - 要检查的通道类型
     * @returns {Boolean} 如果通道存在返回true，否则返回false
     */
    hasChannel(channelType) {
        return this.channelMap.has(channelType);
    }

    /**
     * 获取特定通道类型对应的索引
     * 
     * @param {String} channelType - 通道类型
     * @returns {Number} 通道索引，如果未找到则返回-1
     */
    getChannelIndex(channelType) {
        return this.channelMap.has(channelType) ? this.channelMap.get(channelType) : -1;
    }

    /**
     * 获取所有可用的通道类型
     * 
     * @returns {Array} 可用通道类型的数组
     */
    getAvailableChannels() {
        return [...this.channelMap.keys()];
    }

    /**
     * 创建多渲染目标(MRT)专用材质
     * 该材质会为每个渲染目标提供一个输出
     */
    createMRTMaterial() {
        // 生成着色器输出声明
        let outputDeclarations = '';
        let outputAssignments = '';

        // 用户可能配置的输出通道数，最多支持8个（WebGL2的限制）
        const effectiveOutputCount = Math.min(this.outputCount, 8);

        // 清空通道映射
        this.channelMap.clear();

        // 创建通道映射，将通道类型映射到对应的索引
        for (let i = 0; i < Math.min(this.channels.length, effectiveOutputCount); i++) {
            this.channelMap.set(this.channels[i], i);
        }

        for (let i = 0; i < effectiveOutputCount; i++) {
            outputDeclarations += `layout(location = ${i}) out vec4 gOutput${i};\n`;

            // 获取当前索引对应的通道类型
            const channelType = i < this.channels.length ? this.channels[i] : null;

            // 根据通道类型生成相应的输出赋值
            switch (channelType) {
                case MRTRenderPass.CHANNEL_COLOR:
                    // 通道: 颜色 (RGB + Alpha)
                    outputAssignments += `gOutput${i} = vec4(diffuseColor, 1.0);\n`;
                    break;

                case MRTRenderPass.CHANNEL_NORMAL:
                    // 通道: 法线 (世界空间法线映射到[0,1]范围)
                    outputAssignments += `gOutput${i} = vec4(normalize(vNormal) * 0.5 + 0.5, 1.0);\n`;
                    break;

                case MRTRenderPass.CHANNEL_DEPTH:
                    // 通道: 深度 (非线性映射以突出细节)
                    outputAssignments += `
                        // 计算到相机的距离
                        float depth = abs(vViewPosition.z);
                        // 应用非线性映射以增强近距离的变化
                        float mappedDepth = 1.0 - exp(-0.1 * depth);
                        gOutput${i} = vec4(vec3(mappedDepth), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_POSITION:
                    // 通道: 世界位置 (缩放到合理范围)
                    outputAssignments += `
                        // 将世界位置映射到合理颜色范围
                        vec3 worldPosNormalized = vWorldPosition * 0.1;
                        // 对每个分量进行循环映射，避免过大或过小的值
                        worldPosNormalized = fract(worldPosNormalized + 0.5);
                        gOutput${i} = vec4(worldPosNormalized, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_PBR:
                    // 通道: 模拟PBR属性 (R=粗糙度, G=金属度, B=环境光遮蔽)
                    outputAssignments += `
                        // 基于位置生成伪PBR属性
                        float pbr_roughness = fract(vWorldPosition.x * 0.5) * 0.8 + 0.2;
                        float pbr_metalness = fract(vWorldPosition.y * 0.5) * 0.8 + 0.2;
                        float pbr_ao = fract(vWorldPosition.z * 0.5) * 0.5 + 0.5;
                        gOutput${i} = vec4(pbr_roughness, pbr_metalness, pbr_ao, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_ROUGHNESS:
                    // 通道: 单独的粗糙度
                    outputAssignments += `
                        // 基于位置生成粗糙度
                        float rough_value = fract(vWorldPosition.x * 0.5) * 0.8 + 0.2;
                        gOutput${i} = vec4(vec3(rough_value), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_METALNESS:
                    // 通道: 单独的金属度
                    outputAssignments += `
                        // 基于位置生成金属度
                        float metal_value = fract(vWorldPosition.y * 0.5) * 0.8 + 0.2;
                        gOutput${i} = vec4(vec3(metal_value), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_AO:
                    // 通道: 单独的环境光遮蔽
                    outputAssignments += `
                        // 基于位置生成环境光遮蔽
                        float ao_value = fract(vWorldPosition.z * 0.5) * 0.5 + 0.5;
                        gOutput${i} = vec4(vec3(ao_value), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_MOTION:
                    // 通道: 运动向量 (用于运动模糊) - 这里使用简化模拟
                    outputAssignments += `
                        // 模拟运动向量 - 使用世界坐标的变化率作为运动方向
                        vec2 motion = vec2(
                            sin(vWorldPosition.x * 0.1 + time) * 0.5,
                            cos(vWorldPosition.y * 0.1 + time) * 0.5
                        ) * 0.1;
                        gOutput${i} = vec4(motion.x, motion.y, 0.0, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_EMISSION:
                    // 通道: 自发光/发光贴图 - 模拟某些区域发光效果
                    outputAssignments += `
                        // 基于UV坐标生成发光图案
                        float emissionPattern = 
                            max(0.0, 
                                sin(vUv.x * 20.0 + time) * sin(vUv.y * 20.0 + time) * 2.0
                            );
                        // 生成随机颜色发光
                        vec3 emissionColor = vBaseColor * emissionPattern * 2.0;
                        gOutput${i} = vec4(emissionColor, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_ID:
                    // 通道: 对象ID - 用于拾取和选择
                    outputAssignments += `
                        // 使用世界位置的哈希作为伪对象ID
                        // 真实应用中应从uniform或顶点属性获取
                        float id = fract(
                            sin(dot(floor(vWorldPosition), vec3(12.9898, 78.233, 45.543))) * 43758.5453
                        );
                        // 使用不同颜色显示不同ID
                        vec3 idColor = vec3(id, fract(id * 13.0), fract(id * 27.0));
                        gOutput${i} = vec4(idColor, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_MASK:
                    // 通道: 遮罩 - 可用于各种遮罩效果
                    outputAssignments += `
                        // 基于UV创建一个棋盘格图案作为遮罩示例
                        float mask = mod(floor(vUv.x * 10.0) + floor(vUv.y * 10.0), 2.0);
                        gOutput${i} = vec4(vec3(mask), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_SHADOW:
                    // 通道: 阴影信息
                    outputAssignments += `
                        // 使用简单的梯度作为阴影示例
                        // 真实应用中应获取实际阴影信息
                        float shadowValue = max(0.0, 1.0 - vViewPosition.z * 0.1);
                        gOutput${i} = vec4(vec3(shadowValue), 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_VELOCITY:
                    // 通道: 速度向量 - 与运动不同的计算方式
                    outputAssignments += `
                        // 基于时间和位置计算的速度场
                        vec2 velocity = vec2(
                            sin(vWorldPosition.y * 0.2 + time * 2.0),
                            cos(vWorldPosition.x * 0.2 + time * 2.0)
                        ) * 0.15;
                        gOutput${i} = vec4(velocity.x, velocity.y, 0.0, 1.0);
                    `;
                    break;

                case MRTRenderPass.CHANNEL_CUSTOM:
                    // 通道: 自定义 - 用户可以在这里添加自己的计算逻辑
                    outputAssignments += `
                        // 示例自定义输出 - 使用时间变化的花纹
                        vec3 customColor = vec3(
                            0.5 + 0.5 * sin(vUv.x * 20.0 + time),
                            0.5 + 0.5 * sin(vUv.y * 20.0 + time * 0.7),
                            0.5 + 0.5 * sin((vUv.x + vUv.y) * 10.0 + time * 1.3)
                        );
                        gOutput${i} = vec4(customColor, 1.0);
                    `;
                    break;

                default:
                    // 默认输出 - 灰色
                    outputAssignments += `gOutput${i} = vec4(0.5, 0.5, 0.5, 1.0);\n`;
                    break;
            }
        }

        // 创建多渲染目标材质
        this.mrtMaterial = new ShaderMaterial({
            uniforms: {
                // 可以在这里添加额外的uniform
                time: { value: 0.0 }
            },
            vertexShader: `
                out vec3 vNormal;
                out vec2 vUv;
                out vec3 vViewPosition;
                out vec3 vWorldPosition;
                // 使用自定义属性传递颜色信息
                out vec3 vBaseColor;
                
                void main() {
                    vUv = uv;
                    vNormal = normalMatrix * normal;
                    
                    // 计算世界空间位置
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    
                    // 计算视图空间位置
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    vViewPosition = mvPosition.xyz;
                    
                    // 生成一个基于位置的颜色 (在没有实际颜色输入时的替代方案)
                    // 这样每个物体都会根据其位置有不同的颜色
                    vBaseColor = normalize(abs(worldPosition.xyz)) * 0.5 + 0.5;
                    
                    // 最终投影
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision highp float;
                precision highp int;
                
                ${outputDeclarations}
                
                // 来自顶点着色器的变量
                in vec3 vNormal;
                in vec2 vUv;
                in vec3 vViewPosition;
                in vec3 vWorldPosition;
                in vec3 vBaseColor;
                
                // Uniform变量
                uniform float time;
                
                // 计算颜色 - 这里使用多种方法来确保颜色可见
                vec3 getDiffuseColor() {
                    // 基础颜色（来自顶点着色器）
                    vec3 baseColor = vBaseColor;
                    
                    // 调整颜色 - 增加饱和度
                    vec3 enhancedColor = baseColor;
                    
                    // 使用UV坐标添加变化
                    vec3 uvColor = vec3(
                        fract(vUv.x * 5.0),
                        fract(vUv.y * 5.0),
                        fract((vUv.x + vUv.y) * 2.5)
                    );
                    
                    // 混合颜色源以创建更鲜艳的结果
                    return mix(enhancedColor, uvColor, 0.3) * 0.8 + 0.2;
                }
                
                void main() {
                    // 获取漫反射颜色
                    vec3 diffuseColor = getDiffuseColor();
                    
                    // 为每个渲染目标提供输出
                    ${outputAssignments}
                }
            `,
            glslVersion: GLSL3,
            side: FrontSide,
            blending: NoBlending
        });
    }

    /**
     * 渲染场景到多个渲染目标
     * 
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 包含上一个通道结果的帧缓冲区
     * @param {WebGLRenderTarget} outputBuffer - 作为输出渲染目标的帧缓冲区，除非此通道渲染到屏幕
     * @param {Number} [deltaTime] - 上一帧和当前帧之间的时间（秒）
     * @param {Boolean} [stencilTest] - 指示模板蒙版是否处于活动状态
     */
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {
        timeLog("MRTRenderPass.render");

        try {
            const scene = this.scene;
            const camera = this.camera;
            const selection = this.selection;
            const mask = camera.layers.mask;
            const background = scene.background;
            const shadowMapAutoUpdate = renderer.shadowMap.autoUpdate;

            // 如果renderTargets未初始化或尺寸为零，初始化它
            if (this.renderTargets === null ||
                (this.renderTargets.width <= 0 || this.renderTargets.height <= 0)) {
                this.initRenderTargets(renderer);
            }

            // 检查渲染目标是否正确初始化
            if (this.renderTargets === null) {
                console.error("MRTRenderPass: 渲染目标初始化失败");
                return;
            }

            // 获取场景中第一个子对象的类名（如果存在）
            let childClassName = "无子对象";
            if (scene && scene.children && scene.children.length > 0) {
                childClassName = scene.children[0].constructor.name;
            }
            log(`MRTRenderPass 渲染场景, 第一个子对象类型: ${childClassName}`);

            // 更新着色器中的time参数，用于动态效果
            if (this.mrtMaterial && this.mrtMaterial.uniforms && this.mrtMaterial.uniforms.time) {
                this.mrtMaterial.uniforms.time.value = performance.now() * 0.001;
            }

            if (selection !== null) {
                camera.layers.set(selection.getLayer());
            }

            if (this.skipShadowMapUpdate) {
                renderer.shadowMap.autoUpdate = false;
            }

            if (this.ignoreBackground || this.clearPass.overrideClearColor !== null) {
                scene.background = null;
            }

            if (this.clearPass.enabled) {
                // 应用于所有MRT目标
                this.clearPass.render(renderer, this.renderTargets);
            }

            // 设置MRT渲染目标
            renderer.setRenderTarget(this.renderTargets);

            // 保存当前的覆盖材质
            const currentOverrideMaterial = scene.overrideMaterial;

            // 使用MRT专用材质渲染场景
            scene.overrideMaterial = this.mrtMaterial;

            // 渲染场景
            renderer.render(scene, camera);

            // 恢复原来的覆盖材质
            scene.overrideMaterial = currentOverrideMaterial;

            // 如果需要，将MRT的第一个渲染目标复制到输出缓冲区
            if (!this.renderToScreen && outputBuffer !== null) {
                // 这里可以添加复制操作，将MRT的第一个输出复制到outputBuffer
            }

            // 恢复原始值
            camera.layers.mask = mask;
            scene.background = background;
            renderer.shadowMap.autoUpdate = shadowMapAutoUpdate;

            // 将渲染目标数组填充为MRT的纹理
            this.buffers = [];
            for (let i = 0; i < this.outputCount; i++) {
                this.buffers.push(this.renderTargets.texture[i]);
            }
        } catch (e) {
            console.error("MRTRenderPass.render 执行错误:", e);
        }

        timeEndLog("MRTRenderPass.render");
    }

    /**
     * 更新通道的大小
     * 
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        if (this.renderTargets !== null) {
            this.renderTargets.setSize(width, height);
        }
        this.clearPass.setSize(width, height);
    }

    /**
     * 释放资源
     */
    dispose() {
        super.dispose();

        if (this.renderTargets !== null) {
            this.renderTargets.dispose();
        }

        if (this.overrideMaterialManager !== null) {
            this.overrideMaterialManager.dispose();
        }

        if (this.mrtMaterial !== null && this.mrtMaterial !== undefined) {
            this.mrtMaterial.dispose();
        }

        this.clearPass.dispose();
    }
} 