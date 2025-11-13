// import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from "run-scene-core/examples/jsm/postprocessing/ShaderPass";
import { UnrealBloomPass } from "run-scene-core/examples/jsm/postprocessing/UnrealBloomPass";
import { EffectComposer } from "run-scene-core/examples/jsm/postprocessing/EffectComposer";
import { GlowThreeShader } from "./GlowThreeShader";
import  type { MTPostProcessing } from "../MTPostProcessing";
import Three from "../../Libs/Three";

export class GlowThree {
  private mtuPP: MTPostProcessing;
  private readonly bloomLayer: any;
  private readonly darkMaterial: any;
  private readonly materials: any;
  private bloomPass: any;
  private finalPass: any;
  // private bloomComposer: any;
  private finalComposer: any;

  /**
   * 后处理初始化
   */
  constructor(pp: MTPostProcessing) {
    this.mtuPP = pp;
    this.bloomLayer = new Three.Layers();
    this.bloomLayer.set(this.mtuPP.BLOOM_SCENE);
    this.darkMaterial = new Three.MeshBasicMaterial({ color: "black" });
    this.materials = {};

    const scene = this.mtuPP.mainScene;
    if (scene.fog) {
      if (!this.mtuPP.sceneFogColor)
        this.mtuPP.sceneFogColor = new Three.Color();
      this.mtuPP.sceneFogColor.copy(scene.fog.color);
    }
    if (scene.background) this.mtuPP.sceneBackground = scene.background;

    if (this.mtuPP.renderer) {
      this.postProcessing();
    }
  }

  /**
   * 若scene.background=Color，且Color!=black，则加上UnrealBloomPass效果后会导致全白屏；
   * 若scene.background=Color，且Color==black，则加上UnrealBloomPass效果后会导致深度绘制不正确；
   * 若scene.background=Texture|null，则加上UnrealBloomPass效果后才是正确的深度绘制；
   */
  private postProcessing(): void {
    // const renderScene = new RenderPass(this.mtuPP.mainScene, this.mtuPP.mainCamera);

    this.bloomPass = new UnrealBloomPass(this.mtuPP.rtSize, 1.5, 0.4, 0.85);
    this.bloomPass.radius = this.mtuPP.params.glow.radius;
    this.bloomPass.strength = this.mtuPP.params.glow.strength;
    this.bloomPass.threshold = this.mtuPP.params.glow.threshold;

    // this.bloomComposer = new EffectComposer(this.mtuPP.renderer);
    // this.bloomComposer.renderToScreen = false;
    // this.bloomComposer.addPass(renderScene);
    // this.bloomComposer.addPass(bloomPass);
    this.mtuPP.effectComposer.addPass(this.bloomPass);

    this.finalPass = new ShaderPass(
      new Three.ShaderMaterial({
        uniforms: {
          baseTexture: { value: null },
          // bloomTexture: {value: this.bloomComposer.renderTarget2.texture},
          bloomTexture: {
            value: this.mtuPP.effectComposer.renderTarget2.texture,
          },
        },
        vertexShader: GlowThreeShader.vertexShader,
        fragmentShader: GlowThreeShader.fragmentShader,
        defines: {},
      }),
      "baseTexture"
    );
    this.finalPass.needsSwap = true;

    const renderTarget = new Three.WebGLRenderTarget(
      this.mtuPP.rtSize.x,
      this.mtuPP.rtSize.y,
      { samples: this.mtuPP.params.pp.samples } as any
    );
    this.finalComposer = new EffectComposer(this.mtuPP.renderer, renderTarget);
    // this.finalComposer.addPass(renderScene);
    this.finalComposer.addPass(this.mtuPP.renderPass);
    this.finalComposer.addPass(this.finalPass);
  }

  private renderBloom(mask: boolean) {
    if (this.mtuPP.sceneFogColor)
      this.mtuPP.mainScene.fog?.color.copy(this.mtuPP.BLACK_COLOR);
    if (this.mtuPP.sceneBackground)
      this.mtuPP.mainScene.background = this.mtuPP.BLACK_COLOR;
    if (mask) {
      this.mtuPP.mainScene.traverse((obj: any) => {
        if (obj.isMesh && !this.bloomLayer.test(obj.layers)) {
          this.materials[obj.uuid] = obj.material;
          obj.material = this.darkMaterial;
        }
      });
      // this.bloomComposer.render();
      this.mtuPP.effectComposer.render();
      this.mtuPP.mainScene.traverse((obj: any) => {
        if (this.materials[obj.uuid]) {
          obj.material = this.materials[obj.uuid];
          delete this.materials[obj.uuid];
        }
      });
    } else {
      this.mtuPP.mainCamera.layers.set(this.mtuPP.BLOOM_SCENE);
      // this.bloomComposer.render();
      this.mtuPP.effectComposer.render();
      this.mtuPP.mainCamera.layers.set(this.mtuPP.ENTIRE_SCENE);
    }
    if (this.mtuPP.sceneFogColor)
      this.mtuPP.mainScene.fog?.color.copy(this.mtuPP.sceneFogColor);
    if (this.mtuPP.sceneBackground)
      this.mtuPP.mainScene.background = this.mtuPP.sceneBackground;
  }

  /**
   * 渲染循环
   */
  public render(): void {
    this.renderBloom(true);
    this.finalComposer.render();
  }

  public setGlowData(name: string, value: any) {
    this.bloomPass[name] = value;
  }

  /**
   * 重置窗口变化导致的renderer的绘制调整
   */
  public setSize(width: number, height: number): void {
    if (this.finalComposer) {
      this.finalComposer.setSize(width, height);
    }
  }

  /**
   * 废置
   */
  public dispose(): void {
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    this.finalPass = null;
    if (this.finalComposer) {
      if (this.finalComposer.renderTarget1) {
        this.finalComposer.renderTarget1.dispose();
        this.finalComposer.renderTarget1 = null;
      }
      if (this.finalComposer.renderTarget2) {
        this.finalComposer.renderTarget2.dispose();
        this.finalComposer.renderTarget2 = null;
      }
      this.finalComposer = null;
    }
  }

  public enablePass(active: boolean) {
    if (this.bloomPass && this.bloomPass.enabled !== active) {
      this.bloomPass.enabled = active;
      this.finalPass.enabled = active;
    }
  }
}
