import { Effect, Selection, NormalPass, RenderPass, ClearPass } from "postprocessing"
import { Color, Uniform, Layers, WebGLRenderTarget, LinearFilter, HalfFloatType, NoBlending, DepthTexture, EqualDepth, NotEqualDepth, BasicDepthPacking, RGBADepthPacking } from "three"
import { TRAAEffect } from '../../index'
import ao_compose from './shader/ao_compose.frag'
import { PoissionDenoisePass } from '../pass/PoissionDenoisePass'
import { DepthComparisonMaterial, DepthPass, ShaderPass } from "postprocessing"
import { DepthMaskMaterial, MultiSampleDepthMaskMaterial } from "postprocessing"
import { DepthTestStrategy } from "postprocessing"
import * as THREE from 'three';
const defaultAOOptions = {
    resolutionScale: 1,
    spp: 8,
    distance: 2,
    distancePower: 1,
    power: 4,
    bias: 40,
    thickness: 0.075,
    color: new Color("black"),
    brightnessThreshold: 0.7,
    maskThreshold: 0.01,  // 添加遮罩阈值参数
    debugMode: 0,
    ignoreSelection: null,
    highlightValue: 1000,
    closeAutoUpdate: false,
    useNormalPass: false,
    velocityDepthNormalPass: null,
    normalTexture: null,
    // 添加多采样相关参数
    useMultisampling: true,     // 是否启用多采样
    samplingCount: 9,           // 采样数量
    samplingRadius: 2.0,        // 采样半径
    samplingThreshold: 0.5,     // 采样匹配阈值
    renderBefore: () => {
    },
    ...PoissionDenoisePass.DefaultOptions
};

console.log('Log-- ', 0.22, 'SelectiveAOEffect');
export class SelectiveAOEffect extends Effect {
    constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {
        // 合并选项
        options = {
            ...defaultAOOptions,
            ...options
        };

        // 使用AO着色器作为基础效果着色器
        super("AOEffect", ao_compose, {
            type: "FinalAOMaterial",
            uniforms: new Map([
                ["inputTexture", new Uniform(null)],
                ["inputBuffer", new Uniform(null)],
                ["depthTexture", new Uniform(null)],
                ["maskTexture", new Uniform(null)],
                ["power", new Uniform(0)],
                ["color", new Uniform(new Color("black"))],
                ["brightnessThreshold", new Uniform(0.7)],
                ["maskThreshold", new Uniform(0.01)],  // 添加遮罩阈值统一变量
                ["debugMode", new Uniform(0)],
                ["depthNear", new Uniform(0.1)],
                ["depthFar", new Uniform(1000.0)]
            ])
        });

        // 存储上次大小设置
        this.lastSize = {
            width: 0,
            height: 0,
            resolutionScale: 0
        };

        // 保存引用
        this.composer = composer;
        this.aoPass = aoPass;
        this.options = options;
        this.scene = scene;
        this.camera = camera;

        // 初始化Selection对象
        this._ignoreSelection = options.ignoreSelection || new Selection();

        // 创建遮罩渲染目标
        this.renderTargetMask = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: true,
            stencilBuffer: true  // 启用模板缓冲
        });
        this.renderTargetMask.texture.name = "AO.Mask";
        this.uniforms.get("maskTexture").value = this.renderTargetMask.texture;

        // 存储原始材质状态的映射
        this.originalMaterials = new Map();
        this.originalStencilSettings = new Map();
        this.renderer = null;

        // 创建专用于AO的渲染目标
        this.createRenderTargets();

        // 创建基本渲染通道
        this.renderPass = new RenderPass(scene, camera);
        this.renderPass.clear = true;

        // 创建深度通道
        this.depthPass = new DepthPass(scene, camera);

        console.log('Log-- ', options.useMultisampling, 'options.useMultisampling');
        // 创建深度遮罩材质（根据配置决定是否使用多采样）
        if (options.useMultisampling) {
            this.depthMaskMaterial = new MultiSampleDepthMaskMaterial();
        } else {
            this.depthMaskMaterial = new DepthMaskMaterial();
        }
        this.depthMaskMaterial.copyCameraSettings(camera);
        this.depthMaskMaterial.depthBuffer0 = composer.depthTexture;  // 场景深度
        this.depthMaskMaterial.depthPacking0 = BasicDepthPacking;
        this.depthMaskMaterial.depthBuffer1 = this.depthPass.texture; // 选中对象深度
        this.depthMaskMaterial.depthPacking1 = RGBADepthPacking;
        this.depthMaskMaterial.depthMode = THREE.EqualDepth;                // 默认使用相等深度模式
        this.depthMaskMaterial.epsilon = 0.000009;                // 默认使用相等深度模式

        // 如果使用多采样，设置多采样参数
        if (options.useMultisampling && this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial) {
            this.depthMaskMaterial.samplingCount = options.samplingCount || 9;
            this.depthMaskMaterial.samplingRadius = options.samplingRadius || 2.0;
            this.depthMaskMaterial.samplingThreshold = options.samplingThreshold || 0.5;
        }

        // 使用深度遮罩材质创建遮罩通道替代原来的RenderPass
        this.maskPass = new ShaderPass(this.depthMaskMaterial);
        this.maskPass.clear = true;  // 确保渲染之前清理目标

        // 清除通道，用于在不同渲染步骤间清除
        this.clearPass = new ClearPass(true, false, false);
        this.clearPass.overrideClearColor = new Color(0x000000);
        this.clearPass.overrideClearAlpha = 1;

        // 添加反转遮罩和忽略背景选项
        this._inverted = false;
        this._ignoreBackground = false;

        // 存储原始发光值的映射
        this.originalEmissives = new Map();

        // 设置深度纹理
        if (!composer.depthTexture) composer.createDepthTexture();
        this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = composer.depthTexture;
        this.uniforms.get("depthTexture").value = composer.depthTexture;

        // 设置法线纹理（如果需要）
        if (options.useNormalPass || options.normalTexture) {
            if (options.useNormalPass) {
                this.normalPass = new NormalPass(scene, camera);
            }
            const normalTexture = options.normalTexture || this.normalPass.texture;
            this.aoPass.fullscreenMaterial.uniforms.normalTexture.value = normalTexture;
            this.aoPass.fullscreenMaterial.defines.useNormalTexture = "";
        }

        // 创建降噪通道
        this.poissionDenoisePass = new PoissionDenoisePass(camera, this.aoPass.texture, composer.depthTexture);

        // 检查降噪通道是否正确初始化
        if (this.poissionDenoisePass) {
            if (!this.poissionDenoisePass.renderTarget) {
                console.warn("PoissionDenoisePass创建后renderTarget未定义，尝试通过设置尺寸初始化");
                // 强制设置初始尺寸，以确保渲染目标被创建
                const initialWidth = 1;
                const initialHeight = 1;
                try {
                    this.poissionDenoisePass.setSize(initialWidth, initialHeight);
                    console.log("PoissionDenoisePass渲染目标初始化成功");
                } catch (error) {
                    console.error("初始化PoissionDenoisePass渲染目标失败:", error);
                }
            }
        } else {
            console.error("降噪通道(PoissionDenoisePass)创建失败");
        }

        // 使选项响应式
        this.makeOptionsReactive(options);

        // 初始化选择对象图层
        this.initializeSelectionLayer();
    }

    // 初始化Selection对象，移除图层依赖
    initializeSelectionLayer() {
        if (!this._ignoreSelection) return;

        // 确保Selection有正确的方法
        if (!this._ignoreSelection.add && typeof this._ignoreSelection.add !== 'function') {
            console.warn('Selection对象缺少add方法，可能无法正常添加对象');
        }

        // 打印一些调试信息
        const itemCount = this.getSelectionItems().length;
        console.log(`AO初始化: 忽略对象数量=${itemCount}`);

        // 如果选择为空，打印警告
        if (itemCount === 0) {
            console.warn('Selection为空，所有物体都将参与AO计算');
        }
    }

    // 创建渲染目标
    createRenderTargets() {
        // 创建AO专用渲染目标，确保包含深度纹理和模板缓冲
        this.renderTargetAO = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: true,
            stencilBuffer: true,  // 启用模板缓冲
            depthTexture: new DepthTexture() // 关键：添加深度纹理
        });
        this.renderTargetAO.texture.name = "AO.Target";
        this.renderTargetAO.depthTexture.name = "AO.Depth";

        // 创建模板缓冲可视化纹理
        this.stencilVisualizationTarget = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: false
        });
        this.stencilVisualizationTarget.texture.name = "AO.StencilVisualization";
    }

    makeOptionsReactive(options) {
        for (const key of Object.keys(options)) {
            Object.defineProperty(this, key, {
                get() {
                    // 为ignoreSelection属性提供特殊处理
                    if (key === "ignoreSelection") {
                        return this._ignoreSelection;
                    }
                    return options[key];
                },

                set(value) {
                    if (value === null || value === undefined) return;
                    options[key] = value;

                    switch (key) {
                        case "spp":
                            this.aoPass.fullscreenMaterial.defines.spp = value.toFixed(0);
                            this.aoPass.fullscreenMaterial.needsUpdate = true;
                            break;

                        case "distance":
                            this.aoPass.fullscreenMaterial.uniforms.aoDistance.value = value;
                            break;

                        case "resolutionScale":
                            this.setSize(this.lastSize.width, this.lastSize.height);
                            break;

                        case "power":
                            this.uniforms.get("power").value = value;
                            break;

                        case "color":
                            this.uniforms.get("color").value.copy(new Color(value));
                            break;

                        case "brightnessThreshold":
                            this.uniforms.get("brightnessThreshold").value = value;
                            break;

                        case "debugMode":
                            this.uniforms.get("debugMode").value = value;
                            break;

                        // 处理closeAutoUpdate变化
                        case "closeAutoUpdate":
                            // 不再需要处理enableEffect
                            break;

                        case "ignoreSelection":
                            // 更新Selection对象，但使用私有变量避免递归
                            this._ignoreSelection = value || new Selection();
                            break;

                        case "highlightValue":
                            // 更新高亮值
                            break;

                        // 降噪参数
                        case "iterations":
                        case "radius":
                        case "rings":
                        case "samples":
                            this.poissionDenoisePass[key] = value;
                            break;

                        case "lumaPhi":
                        case "depthPhi":
                        case "normalPhi":
                            this.poissionDenoisePass.fullscreenMaterial.uniforms[key].value = Math.max(value, 0.0001);
                            break;

                        case "useMultisampling":
                            // 切换多采样模式需要重新创建材质
                            if (value && !(this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial)) {
                                const oldMaterial = this.depthMaskMaterial;
                                this.depthMaskMaterial = new MultiSampleDepthMaskMaterial();
                                this.depthMaskMaterial.copyCameraSettings(this.camera);
                                this.depthMaskMaterial.depthBuffer0 = oldMaterial.uniforms.depthBuffer0.value;
                                this.depthMaskMaterial.depthPacking0 = Number(oldMaterial.defines.DEPTH_PACKING_0);
                                this.depthMaskMaterial.depthBuffer1 = oldMaterial.uniforms.depthBuffer1.value;
                                this.depthMaskMaterial.depthPacking1 = Number(oldMaterial.defines.DEPTH_PACKING_1);
                                this.depthMaskMaterial.depthMode = oldMaterial.depthMode;
                                this.depthMaskMaterial.epsilon = oldMaterial.epsilon;
                                this.depthMaskMaterial.samplingCount = this.samplingCount;
                                this.depthMaskMaterial.samplingRadius = this.samplingRadius;
                                this.depthMaskMaterial.samplingThreshold = this.samplingThreshold;

                                // 更新遮罩通道的材质
                                this.maskPass.fullscreenMaterial = this.depthMaskMaterial;
                            } else if (!value && this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial) {
                                const oldMaterial = this.depthMaskMaterial;
                                this.depthMaskMaterial = new DepthMaskMaterial();
                                this.depthMaskMaterial.copyCameraSettings(this.camera);
                                this.depthMaskMaterial.depthBuffer0 = oldMaterial.uniforms.depthBuffer0.value;
                                this.depthMaskMaterial.depthPacking0 = Number(oldMaterial.defines.DEPTH_PACKING_0);
                                this.depthMaskMaterial.depthBuffer1 = oldMaterial.uniforms.depthBuffer1.value;
                                this.depthMaskMaterial.depthPacking1 = Number(oldMaterial.defines.DEPTH_PACKING_1);
                                this.depthMaskMaterial.depthMode = oldMaterial.depthMode;
                                this.depthMaskMaterial.epsilon = oldMaterial.epsilon;

                                // 更新遮罩通道的材质
                                this.maskPass.fullscreenMaterial = this.depthMaskMaterial;
                            }
                            break;

                        case "samplingCount":
                            if (this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial) {
                                this.depthMaskMaterial.samplingCount = value;
                            }
                            break;

                        case "samplingRadius":
                            if (this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial) {
                                this.depthMaskMaterial.samplingRadius = value;
                            }
                            break;

                        case "samplingThreshold":
                            if (this.depthMaskMaterial instanceof MultiSampleDepthMaskMaterial) {
                                this.depthMaskMaterial.samplingThreshold = value;
                            }
                            break;

                        default:
                            if (key in this.aoPass.fullscreenMaterial.uniforms) {
                                this.aoPass.fullscreenMaterial.uniforms[key].value = value;
                            }
                    }
                },

                configurable: true
            });

            // 应用初始值
            this[key] = options[key];
        }
    }

    setSize(width, height) {
        if (width === undefined || height === undefined) return;

        if (width === this.lastSize.width && height === this.lastSize.height && this.resolutionScale === this.lastSize.resolutionScale) {
            return;
        }

        // 更新法线通道尺寸
        if (this.normalPass) {
            this.normalPass.setSize(width, height);
        }

        // 更新AO通道尺寸
        if (this.aoPass) {
            this.aoPass.setSize(width * this.resolutionScale, height * this.resolutionScale);
        }

        // 更新遮罩渲染目标尺寸
        if (this.renderTargetMask) {
            this.renderTargetMask.setSize(width * this.resolutionScale, height * this.resolutionScale);
        }

        // 更新模板可视化渲染目标尺寸
        if (this.stencilVisualizationTarget) {
            this.stencilVisualizationTarget.setSize(width, height);
        }

        // 更新降噪通道尺寸
        if (this.poissionDenoisePass) {
            try {
                this.poissionDenoisePass.setSize(width, height);
                if (!this.poissionDenoisePass.renderTarget) {
                    console.warn("调整大小后，PoissionDenoisePass的renderTarget仍然未定义");
                }
            } catch (error) {
                console.error("设置PoissionDenoisePass大小时出错:", error);
            }
        }

        // 更新渲染目标尺寸
        if (this.renderTargetAO) {
            this.renderTargetAO.setSize(width * this.resolutionScale, height * this.resolutionScale);
        }

        // 更新深度通道尺寸
        if (this.depthPass) {
            this.depthPass.setSize(width, height);
        }

        // 更新遮罩通道尺寸
        if (this.maskPass) {
            this.maskPass.setSize(width, height);
        }

        // 保存新尺寸
        this.lastSize = {
            width,
            height,
            resolutionScale: this.resolutionScale
        };
    }

    // 获取Selection中的对象
    getSelectionItems() {
        if (!this._ignoreSelection) return [];

        // 检查各种可能的访问方式
        if (Array.isArray(this._ignoreSelection.items)) {
            return this._ignoreSelection.items;
        }

        if (Array.isArray(this._ignoreSelection.objects)) {
            return this._ignoreSelection.objects;
        }

        if (typeof this._ignoreSelection.getItems === 'function') {
            return this._ignoreSelection.getItems();
        }

        if (typeof this._ignoreSelection.getSelection === 'function') {
            return this._ignoreSelection.getSelection();
        }

        // 如果Selection是一个可迭代对象
        if (typeof this._ignoreSelection[Symbol.iterator] === 'function') {
            return Array.from(this._ignoreSelection);
        }

        console.warn('无法确定Selection API的使用方式');
        return [];
    }

    // 准备场景，设置对象图层
    prepareScene() {
        // 存储原始材质和发光值
        this.originalMaterials = new Map();

        // 创建用于标记忽略对象的高亮材质（如果还未创建）
        if (!this.ignoreMaterial) {
            this.ignoreMaterial = {
                originalMaterialEnabled: true,
                emissive: new Color(1000, 1000, 1000) // 超亮颜色，便于在着色器中识别
            };
        }

        // 获取要忽略的对象列表
        const selectionItems = this.getSelectionItems();

        // 为忽略列表中的对象应用特殊材质或标记
        selectionItems.forEach(object => {
            if (object && object.isMesh) {
                // 保存原始材质
                this.originalMaterials.set(object.uuid, {
                    material: object.material,
                    emissive: object.material.emissive ? object.material.emissive.clone() : null
                });

                // 设置超高亮度，但保持原始材质外观
                if (Array.isArray(object.material)) {
                    // 处理多材质对象
                    object.material.forEach(mat => {
                        if (mat.emissive) {
                            // 临时保存原始发光值并设置极高亮度
                            mat._originalEmissive = mat.emissive.clone();
                            // 使用更高的值确保在所有情况下都被识别
                            mat.emissive.set(2000, 2000, 2000);
                        }
                    });
                } else if (object.material.emissive) {
                    // 单材质对象
                    object.material._originalEmissive = object.material.emissive.clone();
                    // 使用更高的值确保在所有情况下都被识别
                    object.material.emissive.set(2000, 2000, 2000);
                }
            }
        });
    }

    // 恢复场景原始状态
    restoreScene() {
        // 恢复原始材质
        if (this.originalMaterials) {
            for (const [uuid, data] of this.originalMaterials.entries()) {
                const object = this.scene.getObjectByProperty('uuid', uuid);
                if (object) {
                    // 恢复发光值
                    if (Array.isArray(object.material)) {
                        // 处理多材质对象
                        object.material.forEach(mat => {
                            if (mat._originalEmissive) {
                                mat.emissive.copy(mat._originalEmissive);
                                delete mat._originalEmissive;
                            }
                        });
                    } else if (object.material._originalEmissive) {
                        // 单材质对象
                        object.material.emissive.copy(object.material._originalEmissive);
                        delete object.material._originalEmissive;
                    }
                }
            }
            this.originalMaterials.clear();
        }
    }


    update(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {
        // 保存渲染器引用以便在beforeRender和afterRender中使用
        this.renderer = renderer;

        // 更新相机设置
        this.depthMaskMaterial.copyCameraSettings(this.camera);

        // 准备场景 - AO效果的输入设置
        if (!this.aoPass.fullscreenMaterial.uniforms.inputBuffer) {
            this.aoPass.fullscreenMaterial.uniforms.inputBuffer = {
                value: null
            }
        }
        this.aoPass.fullscreenMaterial.uniforms.inputBuffer.value = inputBuffer.texture;

        // 更新深度参数
        if (this.camera) {
            this.uniforms.get("depthNear").value = this.camera.near;
            this.uniforms.get("depthFar").value = this.camera.far;
        }

        // 执行渲染前回调
        this.options?.renderBefore?.(this.scene);

        // 检查是否使用TRAA动画噪声
        const hasTRAA = this.composer.passes.some(pass => {
            const effects = pass.effects;
            return pass.enabled && !pass.skipRendering &&
                effects && effects.some(effect => effect instanceof TRAAEffect);
        });

        // 设置动画噪声
        this.aoPass.fullscreenMaterial.needsUpdate = true;
        if (hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {
            this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
            this.aoPass.fullscreenMaterial.needsUpdate = true;
        } else if (!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {
            delete this.aoPass.fullscreenMaterial.defines.animatedNoise;
        }

        // 保存当前渲染目标以便恢复
        const currentRenderTarget = renderer.getRenderTarget();

        try {
            // 1. 清理所有渲染目标
            this.clearAllRenderTargets(renderer);

            // 2. 启用模板测试 - 使用辅助方法
            this.setStencilTestMode(renderer, this._inverted);

            // 如果处于模板调试模式，生成模板可视化纹理
            if (this.debugMode === 8 || this.debugMode === 9) {
                // 更新模板可视化纹理大小
                if (this.stencilVisualizationTarget) {
                    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
                    if (this.stencilVisualizationTarget.width !== size.width ||
                        this.stencilVisualizationTarget.height !== size.height) {
                        this.stencilVisualizationTarget.setSize(size.width, size.height);
                    }
                }

                // 捕获模板缓冲内容到纹理
                this.captureStencilBuffer(renderer);
            }

            // 3. 渲染AO效果
            renderer.setRenderTarget(this.aoPass.renderTarget);
            renderer.clear(true, true, true);
            this.aoPass.render(renderer);

            // 4. 对AO结果进行降噪
            renderer.setRenderTarget(this.poissionDenoisePass.renderTarget);
            this.poissionDenoisePass.render(renderer);

            // 5. 设置最终AO纹理
            this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
            this.uniforms.get("inputBuffer").value = inputBuffer.texture;

            // 6. 禁用模板测试
            this.disableStencilTest(renderer);

        } catch (error) {
            console.error("渲染AO效果时出错:", error);
        } finally {
            // 恢复原始渲染目标
            renderer.setRenderTarget(currentRenderTarget);
        }
    }

    // 清理所有渲染目标
    clearAllRenderTargets(renderer) {
        // 保存当前渲染目标
        const currentRenderTarget = renderer.getRenderTarget();

        try {
            // 清理所有已定义的渲染目标
            const targets = [
                this.renderTargetAO,
                this.renderTargetMask,
                this.stencilVisualizationTarget,
                this.aoPass?.renderTarget,
                this.poissionDenoisePass?.renderTarget
            ];

            // 遍历所有渲染目标并清理
            for (const target of targets) {
                if (target) {
                    renderer.setRenderTarget(target);
                    renderer.clear(true, true, true);
                }
            }
        } catch (error) {
            console.error("清理渲染目标时出错:", error);
        } finally {
            // 确保无论如何都恢复原来的渲染目标
            renderer.setRenderTarget(currentRenderTarget);
        }
    }

    /**
     * 初始化效果
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {Boolean} alpha - 是否有alpha通道
     * @param {Number} frameBufferType - 帧缓冲区类型
     */
    initialize(renderer, alpha, frameBufferType) {
        // 确保所有通道和材质正确初始化
        this.depthPass.initialize(renderer, alpha, frameBufferType);
        this.maskPass.initialize(renderer, alpha, frameBufferType);
        this.aoPass.initialize(renderer, alpha, frameBufferType);

        if (this.poissionDenoisePass) {
            this.poissionDenoisePass.initialize(renderer, alpha, frameBufferType);
        }

        // 检查渲染器是否支持对数深度缓冲
        if (renderer.capabilities.logarithmicDepthBuffer) {
            if (this.depthMaskMaterial) {
                this.depthMaskMaterial.defines.LOG_DEPTH = "1";
                this.depthMaskMaterial.needsUpdate = true;
            }
        }

        // 初始化模板可视化相关对象的大小
        if (this.stencilVisualizationTarget) {
            const size = renderer.getDrawingBufferSize(new THREE.Vector2());
            this.stencilVisualizationTarget.setSize(size.width, size.height);
        }

        // 确保渲染器启用了模板缓冲
        if (renderer.capabilities.stencil === false) {
            console.warn("渲染器不支持模板缓冲，选择性SSAO将无法正常工作");
        }
    }

    // 存储原始发光值的方法
    storeOriginalEmissive(object) {
        if (!this.originalEmissives.has(object.uuid)) {
            if (object.material) {
                if (object.material.emissive) {
                    this.originalEmissives.set(object.uuid, object.material.emissive.clone());
                } else if (Array.isArray(object.material)) {
                    const emissives = [];
                    object.material.forEach(mat => {
                        if (mat.emissive) {
                            emissives.push(mat.emissive.clone());
                        } else {
                            emissives.push(null);
                        }
                    });
                    this.originalEmissives.set(object.uuid, emissives);
                }
            }
        }
    }

    // 设置对象高亮的方法
    setObjectHighlight(object, highlight) {
        // 确保存储了原始发光值
        this.storeOriginalEmissive(object);

        if (object.material) {
            if (object.material.emissive) {
                if (highlight) {
                    object.material.emissive.set(
                        this.highlightValue,
                        this.highlightValue,
                        this.highlightValue
                    );
                } else {
                    const originalEmissive = this.originalEmissives.get(object.uuid);
                    if (originalEmissive) {
                        object.material.emissive.copy(originalEmissive);
                    }
                }
            } else if (Array.isArray(object.material)) {
                const originalEmissives = this.originalEmissives.get(object.uuid);
                object.material.forEach((mat, index) => {
                    if (mat.emissive) {
                        if (highlight) {
                            mat.emissive.set(
                                this.highlightValue,
                                this.highlightValue,
                                this.highlightValue
                            );
                        } else if (originalEmissives && originalEmissives[index]) {
                            mat.emissive.copy(originalEmissives[index]);
                        }
                    }
                });
            }
        }
    }

    // 添加一个对象到忽略列表
    addToIgnoreList(object) {
        if (!object) return;

        if (this._ignoreSelection && typeof this._ignoreSelection.add === 'function') {
            this._ignoreSelection.add(object);
            console.log(`已添加对象到AO忽略列表: ${object.name || object.uuid}`);

            // 标记需要更新
            this.setChanged();
        } else {
            console.warn('无法添加对象到忽略列表，Selection对象不可用');
        }
    }

    // 从忽略列表中移除对象
    removeFromIgnoreList(object) {
        if (!object) return;

        if (this._ignoreSelection && typeof this._ignoreSelection.delete === 'function') {
            this._ignoreSelection.delete(object);
            console.log(`已从AO忽略列表移除对象: ${object.name || object.uuid}`);

            // 标记需要更新
            this.setChanged();
        } else {
            console.warn('无法从忽略列表移除对象，Selection对象不可用');
        }
    }

    // 清空忽略列表
    clearIgnoreList() {
        if (this._ignoreSelection && typeof this._ignoreSelection.clear === 'function') {
            this._ignoreSelection.clear();
            console.log('已清空AO忽略列表');

            // 标记需要更新
            this.setChanged();
        } else {
            console.warn('无法清空忽略列表，Selection对象不可用');
        }
    }

    // 触发效果更新
    forceUpdate() {
        // 标记需要更新
        this.setChanged();

        // 如果在composer中，尝试触发一次渲染
        if (this.composer && typeof this.composer.render === 'function') {
            // 请求一次额外的渲染，清除残留色块
            requestAnimationFrame(() => {
                this.composer.render();
            });
        }
    }

    // 设置调试模式的方法
    setDebugMode(mode) {
        if (mode >= 0 && mode <= 9) {
            this.debugMode = mode;
            console.log(`AO调试模式已切换到: ${this.getDebugModeName(mode)}`);
        } else {
            console.warn(`无效的调试模式: ${mode}，有效范围: 0-9`);
        }
    }

    // 获取调试模式名称
    getDebugModeName(mode) {
        const modes = [
            "正常",
            "亮度",
            "AO强度",
            "AO值",
            "遮罩",
            "深度(灰度)",
            "深度(彩色)",
            "遮罩和深度对比",
            "模板缓冲",
            "模板叠加"
        ];
        return modes[mode] || "未知";
    }

    // 循环切换调试模式
    cycleDebugMode() {
        const newMode = (this.debugMode + 1) % 10; // 10是调试模式总数
        this.setDebugMode(newMode);
        return newMode;
    }

    // 显示所有调试模式
    listDebugModes() {
        console.log("可用的AO调试模式:");
        for (let i = 0; i < 10; i++) {
            console.log(`${i}: ${this.getDebugModeName(i)}`);
        }
    }

    /**
     * 指示遮罩是否应该反转（反转选择物体的AO效果）
     * 
     * @type {Boolean}
     */
    get inverted() {
        return this._inverted;
    }

    set inverted(value) {
        this._inverted = value;
        // 适用于模板测试时，不再需要修改depthMaskMaterial
        // 改变将在update方法中使用不同的模板测试函数实现
        // 保留下面的代码是为了兼容
        if (this.depthMaskMaterial) {
            this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;
        }
    }

    /**
     * 指示是否忽略背景（不对背景应用AO效果）
     * 
     * @type {Boolean}
     */
    get ignoreBackground() {
        return this._ignoreBackground;
    }

    set ignoreBackground(value) {
        this._ignoreBackground = value;
        this.depthMaskMaterial.maxDepthStrategy = value ?
            DepthTestStrategy.DISCARD_MAX_DEPTH :
            DepthTestStrategy.KEEP_MAX_DEPTH;
    }
    beforeRender() {
        if (!this.renderer) {
            this.renderer = this.composer.renderer;
        }

        if (!this.renderer || !this.scene || !this.camera) return;

        // 保存当前渲染状态
        this.currentStencilTest = this.renderer.state.buffers.stencil.test;

        // 清除模板缓冲
        this.renderer.clearStencil();

        // 获取选中对象
        const selectedObjects = this.getSelectionItems();

        // 保存原始模板设置
        this.originalStencilSettings = new Map();

        // 为选中对象设置模板写入
        selectedObjects.forEach(object => {
            this.setupStencilForObject(object);
        });

        console.log('已为SSAO设置模板缓冲，处理对象数量:', selectedObjects.length);
    }

    // 为对象设置模板写入
    setupStencilForObject(object) {
        if (!object) return;

        if (object.isMesh) {
            // 处理单个网格对象
            this.setupStencilForMaterial(object, object.material);
        } else if (object.children && object.children.length > 0) {
            // 递归处理子对象
            object.traverse(child => {
                if (child.isMesh) {
                    this.setupStencilForMaterial(child, child.material);
                }
            });
        }
    }

    // 为材质设置模板写入
    setupStencilForMaterial(object, material) {
        const materials = Array.isArray(material) ? material : [material];

        materials.forEach(mat => {
            if (!mat) return;

            // 保存原始设置
            this.originalStencilSettings.set(mat, {
                stencilWrite: mat.stencilWrite || false,
                stencilRef: mat.stencilRef || 0,
                stencilFunc: mat.stencilFunc || THREE.AlwaysStencilFunc,
                stencilFuncBack: mat.stencilFuncBack,
                stencilRefBack: mat.stencilRefBack,
                stencilFailBack: mat.stencilFailBack,
                stencilZFailBack: mat.stencilZFailBack,
                stencilZPassBack: mat.stencilZPassBack,
                stencilWriteMask: mat.stencilWriteMask,
                stencilFail: mat.stencilFail,
                stencilZFail: mat.stencilZFail,
                stencilZPass: mat.stencilZPass
            });

            // 设置模板写入
            mat.stencilWrite = true;
            mat.stencilRef = 1;  // 用1标记选中对象
            mat.stencilFunc = THREE.AlwaysStencilFunc;
            mat.stencilZPass = THREE.ReplaceStencilOp;
        });
    }

    afterRender() {
        // 恢复所有材质的原始模板设置
        if (this.originalStencilSettings) {
            for (const [material, settings] of this.originalStencilSettings.entries()) {
                // 恢复所有保存的属性
                Object.assign(material, settings);
            }
            this.originalStencilSettings.clear();
        }

        // 恢复渲染器的模板测试状态
        if (this.renderer && this.currentStencilTest !== undefined) {
            this.renderer.state.buffers.stencil.setTest(this.currentStencilTest);
        }

        console.log('已恢复SSAO的原始模板设置');
    }

    // 辅助方法，设置模板测试
    setStencilTestMode(renderer, inverted = false) {
        if (!renderer) return;

        renderer.state.buffers.stencil.setTest(true);
        renderer.state.buffers.stencil.setFunc(
            inverted ? THREE.NotEqualStencilFunc : THREE.EqualStencilFunc,
            1,  // 引用值
            0xff  // 掩码
        );
        renderer.state.buffers.stencil.setOp(
            THREE.KeepStencilOp,
            THREE.KeepStencilOp,
            THREE.KeepStencilOp
        );
    }

    // 辅助方法，禁用模板测试
    disableStencilTest(renderer) {
        if (!renderer) return;

        renderer.state.buffers.stencil.setTest(false);
    }

    // 将模板缓冲内容捕获到纹理中用于调试
    captureStencilBuffer(renderer) {
        if (!this.stencilVisualizationTarget || !renderer) return;

        // 保存当前状态
        const currentRenderTarget = renderer.getRenderTarget();
        const currentAutoClear = renderer.autoClear;
        const currentClearColor = renderer.getClearColor(new THREE.Color());
        const currentClearAlpha = renderer.getClearAlpha();
        const currentStencilTest = renderer.state.buffers.stencil.test;

        try {
            // 创建一个特殊的材质，用于可视化模板缓冲
            if (!this.stencilCaptureMaterial) {
                this.stencilCaptureMaterial = new THREE.ShaderMaterial({
                    uniforms: {
                        stencilRef: { value: 1 },  // 我们标记的参考值
                        inputBuffer: { value: null } // 用于混合场景颜色
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform float stencilRef;
                        uniform sampler2D inputBuffer;
                        varying vec2 vUv;
                        void main() {
                            // 读取原始场景颜色用于混合
                            vec4 sceneColor = texture2D(inputBuffer, vUv);
                            
                            // 亮红色表示模板值为1的区域
                            vec3 highlightColor = vec3(1.0, 0.2, 0.2);
                            
                            // 设置一定透明度让场景内容部分可见
                            gl_FragColor = vec4(highlightColor, 0.7);
                        }
                    `,
                    stencilWrite: false, // 我们只读取模板，不写入
                    colorWrite: true,
                    transparent: true,
                    depthTest: false,
                    depthWrite: false
                });

                // 创建一个全屏四边形
                this.stencilCaptureMesh = new THREE.Mesh(
                    new THREE.PlaneGeometry(2, 2),
                    this.stencilCaptureMaterial
                );

                // 创建一个简单的场景和相机
                this.stencilCaptureScene = new THREE.Scene();
                this.stencilCaptureCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
                this.stencilCaptureScene.add(this.stencilCaptureMesh);
            }

            // 更新材质中的输入缓冲
            this.stencilCaptureMaterial.uniforms.inputBuffer.value = this.composer.inputBuffer.texture;

            // 先清除可视化目标
            renderer.setRenderTarget(this.stencilVisualizationTarget);
            renderer.setClearColor(0x000000, 0);  // 黑色透明背景
            renderer.clear(true, true, true);

            // 禁用模板测试 - 先绘制背景
            renderer.state.buffers.stencil.setTest(false);
            // 绘制背景 - 使用原始场景颜色
            const backgroundMaterial = new THREE.MeshBasicMaterial({
                map: this.composer.inputBuffer.texture,
                depthTest: false
            });
            const tempMesh = this.stencilCaptureMesh.clone();
            tempMesh.material = backgroundMaterial;
            renderer.render(tempMesh, this.stencilCaptureCamera);

            // 启用模板测试 - 然后只在模板区域绘制高亮色
            renderer.state.buffers.stencil.setTest(true);
            renderer.state.buffers.stencil.setFunc(
                THREE.EqualStencilFunc,
                1,   // 查找模板值为1的区域
                0xFF // 完整掩码
            );

            // 渲染到纹理 - 只在模板值等于1的区域绘制
            renderer.render(this.stencilCaptureScene, this.stencilCaptureCamera);

            // 获取纹理结果
            const stencilTexture = this.stencilVisualizationTarget.texture;

            // 更新着色器中的maskTexture
            if (this.debugMode === 8 || this.debugMode === 9) {
                this.uniforms.get("maskTexture").value = stencilTexture;
            }

        } catch (error) {
            console.error("捕获模板缓冲时出错:", error);
        } finally {
            // 恢复原始状态
            renderer.setRenderTarget(currentRenderTarget);
            renderer.state.buffers.stencil.setTest(currentStencilTest);
            renderer.autoClear = currentAutoClear;
            renderer.setClearColor(currentClearColor, currentClearAlpha);
        }
    }
}