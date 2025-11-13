import {
    AdditiveBlending,
    BasicDepthPacking,
    Color,
    EqualDepth,
    HalfFloatType,
    NotEqualDepth,
    RGBADepthPacking,
    SRGBColorSpace,
    Vector2,
    Vector3, Uniform,
    WebGLRenderTarget
} from "three";

import { Selection } from "../core/Selection.js";
import { DepthTestStrategy } from "../enums/DepthTestStrategy.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { DepthMaskMaterial } from "../materials/DepthMaskMaterial.js";
import { LuminosityHighPassMaterial } from "../materials/LuminosityHighPassMaterial.js";
import { SeparableGaussianBlurMaterial } from "../materials/SeparableGaussianBlurMaterial.js";
import { UnrealBloomCompositeMaterial } from "../materials/UnrealBloomCompositeMaterial.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";
import { BlendMode } from "./blending/BlendMode.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";

import fragmentShader from "./glsl/unreal-bloom.frag";

/**
 * A selective unreal bloom effect.
 *
 * This effect applies bloom to selected objects only, using UnrealBloomPass algorithm
 * with separable Gaussian blur and multi-MIP level compositing.
 *
 * Based on UnrealBloomPass from three.js examples.
 */

export class SelectiveUnrealBloomEffect extends Effect {

    /**
     * Constructs a new selective unreal bloom effect.
     *
     * @param {Scene} scene - The main scene.
     * @param {Camera} camera - The main camera.
     * @param {Object} [options] - The options.
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - The blend function.
     * @param {Number} [options.strength=1.0] - The bloom strength.
     * @param {Number} [options.radius=0.4] - The bloom radius.
     * @param {Number} [options.threshold=0.85] - The luminosity threshold.
     * @param {Number} [options.smoothWidth=0.01] - The smooth width for threshold.
     * @param {Number} [options.nMips=5] - The number of MIP levels.
     * @param {Object} [options.gBufferTextures=null] - G-Buffer textures from RenderPass.
     * @param {Texture} [options.gBufferTextures.gDepth] - G-Buffer depth texture.
     */

    constructor(scene, camera, options = {}) {

        const {
            blendFunction = BlendFunction.ADD,  // 使用 ADD，模拟 UnrealBloomPass 的 AdditiveBlending
            strength = 1.0,
            radius = 0.4,  // UnrealBloomPass 默认使用 0.1，但这里使用 0.4 以获得更明显的效果
            threshold = 0.85,
            smoothWidth = 0.01,
            nMips = 5,
            gBufferTextures = null
        } = options;

        super("SelectiveUnrealBloomEffect", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            uniforms: new Map([
                ["map", new Uniform(null)],
                ["intensity", new Uniform(1.0)],  // 默认 1.0，因为 strength 已经在 composite 中应用
                ["bloomColor", new Uniform(new Color(0xffffff))]  // 默认白色，不改变颜色
            ])
        });

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
         * G-Buffer textures (if provided).
         *
         * @type {Object|null}
         * @private
         */
        this.gBufferTextures = gBufferTextures || null;

        /**
         * The bloom strength.
         *
         * @type {Number}
         */
        this.strength = strength;

        /**
         * The bloom radius.
         *
         * @type {Number}
         */
        this.radius = radius;

        /**
         * The luminosity threshold.
         *
         * @type {Number}
         */
        this.threshold = threshold;

        /**
         * The smooth width for threshold.
         *
         * @type {Number}
         */
        this.smoothWidth = smoothWidth;

        /**
         * The number of MIP levels.
         *
         * @type {Number}
         */
        this.nMips = nMips;

        /**
         * A depth pass.
         *
         * @type {DepthPass}
         * @private
         */
        this.depthPass = new DepthPass(scene, camera);

        /**
         * A clear pass.
         *
         * @type {ClearPass}
         * @private
         */
        this.clearPass = new ClearPass(true, false, false);
        this.clearPass.overrideClearColor = new Color(0x000000);

        /**
         * A depth mask pass.
         *
         * @type {ShaderPass}
         * @private
         */
        this.depthMaskPass = new ShaderPass(new DepthMaskMaterial());

        const depthMaskMaterial = this.depthMaskMaterial;
        depthMaskMaterial.copyCameraSettings(camera);
        depthMaskMaterial.depthBuffer1 = this.depthPass.texture;
        depthMaskMaterial.depthPacking1 = RGBADepthPacking;
        depthMaskMaterial.depthMode = EqualDepth;
        this.depthMaskMaterial.epsilon = 0.000009;

        // 如果提供了GBuffer，使用gDepth作为主场景深度缓冲
        const useGBuffer = this.gBufferTextures && this.gBufferTextures.gDepth;
        if (useGBuffer) {
            depthMaskMaterial.depthBuffer0 = this.gBufferTextures.gDepth;
            depthMaskMaterial.depthPacking0 = BasicDepthPacking;
        }

        /**
         * A render target for masked bloom.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetMasked = new WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.renderTargetMasked.texture.name = "UnrealBloom.Masked";

        /**
         * Render targets for horizontal blur.
         *
         * @type {WebGLRenderTarget[]}
         * @private
         */
        this.renderTargetsHorizontal = [];

        /**
         * Render targets for vertical blur.
         *
         * @type {WebGLRenderTarget[]}
         * @private
         */
        this.renderTargetsVertical = [];

        /**
         * Render target for bright areas.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetBright = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
        this.renderTargetBright.texture.name = "UnrealBloom.bright";
        this.renderTargetBright.texture.generateMipmaps = false;

        /**
         * Luminosity high pass material.
         *
         * @type {LuminosityHighPassMaterial}
         * @private
         */
        this.materialHighPassFilter = new LuminosityHighPassMaterial();
        this.materialHighPassFilter.uniforms.luminosityThreshold.value = threshold;
        this.materialHighPassFilter.uniforms.smoothWidth.value = smoothWidth;

        /**
         * Separable blur materials.
         *
         * @type {SeparableGaussianBlurMaterial[]}
         * @private
         */
        this.separableBlurMaterials = [];

        /**
         * Composite material.
         *
         * @type {UnrealBloomCompositeMaterial}
         * @private
         */
        this.compositeMaterial = new UnrealBloomCompositeMaterial(nMips);
        this.compositeMaterial.uniforms.bloomStrength.value = strength;
        this.compositeMaterial.uniforms.bloomRadius.value = radius;

        /**
         * Bloom factors for each MIP level.
         *
         * @type {Number[]}
         */
        this.bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];

        /**
         * Bloom tint colors for each MIP level.
         *
         * @type {Vector3[]}
         */
        this.bloomTintColors = [
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1)
        ];


        /**
         * Blur direction X.
         *
         * @type {Vector2}
         * @private
         */
        this.blurDirectionX = new Vector2(1.0, 0.0);

        /**
         * Blur direction Y.
         *
         * @type {Vector2}
         * @private
         */
        this.blurDirectionY = new Vector2(0.0, 1.0);

        /**
         * A selection of objects.
         *
         * @type {Selection}
         * @readonly
         */
        this.selection = new Selection();

        /**
         * Backing data for {@link inverted}.
         *
         * @type {Boolean}
         * @private
         */
        this._inverted = false;

        /**
         * Backing data for {@link ignoreBackground}.
         *
         * @type {Boolean}
         * @private
         */
        this._ignoreBackground = false;

        // Initialize render targets and materials
        this._initializeRenderTargets();

    }

    /**
     * Initializes render targets and blur materials.
     *
     * @private
     */

    _initializeRenderTargets() {

        const kernelSizeArray = [3, 5, 7, 9, 11];
        let resx = Math.round(1 / 2);
        let resy = Math.round(1 / 2);

        for (let i = 0; i < this.nMips; i++) {

            const renderTargetHorizontal = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            renderTargetHorizontal.texture.name = "UnrealBloom.h" + i;
            renderTargetHorizontal.texture.generateMipmaps = false;
            this.renderTargetsHorizontal.push(renderTargetHorizontal);

            const renderTargetVertical = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            renderTargetVertical.texture.name = "UnrealBloom.v" + i;
            renderTargetVertical.texture.generateMipmaps = false;
            this.renderTargetsVertical.push(renderTargetVertical);

            this.separableBlurMaterials.push(new SeparableGaussianBlurMaterial(kernelSizeArray[i]));
            this.separableBlurMaterials[i].uniforms.invSize.value = new Vector2(1 / resx, 1 / resy);

            resx = Math.round(resx / 2);
            resy = Math.round(resy / 2);

        }

        // Set composite material textures
        this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0].texture;
        this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1].texture;
        this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2].texture;
        this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3].texture;
        this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4].texture;
        this.compositeMaterial.uniforms.bloomFactors.value = this.bloomFactors;
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;

    }

    set mainScene(value) {

        this.depthPass.mainScene = value;

    }

    set mainCamera(value) {

        this.camera = value;
        this.depthPass.mainCamera = value;
        this.depthMaskMaterial.copyCameraSettings(value);

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
     * The depth mask material.
     *
     * @type {DepthMaskMaterial}
     * @private
     */

    get depthMaskMaterial() {

        return this.depthMaskPass.fullscreenMaterial;

    }

    /**
     * Indicates whether the selection should be considered inverted.
     *
     * @type {Boolean}
     */

    get inverted() {

        return this._inverted;

    }

    set inverted(value) {

        this._inverted = value;
        this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;

    }

    /**
     * Indicates whether the background colors will be ignored.
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

    /**
     * Sets the depth texture.
     *
     * @param {Texture} depthTexture - A depth texture.
     * @param {DepthPackingStrategies} [depthPacking=BasicDepthPacking] - The depth packing.
     */

    setDepthTexture(depthTexture, depthPacking = BasicDepthPacking) {

        this.depthMaskMaterial.depthBuffer0 = depthTexture;
        this.depthMaskMaterial.depthPacking0 = depthPacking;

    }

    /**
     * Sets the G-Buffer textures.
     *
     * @param {Object|null} gBufferTextures - The G-Buffer textures.
     * @param {Texture} [gBufferTextures.gDepth] - The depth texture from G-Buffer.
     */

    setGBufferTextures(gBufferTextures) {

        this.gBufferTextures = gBufferTextures;

        const useGBuffer = gBufferTextures && gBufferTextures.gDepth;

        if (useGBuffer) {
            this.depthMaskMaterial.depthBuffer0 = gBufferTextures.gDepth;
            this.depthMaskMaterial.depthPacking0 = BasicDepthPacking;
        }

    }

    /**
     * Updates this effect.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     */

    update(renderer, inputBuffer, deltaTime) {

        const camera = this.camera;
        const selection = this.selection;
        const inverted = this.inverted;
        let renderTarget = inputBuffer;

        timeLog("SelectiveUnrealBloomEffect.update");

        // Apply depth mask if needed
        if (this.ignoreBackground || !inverted || selection.size > 0) {

            // Render selected objects depth
            timeLog("SelectiveUnrealBloomEffect.update.depthPass");
            const mask = camera.layers.mask;
            camera.layers.set(selection.layer);
            this.depthPass.render(renderer, undefined, undefined, undefined, undefined, undefined, {
                projectObject: true,
                updateMatrixWorld: false,
                useProgramCache: false
            });
            camera.layers.mask = mask;
            timeEndLog("SelectiveUnrealBloomEffect.update.depthPass");

            // Apply depth mask
            timeLog("SelectiveUnrealBloomEffect.update.maskRender");
            renderTarget = this.renderTargetMasked;
            this.clearPass.render(renderer, renderTarget);
            this.depthMaskPass.render(renderer, inputBuffer, renderTarget, undefined, undefined, {
                projectObject: true,
                updateMatrixWorld: false,
                useProgramCache: false
            });
            timeEndLog("SelectiveUnrealBloomEffect.update.maskRender");

        }

        // UnrealBloomPass algorithm
        timeLog("SelectiveUnrealBloomEffect.update.unrealBloom");

        // Create temporary shader passes for rendering
        const highPassPass = new ShaderPass(this.materialHighPassFilter, "tDiffuse");
        const compositePass = new ShaderPass(this.compositeMaterial);

        // 1. Extract Bright Areas
        this.materialHighPassFilter.uniforms.tDiffuse.value = renderTarget.texture;
        this.materialHighPassFilter.uniforms.luminosityThreshold.value = this.threshold;
        this.materialHighPassFilter.uniforms.smoothWidth.value = this.smoothWidth;
        highPassPass.render(renderer, renderTarget, this.renderTargetBright);

        // 2. Blur All the mips progressively
        let inputRenderTarget = this.renderTargetBright;

        for (let i = 0; i < this.nMips; i++) {

            const blurMaterial = this.separableBlurMaterials[i];
            const blurPass = new ShaderPass(blurMaterial, "colorTexture");

            // Horizontal blur
            blurMaterial.uniforms.colorTexture.value = inputRenderTarget.texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionX;
            blurPass.render(renderer, inputRenderTarget, this.renderTargetsHorizontal[i]);

            // Vertical blur
            blurMaterial.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionY;
            blurPass.render(renderer, this.renderTargetsHorizontal[i], this.renderTargetsVertical[i]);

            inputRenderTarget = this.renderTargetsVertical[i];

        }

        // 3. Composite All the mips
        this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
        this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
        this.compositeMaterial.uniforms.bloomFactors.value = this.bloomFactors;
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
        compositePass.render(renderer, this.renderTargetsVertical[0], this.renderTargetsHorizontal[0]);

        // 4. Store result for final blending
        this.uniforms.get("map").value = this.renderTargetsHorizontal[0].texture;
        // intensity 不需要在这里设置，它应该保持用户设置的值或默认值 1.0

        timeEndLog("SelectiveUnrealBloomEffect.update.unrealBloom");
        timeEndLog("SelectiveUnrealBloomEffect.update");

    }

    /**
     * Updates the size of internal render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */

    setSize(width, height) {

        let resx = Math.round(width / 2);
        let resy = Math.round(height / 2);

        this.renderTargetBright.setSize(resx, resy);
        this.renderTargetMasked.setSize(width, height);
        this.depthPass.setSize(width, height);

        for (let i = 0; i < this.nMips; i++) {

            this.renderTargetsHorizontal[i].setSize(resx, resy);
            this.renderTargetsVertical[i].setSize(resx, resy);
            this.separableBlurMaterials[i].setSize(resx, resy);

            resx = Math.round(resx / 2);
            resy = Math.round(resy / 2);

        }

    }

    /**
     * Performs initialization tasks.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Boolean} alpha - Whether the renderer uses the alpha channel.
     * @param {Number} frameBufferType - The type of the main frame buffers.
     */

    initialize(renderer, alpha, frameBufferType) {

        this.clearPass.initialize(renderer, alpha, frameBufferType);
        this.depthPass.initialize(renderer, alpha, frameBufferType);
        this.depthMaskPass.initialize(renderer, alpha, frameBufferType);

        if (renderer !== null && renderer.capabilities.logarithmicDepthBuffer) {

            this.depthMaskPass.fullscreenMaterial.defines.LOG_DEPTH = "1";

        }

        if (frameBufferType !== undefined) {

            this.renderTargetMasked.texture.type = frameBufferType;

            if (renderer !== null && renderer.outputColorSpace === SRGBColorSpace) {

                this.renderTargetMasked.texture.colorSpace = SRGBColorSpace;

            }

        }

    }

    /**
     * The bloom intensity.
     *
     * This is a separate control from strength. Strength is applied in the composite shader,
     * while intensity is applied in the final blend shader for fine-tuning.
     *
     * @type {Number}
     */

    get intensity() {

        return this.uniforms.get("intensity").value;

    }

    set intensity(value) {

        this.uniforms.get("intensity").value = value;

    }

    /**
     * The bloom color.
     *
     * @type {Color}
     */

    get bloomColor() {

        return this.uniforms.get("bloomColor").value;

    }

    set bloomColor(value) {

        this.uniforms.get("bloomColor").value.copy(new Color(value));

    }

}
