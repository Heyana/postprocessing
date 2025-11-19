import {
    Color,
    HalfFloatType,
    RGBAFormat,
    SRGBColorSpace,
    Uniform,
    UniformsUtils,
    Vector2,
    Vector3,
    WebGLRenderTarget,
    ShaderMaterial
} from "three";

import { BlendFunction } from "../enums/BlendFunction.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import { Selection } from "../core/Selection.js";
import { LuminosityHighPassMaterial } from "../materials/LuminosityHighPassMaterial.js";
import { SeparableGaussianBlurMaterial } from "../materials/SeparableGaussianBlurMaterial.js";
import { UnrealBloomCompositeMaterial } from "../materials/UnrealBloomCompositeMaterial.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { RenderPass } from "../passes/RenderPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/layer-based-glow.frag";

/**
 * A layer-based glow effect using Selection.
 *
 * This effect applies bloom/glow to selected objects using Selection system,
 * similar to GlowMTU's approach. It uses Selection to manage objects and
 * applies UnrealBloomPass algorithm for the glow effect.
 *
 * @example
 * const effect = new LayerBasedGlowEffect(scene, camera, {
 *   strength: 1.5,
 *   radius: 0.4,
 *   threshold: 0.85
 * });
 * 
 * // Add objects to the selection
 * effect.selection.add(glowObject);
 */

export class LayerBasedGlowEffect extends Effect {

    /**
     * Constructs a new layer-based glow effect.
     *
     * @param {Scene} scene - The main scene.
     * @param {Camera} camera - The main camera.
     * @param {Object} [options] - The options.
     * @param {BlendFunction} [options.blendFunction=BlendFunction.ADD] - The blend function.
     * @param {Number} [options.strength=1.0] - The glow strength.
     * @param {Number} [options.radius=0.4] - The glow radius.
     * @param {Number} [options.threshold=0.85] - The luminosity threshold.
     * @param {Number} [options.smoothWidth=0.01] - The smooth width for threshold.
     * @param {Number} [options.nMips=5] - The number of MIP levels.
     * @param {Boolean} [options.useHighPass=true] - Whether to use high-pass filter.
     * @param {Color|number|string} [options.bloomColor=0xffffff] - The glow color.
     */

    constructor(scene, camera, {
        blendFunction = BlendFunction.ADD,
        strength = 1.0,
        radius = 0.4,
        threshold = 0.3,
        smoothWidth = 0.2,
        nMips = 5,
        useHighPass = true,
        bloomColor = 0xffffff
    } = {}) {

        super("LayerBasedGlowEffect", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            uniforms: new Map([
                ["map", new Uniform(null)],
                ["intensity", new Uniform(1.0)],
                ["bloomColor", new Uniform(new Color(bloomColor))]
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
         * A selection of objects.
         *
         * @type {Selection}
         * @readonly
         */
        this.selection = new Selection();

        /**
         * The glow strength.
         *
         * @type {Number}
         */
        this.strength = strength;

        /**
         * The glow radius.
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
         * Whether to use high-pass filter.
         *
         * @type {Boolean}
         */
        this.useHighPass = useHighPass;

        /**
         * A render pass for the glow layer.
         *
         * @type {RenderPass}
         * @private
         */
        this.layerRenderPass = new RenderPass(scene, camera);
        this.layerRenderPass.clear = false; // We handle clearing manually
        this.layerRenderPass.clearDepth = false; // Don't clear depth in RenderPass, we do it in clearPass
        this.layerRenderPass.selection = this.selection; // Use selection for layer management

        /**
         * A clear pass.
         *
         * @type {ClearPass}
         * @private
         */
        this.clearPass = new ClearPass(true, true, false); // Clear color and depth
        this.clearPass.overrideClearColor = new Color(0x000000);
        this.clearPass.renderToScreen = false;

        /**
         * Render target for the glow layer.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetLayer = new WebGLRenderTarget(1, 1, { depthBuffer: true });
        this.renderTargetLayer.texture.name = "LayerBasedGlow.Layer";

        /**
         * A depth pass for the selected objects.
         *
         * @type {DepthPass}
         * @private
         */
        this.depthPass = new DepthPass(scene, camera);

        /**
         * Render target for bright areas.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetBright = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
        this.renderTargetBright.texture.name = "LayerBasedGlow.bright";
        this.renderTargetBright.texture.generateMipmaps = false;

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
        this.bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2].slice(0, nMips);

        /**
         * Bloom tint colors for each MIP level.
         *
         * @type {Vector3[]}
         */
        this.bloomTintColors = new Array(nMips).fill(0).map(() => new Vector3(1, 1, 1));

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

        // Initialize render targets and materials
        this._initializeRenderTargetsAndMaterials();

    }

    /**
     * Initializes render targets and blur materials.
     *
     * @private
     */
    _initializeRenderTargetsAndMaterials() {

        const kernelSizeArray = [3, 5, 7, 9, 11];
        let resx = Math.round(1 / 2);
        let resy = Math.round(1 / 2);

        for (let i = 0; i < this.nMips; i++) {

            const rtH = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            rtH.texture.name = "LayerBasedGlow.h" + i;
            rtH.texture.generateMipmaps = false;
            this.renderTargetsHorizontal.push(rtH);

            const rtV = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            rtV.texture.name = "LayerBasedGlow.v" + i;
            rtV.texture.generateMipmaps = false;
            this.renderTargetsVertical.push(rtV);

            const blurMat = new SeparableGaussianBlurMaterial(kernelSizeArray[i] ?? kernelSizeArray[kernelSizeArray.length - 1]);
            blurMat.uniforms.invSize.value = new Vector2(1 / resx, 1 / resy);
            this.separableBlurMaterials.push(blurMat);

            resx = Math.max(1, Math.round(resx / 2));
            resy = Math.max(1, Math.round(resy / 2));

        }

        // Set composite material textures
        this.compositeMaterial.uniforms.blurTexture1.value = this.renderTargetsVertical[0]?.texture || null;
        this.compositeMaterial.uniforms.blurTexture2.value = this.renderTargetsVertical[1]?.texture || null;
        this.compositeMaterial.uniforms.blurTexture3.value = this.renderTargetsVertical[2]?.texture || null;
        this.compositeMaterial.uniforms.blurTexture4.value = this.renderTargetsVertical[3]?.texture || null;
        this.compositeMaterial.uniforms.blurTexture5.value = this.renderTargetsVertical[4]?.texture || null;
        this.compositeMaterial.uniforms.bloomFactors.value = this.bloomFactors;
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;

    }

    /**
     * Sets the main scene.
     *
     * @param {Scene} value - The scene.
     */
    set mainScene(value) {

        this.scene = value;
        if (this.layerRenderPass) {
            this.layerRenderPass.mainScene = value;
        }

    }

    /**
     * Sets the main camera.
     *
     * @param {Camera} value - The camera.
     */
    set mainCamera(value) {

        this.camera = value;
        if (this.layerRenderPass) {
            this.layerRenderPass.mainCamera = value;
        }

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
     * Updates this effect.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     */

    update(renderer, inputBuffer, deltaTime) {

        // 1. Render only the selected objects to a separate render target
        // RenderPass will automatically use selection.layer if selection is set
        // Clear the layer render target
        this.clearPass.render(renderer, this.renderTargetLayer, this.renderTargetLayer);

        // Render depth of selected objects for depth masking
        if (this.selection.size > 0) {
            const oldLayerMask = this.camera.layers.mask;
            this.camera.layers.set(this.selection.layer);
            this.depthPass.render(renderer, undefined, undefined, undefined, undefined, undefined, {
                projectObject: true,
                updateMatrixWorld: false,
                useProgramCache: false
            });
            this.camera.layers.mask = oldLayerMask;
        }

        // Render the glow layer (RenderPass uses inputBuffer as render target and selection for layer)
        this.layerRenderPass.render(renderer, this.renderTargetLayer, this.renderTargetLayer);

        // 2. Apply high-pass filter (optional)
        let source = this.renderTargetLayer;
        if (this.useHighPass) {
            this.materialHighPassFilter.uniforms.tDiffuse.value = this.renderTargetLayer.texture;
            this.materialHighPassFilter.uniforms.luminosityThreshold.value = this.threshold;
            this.materialHighPassFilter.uniforms.smoothWidth.value = this.smoothWidth;
            const highPassPass = new ShaderPass(this.materialHighPassFilter, "tDiffuse");
            highPassPass.render(renderer, this.renderTargetLayer, this.renderTargetBright);
            source = this.renderTargetBright;
        }

        // 3. Apply separable Gaussian blur for each MIP level
        let currentInput = source;

        for (let i = 0; i < this.nMips; i++) {

            const blurMaterial = this.separableBlurMaterials[i];
            const blurPass = new ShaderPass(blurMaterial, "colorTexture");

            // Horizontal blur
            blurMaterial.uniforms.colorTexture.value = currentInput.texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionX;
            blurPass.render(renderer, currentInput, this.renderTargetsHorizontal[i]);

            // Vertical blur
            blurMaterial.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionY;
            blurPass.render(renderer, this.renderTargetsHorizontal[i], this.renderTargetsVertical[i]);

            currentInput = this.renderTargetsVertical[i];

        }

        // 4. Composite all MIP levels
        this.compositeMaterial.uniforms.bloomStrength.value = this.strength;
        this.compositeMaterial.uniforms.bloomRadius.value = this.radius;
        this.compositeMaterial.uniforms.bloomFactors.value = this.bloomFactors;
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
        const compositePass = new ShaderPass(this.compositeMaterial);
        compositePass.render(renderer, this.renderTargetsVertical[0], this.renderTargetsHorizontal[0]);

        // 5. Store result for final blending
        this.uniforms.get("map").value = this.renderTargetsHorizontal[0].texture;

    }

    /**
     * Updates the size of internal render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {

        let resx = Math.max(1, Math.round(width / 2));
        let resy = Math.max(1, Math.round(height / 2));

        this.renderTargetLayer.setSize(width, height);
        this.renderTargetBright.setSize(resx, resy);
        if (this.depthPass) this.depthPass.setSize(width, height);

        for (let i = 0; i < this.nMips; i++) {

            this.renderTargetsHorizontal[i].setSize(resx, resy);
            this.renderTargetsVertical[i].setSize(resx, resy);
            this.separableBlurMaterials[i].setSize(resx, resy);

            resx = Math.max(1, Math.round(resx / 2));
            resy = Math.max(1, Math.round(resy / 2));

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
        this.layerRenderPass.initialize(renderer, alpha, frameBufferType);
        if (this.depthPass) this.depthPass.initialize(renderer, alpha, frameBufferType);

        if (frameBufferType !== undefined) {

            this.renderTargetLayer.texture.type = frameBufferType;
            this.renderTargetBright.texture.type = frameBufferType;

            for (let i = 0; i < this.nMips; i++) {
                this.renderTargetsHorizontal[i].texture.type = frameBufferType;
                this.renderTargetsVertical[i].texture.type = frameBufferType;
            }

            if (renderer !== null && renderer.outputColorSpace === SRGBColorSpace) {
                this.renderTargetLayer.texture.colorSpace = SRGBColorSpace;
                this.renderTargetBright.texture.colorSpace = SRGBColorSpace;
                for (let i = 0; i < this.nMips; i++) {
                    this.renderTargetsHorizontal[i].texture.colorSpace = SRGBColorSpace;
                    this.renderTargetsVertical[i].texture.colorSpace = SRGBColorSpace;
                }
            }

        }

    }

    /**
     * The glow intensity.
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
     * The glow color.
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

