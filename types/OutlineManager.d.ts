import {
  Scene,
  Camera,
  WebGLRenderer,
  WebGLRenderTarget,
  Object3D,
} from "three";
import { Selection } from "./Selection";

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
   * The resolution scale.
   */
  resolutionScale: number;

  /**
   * Constructs a new outline manager.
   *
   * @param {Scene} scene - The main scene.
   * @param {Camera} camera - The main camera.
   * @param {Object} [options] - The options.
   * @param {Number} [options.resolutionScale=1.0] - The resolution scale.
   * @param {Number} [options.multisampling=0] - The number of samples for multisampling.
   */
  constructor(scene: Scene, camera: Camera, options?: OutlineManagerOptions);

  /**
   * Get a selection for a specific layer, creating it if it doesn't exist.
   *
   * @param {Number} layer - The layer to get a selection for.
   * @return {Selection} The selection for the specified layer.
   */
  getSelectionForLayer(layer: number): Selection;

  /**
   * Add an object to a specific layer's selection.
   *
   * @param {Object3D} object - The object to add.
   * @param {Number} layer - The layer to add the object to.
   */
  addToLayer(object: Object3D, layer: number): void;

  /**
   * Remove an object from a specific layer's selection.
   *
   * @param {Object3D} object - The object to remove.
   * @param {Number} layer - The layer to remove the object from.
   * @return {Boolean} Whether the object was removed.
   */
  removeFromLayer(object: Object3D, layer: number): boolean;

  /**
   * Updates the shared resources.
   *
   * @param {WebGLRenderer} renderer - The renderer.
   * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
   * @return {Boolean} Whether an update was performed.
   */
  update(renderer: WebGLRenderer, deltaTime?: number): boolean;

  /**
   * Clear this manager's selection but keep track of which objects are
   * still used by active outline effects.
   *
   * @param {Set<Object3D>} activeObjects - Objects that are still part of active effects.
   * @param {Number} [exceptLayer] - A layer to exclude from clearing.
   */
  clearUnused(activeObjects: Set<Object3D>, exceptLayer?: number): void;

  /**
   * Updates the size of internal render targets.
   *
   * @param {Number} width - The width.
   * @param {Number} height - The height.
   */
  setSize(width: number, height: number): void;

  /**
   * Performs initialization tasks.
   *
   * @param {WebGLRenderer} renderer - The renderer.
   * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
   * @param {Number} frameBufferType - The type of the main frame buffers.
   */
  initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void;

  /**
   * Forces the shared resources to update in the next frame.
   */
  setNeedsUpdate(): void;
}
