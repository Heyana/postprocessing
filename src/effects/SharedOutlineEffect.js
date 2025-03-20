import { Color, RepeatWrapping, Uniform, WebGLRenderTarget } from "three";
import { Resolution } from "../core/Resolution.js";
import { Selection } from "../core/Selection.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { KernelSize } from "../enums/KernelSize.js";
import { OutlineMaterial } from "../materials/OutlineMaterial.js";
import { KawaseBlurPass } from "../passes/KawaseBlurPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/outline.frag";
import vertexShader from "./glsl/outline.vert";
const myConsole = {
    log: (...args) => {
        return;
    },
    time: (...args) => {
        console.time(...args);
        return;
    },
    timeEnd: (...args) => {
        console.timeEnd(...args);
        return;
    }
}
/**
 * An outline effect that can share resources with other outline effects.
 */
export class SharedOutlineEffect extends Effect {

    /**
     * Constructs a new shared outline effect.
     *
     * @param {OutlineManager} outlineManager - The outline manager with shared resources.
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
     * @param {Number} [options.resolutionScale=0.5] - The resolution scale.
     * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - The horizontal resolution.
     * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - The vertical resolution.
     */
    constructor(outlineManager, {
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
        resolutionScale = 0.5,
        resolutionX = Resolution.AUTO_SIZE,
        resolutionY = Resolution.AUTO_SIZE,
        managerIndex = 10
    } = {}) {

        super("SharedOutlineEffect", fragmentShader, {
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
         * The outline manager providing shared resources.
         *
         * @type {OutlineManager}
         * @private
         */
        this.manager = outlineManager;

        /**
         * A render target for the edge detection.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetOutline = new WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.renderTargetOutline.texture.name = "Outline.Edges";
        this.uniforms.get("edgeTexture").value = this.renderTargetOutline.texture;

        // Use the shared mask texture
        this.uniforms.get("maskTexture").value = outlineManager.renderTargetMask.texture;

        /**
         * A blur pass.
         *
         * @type {KawaseBlurPass}
         */
        this.blurPass = new KawaseBlurPass({
            resolutionScale,
            resolutionX,
            resolutionY,
            kernelSize
        });
        this.blurPass.enabled = blur;

        /**
         * An outline detection pass.
         *
         * @type {ShaderPass}
         * @private
         */
        this.outlinePass = new ShaderPass(new OutlineMaterial());
        const outlineMaterial = this.outlinePass.fullscreenMaterial;
        outlineMaterial.inputBuffer = outlineManager.renderTargetMask.texture;

        /**
         * The current animation time.
         *
         * @type {Number}
         * @private
         */
        this.time = 0;

        /**
         * A selection of objects that will be outlined.
         *
         * @type {Selection}
         */
        this.selection = new Selection();

        /**
         * The pulse speed. Set to 0 to disable.
         *
         * @type {Number}
         */
        this.pulseSpeed = pulseSpeed;

        /**
         * The selection layer used for this effect.
         * This should be different for each effect to prevent mixing.
         * 
         * @type {Number}
         * @private
         */
        this._selectionLayer = this.selection.layer;

        // Update global reference for OutlineManager
        if (globalThis.SharedOutlineEffect === undefined) {
            globalThis.SharedOutlineEffect = SharedOutlineEffect;
        }
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
     * @return {Resolution} The resolution.
     */
    getResolution() {
        return this.blurPass.getResolution();
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
     * Updates this effect.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     */
    update(renderer, inputBuffer, deltaTime) {
        myConsole.time(`SharedOutlineEffect.update[layer=${this._selectionLayer}]`);
        myConsole.log(`开始渲染轮廓效果 - 层: ${this._selectionLayer}, 选中对象数: ${this.selection.size}`);

        // Collect all active objects from all SharedOutlineEffects
        // This is a static property shared across all instances
        if (SharedOutlineEffect.activeObjects === undefined) {
            SharedOutlineEffect.activeObjects = new Set();
        }

        // Store the current layer being processed
        if (SharedOutlineEffect.currentLayer === undefined) {
            SharedOutlineEffect.currentLayer = null;
        }

        // 更新计数器，用于跟踪渲染顺序
        if (SharedOutlineEffect.updateCounter === undefined) {
            SharedOutlineEffect.updateCounter = 0;
        }

        // Increment counter for this update cycle
        SharedOutlineEffect.updateCounter++;

        const renderCounter = SharedOutlineEffect.updateCounter;
        myConsole.log(`轮廓渲染计数: ${renderCounter} - 层: ${this._selectionLayer}`);

        // 设置当前处理的层
        this.manager.currentLayer = this._selectionLayer;
        SharedOutlineEffect.currentLayer = this._selectionLayer;

        // Add this effect's selected objects to the active set
        if (this.selection.size > 0) {
            for (const object of this.selection) {
                SharedOutlineEffect.activeObjects.add(object);
            }
        }

        // Update the pulse effect
        const uniforms = this.uniforms;
        const pulse = uniforms.get("pulse");

        pulse.value = 1;
        if (this.pulseSpeed > 0) {
            pulse.value = Math.cos(this.time * this.pulseSpeed * 10.0) * 0.375 + 0.625;
        }
        this.time += deltaTime;

        // Add objects from this effect's selection to the shared manager's selection for this layer
        if (this.selection.size > 0) {
            // Use the layer-specific selection
            const layerSelection = this.manager.getSelectionForLayer(this._selectionLayer);

            // Update the objects in this layer
            for (const object of this.selection) {
                if (!layerSelection.has(object)) {
                    layerSelection.add(object);
                    this.manager.setNeedsUpdate();
                }
            }

            // Update the shared resources - 每个效果独立渲染自己的层
            this.manager.update(renderer, deltaTime);

            // 渲染轮廓
            myConsole.time(`SharedOutlineEffect.outlinePass[layer=${this._selectionLayer}]`);
            this.outlinePass.render(renderer, null, this.renderTargetOutline);
            myConsole.timeEnd(`SharedOutlineEffect.outlinePass[layer=${this._selectionLayer}]`);

            if (this.blurPass.enabled) {
                myConsole.time(`SharedOutlineEffect.blurPass[layer=${this._selectionLayer}]`);
                this.blurPass.render(renderer, this.renderTargetOutline, this.renderTargetOutline);
                myConsole.timeEnd(`SharedOutlineEffect.blurPass[layer=${this._selectionLayer}]`);
            }
        }

        // 如果是最后一个效果，清理不再使用的对象
        if (renderCounter === 2) { // 假设有两个效果实例
            this.manager.clearUnused(SharedOutlineEffect.activeObjects, this._selectionLayer);
            SharedOutlineEffect.activeObjects.clear();
            SharedOutlineEffect.updateCounter = 0;
            SharedOutlineEffect.currentLayer = null;
        }

        myConsole.log(`完成渲染轮廓效果 - 层: ${this._selectionLayer}`);
        myConsole.timeEnd(`SharedOutlineEffect.update[layer=${this._selectionLayer}]`);
    }

    /**
     * Updates the size of internal render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {
        this.blurPass.setSize(width, height);

        const resolution = this.resolution;
        resolution.setBaseSize(width, height);
        const w = resolution.width, h = resolution.height;

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
        this.blurPass.initialize(renderer, alpha, frameBufferType);
        this.outlinePass.initialize(renderer, alpha, frameBufferType);
    }

    /**
     * The selection layer.
     *
     * @type {Number}
     */
    get selectionLayer() {
        return this._selectionLayer;
    }

    set selectionLayer(value) {
        // Update the internal selection layer
        const oldLayer = this._selectionLayer;
        this._selectionLayer = value;

        // Update the selection with the new layer
        const objects = [...this.selection];
        this.selection.clear();

        // Create a new selection with the new layer
        this.selection = new Selection([], value);

        // Re-add all objects to the new selection
        for (const object of objects) {
            this.selection.add(object);
        }

        // Force an update since the layer changed
        if (this.manager) {
            this.manager.setNeedsUpdate();
        }
    }
} 