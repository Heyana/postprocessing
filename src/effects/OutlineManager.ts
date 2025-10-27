import {
  WebGLRenderTarget,
  Color,
  WebGLRenderer,
  Scene,
  Camera,
  Object3D,
  PerspectiveCamera,
} from "three";
import { Selection } from "../core/Selection.js";
import { DepthPass } from "../passes/DepthPass.js";
import { DepthComparisonMaterial } from "../materials/DepthComparisonMaterial.js";
import { RenderPass } from "../passes/RenderPass.js";
// 导入类型辅助
import "../types-helper";

/**
 * Options for the OutlineManager.
 */
export interface OutlineManagerOptions {
  /**
   * The resolution scale.
   */
  resolutionScale?: number;

  /**
   * The number of samples for multisampling.
   */
  multisampling?: number;
}

/**
 * A manager for sharing resources between multiple outline effects.
 */
export class OutlineManager {
  /**
   * The main scene.
   */
  private scene: Scene;

  /**
   * The main camera.
   */
  private camera: Camera;

  /**
   * A map of layer-specific selections.
   * Each SharedOutlineEffect should use a different layer.
   */
  private selectionsByLayer: Map<number, Selection>;

  /**
   * A shared selection of objects that will be outlined.
   * This is maintained for backward compatibility.
   */
  selection: Selection;

  /**
   * The current layer being processed.
   * Will be set by each SharedOutlineEffect before rendering.
   */
  currentLayer: number | null;

  /**
   * A render target for the outline mask.
   */
  renderTargetMask: WebGLRenderTarget;

  /**
   * A depth pass.
   */
  private depthPass: DepthPass;

  /**
   * A depth comparison mask pass.
   */
  private maskPass: RenderPass;

  /**
   * The resolution scale.
   */
  resolutionScale: number;

  /**
   * Indicates whether the resources need an update.
   */
  private needsUpdate: boolean;

  /**
   * Constructs a new outline manager.
   *
   * @param scene - The main scene.
   * @param camera - The main camera.
   * @param options - The options.
   */
  constructor(
    scene: Scene,
    camera: Camera,
    options: OutlineManagerOptions = {}
  ) {
    const { resolutionScale = 1.0, multisampling = 0 } = options;

    /**
     * The main scene.
     */
    this.scene = scene;

    /**
     * The main camera.
     */
    this.camera = camera;

    /**
     * A map of layer-specific selections.
     * Each SharedOutlineEffect should use a different layer.
     */
    this.selectionsByLayer = new Map();

    /**
     * A shared selection of objects that will be outlined.
     * This is maintained for backward compatibility.
     */
    this.selection = new Selection();

    /**
     * The current layer being processed.
     * Will be set by each SharedOutlineEffect before rendering.
     */
    this.currentLayer = null;

    // Store this default selection in our map
    this.selectionsByLayer.set(this.selection.layer, this.selection);

    /**
     * A render target for the outline mask.
     */
    this.renderTargetMask = new WebGLRenderTarget(1, 1);
    this.renderTargetMask.samples = multisampling;
    this.renderTargetMask.texture.name = "Outline.Mask";

    /**
     * A depth pass.
     */
    this.depthPass = new DepthPass(scene, camera);

    /**
     * A depth comparison mask pass.
     */
    this.maskPass = new RenderPass(
      scene,
      camera,
      new DepthComparisonMaterial(
        this.depthPass.texture,
        camera as PerspectiveCamera
      )
    );
    const clearPass = this.maskPass.clearPass;
    clearPass.overrideClearColor = new Color(0xffffff);
    clearPass.overrideClearAlpha = 1;

    /**
     * The resolution scale.
     */
    this.resolutionScale = resolutionScale;

    /**
     * Indicates whether the resources need an update.
     */
    this.needsUpdate = true;
  }

  /**
   * Get a selection for a specific layer, creating it if it doesn't exist.
   *
   * @param layer - The layer to get a selection for.
   * @return The selection for the specified layer.
   */
  getSelectionForLayer(layer: number): Selection {
    if (!this.selectionsByLayer.has(layer)) {
      const newSelection = new Selection([], layer);
      this.selectionsByLayer.set(layer, newSelection);
    }
    return this.selectionsByLayer.get(layer)!;
  }

  /**
   * Add an object to a specific layer's selection.
   *
   * @param object - The object to add.
   * @param layer - The layer to add the object to.
   */
  addToLayer(object: Object3D, layer: number): void {
    const selection = this.getSelectionForLayer(layer);
    selection.add(object);
    this.needsUpdate = true;
  }

  /**
   * Remove an object from a specific layer's selection.
   *
   * @param object - The object to remove.
   * @param layer - The layer to remove the object from.
   * @return Whether the object was removed.
   */
  removeFromLayer(object: Object3D, layer: number): boolean {
    if (this.selectionsByLayer.has(layer)) {
      const selection = this.selectionsByLayer.get(layer)!;
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
   * @param renderer - The renderer.
   * @param deltaTime - The time between the last frame and the current one in seconds.
   * @return Whether an update was performed.
   */
  update(renderer: WebGLRenderer, deltaTime?: number): boolean {
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

    console.time("SharedOutline.update");
    const background = scene.background;
    const mask = camera.layers.mask;

    scene.background = null;

    // Render a custom depth texture and ignore selected objects
    console.time("SharedOutline.depthPass");

    // Hide all selected objects across all layers
    for (const selection of this.selectionsByLayer.values()) {
      selection.setVisible(false);
    }

    // @ts-ignore - Pass API expects more arguments but implementation handles this case
    this.depthPass.render(renderer);

    // Show all selected objects again
    for (const selection of this.selectionsByLayer.values()) {
      selection.setVisible(true);
    }

    console.timeEnd("SharedOutline.depthPass");

    // Compare the depth of the selected objects with the depth texture
    console.time("SharedOutline.maskPass");

    // We need to render the mask for each active layer separately
    // Use a layered approach - render each layer's selection to the mask
    let layerRendered = false;

    // Use our own currentLayer property that will be set by each SharedOutlineEffect
    const currentLayer = this.currentLayer;

    if (currentLayer !== undefined && currentLayer !== null) {
      // Render only the current layer
      if (this.selectionsByLayer.has(currentLayer)) {
        const selection = this.selectionsByLayer.get(currentLayer)!;
        if (selection.size > 0) {
          camera.layers.set(currentLayer);
          // @ts-ignore - Pass API expects more arguments but implementation handles this case
          this.maskPass.render(renderer, this.renderTargetMask);
          layerRendered = true;
        }
      }
    }

    // If no specific layer was rendered, fall back to default behavior
    if (!layerRendered) {
      // Use the default selection's layer
      camera.layers.set(this.selection.layer);
      // @ts-ignore - Pass API expects more arguments but implementation handles this case
      this.maskPass.render(renderer, this.renderTargetMask);
    }

    console.timeEnd("SharedOutline.maskPass");

    // Restore the camera layer mask and the scene background
    camera.layers.mask = mask;
    scene.background = background;

    this.needsUpdate = false;
    console.timeEnd("SharedOutline.update");

    return true;
  }

  /**
   * Clear this manager's selection but keep track of which objects are
   * still used by active outline effects.
   *
   * @param activeObjects - Objects that are still part of active effects.
   * @param exceptLayer - A layer to exclude from clearing.
   */
  clearUnused(activeObjects: Set<Object3D>, exceptLayer?: number): void {
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
   * @param width - The width.
   * @param height - The height.
   */
  setSize(width: number, height: number): void {
    const w = Math.floor(width * this.resolutionScale);
    const h = Math.floor(height * this.resolutionScale);

    this.depthPass.setSize(w, h);
    this.renderTargetMask.setSize(w, h);
  }

  /**
   * Performs initialization tasks.
   *
   * @param renderer - The renderer.
   * @param alpha - Whether the renderer uses the alpha channel or not.
   * @param frameBufferType - The type of the main frame buffers.
   */
  initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    this.depthPass.initialize(renderer, alpha, frameBufferType);
    this.maskPass.initialize(renderer, alpha, frameBufferType);
  }

  /**
   * Forces the shared resources to update in the next frame.
   */
  setNeedsUpdate(): void {
    this.needsUpdate = true;
  }
}
