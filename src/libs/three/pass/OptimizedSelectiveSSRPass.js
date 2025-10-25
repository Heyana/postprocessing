import {
    AddEquation,
    Color,
    NormalBlending,
    DepthTexture,
    SrcAlphaFactor,
    OneMinusSrcAlphaFactor,
    MeshNormalMaterial,
    MeshBasicMaterial,
    NearestFilter,
    LinearFilter,
    NoBlending,
    ShaderMaterial,
    UniformsUtils,
    UnsignedShortType,
    WebGLRenderTarget,
    HalfFloatType,
    RGBADepthPacking,
    BasicDepthPacking,
    EqualDepth,
    NotEqualDepth,
    Layers,
    Uniform,
    Vector2
} from "three";
import { Pass, FullScreenQuad } from "./Pass.js";
import { SSRShader, SSRBlurShader, SSRDepthShader } from "../shaders/SelectiveSSRShader.js";
import { CopyShader } from "../shaders/CopyShader.js";
import { Selection } from "postprocessing";
import { DepthMaskMaterial, DepthPass, ShaderPass } from "postprocessing";
import { renderUtils } from "../../../utils/RenderUtils.js";
import { DepthTestStrategy } from "postprocessing";

/**
 * 优化版选择性屏幕空间反射Pass
 * 
 * 主要优化：
 * 1. 分辨率分层控制 - 支持0.5x等不同分辨率
 * 2. 选择性renderOverride - 减少不必要的场景遍历
 * 3. 材质缓存机制 - 避免重复计算
 * 4. 智能渲染目标管理
 */
class OptimizedSelectiveSSRPass extends Pass {

    constructor({ renderer, scene, camera, width, height, selection, bouncing = false, groundReflector, composer }) {

        super();

        this.width = (width !== undefined) ? width : 512;
        this.height = (height !== undefined) ? height : 512;

        this.clear = true;

        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.composer = composer;
        this.groundReflector = groundReflector;

        // ==== 新增：分辨率控制 ====

        /**
         * SSR分辨率缩放比例
         * @type {Number}
         */
        this._ssrResolutionScale = 0.5; // 默认0.5倍分辨率

        /**
         * 是否启用智能分辨率调节
         * @type {Boolean}
         */
        this.adaptiveResolution = true;

        /**
         * 目标帧率（用于自适应分辨率）
         * @type {Number}
         */
        this.targetFPS = 60;

        /**
         * 帧率采样窗口
         * @type {Array<Number>}
         */
        this.fpsHistory = [];
        this.fpsHistorySize = 10;

        // ==== 新增：缓存机制 ====

        /**
         * 法线纹理缓存标志
         * @type {Boolean}
         */
        this.normalTextureDirty = true;

        /**
         * 选择状态哈希（用于检测变化）
         * @type {String}
         */
        this.selectionHash = '';

        /**
         * 场景变化标志
         * @type {Boolean}
         */
        this.sceneChanged = true;

        // 继承原有属性
        this.opacity = SSRShader.uniforms.opacity.value;
        this.output = 0;
        this.maxDistance = SSRShader.uniforms.maxDistance.value;
        this.thickness = SSRShader.uniforms.thickness.value;
        this.reflectionStrength = SSRShader.uniforms.reflectionStrength.value;
        this.tempColor = new Color();

        // 外部深度纹理支持
        this.externalDepthTexture = null;
        this.useExternalDepth = false;

        // 选择系统
        this._selection = selection || new Selection();
        this.selective = true;

        // Bouncing属性
        this._bouncing = bouncing;
        Object.defineProperty(this, "bouncing", {
            get() { return this._bouncing; },
            set(val) { this.setBouncing(val); }
        });

        this.blur = true;

        // 距离衰减
        this._distanceAttenuation = SSRShader.defines.DISTANCE_ATTENUATION;
        Object.defineProperty(this, "distanceAttenuation", {
            get() { return this._distanceAttenuation; },
            set(val) {
                if (this._distanceAttenuation === val) { return; }
                this._distanceAttenuation = val;
                this.ssrMaterial.defines.DISTANCE_ATTENUATION = val;
                this.ssrMaterial.needsUpdate = true;
            }
        });

        // 菲涅尔效应
        this._fresnel = SSRShader.defines.FRESNEL;
        Object.defineProperty(this, "fresnel", {
            get() { return this._fresnel; },
            set(val) {
                if (this._fresnel === val) { return; }
                this._fresnel = val;
                this.ssrMaterial.defines.FRESNEL = val;
                this.ssrMaterial.needsUpdate = true;
            }
        });

        // 无限厚度
        this._infiniteThick = SSRShader.defines.INFINITE_THICK;
        Object.defineProperty(this, "infiniteThick", {
            get() { return this._infiniteThick; },
            set(val) {
                if (this._infiniteThick === val) { return; }
                this._infiniteThick = val;
                this.ssrMaterial.defines.INFINITE_THICK = val;
                this.ssrMaterial.needsUpdate = true;
            }
        });

        // 反射强度
        this._reflectionStrength = SSRShader.uniforms.reflectionStrength.value;
        Object.defineProperty(this, "reflectionStrength", {
            get() { return this._reflectionStrength; },
            set(val) {
                if (this._reflectionStrength === val) { return; }
                this._reflectionStrength = val;
                if (this.ssrMaterial) {
                    this.ssrMaterial.uniforms.reflectionStrength.value = val;
                }
            }
        });

        // 分辨率缩放属性
        Object.defineProperty(this, "ssrResolutionScale", {
            get() { return this._ssrResolutionScale; },
            set(val) {
                if (val <= 0 || val > 1) {
                    console.warn("SSR分辨率缩放比例必须在0-1之间");
                    return;
                }
                if (this._ssrResolutionScale !== val) {
                    this._ssrResolutionScale = val;
                    this._updateSSRResolution();
                }
            }
        });

        // 初始化渲染目标
        this._initializeRenderTargets();
        this._initializeMaterials();
    }

    /**
     * 初始化渲染目标
     * @private
     */
    _initializeRenderTargets() {

        // 计算SSR渲染分辨率
        const ssrWidth = Math.max(1, Math.round(this.width * this._ssrResolutionScale));
        const ssrHeight = Math.max(1, Math.round(this.height * this._ssrResolutionScale));

        // 深度纹理（全分辨率）
        const depthTexture = new DepthTexture();
        depthTexture.type = UnsignedShortType;
        depthTexture.minFilter = NearestFilter;
        depthTexture.magFilter = NearestFilter;

        // beauty render target（SSR分辨率）
        this.beautyRenderTarget = new WebGLRenderTarget(ssrWidth, ssrHeight, {
            minFilter: LinearFilter, // 使用线性过滤以支持上采样
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthTexture: depthTexture,
            depthBuffer: true
        });

        // 用于bouncing的渲染目标（SSR分辨率）
        this.prevRenderTarget = new WebGLRenderTarget(ssrWidth, ssrHeight, {
            minFilter: LinearFilter,
            magFilter: LinearFilter
        });

        // 法线渲染目标（SSR分辨率）
        this.normalRenderTarget = new WebGLRenderTarget(ssrWidth, ssrHeight, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType
        });

        // 金属度渲染目标（SSR分辨率）
        this.metalnessRenderTarget = new WebGLRenderTarget(ssrWidth, ssrHeight, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType
        });

        // SSR渲染目标（SSR分辨率）
        this.ssrRenderTarget = new WebGLRenderTarget(ssrWidth, ssrHeight, {
            minFilter: LinearFilter,
            magFilter: LinearFilter
        });

        // 模糊渲染目标（SSR分辨率）
        this.blurRenderTarget = this.ssrRenderTarget.clone();
        this.blurRenderTarget2 = this.ssrRenderTarget.clone();

        // 遮罩渲染目标（全分辨率 - 保持精度）
        this.renderTargetMask = new WebGLRenderTarget(this.width, this.height, {
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            type: HalfFloatType,
            depthBuffer: true
        });
        this.renderTargetMask.texture.name = "SSR.Mask";

        // 上采样渲染目标（全分辨率）
        this.upsampleRenderTarget = new WebGLRenderTarget(this.width, this.height, {
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType
        });

        console.log(`OptimizedSSRPass: 创建渲染目标 - SSR分辨率: ${ssrWidth}x${ssrHeight}, 全分辨率: ${this.width}x${this.height}`);
    }

    /**
     * 初始化材质
     * @private
     */
    _initializeMaterials() {

        const ssrWidth = Math.max(1, Math.round(this.width * this._ssrResolutionScale));
        const ssrHeight = Math.max(1, Math.round(this.height * this._ssrResolutionScale));

        // SSR材质
        this.ssrMaterial = new ShaderMaterial({
            defines: Object.assign({}, SSRShader.defines, {
                MAX_STEP: Math.sqrt(ssrWidth * ssrWidth + ssrHeight * ssrHeight)
            }),
            uniforms: UniformsUtils.clone(SSRShader.uniforms),
            vertexShader: SSRShader.vertexShader,
            fragmentShader: SSRShader.fragmentShader,
            blending: NoBlending
        });

        if (!this.composer.depthTexture) {
            this.composer.createDepthTexture();
        }
        this.ssrMaterial.uniforms.depthTexture = new Uniform(this.composer.depthTexture);

        this.ssrMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
        this.ssrMaterial.uniforms.tNormal.value = this.normalRenderTarget.texture;
        this.ssrMaterial.defines.SELECTIVE = this.selective;
        this.ssrMaterial.needsUpdate = true;
        this.ssrMaterial.uniforms.tMetalness.value = this.metalnessRenderTarget.texture;
        this.ssrMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;
        this.ssrMaterial.uniforms.cameraNear.value = this.camera.near;
        this.ssrMaterial.uniforms.cameraFar.value = this.camera.far;
        this.ssrMaterial.uniforms.thickness.value = this.thickness;
        this.ssrMaterial.uniforms.resolution.value.set(ssrWidth, ssrHeight);
        this.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
        this.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.camera.projectionMatrixInverse);
        this.ssrMaterial.uniforms.reflectionStrength.value = this.reflectionStrength;

        // 深度通道
        this.depthPass = new DepthPass(this.scene, this.camera);

        // 深度遮罩材质
        this.depthMaskMaterial = new DepthMaskMaterial();
        this.depthMaskMaterial.copyCameraSettings(this.camera);
        this.depthMaskMaterial.depthBuffer0 = this.composer.depthTexture;
        this.depthMaskMaterial.depthPacking0 = BasicDepthPacking;
        this.depthMaskMaterial.depthBuffer1 = this.depthPass.texture;
        this.depthMaskMaterial.depthPacking1 = RGBADepthPacking;
        this.depthMaskMaterial.depthMode = EqualDepth;
        this.depthMaskMaterial.epsilon = 0.000009;

        // 遮罩通道
        this.maskPass = new ShaderPass(this.depthMaskMaterial);
        this.maskPass.clear = true;

        // 反转遮罩和忽略背景选项
        this._inverted = false;
        this._ignoreBackground = false;

        // 法线材质
        this.normalMaterial = new MeshNormalMaterial();
        this.normalMaterial.blending = NoBlending;

        // 金属度材质
        this.metalnessOnMaterial = new MeshBasicMaterial({ color: "white" });
        this.metalnessOffMaterial = new MeshBasicMaterial({ color: "black" });

        // 模糊材质
        this.blurMaterial = new ShaderMaterial({
            defines: Object.assign({}, SSRBlurShader.defines),
            uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
            vertexShader: SSRBlurShader.vertexShader,
            fragmentShader: SSRBlurShader.fragmentShader
        });
        this.blurMaterial.uniforms.tDiffuse.value = this.ssrRenderTarget.texture;
        this.blurMaterial.uniforms.resolution.value.set(ssrWidth, ssrHeight);

        this.blurMaterial2 = new ShaderMaterial({
            defines: Object.assign({}, SSRBlurShader.defines),
            uniforms: UniformsUtils.clone(SSRBlurShader.uniforms),
            vertexShader: SSRBlurShader.vertexShader,
            fragmentShader: SSRBlurShader.fragmentShader
        });
        this.blurMaterial2.uniforms.tDiffuse.value = this.blurRenderTarget.texture;
        this.blurMaterial2.uniforms.resolution.value.set(ssrWidth, ssrHeight);

        // 深度渲染材质
        this.depthRenderMaterial = new ShaderMaterial({
            defines: Object.assign({}, SSRDepthShader.defines),
            uniforms: UniformsUtils.clone(SSRDepthShader.uniforms),
            vertexShader: SSRDepthShader.vertexShader,
            fragmentShader: SSRDepthShader.fragmentShader,
            blending: NoBlending
        });
        this.depthRenderMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;
        this.depthRenderMaterial.uniforms.cameraNear.value = this.camera.near;
        this.depthRenderMaterial.uniforms.cameraFar.value = this.camera.far;

        // 拷贝材质
        this.copyMaterial = new ShaderMaterial({
            uniforms: UniformsUtils.clone(CopyShader.uniforms),
            vertexShader: CopyShader.vertexShader,
            fragmentShader: CopyShader.fragmentShader,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blendSrc: SrcAlphaFactor,
            blendDst: OneMinusSrcAlphaFactor,
            blendEquation: AddEquation,
            blendSrcAlpha: SrcAlphaFactor,
            blendDstAlpha: OneMinusSrcAlphaFactor,
            blendEquationAlpha: AddEquation
        });

        // 上采样材质（简单的双线性插值）
        this.upsampleMaterial = new ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new Vector2() },
                targetResolution: { value: new Vector2() }
            },
            vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
				}
			`,
            fragmentShader: `
				uniform sampler2D tDiffuse;
				uniform vec2 resolution;
				uniform vec2 targetResolution;
				varying vec2 vUv;

				void main() {
					// 高质量双线性上采样
					vec2 texelSize = 1.0 / resolution;
					vec2 targetTexelSize = 1.0 / targetResolution;
					
					// 使用更平滑的插值
					vec4 color = texture2D(tDiffuse, vUv);
					
					// 可选：添加轻微的锐化以补偿上采样模糊
					vec4 sharp = texture2D(tDiffuse, vUv) * 1.2 
								- texture2D(tDiffuse, vUv + vec2(texelSize.x, 0.0)) * 0.05
								- texture2D(tDiffuse, vUv - vec2(texelSize.x, 0.0)) * 0.05
								- texture2D(tDiffuse, vUv + vec2(0.0, texelSize.y)) * 0.05
								- texture2D(tDiffuse, vUv - vec2(0.0, texelSize.y)) * 0.05;
					
					gl_FragColor = mix(color, sharp, 0.1); // 轻微锐化
				}
			`
        });

        this.fsQuad = new FullScreenQuad(null);
        this.originalClearColor = new Color();
    }

    /**
     * 更新SSR分辨率
     * @private
     */
    _updateSSRResolution() {
        const ssrWidth = Math.max(1, Math.round(this.width * this._ssrResolutionScale));
        const ssrHeight = Math.max(1, Math.round(this.height * this._ssrResolutionScale));

        // 更新SSR相关的渲染目标
        this.beautyRenderTarget.setSize(ssrWidth, ssrHeight);
        this.prevRenderTarget.setSize(ssrWidth, ssrHeight);
        this.normalRenderTarget.setSize(ssrWidth, ssrHeight);
        this.metalnessRenderTarget.setSize(ssrWidth, ssrHeight);
        this.ssrRenderTarget.setSize(ssrWidth, ssrHeight);
        this.blurRenderTarget.setSize(ssrWidth, ssrHeight);
        this.blurRenderTarget2.setSize(ssrWidth, ssrHeight);

        // 更新材质分辨率
        if (this.ssrMaterial) {
            this.ssrMaterial.uniforms.resolution.value.set(ssrWidth, ssrHeight);
            this.ssrMaterial.defines.MAX_STEP = Math.sqrt(ssrWidth * ssrWidth + ssrHeight * ssrHeight);
            this.ssrMaterial.needsUpdate = true;
        }

        if (this.blurMaterial) {
            this.blurMaterial.uniforms.resolution.value.set(ssrWidth, ssrHeight);
        }

        if (this.blurMaterial2) {
            this.blurMaterial2.uniforms.resolution.value.set(ssrWidth, ssrHeight);
        }

        if (this.upsampleMaterial) {
            this.upsampleMaterial.uniforms.resolution.value.set(ssrWidth, ssrHeight);
            this.upsampleMaterial.uniforms.targetResolution.value.set(this.width, this.height);
        }

        console.log(`OptimizedSSRPass: 更新SSR分辨率到 ${ssrWidth}x${ssrHeight} (缩放比例: ${this._ssrResolutionScale})`);
    }

    /**
     * 检查选择状态是否发生变化
     * @returns {Boolean} 是否发生变化
     * @private
     */
    _checkSelectionChanged() {
        const selectedObjects = Array.from(this._selection);
        const newHash = selectedObjects.map(obj => obj.uuid).sort().join(',');

        if (newHash !== this.selectionHash) {
            this.selectionHash = newHash;
            this.normalTextureDirty = true;
            this.sceneChanged = true;
            return true;
        }
        return false;
    }

    /**
     * 优化的renderOverride - 仅对选中对象进行渲染
     * @private
     */
    optimizedRenderOverride(renderer, overrideMaterial, renderTarget, clearColor, clearAlpha, effectPassOpts) {

        // 检查是否需要重新渲染
        if (!this.normalTextureDirty && !this.sceneChanged) {
            return; // 复用上一帧的法线纹理
        }

        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
        const originalAutoClear = renderer.autoClear;

        renderer.setRenderTarget(renderTarget);
        renderer.autoClear = false;

        clearColor = overrideMaterial.clearColor || clearColor;
        clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

        if ((clearColor !== undefined) && (clearColor !== null)) {
            renderer.setClearColor(clearColor);
            renderer.setClearAlpha(clearAlpha || 0.0);
            renderer.clear();
        }

        // ==== 优化：仅渲染选中的对象 ====
        const selectedObjects = Array.from(this._selection);

        if (selectedObjects.length > 0) {
            // 临时隐藏未选中的对象
            const hiddenObjects = [];

            this.scene.traverse(child => {
                if (child.isMesh && !selectedObjects.includes(child) && child.visible) {
                    child.visible = false;
                    hiddenObjects.push(child);
                }
            });

            // 渲染场景（只有选中对象可见）
            this.scene.overrideMaterial = overrideMaterial;
            renderer.shadowMap.autoUpdate = false;
            renderer.render(this.scene, this.camera, renderUtils.getStandardOpts({
                projectObject: true,
                updateMatrixWorld: false,
                useProgramCache: false
            }, {
                subOptsState: false
            }));
            this.scene.overrideMaterial = null;

            // 恢复对象可见性
            hiddenObjects.forEach(child => {
                child.visible = true;
            });
        }

        // 恢复渲染器状态
        renderer.autoClear = originalAutoClear;
        renderer.setClearColor(this.originalClearColor);
        renderer.setClearAlpha(originalClearAlpha);

        // 标记法线纹理已更新
        this.normalTextureDirty = false;
        this.sceneChanged = false;

        console.log(`OptimizedSSRPass: 选择性渲染完成，处理了 ${selectedObjects.length} 个对象`);
    }

    /**
     * 自适应分辨率调节
     * @private
     */
    _adaptiveResolutionAdjust(deltaTime) {
        if (!this.adaptiveResolution) return;

        const currentFPS = deltaTime > 0 ? 1.0 / deltaTime : 60;

        // 添加到历史记录
        this.fpsHistory.push(currentFPS);
        if (this.fpsHistory.length > this.fpsHistorySize) {
            this.fpsHistory.shift();
        }

        // 计算平均帧率
        if (this.fpsHistory.length >= this.fpsHistorySize) {
            const avgFPS = this.fpsHistory.reduce((a, b) => a + b) / this.fpsHistory.length;

            const fpsRatio = avgFPS / this.targetFPS;

            // 动态调整分辨率
            if (fpsRatio < 0.8 && this._ssrResolutionScale > 0.25) {
                // 帧率过低，降低分辨率
                this.ssrResolutionScale = Math.max(0.25, this._ssrResolutionScale - 0.1);
                console.log(`自适应分辨率：降低到 ${this._ssrResolutionScale}`);
            } else if (fpsRatio > 1.2 && this._ssrResolutionScale < 1.0) {
                // 帧率充足，提高分辨率
                this.ssrResolutionScale = Math.min(1.0, this._ssrResolutionScale + 0.05);
                console.log(`自适应分辨率：提高到 ${this._ssrResolutionScale}`);
            }
        }
    }

    // 继承原有的render方法，但使用优化版本
    render(renderer, writeBuffer, inputBuffer, deltaTime, stencilTest, depthPass, effectPassOpts) {

        // 自适应分辨率调节
        this._adaptiveResolutionAdjust(deltaTime);

        // 检查选择状态变化
        this._checkSelectionChanged();

        // 保存状态
        const oldMatrixAutoUpdate = this.scene.matrixAutoUpdate;
        const oldCameraMatrixAutoUpdate = this.camera.matrixAutoUpdate;
        const oldShadowUpdate = renderer.shadowMap.needsUpdate;

        this.scene.matrixAutoUpdate = false;
        this.camera.matrixAutoUpdate = false;
        renderer.shadowMap.needsUpdate = false;

        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const currentRenderTarget = renderer.getRenderTarget();
        const background = this.scene.background;

        // 渲染beauty和depth（使用SSR分辨率）
        renderer.setRenderTarget(this.beautyRenderTarget);
        renderer.clear();

        if (this.groundReflector) {
            this.groundReflector.visible = false;
            this.groundReflector.doRender(this.renderer, this.scene, this.camera);
            this.groundReflector.visible = true;
        }

        this.scene.background = null;
        if (this.groundReflector) {
            this.groundReflector.visible = false;
        }

        // 使用优化的renderOverride渲染法线（仅选中对象）
        this.optimizedRenderOverride(
            renderer,
            this.normalMaterial,
            this.normalRenderTarget,
            0,
            0,
            effectPassOpts
        );

        this.depthMaskMaterial.depthBuffer0 = this.composer.depthTexture;
        this.depthMaskMaterial.inputBuffer = inputBuffer.texture;

        // 处理选中对象的深度渲染
        const mask = this.camera.layers.mask;
        this.camera.layers.set(this._selection.layer);

        const otherModels = [];
        this._selection.forEach((model) => {
            if (model.children.length > 0) {
                model.traverse((child) => {
                    if (child.isMesh && !child.layers.isEnabled(this._selection.layer) && child.visible) {
                        otherModels.push({
                            model: child,
                            oldLayerMask: child.layers.mask
                        });
                        child.layers.set(this._selection.layer);
                    }
                });
            }
        });

        this.depthPass.render(renderer, inputBuffer, undefined, undefined, undefined, undefined, {
            projectObject: true,
            updateMatrixWorld: false,
            useProgramCache: false,
            ...renderUtils.getSubOpths(false)
        });

        this.ssrMaterial.uniforms.depthPass1 = new Uniform(this.depthPass.renderTarget.texture);

        this.camera.layers.mask = mask;
        otherModels.forEach(({ model, oldLayerMask }) => {
            model.layers.mask = oldLayerMask;
        });

        // 渲染遮罩（使用全分辨率）
        renderer.setRenderTarget(this.renderTargetMask);
        renderer.clear(true, true, true);

        this.maskPass.render(renderer, inputBuffer, this.renderTargetMask, undefined, undefined, {
            projectObject: true,
            updateMatrixWorld: false,
            useProgramCache: false,
            ...renderUtils.getSubOpths(false)
        });

        this.scene.background = background;

        // 渲染SSR（使用SSR分辨率）
        this.ssrMaterial.uniforms.opacity.value = this.opacity;
        this.ssrMaterial.uniforms.maxDistance.value = this.maxDistance;
        this.ssrMaterial.uniforms.thickness.value = this.thickness;
        this.ssrMaterial.uniforms.reflectionStrength.value = this.reflectionStrength;
        this.ssrMaterial.uniforms.maskTexture = { value: this.renderTargetMask.texture };
        this.ssrMaterial.uniforms.maskThreshold = { value: this.maskThreshold };
        this.ssrMaterial.defines.SELECTIVE = true;
        this.ssrMaterial.needsUpdate = true;

        if (this.useExternalDepth && this.externalDepthTexture) {
            this.ssrMaterial.uniforms.tDepth.value = this.externalDepthTexture;
        } else {
            this.ssrMaterial.uniforms.tDepth.value = this.beautyRenderTarget.depthTexture;
        }

        this.renderPass(renderer, this.ssrMaterial, this.ssrRenderTarget);

        // 渲染模糊（使用SSR分辨率）
        if (this.blur) {
            this.renderPass(renderer, this.blurMaterial, this.blurRenderTarget);
            this.renderPass(renderer, this.blurMaterial2, this.blurRenderTarget2);
        }

        // 上采样SSR结果到全分辨率
        const ssrResult = this.blur ? this.blurRenderTarget2.texture : this.ssrRenderTarget.texture;
        this.upsampleMaterial.uniforms.tDiffuse.value = ssrResult;
        this.renderPass(renderer, this.upsampleMaterial, this.upsampleRenderTarget);

        // 输出结果到屏幕
        switch (this.output) {
            case OptimizedSelectiveSSRPass.OUTPUT.Default:
                if (this.bouncing) {
                    this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

                    this.copyMaterial.uniforms.tDiffuse.value = this.upsampleRenderTarget.texture;
                    this.copyMaterial.blending = NormalBlending;
                    this.renderPass(renderer, this.copyMaterial, this.prevRenderTarget);

                    this.copyMaterial.uniforms.tDiffuse.value = this.prevRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                } else {
                    // 首先渲染beauty
                    this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
                    this.copyMaterial.blending = NoBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);

                    // 然后叠加上采样后的SSR结果
                    this.copyMaterial.uniforms.tDiffuse.value = this.upsampleRenderTarget.texture;
                    this.copyMaterial.blending = NormalBlending;
                    this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                }
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.SSR:
                this.copyMaterial.uniforms.tDiffuse.value = this.upsampleRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Beauty:
                this.copyMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Depth:
                this.depthRenderMaterial.uniforms.tDepth.value = this.composer.depthTexture;
                this.renderPass(renderer, this.depthRenderMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Normal:
                this.copyMaterial.uniforms.tDiffuse.value = this.normalRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Metalness:
                this.copyMaterial.uniforms.tDiffuse.value = this.metalnessRenderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Mask:
                this.copyMaterial.uniforms.tDiffuse.value = this.depthPass.renderTarget.texture;
                this.copyMaterial.blending = NoBlending;
                this.renderPass(renderer, this.copyMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            case OptimizedSelectiveSSRPass.OUTPUT.Debug:
                this.renderPass(renderer, this.ssrMaterial, this.renderToScreen ? null : writeBuffer);
                break;

            default:
                console.warn("THREE.OptimizedSelectiveSSRPass: Unknown output type.");
        }

        // 恢复状态
        renderer.setRenderTarget(this.ssrRenderTarget);
        this.scene.matrixAutoUpdate = oldMatrixAutoUpdate;
        this.camera.matrixAutoUpdate = oldCameraMatrixAutoUpdate;
        renderer.shadowMap.needsUpdate = oldShadowUpdate;
    }

    // 继承其他必要方法...
    renderPass(renderer, passMaterial, renderTarget, clearColor, clearAlpha) {
        this.originalClearColor.copy(renderer.getClearColor(this.tempColor));
        const originalClearAlpha = renderer.getClearAlpha(this.tempColor);
        const originalAutoClear = renderer.autoClear;

        renderer.setRenderTarget(renderTarget);
        renderer.autoClear = false;

        if ((clearColor !== undefined) && (clearColor !== null)) {
            renderer.setClearColor(clearColor);
            renderer.setClearAlpha(clearAlpha || 0.0);
            renderer.clear();
        }

        this.fsQuad.material = passMaterial;
        this.fsQuad.render(renderer, {
            projectObject: true,
            updateMatrixWorld: false,
            useProgramCache: false
        });

        renderer.autoClear = originalAutoClear;
        renderer.setClearColor(this.originalClearColor);
        renderer.setClearAlpha(originalClearAlpha);
    }

    setSize(width, height) {
        this.width = width;
        this.height = height;

        // 更新全分辨率渲染目标
        this.renderTargetMask.setSize(width, height);
        this.upsampleRenderTarget.setSize(width, height);

        // 更新SSR分辨率
        this._updateSSRResolution();

        if (this.depthPass) {
            this.depthPass.setSize(width, height);
        }

        if (this.maskPass) {
            this.maskPass.setSize(width, height);
        }

        console.log(`OptimizedSSRPass: 设置尺寸 ${width}x${height}`);
    }

    // 标记场景发生变化（外部调用）
    markSceneChanged() {
        this.sceneChanged = true;
        this.normalTextureDirty = true;
    }

    // 强制刷新法线纹理
    forceRefreshNormals() {
        this.normalTextureDirty = true;
        this.sceneChanged = true;
    }

    // 获取当前性能统计
    getPerformanceStats() {
        const avgFPS = this.fpsHistory.length > 0 ?
            this.fpsHistory.reduce((a, b) => a + b) / this.fpsHistory.length : 0;

        return {
            currentResolutionScale: this._ssrResolutionScale,
            averageFPS: avgFPS,
            adaptiveResolution: this.adaptiveResolution,
            normalTextureCached: !this.normalTextureDirty
        };
    }

    // 继承其他方法（setBouncing, 选择管理等）
    setBouncing(val) {
        if (this._bouncing === val) { return; }
        this._bouncing = val;
        if (val) {
            this.ssrMaterial.uniforms.tDiffuse.value = this.prevRenderTarget.texture;
        } else {
            this.ssrMaterial.uniforms.tDiffuse.value = this.beautyRenderTarget.texture;
        }
    }

    get inverted() { return this._inverted; }
    set inverted(value) {
        this._inverted = value;
        if (this.depthMaskMaterial) {
            this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;
        }
    }

    get ignoreBackground() { return this._ignoreBackground; }
    set ignoreBackground(value) {
        this._ignoreBackground = value;
        if (this.depthMaskMaterial) {
            this.depthMaskMaterial.maxDepthStrategy = value ?
                DepthTestStrategy.DISCARD_MAX_DEPTH :
                DepthTestStrategy.KEEP_MAX_DEPTH;
        }
    }

    // 选择管理方法
    addToSelection(object) {
        if (!object) { return; }
        if (this._selection && typeof this._selection.add === "function") {
            this._selection.add(object);
            this.markSceneChanged();
            console.log(`已添加对象到SSR选择集: ${object.name || object.uuid}`);
        }
    }

    removeFromSelection(object) {
        if (!object) { return; }
        if (this._selection && typeof this._selection.delete === "function") {
            this._selection.delete(object);
            this.markSceneChanged();
            console.log(`已从SSR选择集移除对象: ${object.name || object.uuid}`);
        }
    }

    clearSelection() {
        if (this._selection && typeof this._selection.clear === "function") {
            this._selection.clear();
            this.markSceneChanged();
            console.log("已清空SSR选择集");
        }
    }

    toggleSelection(object) {
        if (!object) { return; }
        if (this._selection) {
            if (this._selection.has(object)) {
                this.removeFromSelection(object);
            } else {
                this.addToSelection(object);
            }
        }
    }

    getSelectionItems() {
        if (!this._selection) { return []; }
        if (Array.isArray(this._selection.items)) return this._selection.items;
        if (Array.isArray(this._selection.objects)) return this._selection.objects;
        if (typeof this._selection.getItems === "function") return this._selection.getItems();
        if (typeof this._selection.getSelection === "function") return this._selection.getSelection();
        if (typeof this._selection[Symbol.iterator] === "function") return Array.from(this._selection);
        return [];
    }

    // 初始化方法
    initialize(renderer, alpha, frameBufferType) {
        if (this.depthPass) {
            this.depthPass.initialize(renderer, alpha, frameBufferType);
        }
        if (this.maskPass) {
            this.maskPass.initialize(renderer, alpha, frameBufferType);
        }
        if (renderer.capabilities.logarithmicDepthBuffer) {
            if (this.depthMaskMaterial) {
                this.depthMaskMaterial.defines.LOG_DEPTH = "1";
                this.depthMaskMaterial.needsUpdate = true;
            }
        }
    }

    // 基于金属度的自动选择
    updateSelectionBasedOnMetalness(threshold = 0.5) {
        if (!this._selection || !this.scene) { return; }
        this.clearSelection();
        this.scene.traverseVisible(object => {
            if (object.isMesh && object.material) {
                let metalness = 0;
                if (!Array.isArray(object.material)) {
                    if (object.material.metalness !== undefined) {
                        metalness = object.material.metalness;
                    }
                } else {
                    let totalMetalness = 0;
                    let validMaterials = 0;
                    for (const mat of object.material) {
                        if (mat.metalness !== undefined) {
                            totalMetalness += mat.metalness;
                            validMaterials++;
                        }
                    }
                    if (validMaterials > 0) {
                        metalness = totalMetalness / validMaterials;
                    }
                }
                if (metalness >= threshold) {
                    this.addToSelection(object);
                }
            }
        });
        console.log(`基于金属度 >= ${threshold} 更新选择，共选中 ${this.getSelectionItems().length} 个对象`);
    }

    setMetalnessThreshold(threshold) {
        this.updateSelectionBasedOnMetalness(threshold);
    }

    // 销毁方法
    dispose() {
        this.beautyRenderTarget.dispose();
        this.prevRenderTarget.dispose();
        this.normalRenderTarget.dispose();
        this.metalnessRenderTarget.dispose();
        this.ssrRenderTarget.dispose();
        this.blurRenderTarget.dispose();
        this.blurRenderTarget2.dispose();
        this.renderTargetMask.dispose();
        this.upsampleRenderTarget.dispose();

        this.normalMaterial.dispose();
        this.metalnessOnMaterial.dispose();
        this.metalnessOffMaterial.dispose();
        this.blurMaterial.dispose();
        this.blurMaterial2.dispose();
        this.copyMaterial.dispose();
        this.upsampleMaterial.dispose();
        this.depthRenderMaterial.dispose();

        this.fsQuad.dispose();
    }
}

// 输出类型定义
OptimizedSelectiveSSRPass.OUTPUT = {
    "Default": 0,
    "SSR": 1,
    "Beauty": 3,
    "Depth": 4,
    "Normal": 5,
    "Metalness": 7,
    "Mask": 8,
    "Debug": 9
};

OptimizedSelectiveSSRPass.prototype.setOutputMode = function (mode) {
    this.output = mode;
    console.log(`已设置输出模式：${Object.keys(OptimizedSelectiveSSRPass.OUTPUT).find(key => OptimizedSelectiveSSRPass.OUTPUT[key] === mode) || "未知"}`);
};

OptimizedSelectiveSSRPass.prototype.cycleOutputMode = function () {
    const modes = Object.values(OptimizedSelectiveSSRPass.OUTPUT);
    const currentIndex = modes.indexOf(this.output);
    const nextIndex = (currentIndex + 1) % modes.length;
    this.setOutputMode(modes[nextIndex]);
};

export { OptimizedSelectiveSSRPass };
