import { Color, RepeatWrapping, Uniform, WebGLRenderTarget, Texture, Object3D, WebGLRenderer } from "three";
import { Resolution } from "../core/Resolution.js";
import { Selection } from "../core/Selection.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { KernelSize } from "../enums/KernelSize.js";
import { OutlineMaterial } from "../materials/OutlineMaterial.js";
import { KawaseBlurPass } from "../passes/KawaseBlurPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";
import { OutlineManager } from "./OutlineManager.js";
import '../types-helper';

import fragmentShader from "./glsl/outline.frag";
import vertexShader from "./glsl/outline.vert";

/**
 * Options for the SharedOutlineEffect.
 */
export interface SharedOutlineEffectOptions {
  /**
   * The blend function. Use `BlendFunction.ALPHA` for dark outlines.
   */
  blendFunction?: number;

  /**
   * A pattern texture.
   */
  patternTexture?: Texture | null;

  /**
   * The pattern scale.
   */
  patternScale?: number;

  /**
   * The edge strength.
   */
  edgeStrength?: number;

  /**
   * The pulse speed. A value of zero disables the pulse effect.
   */
  pulseSpeed?: number;

  /**
   * The color of visible edges.
   */
  visibleEdgeColor?: number;

  /**
   * The color of hidden edges.
   */
  hiddenEdgeColor?: number;

  /**
   * The blur kernel size.
   */
  kernelSize?: number;

  /**
   * Whether the outline should be blurred.
   */
  blur?: boolean;

  /**
   * Whether occluded parts of selected objects should be visible.
   */
  xRay?: boolean;

  /**
   * The resolution scale.
   */
  resolutionScale?: number;

  /**
   * The horizontal resolution.
   */
  resolutionX?: number;

  /**
   * The vertical resolution.
   */
  resolutionY?: number;
}

/**
 * An outline effect that can share resources with other outline effects.
 */
export class SharedOutlineEffect extends Effect {
  /**
   * The set of active objects across all SharedOutlineEffect instances.
   */
  static activeObjects: Set<Object3D>;

  /**
   * The current layer being processed.
   */
  static currentLayer: number | null;

  /**
   * Counter for tracking effect updates.
   */
  static updateCounter: number;

  /**
   * The outline manager providing shared resources.
   */
  private manager: OutlineManager;

  /**
   * A render target for the edge detection.
   */
  private renderTargetOutline: WebGLRenderTarget;

  /**
   * A blur pass.
   */
  blurPass: KawaseBlurPass;

  /**
   * An outline detection pass.
   */
  private outlinePass: ShaderPass;

  /**
   * The current animation time.
   */
  private time: number;

  /**
   * A selection of objects that will be outlined.
   */
  selection: Selection;

  /**
   * The pulse speed. Set to 0 to disable.
   */
  pulseSpeed: number;

  /**
   * The selection layer used for this effect.
   * This should be different for each effect to prevent mixing.
   */
  private _selectionLayer: number;

  /**
   * Constructs a new shared outline effect.
   *
   * @param outlineManager - The outline manager with shared resources.
   * @param options - The options.
   */
  constructor(
    outlineManager: OutlineManager,
    options: SharedOutlineEffectOptions = {}
  ) {
    const {
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
    } = options;

    super("SharedOutlineEffect", fragmentShader, {
      uniforms: new Map([
        ["maskTexture", new Uniform(null)],
        ["edgeTexture", new Uniform(null)],
        ["edgeStrength", new Uniform(edgeStrength)],
        ["visibleEdgeColor", new Uniform(new Color(visibleEdgeColor))],
        ["hiddenEdgeColor", new Uniform(new Color(hiddenEdgeColor))],
        ["pulse", new Uniform(1.0)],
        ["patternScale", new Uniform(patternScale)],
        ["patternTexture", new Uniform(null)],
      ] as [string, Uniform][]),
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
     */
    this.manager = outlineManager;

    /**
     * A render target for the edge detection.
     */
    this.renderTargetOutline = new WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.renderTargetOutline.texture.name = "Outline.Edges";
    this.uniforms.get("edgeTexture")!.value = this.renderTargetOutline.texture;

    // Use the shared mask texture
    this.uniforms.get("maskTexture")!.value = outlineManager.renderTargetMask.texture;

    /**
     * A blur pass.
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
     */
    this.outlinePass = new ShaderPass(new OutlineMaterial());
    const outlineMaterial = this.outlinePass.fullscreenMaterial as OutlineMaterial;
    outlineMaterial.inputBuffer = outlineManager.renderTargetMask.texture;

    /**
     * The current animation time.
     */
    this.time = 0;

    /**
     * A selection of objects that will be outlined.
     */
    this.selection = new Selection();

    /**
     * The pulse speed. Set to 0 to disable.
     */
    this.pulseSpeed = pulseSpeed;

    /**
     * The selection layer used for this effect.
     * This should be different for each effect to prevent mixing.
     */
    this._selectionLayer = this.selection.layer;

    // Update global reference for OutlineManager
    if ((globalThis as any).SharedOutlineEffect === undefined) {
      (globalThis as any).SharedOutlineEffect = SharedOutlineEffect;
    }
  }

  /**
   * The resolution of this effect.
   */
  get resolution(): Resolution {
    return this.blurPass.resolution;
  }

  /**
   * Returns the resolution.
   *
   * @return The resolution.
   */
  getResolution(): Resolution {
    return this.blurPass.getResolution();
  }

  /**
   * The pattern scale.
   */
  get patternScale(): number {
    return this.uniforms.get("patternScale")!.value;
  }

  set patternScale(value: number) {
    this.uniforms.get("patternScale")!.value = value;
  }

  /**
   * The edge strength.
   */
  get edgeStrength(): number {
    return this.uniforms.get("edgeStrength")!.value;
  }

  set edgeStrength(value: number) {
    this.uniforms.get("edgeStrength")!.value = value;
  }

  /**
   * The visible edge color.
   */
  get visibleEdgeColor(): Color {
    return this.uniforms.get("visibleEdgeColor")!.value;
  }

  set visibleEdgeColor(value: Color) {
    this.uniforms.get("visibleEdgeColor")!.value = value;
  }

  /**
   * The hidden edge color.
   */
  get hiddenEdgeColor(): Color {
    return this.uniforms.get("hiddenEdgeColor")!.value;
  }

  set hiddenEdgeColor(value: Color) {
    this.uniforms.get("hiddenEdgeColor")!.value = value;
  }

  /**
   * Indicates whether X-ray mode is enabled.
   */
  get xRay(): boolean {
    return this.defines.has("X_RAY");
  }

  set xRay(value: boolean) {
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
   */
  get patternTexture(): Texture | null {
    return this.uniforms.get("patternTexture")!.value;
  }

  set patternTexture(value: Texture | null) {
    if (value !== null) {
      value.wrapS = value.wrapT = RepeatWrapping;
      this.defines.set("USE_PATTERN", "1");
      this.setVertexShader(vertexShader);
    } else {
      this.defines.delete("USE_PATTERN");
      this.setVertexShader(null as unknown as string);
    }

    this.uniforms.get("patternTexture")!.value = value;
    this.setChanged();
  }

  /**
   * Updates this effect.
   *
   * @param renderer - The renderer.
   * @param inputBuffer - A frame buffer that contains the result of the previous pass.
   * @param deltaTime - The time between the last frame and the current one in seconds.
   */
  override update(
    renderer: WebGLRenderer,
    inputBuffer: WebGLRenderTarget,
    deltaTime?: number
  ): void {
    console.time(`SharedOutlineEffect.update[layer=${this._selectionLayer}]`);
    console.log(`开始渲染轮廓效果 - 层: ${this._selectionLayer}, 选中对象数: ${this.selection.size}`);

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
    SharedOutlineEffect.updateCounter++;
    
    const renderCounter = SharedOutlineEffect.updateCounter;
    console.log(`轮廓渲染计数: ${renderCounter} - 层: ${this._selectionLayer}`);

    // 设置当前处理的层
    this.manager.currentLayer = this._selectionLayer;
    SharedOutlineEffect.currentLayer = this._selectionLayer;

    // Update the pulse effect
    const uniforms = this.uniforms;
    const pulse = uniforms.get("pulse")!;
    
    pulse.value = 1;
    if (this.pulseSpeed > 0) {
      pulse.value = Math.cos(this.time * this.pulseSpeed * 10.0) * 0.375 + 0.625;
    }
    this.time += deltaTime ?? 0;

    // Support for objects that were removed from the scene
    if (this.selection.size > 0) {
      const selection = this.selection;
      const activeObjects = SharedOutlineEffect.activeObjects;

      // Add selected objects to the active set for this frame
      for (const object of selection) {
        activeObjects.add(object);
      }

      // 将当前效果的对象添加到管理器中对应层的选择集
      const layerSelection = this.manager.getSelectionForLayer(this._selectionLayer);
      for (const object of selection) {
        if (!layerSelection.has(object)) {
          layerSelection.add(object);
          this.manager.setNeedsUpdate();
        }
      }

      // Request manager to update - this will render depth and mask passes if needed
      this.manager.update(renderer, deltaTime!);

      // 渲染轮廓
      console.time(`SharedOutlineEffect.outlinePass[layer=${this._selectionLayer}]`);
      this.outlinePass.render(renderer, null, this.renderTargetOutline);
      console.timeEnd(`SharedOutlineEffect.outlinePass[layer=${this._selectionLayer}]`);

      if (this.blurPass.enabled) {
        console.time(`SharedOutlineEffect.blurPass[layer=${this._selectionLayer}]`);
        this.blurPass.render(renderer, this.renderTargetOutline, this.renderTargetOutline);
        console.timeEnd(`SharedOutlineEffect.blurPass[layer=${this._selectionLayer}]`);
      }
    }
    
    // 如果是最后一个效果，清理不再使用的对象
    if (renderCounter === 2) { // 假设有两个效果实例
      this.manager.clearUnused(SharedOutlineEffect.activeObjects, this._selectionLayer);
      SharedOutlineEffect.activeObjects.clear();
      SharedOutlineEffect.updateCounter = 0;
      SharedOutlineEffect.currentLayer = null;
    }

    console.log(`完成渲染轮廓效果 - 层: ${this._selectionLayer}`);
    console.timeEnd(`SharedOutlineEffect.update[layer=${this._selectionLayer}]`);
  }

  /**
   * Updates the size of internal render targets.
   *
   * @param width - The width.
   * @param height - The height.
   */
  override setSize(width: number, height: number): void {
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
   * @param renderer - The renderer.
   * @param alpha - Whether the renderer uses the alpha channel or not.
   * @param frameBufferType - The type of the main frame buffers.
   */
  override initialize(
    renderer: WebGLRenderer,
    alpha: boolean,
    frameBufferType: number
  ): void {
    this.blurPass.initialize(renderer, alpha, frameBufferType);
    this.outlinePass.initialize(renderer, alpha, frameBufferType);
  }

  /**
   * The selection layer.
   */
  get selectionLayer(): number {
    return this._selectionLayer;
  }

  set selectionLayer(value: number) {
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
