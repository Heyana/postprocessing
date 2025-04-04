import { Effect, Selection, NormalPass, RenderPass, ClearPass } from "postprocessing"
import { Color, Uniform, Layers, WebGLRenderTarget, LinearFilter, HalfFloatType, NoBlending, DepthTexture } from "three"
import { TRAAEffect } from '../../index'
import ao_compose from './shader/ao_compose.frag'
import passthrough from './shader/passthrough.frag'

import { PoissionDenoisePass } from '../pass/PoissionDenoisePass'
const defaultAOOptions = {
    resolutionScale: 1,
    spp: 8,
    distance: 2,
    distancePower: 1,
    power: 2,
    bias: 40,
    thickness: 0.075,
    color: new Color("black"),
    brightnessThreshold: 0.7,
    ignoreSelection: null,
    highlightValue: 0.8,
    closeAutoUpdate: false,
    useNormalPass: false,
    velocityDepthNormalPass: null,
    normalTexture: null,
    renderBefore: () => {
    },
    ...PoissionDenoisePass.DefaultOptions
};

export class AOEffect extends Effect {
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
                ["depthTexture", new Uniform(null)],
                ["power", new Uniform(0)],
                ["color", new Uniform(new Color("black"))],
                ["brightnessThreshold", new Uniform(0.7)]
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

        // 添加调试模式支持
        this._debugMode = "normal"; // normal, depth, ao, selection

        // 初始化Selection对象并分配专用图层
        this._ignoreSelection = options.ignoreSelection || new Selection();
        this._aoLayer = options.aoLayer || 20; // 为AO计算使用专用图层

        // 为Selection指定图层
        if (this._ignoreSelection.layer === undefined) {
            this._ignoreSelection.layer = this._aoLayer;
        }

        // 创建专用于AO的渲染目标
        this.createRenderTargets();

        // 创建渲染通道
        this.renderPass = new RenderPass(scene, camera);
        this.renderPass.clear = true;

        // 清除通道，用于在不同渲染步骤间清除
        this.clearPass = new ClearPass(true, false, false);

        // 存储原始发光值的映射
        this.originalEmissives = new Map();

        // 存储对象的原始图层设置
        this.originalLayers = new Map();

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

            // 为降噪通道添加对全场景深度的支持
            if (this.poissionDenoisePass.fullscreenMaterial && this.poissionDenoisePass.fullscreenMaterial.uniforms) {
                // 预先添加全场景深度纹理的uniform，后续会更新它的值
                this.poissionDenoisePass.fullscreenMaterial.uniforms.fullSceneDepthTexture = { value: null };

                // 添加相关的定义标记
                if (!("USE_FULL_SCENE_DEPTH" in this.poissionDenoisePass.fullscreenMaterial.defines)) {
                    this.poissionDenoisePass.fullscreenMaterial.defines.USE_FULL_SCENE_DEPTH = "";
                    this.poissionDenoisePass.fullscreenMaterial.needsUpdate = true;
                }
            }
        } else {
            console.error("降噪通道(PoissionDenoisePass)创建失败");
        }

        // 使选项响应式
        this.makeOptionsReactive(options);

        // 初始化选择对象图层
        this.initializeSelectionLayer();

        // 创建全场景深度渲染目标 - 用于确保忽略的对象仍然有深度信息
        this.createFullSceneDepthTarget();
    }

    // 添加调试模式的getter和setter
    get debugMode() {
        return this._debugMode;
    }

    set debugMode(value) {
        if (["normal", "depth", "ao", "selection", "full-depth"].includes(value)) {
            this._debugMode = value;
            console.log(`切换到AO调试模式: ${value}`);
        } else {
            console.warn(`无效的调试模式: ${value}，有效值为: normal, depth, ao, selection, full-depth`);
        }
    }

    // 创建全场景深度渲染目标
    createFullSceneDepthTarget() {
        // 创建一个专门用于渲染全场景深度的渲染目标
        this.renderTargetFullScene = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: true,
            depthTexture: new DepthTexture()
        });
        this.renderTargetFullScene.texture.name = "AO.FullScene";
        this.renderTargetFullScene.depthTexture.name = "AO.FullScene.Depth";

        // 创建一个用于全场景渲染的渲染通道
        this.fullSceneRenderPass = new RenderPass(this.scene, this.camera);
        this.fullSceneRenderPass.clear = true;
    }

    // 初始化Selection图层，确保正确的图层分配
    initializeSelectionLayer() {
        if (!this._ignoreSelection) return;

        // 确保Selection有正确的图层
        if (typeof this._ignoreSelection.setLayer === 'function') {
            this._ignoreSelection.setLayer(this._aoLayer);
        } else {
            this._ignoreSelection.layer = this._aoLayer;
        }

        // 确保Selection有正确的方法
        if (!this._ignoreSelection.add && typeof this._ignoreSelection.add !== 'function') {
            console.warn('Selection对象缺少add方法，可能无法正常添加对象');
        }

        // 打印一些调试信息
        const itemCount = this.getSelectionItems().length;
        console.log(`AO图层初始化: 图层=${this._aoLayer}, 选择项数量=${itemCount}`);

        // 如果选择为空，打印警告
        if (itemCount === 0) {
            console.warn('Selection为空，所有物体都将参与AO计算');
        }
    }

    // 创建渲染目标
    createRenderTargets() {
        // 创建AO专用渲染目标，确保包含深度纹理
        this.renderTargetAO = new WebGLRenderTarget(1, 1, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: true,
            depthTexture: new DepthTexture() // 关键：添加深度纹理
        });
        this.renderTargetAO.texture.name = "AO.Target";
        this.renderTargetAO.depthTexture.name = "AO.Depth";
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

                        // 处理closeAutoUpdate变化
                        case "closeAutoUpdate":
                            // 不再需要处理enableEffect
                            break;

                        case "ignoreSelection":
                            // 更新Selection对象，但使用私有变量避免递归
                            this._ignoreSelection = value || new Selection();
                            // 确保selection使用正确的图层
                            this._ignoreSelection.layer = this._aoLayer;
                            break;

                        case "aoLayer":
                            this._aoLayer = value;
                            if (this._ignoreSelection) {
                                this._ignoreSelection.layer = value;
                            }
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

        // 更新降噪通道尺寸
        if (this.poissionDenoisePass) {
            try {
                this.poissionDenoisePass.setSize(width, height);
                // 检查是否成功创建了renderTarget
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

        // 更新全场景渲染目标尺寸
        if (this.renderTargetFullScene) {
            this.renderTargetFullScene.setSize(width, height);
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
        // 记录包含的和排除的对象数量，用于调试
        let includedCount = 0;
        let excludedCount = 0;

        // 保存当前图层状态
        this.scene.traverse(object => {
            if (object.isMesh) {
                // 保存原始图层
                this.originalLayers.set(object.uuid, object.layers.mask);

                // 默认所有对象都参与AO计算
                object.layers.enable(this._aoLayer);
                includedCount++;
            }
        });

        // 从AO图层中排除ignoreSelection中的对象
        if (this._ignoreSelection) {
            const selectionItems = this.getSelectionItems();

            selectionItems.forEach(object => {
                if (object && object.isMesh) {
                    // 注意这里将对象从AO图层中移除
                    if (object.layers.isEnabled(this._aoLayer)) {
                        object.layers.disable(this._aoLayer);
                        excludedCount++;
                    }
                }
            });
        }

        console.log(`预处理场景: 纳入AO计算=${includedCount}个对象, 排除=${excludedCount}个对象`);
    }

    // 恢复场景原始状态
    restoreScene() {
        let restoredCount = 0;

        this.scene.traverse(object => {
            if (object.isMesh && this.originalLayers.has(object.uuid)) {
                // 恢复原始图层设置
                object.layers.mask = this.originalLayers.get(object.uuid);
                restoredCount++;
            }
        });

        console.log(`恢复场景: 已恢复${restoredCount}个对象的图层设置`);

        // 清除存储的图层信息
        this.originalLayers.clear();
    }

    update(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {
        // 保存当前渲染目标和camera状态
        const currentRenderTarget = renderer.getRenderTarget();
        const originalCameraLayers = this.camera.layers.mask;

        // 执行渲染前回调
        this.options?.renderBefore?.(this.scene);

        // 强制清理所有渲染目标
        this.clearAllRenderTargets(renderer);

        // 1. 首先渲染全场景（包括忽略的对象）的深度，用于后续深度比较
        // 确保我们有完整的深度缓冲区包含所有对象
        this.camera.layers.set(1); // 使用默认图层1，包含所有对象
        renderer.setRenderTarget(this.renderTargetFullScene);
        renderer.clear(true, true, true);
        this.fullSceneRenderPass.render(renderer, this.renderTargetFullScene, this.renderTargetFullScene, deltaTime, false);
        const fullSceneDepthTexture = this.renderTargetFullScene.depthTexture;

        // 2. 准备场景，排除被忽略的对象
        this.prepareScene();

        // 打印Selection内容进行调试
        const selectionItems = this.getSelectionItems();
        console.log(`AOEffect过滤: 图层=${this._aoLayer}, 过滤对象数量=${selectionItems.length}`,
            selectionItems.length > 0 ? selectionItems[0] : "无对象");

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

        // 渲染法线通道（如果有）
        if (this.normalPass) {
            this.normalPass.render(renderer);
        }

        // 设置相机只渲染AO图层的对象
        this.camera.layers.set(this._aoLayer);

        // 3. 渲染筛选后的场景到专用深度缓冲区（只包含参与AO计算的模型）
        renderer.setRenderTarget(this.renderTargetAO);
        renderer.clear(true, true, true);
        this.clearPass.render(renderer, this.renderTargetAO);
        this.renderPass.render(renderer, this.renderTargetAO, this.renderTargetAO, deltaTime, false);

        // 获取筛选后的深度纹理
        const filteredDepthTexture = this.renderTargetAO.depthTexture;

        // 恢复相机图层设置
        this.camera.layers.mask = originalCameraLayers;

        // 恢复场景原始状态
        this.restoreScene();

        // 4. 设置着色器uniforms，使用两种深度纹理进行AO计算
        if (filteredDepthTexture && fullSceneDepthTexture) {
            console.log("使用过滤深度纹理和全场景深度纹理");
            // 主要深度纹理用于AO计算
            this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = filteredDepthTexture;

            // 添加全场景深度纹理用于修正被忽略对象上的AO效果
            if (!this.aoPass.fullscreenMaterial.uniforms.fullSceneDepthTexture) {
                this.aoPass.fullscreenMaterial.uniforms.fullSceneDepthTexture = { value: fullSceneDepthTexture };

                // 添加使用全场景深度的标志
                if (!("USE_FULL_SCENE_DEPTH" in this.aoPass.fullscreenMaterial.defines)) {
                    this.aoPass.fullscreenMaterial.defines.USE_FULL_SCENE_DEPTH = "";
                    this.aoPass.fullscreenMaterial.needsUpdate = true;
                }
            } else {
                this.aoPass.fullscreenMaterial.uniforms.fullSceneDepthTexture.value = fullSceneDepthTexture;
            }

            // 同时为降噪通道设置全场景深度纹理
            if (this.poissionDenoisePass &&
                this.poissionDenoisePass.fullscreenMaterial &&
                this.poissionDenoisePass.fullscreenMaterial.uniforms) {

                // 更新降噪通道的深度纹理 - 使用过滤后的深度纹理
                this.poissionDenoisePass.fullscreenMaterial.uniforms.depthTexture.value = filteredDepthTexture;

                // 更新全场景深度纹理
                if (this.poissionDenoisePass.fullscreenMaterial.uniforms.fullSceneDepthTexture) {
                    this.poissionDenoisePass.fullscreenMaterial.uniforms.fullSceneDepthTexture.value = fullSceneDepthTexture;
                }
            }
        } else {
            console.warn("未能获取必要的深度纹理，回退到全局深度纹理");
            this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = this.composer.depthTexture;
        }

        // 5. 渲染AO效果
        renderer.setRenderTarget(this.aoPass.renderTarget);
        renderer.clear(true, true, true);
        this.aoPass.render(renderer);

        // 6. 应用降噪
        this.poissionDenoisePass.render(renderer);

        // 7. 设置最终纹理
        // 根据调试模式选择要显示的纹理
        if (this._debugMode === "normal") {
            // 正常模式 - 显示完整的AO效果
            if (this.iterations > 0 && this.poissionDenoisePass && this.poissionDenoisePass.texture) {
                this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
            } else {
                this.uniforms.get("inputTexture").value = this.aoPass.texture;
            }
        } else if (this._debugMode === "depth") {
            // 深度模式 - 显示过滤后的深度纹理
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
            if (!("DEBUG_DEPTH" in this.defines)) {
                this.defines.DEBUG_DEPTH = "";
                this.needsUpdate = true;
            }
        } else if (this._debugMode === "ao") {
            // AO模式 - 只显示AO通道
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
            if (!("DEBUG_AO" in this.defines)) {
                this.defines.DEBUG_AO = "";
                this.needsUpdate = true;
            }
        } else if (this._debugMode === "selection") {
            // 选择模式 - 显示哪些对象被选中（忽略的对象）
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
            if (!("DEBUG_SELECTION" in this.defines)) {
                this.defines.DEBUG_SELECTION = "";
                this.needsUpdate = true;
            }
        } else if (this._debugMode === "full-depth") {
            // 全深度模式 - 显示包含所有对象的深度纹理
            this.uniforms.get("depthTexture").value = fullSceneDepthTexture;
            if (!("DEBUG_FULL_DEPTH" in this.defines)) {
                this.defines.DEBUG_FULL_DEPTH = "";
                this.needsUpdate = true;
            }
        }

        // 恢复原始渲染目标
        renderer.setRenderTarget(currentRenderTarget);
    }

    // 清理所有渲染目标
    clearAllRenderTargets(renderer) {
        // 保存当前渲染目标
        const currentRenderTarget = renderer.getRenderTarget();

        // 清理AO专用渲染目标
        if (this.renderTargetAO) {
            renderer.setRenderTarget(this.renderTargetAO);
            renderer.clear(true, true, true);
        }

        // 清理AO通道渲染目标
        if (this.aoPass && this.aoPass.renderTarget) {
            renderer.setRenderTarget(this.aoPass.renderTarget);
            renderer.clear(true, true, true);
        }

        // 清理降噪通道渲染目标
        if (this.poissionDenoisePass && this.poissionDenoisePass.renderTarget) {
            renderer.setRenderTarget(this.poissionDenoisePass.renderTarget);
            renderer.clear(true, true, true);
        } else if (this.poissionDenoisePass) {
            console.warn("PoissionDenoisePass的renderTarget未定义，无法清理");

            // 尝试创建renderTarget，如果可能的话
            if (typeof this.poissionDenoisePass.setSize === 'function' &&
                this.lastSize && this.lastSize.width && this.lastSize.height) {
                console.info("尝试重新创建PoissionDenoisePass的renderTarget");
                this.poissionDenoisePass.setSize(this.lastSize.width, this.lastSize.height);
            }
        }

        // 清理全场景深度渲染目标
        if (this.renderTargetFullScene) {
            renderer.setRenderTarget(this.renderTargetFullScene);
            renderer.clear(true, true, true);
        }

        // 恢复原来的渲染目标
        renderer.setRenderTarget(currentRenderTarget);
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
}