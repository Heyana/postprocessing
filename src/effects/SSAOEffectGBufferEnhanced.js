import { BasicDepthPacking, Color, RepeatWrapping, RGBAFormat, Uniform, WebGLRenderTarget } from "three";
import { Resolution } from "../core/Resolution.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import { NoiseTexture } from "../textures/NoiseTexture.js";
import { SSAOMaterial } from "../materials/SSAOMaterial.js";
import { DepthDownsamplingPass } from "../passes/DepthDownsamplingPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/ssao.frag";

const NOISE_TEXTURE_SIZE = 64;

/**
 * Enhanced SSAO Effect with G-Buffer integration.
 * 
 * This enhanced version can use G-Buffer data (normal and depth textures) 
 * if available, falling back to the original implementation if not.
 * 
 * Benefits of G-Buffer integration:
 * - Performance: Avoids redundant geometry rendering
 * - Consistency: Uses same geometric data as other effects
 * - Quality: Higher precision from shared float textures
 */
export class SSAOEffectGBufferEnhanced extends Effect {

    /**
     * Constructs a new enhanced SSAO effect.
     *
     * @param {Camera} camera - The main camera.
     * @param {Texture} [normalBuffer] - A texture that contains the scene normals.
     * @param {Object} [options] - The options.
     * @param {Object} [options.gBufferTextures] - G-Buffer textures if available.
     * @param {Texture} [options.gBufferTextures.gNormal] - G-Buffer normal texture.
     * @param {Texture} [options.gBufferTextures.gDepth] - G-Buffer depth texture.
     * @param {Texture} [options.gBufferTextures.gPosition] - G-Buffer position texture.
     * @param {BlendFunction} [options.blendFunction=BlendFunction.MULTIPLY] - The blend function.
     * @param {Number} [options.samples=9] - The amount of samples per pixel.
     * @param {Number} [options.rings=7] - The amount of spiral turns in the occlusion sampling pattern.
     * @param {Number} [options.radius=0.1825] - The occlusion sampling radius.
     * @param {Number} [options.intensity=1.0] - The intensity of the ambient occlusion.
     * @param {Number} [options.bias=0.025] - An occlusion bias.
     * @param {Number} [options.fade=0.01] - Influences the smoothness of the shadows.
     * @param {Color} [options.color=null] - The color of the ambient occlusion.
     * @param {Number} [options.resolutionScale=1.0] - The resolution scale.
     * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - The horizontal resolution.
     * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - The vertical resolution.
     */
    constructor(camera, normalBuffer, {
        gBufferTextures = null,
        blendFunction = BlendFunction.MULTIPLY,
        samples = 9,
        rings = 7,
        normalDepthBuffer = null,
        depthAwareUpsampling = true,
        worldDistanceThreshold,
        worldDistanceFalloff,
        worldProximityThreshold,
        worldProximityFalloff,
        distanceThreshold = 0.97,
        distanceFalloff = 0.03,
        rangeThreshold = 0.0005,
        rangeFalloff = 0.001,
        minRadiusScale = 0.1,
        luminanceInfluence = 0.7,
        radius = 0.1825,
        intensity = 1.0,
        bias = 0.025,
        fade = 0.01,
        color = null,
        resolutionScale = 1.0,
        resolutionX = Resolution.AUTO_SIZE,
        resolutionY = Resolution.AUTO_SIZE
    } = {}) {

        super("SSAOEffectGBufferEnhanced", fragmentShader, {
            blendFunction,
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["THRESHOLD", "0.997"]
            ]),
            uniforms: new Map([
                ["aoBuffer", new Uniform(null)],
                ["normalDepthBuffer", new Uniform(normalDepthBuffer)],
                ["luminanceInfluence", new Uniform(luminanceInfluence)],
                ["color", new Uniform(null)],
                ["intensity", new Uniform(intensity)],
                ["scale", new Uniform(0.0)]
            ])
        });

        /**
         * G-Buffer textures (if available).
         *
         * @type {Object|null}
         * @private
         */
        this.gBufferTextures = gBufferTextures;

        /**
         * Indicates whether G-Buffer data is being used.
         *
         * @type {Boolean}
         * @private
         */
        this.usingGBuffer = this.gBufferTextures && this.gBufferTextures.gNormal;

        /**
         * The main camera.
         *
         * @type {Camera}
         * @private
         */
        this.camera = camera;

        /**
         * A render target for AO.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTarget = new WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.renderTarget.texture.name = "AO.Target";
        this.uniforms.get("aoBuffer").value = this.renderTarget.texture;

        /**
         * The resolution.
         *
         * @type {Resolution}
         */
        const resolution = this.resolution = new Resolution(this, resolutionX, resolutionY, resolutionScale);
        resolution.addEventListener("change", (e) => this.setSize(resolution.baseWidth, resolution.baseHeight));

        /**
         * A depth downsampling pass (only used if G-Buffer is not available).
         *
         * @type {DepthDownsamplingPass|null}
         * @private
         */
        this.depthDownsamplingPass = null;

        // Only create depth downsampling pass if we're not using G-Buffer
        if (!this.usingGBuffer) {
            this.depthDownsamplingPass = new DepthDownsamplingPass({
                normalBuffer: normalBuffer || this.gBufferTextures?.gNormal,
                resolutionScale
            });
            this.depthDownsamplingPass.enabled = (normalDepthBuffer === null);
        }

        /**
         * An SSAO pass.
         *
         * @type {ShaderPass}
         * @private
         */
        this.ssaoPass = new ShaderPass(new SSAOMaterial(camera));

        // Create noise texture
        const noiseTexture = new NoiseTexture(NOISE_TEXTURE_SIZE, NOISE_TEXTURE_SIZE, RGBAFormat);
        noiseTexture.wrapS = noiseTexture.wrapT = RepeatWrapping;

        // Configure SSAO material
        const ssaoMaterial = this.ssaoMaterial;

        // Use G-Buffer normal texture if available, otherwise use provided normalBuffer
        if (this.usingGBuffer) {
            ssaoMaterial.normalBuffer = this.gBufferTextures.gNormal;
            console.log("✅ SSAO: 使用G-Buffer法线数据");
        } else {
            ssaoMaterial.normalBuffer = normalBuffer;
            console.log("⚠️ SSAO: 使用传统法线缓冲区");
        }

        ssaoMaterial.noiseTexture = noiseTexture;
        ssaoMaterial.minRadiusScale = minRadiusScale;
        ssaoMaterial.samples = samples;
        ssaoMaterial.radius = radius;
        ssaoMaterial.rings = rings;
        ssaoMaterial.fade = fade;
        ssaoMaterial.bias = bias;

        ssaoMaterial.distanceThreshold = distanceThreshold;
        ssaoMaterial.distanceFalloff = distanceFalloff;
        ssaoMaterial.proximityThreshold = rangeThreshold;
        ssaoMaterial.proximityFalloff = rangeFalloff;

        // World distance/proximity thresholds
        if (worldDistanceThreshold !== undefined) {
            ssaoMaterial.worldDistanceThreshold = worldDistanceThreshold;
        }
        if (worldDistanceFalloff !== undefined) {
            ssaoMaterial.worldDistanceFalloff = worldDistanceFalloff;
        }
        if (worldProximityThreshold !== undefined) {
            ssaoMaterial.worldProximityThreshold = worldProximityThreshold;
        }
        if (worldProximityFalloff !== undefined) {
            ssaoMaterial.worldProximityFalloff = worldProximityFalloff;
        }

        // Handle normal depth buffer
        if (this.usingGBuffer) {
            // Use G-Buffer data directly - no need for normalDepthBuffer
            this.defines.set("GBUFFER_NORMALS", "1");
        } else if (normalDepthBuffer !== null) {
            this.ssaoMaterial.normalDepthBuffer = normalDepthBuffer;
            this.defines.set("NORMAL_DEPTH", "1");
        }

        this.depthAwareUpsampling = depthAwareUpsampling;
        this.color = color;

        // Log the configuration
        this.logConfiguration();
    }

    /**
     * Logs the current configuration for debugging.
     *
     * @private
     */
    logConfiguration() {
        console.log("🔧 SSAO Configuration:");
        console.log(`  - Using G-Buffer: ${this.usingGBuffer ? '✅' : '❌'}`);
        console.log(`  - Depth Downsampling: ${this.depthDownsamplingPass?.enabled ? '✅' : '❌'}`);
        console.log(`  - Normal Buffer: ${this.ssaoMaterial.normalBuffer ? '✅' : '❌'}`);
        console.log(`  - Samples: ${this.ssaoMaterial.samples}`);
        console.log(`  - Radius: ${this.ssaoMaterial.radius}`);
        console.log(`  - Intensity: ${this.uniforms.get("intensity").value}`);
    }

    /**
     * Updates G-Buffer textures (can be called at runtime).
     *
     * @param {Object} gBufferTextures - New G-Buffer textures.
     */
    updateGBufferTextures(gBufferTextures) {
        if (!gBufferTextures || !gBufferTextures.gNormal) {
            console.warn("SSAO: Invalid G-Buffer textures provided");
            return;
        }

        const wasUsingGBuffer = this.usingGBuffer;
        this.gBufferTextures = gBufferTextures;
        this.usingGBuffer = true;

        // Update normal buffer
        this.ssaoMaterial.normalBuffer = gBufferTextures.gNormal;

        // If we weren't using G-Buffer before, disable depth downsampling
        if (!wasUsingGBuffer && this.depthDownsamplingPass) {
            this.depthDownsamplingPass.enabled = false;
            console.log("✅ SSAO: 切换到G-Buffer模式，禁用深度下采样");
        }

        this.defines.set("GBUFFER_NORMALS", "1");
        this.defines.delete("NORMAL_DEPTH");
        this.setChanged();

        console.log("✅ SSAO: G-Buffer纹理已更新");
    }

    /**
     * The SSAO material.
     *
     * @type {SSAOMaterial}
     */
    get ssaoMaterial() {
        return this.ssaoPass.fullscreenMaterial;
    }

    /**
     * Sets the main camera.
     *
     * @type {Camera}
     */
    set mainCamera(value) {
        this.camera = value;
        this.ssaoMaterial.copyCameraSettings(value);
    }

    /**
     * Sets the normal buffer.
     *
     * @type {Texture}
     */
    get normalBuffer() {
        return this.ssaoMaterial.normalBuffer;
    }

    set normalBuffer(value) {
        this.ssaoMaterial.normalBuffer = value;
        if (this.depthDownsamplingPass) {
            this.depthDownsamplingPass.fullscreenMaterial.normalBuffer = value;
        }
    }

    /**
     * The intensity.
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
     * The color of the ambient occlusion.
     *
     * @type {Color}
     */
    get color() {
        return this.uniforms.get("color").value;
    }

    set color(value) {
        const uniforms = this.uniforms;
        const defines = this.defines;

        if (value !== null) {
            if (defines.has("COLORIZE")) {
                uniforms.get("color").value.set(value);
            } else {
                defines.set("COLORIZE", "1");
                uniforms.get("color").value = new Color(value);
                this.setChanged();
            }
        } else if (defines.has("COLORIZE")) {
            defines.delete("COLORIZE");
            uniforms.get("color").value = null;
            this.setChanged();
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
        const renderTarget = this.renderTarget;

        // Only run depth downsampling if we're not using G-Buffer
        if (!this.usingGBuffer && this.depthDownsamplingPass?.enabled) {
            this.depthDownsamplingPass.render(renderer);
        }

        this.ssaoPass.render(renderer, null, renderTarget);
    }

    /**
     * Sets the depth texture.
     *
     * @param {Texture} depthTexture - A depth texture.
     * @param {DepthPackingStrategies} [depthPacking=BasicDepthPacking] - The depth packing.
     */
    setDepthTexture(depthTexture, depthPacking = BasicDepthPacking) {
        if (this.usingGBuffer && this.gBufferTextures.gDepth) {
            // Use G-Buffer depth instead
            this.ssaoMaterial.depthBuffer = this.gBufferTextures.gDepth;
            this.ssaoMaterial.depthPacking = BasicDepthPacking; // G-Buffer uses linear depth
            console.log("✅ SSAO: 使用G-Buffer深度数据");
        } else {
            // Fallback to provided depth texture
            if (this.depthDownsamplingPass) {
                this.depthDownsamplingPass.setDepthTexture(depthTexture, depthPacking);
            }
            this.ssaoMaterial.depthBuffer = depthTexture;
            this.ssaoMaterial.depthPacking = depthPacking;
        }
    }

    /**
     * Sets the size.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {
        const resolution = this.resolution;
        resolution.setBaseSize(width, height);
        const w = resolution.width, h = resolution.height;

        this.ssaoMaterial.copyCameraSettings(this.camera);
        this.ssaoMaterial.setSize(w, h);
        this.renderTarget.setSize(w, h);

        if (this.depthDownsamplingPass) {
            this.depthDownsamplingPass.resolution.scale = resolution.scale;
            this.depthDownsamplingPass.setSize(width, height);
        }
    }

    /**
     * Performs initialization tasks.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
     * @param {Number} frameBufferType - The type of the main frame buffers.
     */
    initialize(renderer, alpha, frameBufferType) {
        try {
            if (this.usingGBuffer) {
                // Using G-Buffer - no need for additional initialization
                console.log("✅ SSAO: 使用G-Buffer数据，跳过传统初始化");
                return;
            }

            // Traditional initialization for non-G-Buffer mode
            let normalDepthBuffer = this.uniforms.get("normalDepthBuffer").value;

            if (normalDepthBuffer === null && this.depthDownsamplingPass) {
                this.depthDownsamplingPass.initialize(renderer, alpha, frameBufferType);
                normalDepthBuffer = this.depthDownsamplingPass.texture;
                this.uniforms.get("normalDepthBuffer").value = normalDepthBuffer;
                this.ssaoMaterial.normalDepthBuffer = normalDepthBuffer;
                this.defines.set("NORMAL_DEPTH", "1");
            }
        } catch (e) {
            // Not supported
            if (this.depthDownsamplingPass) {
                this.depthDownsamplingPass.enabled = false;
            }
            console.warn("SSAO initialization failed:", e);
        }
    }

    /**
     * Returns performance metrics.
     *
     * @returns {Object} Performance information.
     */
    getPerformanceInfo() {
        return {
            usingGBuffer: this.usingGBuffer,
            depthDownsamplingEnabled: this.depthDownsamplingPass?.enabled || false,
            samples: this.ssaoMaterial.samples,
            radius: this.ssaoMaterial.radius,
            resolution: `${this.resolution.width}x${this.resolution.height}`,
            resolutionScale: this.resolution.scale
        };
    }
}
