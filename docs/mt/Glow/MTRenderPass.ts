import { Scene, Camera, Material, Color } from "run-scene-core";
import { Pass } from "run-scene-core/examples/jsm/postprocessing/Pass";

export class MTRenderPass extends Pass {
  public layerIndex;
  public clearDepth;
  public scene;
  public camera;
  public sceneBg;
  private readonly overrideMaterial;
  private readonly clearColor;
  private readonly clearAlpha;
  private readonly oldClearColor;
  private readonly oldCameraLayer;
  constructor(
    scene: Scene,
    camera: Camera,
    overrideMaterial?: Material,
    clearColor?: Color,
    clearAlpha?: number
  ) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.layerIndex = 0;
    this.overrideMaterial = overrideMaterial;

    this.clearColor = clearColor;
    this.clearAlpha = clearAlpha !== undefined ? clearAlpha : 0;

    this.clear = true;
    this.clearDepth = false;
    this.needsSwap = false;
    this.oldClearColor = new Color();
    this.oldCameraLayer = camera.layers.mask;
  }

  public render(
    renderer: any,
    _writeBuffer: any,
    readBuffer: any /*, deltaTime, maskActive */
  ): void {
    const oldAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    let oldClearAlpha, oldOverrideMaterial;
    if (this.overrideMaterial !== undefined) {
      oldOverrideMaterial = this.scene.overrideMaterial;
      this.scene.overrideMaterial = this.overrideMaterial;
    }

    if (this.clearColor) {
      renderer.getClearColor(this.oldClearColor);
      oldClearAlpha = renderer.getClearAlpha();
      renderer.setClearColor(this.clearColor, this.clearAlpha);
    }

    // if (this.clearDepth) {
    //     renderer.clearDepth();
    // }

    // 剔除场景背景
    if (this.sceneBg) this.scene.background = null;

    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);

    // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
    if (this.clear)
      renderer.clear(renderer.autoClearColor, this.clearDepth, renderer.autoClearStencil);
    // if (this.clear) renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);

    // 切换相机到对应图层
    this.camera.layers.set(this.layerIndex);
    // 非原场景RT图需要关闭场景背景，否则BloomPass会不对
    // this.scene.background = null;
    renderer.render(this.scene, this.camera);
    // 恢复相机原有图层
    this.camera.layers.mask = this.oldCameraLayer;
    // 恢复场景背景
    this.scene.background = this.sceneBg;

    if (this.clearColor) {
      renderer.setClearColor(this.oldClearColor, oldClearAlpha);
    }

    if (this.overrideMaterial !== undefined) {
      // @ts-ignore
      this.scene.overrideMaterial = oldOverrideMaterial;
    }

    // 恢复场景背景
    this.scene.background = this.sceneBg;

    renderer.autoClear = oldAutoClear;
  }
}
