import { WebGLRenderTarget, Color } from "three";
import { Selection } from "../core/Selection.js";
import { DepthPass } from "../passes/DepthPass.js";
import { DepthComparisonMaterial } from "../materials/DepthComparisonMaterial.js";
import { RenderPass } from "../passes/RenderPass.js";

/**
 * A manager for sharing resources between multiple outline effects.
 */
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
export class OutlineManager {

    /**
     * Constructs a new outline manager.
     *
     * @param {Scene} scene - The main scene.
     * @param {Camera} camera - The main camera.
     * @param {Object} [options] - The options.
     * @param {Number} [options.resolutionScale=1.0] - The resolution scale.
     * @param {Number} [options.multisampling=0] - The number of samples for multisampling.
     */
    constructor(scene, camera, {
        resolutionScale = 1.0,
        multisampling = 0
    } = {}) {
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
         * A map of layer-specific selections.
         * Each SharedOutlineEffect should use a different layer.
         *
         * @type {Map<Number, Selection>}
         * @private
         */
        this.selectionsByLayer = new Map();

        /**
         * A shared selection of objects that will be outlined.
         * This is maintained for backward compatibility.
         *
         * @type {Selection}
         */
        this.selection = new Selection();

        /**
         * The current layer being processed.
         * Will be set by each SharedOutlineEffect before rendering.
         *
         * @type {Number}
         * @public
         */
        this.currentLayer = null;

        // Store this default selection in our map
        this.selectionsByLayer.set(this.selection.layer, this.selection);

        /**
         * A render target for the outline mask.
         *
         * @type {WebGLRenderTarget}
         * @private
         */
        this.renderTargetMask = new WebGLRenderTarget(1, 1);
        this.renderTargetMask.samples = multisampling;
        this.renderTargetMask.texture.name = "Outline.Mask";

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

        /**
         * The resolution scale.
         * 
         * @type {Number}
         */
        this.resolutionScale = resolutionScale;

        /**
         * Indicates whether the resources need an update.
         * 
         * @type {Boolean}
         * @private
         */
        this.needsUpdate = true;
    }

    /**
     * Get a selection for a specific layer, creating it if it doesn't exist.
     * 
     * @param {Number} layer - The layer to get a selection for.
     * @return {Selection} The selection for the specified layer.
     */
    getSelectionForLayer(layer) {
        if (!this.selectionsByLayer.has(layer)) {
            const newSelection = new Selection([], layer);
            this.selectionsByLayer.set(layer, newSelection);
        }
        return this.selectionsByLayer.get(layer);
    }

    /**
     * Add an object to a specific layer's selection.
     * 
     * @param {Object3D} object - The object to add.
     * @param {Number} layer - The layer to add the object to.
     */
    addToLayer(object, layer) {
        const selection = this.getSelectionForLayer(layer);
        selection.add(object);
        this.needsUpdate = true;
    }

    /**
     * Remove an object from a specific layer's selection.
     * 
     * @param {Object3D} object - The object to remove.
     * @param {Number} layer - The layer to remove the object from.
     * @return {Boolean} Whether the object was removed.
     */
    removeFromLayer(object, layer) {
        if (this.selectionsByLayer.has(layer)) {
            const selection = this.selectionsByLayer.get(layer);
            const result = selection.delete(object);
            if (result) {
                this.needsUpdate = true;
            }
            return result;
        }
        return false;
    }

    /**
     * Updates the shared resources.
     * 
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     * @return {Boolean} Whether an update was performed.
     */
    update(renderer, deltaTime) {
        const scene = this.scene;
        const camera = this.camera;

        // Check if any selection has objects
        let hasObjects = false;
        for (const selection of this.selectionsByLayer.values()) {
            if (selection.size > 0) {
                hasObjects = true;
                break;
            }
        }

        if (!this.needsUpdate && !hasObjects) {
            return false;
        }

        // 使用一个静态属性追踪当前帧是否已执行过深度渲染
        // 这样每一帧只需要执行一次深度渲染，多个轮廓效果可以共享结果
        const now = Date.now();
        if (!OutlineManager.lastDepthPassTime || now - OutlineManager.lastDepthPassTime > 16) { // 假设16ms为帧间隔
            myConsole.time("SharedOutline.update");
            const background = scene.background;
            const mask = camera.layers.mask;

            scene.background = null;

            // 只在每帧第一次调用时执行深度渲染
            myConsole.time("SharedOutline.depthPass");

            // Hide all selected objects across all layers
            for (const selection of this.selectionsByLayer.values()) {
                selection.setVisible(false);
            }

            this.depthPass.render(renderer);

            // Show all selected objects again
            for (const selection of this.selectionsByLayer.values()) {
                selection.setVisible(true);
            }

            myConsole.timeEnd("SharedOutline.depthPass");

            // 记录本次深度渲染的时间
            OutlineManager.lastDepthPassTime = now;

            // 恢复场景背景
            scene.background = background;
        }

        // 每个轮廓效果的遮罩通道单独渲染
        myConsole.time("SharedOutline.maskPass");

        const mask = camera.layers.mask; // 保存当前相机层掩码

        // We need to render the mask for each active layer separately
        // Use a layered approach - render each layer's selection to the mask
        let layerRendered = false;

        // Use our own currentLayer property that will be set by each SharedOutlineEffect
        const currentLayer = this.currentLayer;

        if (currentLayer !== undefined && currentLayer !== null) {
            // Render only the current layer
            if (this.selectionsByLayer.has(currentLayer)) {
                const selection = this.selectionsByLayer.get(currentLayer);
                if (selection.size > 0) {
                    camera.layers.set(currentLayer);
                    this.maskPass.render(renderer, this.renderTargetMask);
                    layerRendered = true;
                }
            }
        }

        // If no specific layer was rendered, fall back to default behavior
        if (!layerRendered) {
            // Use the default selection's layer
            camera.layers.set(this.selection.layer);
            this.maskPass.render(renderer, this.renderTargetMask);
        }

        myConsole.timeEnd("SharedOutline.maskPass");

        // Restore the camera layer mask
        camera.layers.mask = mask;

        this.needsUpdate = false;
        myConsole.timeEnd("SharedOutline.update");

        return true;
    }

    /**
     * Clear this manager's selection but keep track of which objects are
     * still used by active outline effects.
     * 
     * @param {Set<Object3D>} activeObjects - Objects that are still part of active effects.
     * @param {Number} [exceptLayer] - A layer to exclude from clearing.
     */
    clearUnused(activeObjects, exceptLayer) {
        // Process each layer's selection
        for (const [layer, selection] of this.selectionsByLayer.entries()) {
            if (exceptLayer !== undefined && layer === exceptLayer) {
                continue; // Skip the excepted layer
            }

            // Get current selection for this layer
            const currentSelection = [...selection];

            // Check each object in the current layer's selection
            for (const object of currentSelection) {
                // If the object is not in active objects, remove it from this layer
                if (!activeObjects.has(object)) {
                    selection.delete(object);
                    this.needsUpdate = true;
                }
            }
        }
    }

    /**
     * Updates the size of internal render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {
        const w = Math.floor(width * this.resolutionScale);
        const h = Math.floor(height * this.resolutionScale);

        this.depthPass.setSize(w, h);
        this.renderTargetMask.setSize(w, h);
    }

    /**
     * Performs initialization tasks.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
     * @param {Number} frameBufferType - The type of the main frame buffers.
     */
    initialize(renderer, alpha, frameBufferType) {
        this.depthPass.initialize(renderer, alpha, frameBufferType);
        this.maskPass.initialize(renderer, alpha, frameBufferType);
    }

    /**
     * Forces the shared resources to update in the next frame.
     */
    setNeedsUpdate() {
        this.needsUpdate = true;
    }
} 