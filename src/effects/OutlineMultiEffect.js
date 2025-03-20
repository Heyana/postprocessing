import { Color, RepeatWrapping, Uniform, UnsignedByteType, WebGLRenderTarget, DataTexture, RGBFormat, FloatType, MeshBasicMaterial, BufferAttribute, AddEquation, OneMinusSrcAlphaFactor, OneFactor, CustomBlending } from "three";
import { Resolution } from "../core/Resolution.js";
import { Selection } from "../core/Selection.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { KernelSize } from "../enums/KernelSize.js";
import { DepthComparisonMaterial } from "../materials/DepthComparisonMaterial.js";
import { OutlineMaterial } from "../materials/OutlineMaterial.js";
import { KawaseBlurPass } from "../passes/KawaseBlurPass.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { RenderPass } from "../passes/RenderPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/outline-multi.frag";
import vertexShader from "./glsl/outline-multi.vert";

/**
 * An outline effect with support for multiple outline colors.
 */

export class OutlineMultiEffect extends Effect {

    /**
     * Constructs a new outline effect.
     *
     * @param {Scene} scene - The main scene.
     * @param {Camera} camera - The main camera.
     * @param {Object} [options] - The options.
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - The blend function. Use `BlendFunction.ALPHA` for dark outlines.
     * @param {Texture} [options.patternTexture=null] - A pattern texture.
     * @param {Number} [options.patternScale=1.0] - The pattern scale.
     * @param {Number} [options.edgeStrength=1.0] - The edge strength.
     * @param {Number} [options.pulseSpeed=0.0] - The pulse speed. A value of zero disables the pulse effect.
     * @param {Number} [options.visibleEdgeColor=0xffffff] - The color of visible edges.
     * @param {Number} [options.hiddenEdgeColor=0x22090a] - The color of hidden edges.
     * @param {KernelSize} [options.kernelSize=KernelSize.VERY_SMALL] - The blur kernel size.
     * @param {Boolean} [options.blur=false] - Whether the outline should be blurred.
     * @param {Boolean} [options.xRay=true] - Whether occluded parts of selected objects should be visible.
     * @param {Number} [options.multisampling=0] - The number of samples used for multisample antialiasing. Requires WebGL 2.
     * @param {Number} [options.resolutionScale=0.5] - The resolution scale.
     * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - The horizontal resolution.
     * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - The vertical resolution.
     * @param {Number} [options.width=Resolution.AUTO_SIZE] - Deprecated. Use resolutionX instead.
     * @param {Number} [options.height=Resolution.AUTO_SIZE] - Deprecated. Use resolutionY instead.
     * @param {Number[]} [options.layers=[20, 21, 22]] - The layers to use for the different outline colors.
     */

    constructor(scene, camera, {
        blendFunction = BlendFunction.SCREEN,
        patternTexture = null,
        patternScale = 1.0,
        edgeStrength = 1.0,
        pulseSpeed = 0.0,
        visibleEdgeColor = 0xffffff,
        hiddenEdgeColor = 0x22090a,
        kernelSize = KernelSize.VERY_SMALL,
        blur = false,
        xRay = true,
        multisampling = 0,
        resolutionScale = 0.5,
        width = Resolution.AUTO_SIZE,
        height = Resolution.AUTO_SIZE,
        resolutionX = width,
        resolutionY = height,
        layers = [20, 21, 22]
    } = {}) {

        super("OutlineMultiEffect", fragmentShader, {
            uniforms: new Map([
                ["maskTexture", new Uniform(null)],
                ["edgeTexture", new Uniform(null)],
                ["edgeStrength", new Uniform(edgeStrength)],
                ["visibleEdgeColor", new Uniform(new Color(visibleEdgeColor))],
                ["hiddenEdgeColor", new Uniform(new Color(hiddenEdgeColor))],
                ["pulse", new Uniform(1.0)],
                ["patternScale", new Uniform(patternScale)],
                ["patternTexture", new Uniform(null)]
            ])
        });

        // Handle alpha blending.
        this.blendMode.addEventListener("change", (event) => {

            if (this.blendMode.blendFunction === BlendFunction.ALPHA) {

                this.defines.set("ALPHA", "1");

            } else {

                this.defines.delete("ALPHA");

            }

            this.setChanged();

        });

        this.blendMode.blendFunction = blendFunction;
        this.patternTexture = patternTexture;
        this.xRay = xRay;

        /**
         * The main scene.
         *
         * @type {Scene}
         * @private
         */

        this.scene = scene;

        /**
         * The main camera.
         *
         * @type {Camera}
         * @private
         */

        this.camera = camera;

        /**
         * A render target for the outline mask.
         *
         * @type {WebGLRenderTarget}
         * @private
         */

        this.renderTargetMask = new WebGLRenderTarget(1, 1);
        this.renderTargetMask.samples = multisampling;
        this.renderTargetMask.texture.name = "Outline.Mask";
        this.uniforms.get("maskTexture").value = this.renderTargetMask.texture;

        /**
         * A render target for the edge detection.
         *
         * @type {WebGLRenderTarget}
         * @private
         */

        this.renderTargetOutline = new WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.renderTargetOutline.texture.name = "Outline.Edges";
        this.uniforms.get("edgeTexture").value = this.renderTargetOutline.texture;

        /**
         * A clear pass.
         *
         * @type {ClearPass}
         * @private
         */

        this.clearPass = new ClearPass();
        this.clearPass.overrideClearColor = new Color(0x000000);
        this.clearPass.overrideClearAlpha = 1;

        /**
         * A depth pass.
         *
         * @type {DepthPass}
         * @private
         */

        this.depthPass = new DepthPass(scene, camera);

        /**
         * A depth comparison mask pass.
         *
         * @type {RenderPass}
         * @private
         */

        this.maskPass = new RenderPass(scene, camera, new DepthComparisonMaterial(this.depthPass.texture, camera));
        const clearPass = this.maskPass.clearPass;
        clearPass.overrideClearColor = new Color(0xffffff);
        clearPass.overrideClearAlpha = 1;

        // 设置maskPass不使用选择集，而是通过相机层控制
        this.maskPass.selection = null;

        /**
         * A blur pass.
         *
         * @type {KawaseBlurPass}
         */

        this.blurPass = new KawaseBlurPass({ resolutionScale, resolutionX, resolutionY, kernelSize });
        this.blurPass.enabled = blur;
        const resolution = this.blurPass.resolution;
        resolution.addEventListener("change", (e) => this.setSize(resolution.baseWidth, resolution.baseHeight));

        /**
         * An outline detection pass.
         *
         * @type {ShaderPass}
         * @private
         */

        this.outlinePass = new ShaderPass(new OutlineMaterial());
        const outlineMaterial = this.outlinePass.fullscreenMaterial;
        outlineMaterial.inputBuffer = this.renderTargetMask.texture;

        /**
         * The current animation time.
         *
         * @type {Number}
         * @private
         */

        this.time = 0;

        /**
         * Indicates whether the outlines should be updated.
         *
         * @type {Boolean}
         * @private
         */

        this.forceUpdate = true;

        /**
         * The pulse speed. Set to 0 to disable.
         *
         * @type {Number}
         */
        this.pulseSpeed = pulseSpeed;

        /**
         * The layers to use for the different outline colors.
         * Default: [20, 21, 22]
         * 
         * @type {Number[]}
         */
        this.layers = layers;

        /**
         * 按层收集的对象映射
         * 键：层号，值：该层中的对象集合Set
         * 
         * @type {Map<Number, Set<Object3D>>}
         */
        this.layerObjectsMap = new Map();

        // 初始化每个层的对象集合
        for (const layer of this.layers) {
            this.layerObjectsMap.set(layer, new Set());
        }

        // 预设的轮廓颜色
        this.outlineColors = [
            { visible: new Color(1.0, 0.0, 0.0), hidden: new Color(0.7, 0.0, 0.0) }, // 纯红色
            { visible: new Color(0.0, 1.0, 0.0), hidden: new Color(0.0, 0.7, 0.0) }, // 纯绿色
            { visible: new Color(0.0, 0.0, 1.0), hidden: new Color(0.0, 0.0, 0.7) }  // 纯蓝色
        ];

        // 设置着色器属性
        this.setVertexShader(vertexShader);
    }

    set mainScene(value) {

        this.scene = value;
        this.depthPass.mainScene = value;
        this.maskPass.mainScene = value;

    }

    set mainCamera(value) {

        this.camera = value;
        this.depthPass.mainCamera = value;
        this.maskPass.mainCamera = value;
        this.maskPass.overrideMaterial.copyCameraSettings(value);

    }

    /**
     * The resolution of this effect.
     *
     * @type {Resolution}
     */

    get resolution() {

        return this.blurPass.resolution;

    }

    /**
     * Returns the resolution.
     *
     * @return {Resizer} The resolution.
     */

    getResolution() {

        return this.blurPass.getResolution();

    }

    /**
     * The amount of MSAA samples.
     *
     * Requires WebGL 2. Set to zero to disable multisampling.
     *
     * @experimental Requires three >= r138.
     * @type {Number}
     */

    get multisampling() {

        return this.renderTargetMask.samples;

    }

    set multisampling(value) {

        this.renderTargetMask.samples = value;
        this.renderTargetMask.dispose();

    }

    /**
     * The pattern scale.
     *
     * @type {Number}
     */

    get patternScale() {

        return this.uniforms.get("patternScale").value;

    }

    set patternScale(value) {

        this.uniforms.get("patternScale").value = value;

    }

    /**
     * The edge strength.
     *
     * @type {Number}
     */

    get edgeStrength() {

        return this.uniforms.get("edgeStrength").value;

    }

    set edgeStrength(value) {

        this.uniforms.get("edgeStrength").value = value;

    }

    /**
     * The visible edge color.
     *
     * @type {Color}
     */

    get visibleEdgeColor() {

        return this.uniforms.get("visibleEdgeColor").value;

    }

    set visibleEdgeColor(value) {

        this.uniforms.get("visibleEdgeColor").value = value;

    }

    /**
     * The hidden edge color.
     *
     * @type {Color}
     */

    get hiddenEdgeColor() {

        return this.uniforms.get("hiddenEdgeColor").value;

    }

    set hiddenEdgeColor(value) {

        this.uniforms.get("hiddenEdgeColor").value = value;

    }

    /**
     * Returns the blur pass.
     *
     * @deprecated Use blurPass instead.
     * @return {KawaseBlurPass} The blur pass.
     */

    getBlurPass() {

        return this.blurPass;

    }

    /**
     * Returns the selection.
     *
     * @deprecated Use selection instead.
     * @return {Selection} The selection.
     */

    getSelection() {

        return this.selection;

    }

    /**
     * Returns the pulse speed.
     *
     * @deprecated Use pulseSpeed instead.
     * @return {Number} The speed.
     */

    getPulseSpeed() {

        return this.pulseSpeed;

    }

    /**
     * Sets the pulse speed. Set to zero to disable.
     *
     * @deprecated Use pulseSpeed instead.
     * @param {Number} value - The speed.
     */

    setPulseSpeed(value) {

        this.pulseSpeed = value;

    }

    /**
     * The current width of the internal render targets.
     *
     * @type {Number}
     * @deprecated Use resolution.width instead.
     */

    get width() {

        return this.resolution.width;

    }

    set width(value) {

        this.resolution.preferredWidth = value;

    }

    /**
     * The current height of the internal render targets.
     *
     * @type {Number}
     * @deprecated Use resolution.height instead.
     */

    get height() {

        return this.resolution.height;

    }

    set height(value) {

        this.resolution.preferredHeight = value;

    }

    /**
     * The selection layer.
     *
     * @type {Number}
     * @deprecated Use selection.layer instead.
     */

    get selectionLayer() {

        return this.selection.layer;

    }

    set selectionLayer(value) {

        this.selection.layer = value;

    }

    /**
     * Indicates whether dithering is enabled.
     *
     * @type {Boolean}
     * @deprecated
     */

    get dithering() {

        return this.blurPass.dithering;

    }

    set dithering(value) {

        this.blurPass.dithering = value;

    }

    /**
     * The blur kernel size.
     *
     * @type {KernelSize}
     * @deprecated Use blurPass.kernelSize instead.
     */

    get kernelSize() {

        return this.blurPass.kernelSize;

    }

    set kernelSize(value) {

        this.blurPass.kernelSize = value;

    }

    /**
     * Indicates whether the outlines should be blurred.
     *
     * @type {Boolean}
     * @deprecated Use blurPass.enabled instead.
     */

    get blur() {

        return this.blurPass.enabled;

    }

    set blur(value) {

        this.blurPass.enabled = value;

    }

    /**
     * Indicates whether X-ray mode is enabled.
     *
     * @type {Boolean}
     */

    get xRay() {

        return this.defines.has("X_RAY");

    }

    set xRay(value) {

        if (this.xRay !== value) {

            if (value) {

                this.defines.set("X_RAY", "1");

            } else {

                this.defines.delete("X_RAY");

            }

            this.setChanged();

        }

    }

    /**
     * The pattern texture. Set to `null` to disable.
     *
     * @type {Texture}
     */

    get patternTexture() {

        return this.uniforms.get("patternTexture").value;

    }

    set patternTexture(value) {

        if (value !== null) {

            value.wrapS = value.wrapT = RepeatWrapping;
            this.defines.set("USE_PATTERN", "1");
            this.setVertexShader(vertexShader);

        } else {

            this.defines.delete("USE_PATTERN");
            this.setVertexShader(null);

        }

        this.uniforms.get("patternTexture").value = value;
        this.setChanged();

    }

    /**
     * Returns the current resolution scale.
     *
     * @return {Number} The resolution scale.
     * @deprecated Use resolution instead.
     */

    getResolutionScale() {

        return this.resolution.scale;

    }

    /**
     * Sets the resolution scale.
     *
     * @param {Number} scale - The new resolution scale.
     * @deprecated Use resolution instead.
     */

    setResolutionScale(scale) {

        this.resolution.scale = scale;

    }

    /**
     * Updates this effect.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     */
    update(renderer, inputBuffer, deltaTime) {
        const scene = this.scene;
        const camera = this.camera;
        const uniforms = this.uniforms;
        const pulse = uniforms.get("pulse");

        // 保存原始状态
        const background = scene.background;
        const mask = camera.layers.mask;

        // 设置基本状态
        scene.background = null;

        // 更新脉冲效果
        this.time += deltaTime;
        pulse.value = (this.pulseSpeed > 0)
            ? 0.625 + Math.cos(this.time * this.pulseSpeed * 10.0) * 0.375
            : 1.0;

        // 检查是否有对象需要渲染轮廓
        let hasObjects = false;
        for (const objects of this.layerObjectsMap.values()) {
            if (objects.size > 0) {
                hasObjects = true;
                break;
            }
        }

        // 如果没有对象需要渲染轮廓，则跳过所有渲染
        if (!hasObjects && !this.forceUpdate) {
            camera.layers.mask = mask;
            scene.background = background;
            return;
        }

        // 保存所有对象的原始层设置
        const originalLayers = new Map();

        // 1. 渲染深度图 - 用于之后的深度比较
        camera.layers.set(0); // 设置为默认层，确保包含所有对象
        this.depthPass.render(renderer);

        // 2. 清除主渲染目标
        this.clearPass.overrideClearColor = new Color(0);
        this.clearPass.render(renderer, this.renderTargetOutline);

        // 获取轮廓材质并保存原始状态
        const originalOutlineMaterial = this.outlinePass.fullscreenMaterial;
        const originalBlending = originalOutlineMaterial.blending;
        const originalBlendSrc = originalOutlineMaterial.blendSrc;
        const originalBlendDst = originalOutlineMaterial.blendDst;
        const originalBlendEquation = originalOutlineMaterial.blendEquation;
        const originalAutoClear = renderer.autoClear;

        // 设置混合模式 - 采用加法混合模式以支持多层颜色叠加
        const blendingSettings = {
            blending: CustomBlending,
            blendEquation: AddEquation,
            blendSrc: OneFactor,
            blendDst: OneFactor // 使用OneFactor而不是OneMinusSrcAlphaFactor以实现加法叠加
        };

        // 确保渲染目标是干净的
        this.clearPass.render(renderer, this.renderTargetOutline);

        // 禁用自动清除以累积不同层的结果
        renderer.autoClear = false;

        // 3. 逐层渲染轮廓 - 使用独立的材质实例
        this.layers.forEach((layer, i) => {
            // 获取当前层的对象集合
            const layerObjects = this.layerObjectsMap.get(layer);

            // 如果该层没有对象，跳过
            if (layerObjects.size === 0) {
                console.log(`跳过空层 ${layer} - 没有对象`);
                return;
            }

            console.log(`处理层 ${layer} 中的 ${layerObjects.size} 个对象`);

            // 为当前层创建独立的材质实例
            const colorIndex = Math.min(i, this.outlineColors.length - 1);
            const colors = this.outlineColors[colorIndex];

            // 清除遮罩渲染目标以准备当前层的渲染
            this.clearPass.overrideClearColor = new Color(0xffffff);
            this.clearPass.render(renderer, this.renderTargetMask);

            // 保存并设置对象层
            layerObjects.forEach(object => {
                if (!originalLayers.has(object)) {
                    originalLayers.set(object, object.layers.mask);
                }
                // 临时将对象设置到当前层
                object.layers.set(layer);
                console.log(`设置对象 "${object.name || 'unnamed'}" 到层 ${layer}`);
            });

            // 设置相机只看当前层 - 这是关键！
            camera.layers.set(layer);
            console.log(`相机设置为查看层 ${layer}`);

            // 渲染当前层的遮罩
            this.maskPass.render(renderer, this.renderTargetMask);

            // 返回到使用原始材质，但更新颜色
            const originalMaterial = this.outlinePass.fullscreenMaterial;
            originalMaterial.visibleEdgeColor.copy(colors.visible);
            originalMaterial.hiddenEdgeColor.copy(colors.hidden);
            originalMaterial.edgeStrength = this.edgeStrength;
            originalMaterial.pulse = pulse.value;

            // 应用混合设置
            Object.assign(originalMaterial, blendingSettings);

            // 使用原始材质渲染轮廓
            this.outlinePass.render(renderer, null, this.renderTargetOutline);
            console.log(`渲染层 ${layer} 的轮廓, 颜色:`, colors.visible);

            // 恢复对象的原始层设置
            layerObjects.forEach(object => {
                object.layers.mask = originalLayers.get(object);
            });
        });

        // 4. 如果需要，应用模糊效果
        if (this.blurPass.enabled) {
            this.blurPass.render(renderer, this.renderTargetOutline, this.renderTargetOutline);
        }

        // 5. 恢复原始状态
        renderer.autoClear = originalAutoClear;
        camera.layers.mask = mask;
        scene.background = background;

        // 设置下一帧是否需要强制更新
        this.forceUpdate = hasObjects;
    }

    /**
     * Updates the size of internal render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */

    setSize(width, height) {

        this.blurPass.setSize(width, height);
        this.renderTargetMask.setSize(width, height);

        const resolution = this.resolution;
        resolution.setBaseSize(width, height);
        const w = resolution.width, h = resolution.height;

        this.depthPass.setSize(w, h);
        this.renderTargetOutline.setSize(w, h);
        this.outlinePass.fullscreenMaterial.setSize(w, h);

    }

    /**
     * Performs initialization tasks.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
     * @param {Number} frameBufferType - The type of the main frame buffers.
     */

    initialize(renderer, alpha, frameBufferType) {

        // No need for high precision: the blur pass operates on a mask texture.
        this.blurPass.initialize(renderer, alpha, UnsignedByteType);

        if (frameBufferType !== undefined) {

            // These passes ignore the buffer type.
            this.depthPass.initialize(renderer, alpha, frameBufferType);
            this.maskPass.initialize(renderer, alpha, frameBufferType);
            this.outlinePass.initialize(renderer, alpha, frameBufferType);

        }

    }

    /**
     * 添加对象到指定的层
     * @param {Object3D} object - 要添加的对象
     * @param {Number} layer - 目标层编号
     * @private
     */
    _addObjectToLayer(object, layer) {
        // 获取该层的对象集合
        const layerObjects = this.layerObjectsMap.get(layer);
        if (layerObjects) {
            // 添加对象到集合
            layerObjects.add(object);

            // 确保对象在默认层可见
            object.layers.enable(0);
            // 确保对象在目标层可见
            object.layers.enable(layer);
        }
    }

    /**
     * 从所有层中移除对象
     * @param {Object3D} object - 要移除的对象
     * @private
     */
    _removeObjectFromAllLayers(object) {
        // 从每个层的对象集合中移除
        for (const [layer, layerObjects] of this.layerObjectsMap.entries()) {
            layerObjects.delete(object);
            // 从对应层中禁用对象
            object.layers.disable(layer);
        }
    }

    /**
     * 设置对象的轮廓颜色层
     * @param {Object3D} object - 要设置颜色的对象
     * @param {Number} layerIndex - 层索引(0-2)，对应this.layers数组的索引
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    setOutlineColorLayer(object, layerIndex) {
        // 确保层索引在有效范围内
        layerIndex = Math.max(0, Math.min(this.layers.length - 1, layerIndex));

        // 先从所有层中移除对象
        this._removeObjectFromAllLayers(object);

        // 添加对象到指定的层
        const targetLayer = this.layers[layerIndex];
        this._addObjectToLayer(object, targetLayer);

        // 强制下一帧更新
        this.forceUpdate = true;

        return this;
    }

    /**
     * 设置为红色轮廓 (层索引0)
     * @param {Object3D} object - 要应用红色轮廓的对象
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    setRedOutline(object) {
        return this.setOutlineColorLayer(object, 0);
    }

    /**
     * 设置为绿色轮廓 (层索引1)
     * @param {Object3D} object - 要应用绿色轮廓的对象
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    setGreenOutline(object) {
        return this.setOutlineColorLayer(object, 1);
    }

    /**
     * 设置为蓝色轮廓 (层索引2)
     * @param {Object3D} object - 要应用蓝色轮廓的对象
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    setBlueOutline(object) {
        return this.setOutlineColorLayer(object, 2);
    }

    /**
     * 移除对象的轮廓效果
     * @param {Object3D} object - 要移除轮廓的对象
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    removeOutline(object) {
        // 从所有层中移除对象
        this._removeObjectFromAllLayers(object);

        // 强制下一帧更新
        this.forceUpdate = true;

        return this;
    }

    /**
     * 自定义轮廓颜色
     * @param {Number} layerIndex - 层索引(0-2)
     * @param {Number|Color} visibleColor - 可见部分的轮廓颜色
     * @param {Number|Color} hiddenColor - 隐藏部分的轮廓颜色
     * @returns {OutlineMultiEffect} - 返回this以支持链式调用
     */
    setOutlineColor(layerIndex, visibleColor, hiddenColor) {
        if (layerIndex >= 0 && layerIndex < this.outlineColors.length) {
            if (visibleColor !== undefined) {
                this.outlineColors[layerIndex].visible = visibleColor instanceof Color
                    ? visibleColor.clone()
                    : new Color(visibleColor);
            }

            if (hiddenColor !== undefined) {
                this.outlineColors[layerIndex].hidden = hiddenColor instanceof Color
                    ? hiddenColor.clone()
                    : new Color(hiddenColor);
            }

            // 强制下一帧更新
            this.forceUpdate = true;
        }

        return this;
    }
} 