import { CopyShader } from "run-scene-core/examples/jsm/shaders/CopyShader";
import { ShaderPass } from "run-scene-core/examples/jsm/postprocessing/ShaderPass";
import { UnrealBloomPass } from "run-scene-core/examples/jsm/postprocessing/UnrealBloomPass";
import { MTMixShaderPass } from "./MTMixShaderPass";
import { MTRenderPass } from "./MTRenderPass";
import { GlowEffectShader } from "./GlowEffectShader";
import  type { MTPostProcessing } from "../MTPostProcessing";

// import {EffectComposer} from "run-scene-core/examples/jsm/postprocessing/EffectComposer";
// import {TAARenderPass} from 'three/examples/jsm/postprocessing/TAARenderPass';
// import {DepthVisualizationShader} from '../shaders/DepthVisualizationShader';

export class GlowMTU {
  private mtuPP: MTPostProcessing;
  // private taaRenderPass: any;
  // private sampleRT: any;
  private bloomRenderPass: MTRenderPass;
  private bloomPass: UnrealBloomPass;
  private mixingPass: MTMixShaderPass;
  private effectCopy: ShaderPass;

  /**
   * 后处理初始化
   */
  constructor(pp: MTPostProcessing) {
    this.mtuPP = pp;
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
    // 关闭自动清除
    // if (this.mtuPP.renderer) this.mtuPP.renderer.autoClear = false;

    // 1. 创建RenderTarget(后处理通道间传递渲染结果的RT图)
    // if (this.effectRT) {
    //     this.effectRT.setSize(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    // } else {
    //     this.effectRT = new MTPostProcessing.THREE.WebGLRenderTarget(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    //     this.effectRT.texture.name = 'EffectComposer.rt';
    //     this.effectRT.texture.type = MTPostProcessing.THREE.FloatType;
    //     this.effectRT.texture.format = MTPostProcessing.THREE.RGBAFormat;
    //     this.effectRT.texture.encoding = MTPostProcessing.THREE.LinearSRGBColorSpace;
    //     this.effectRT.texture.minFilter = MTPostProcessing.THREE.LinearFilter;
    //     this.effectRT.texture.magFilter = MTPostProcessing.THREE.LinearFilter;
    //     this.effectRT.depthTexture = new MTPostProcessing.THREE.DepthTexture(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    //     this.effectRT.depthTexture.format = MTPostProcessing.THREE.DepthFormat;
    //     this.effectRT.depthTexture.type = MTPostProcessing.THREE.UnsignedIntType;
    // }

    // 2. 创建RenderPass
    // 2.1 渲染原场景到RT图，同时处理抗锯齿
    // if (this.taaRenderPass) {
    //     this.taaRenderPass.scene = this.mtuPP.mainScene;
    //     this.taaRenderPass.camera = this.mtuPP.mainCamera;
    // } else {
    //     this.taaRenderPass = new TAARenderPass(this.mtuPP.mainScene, this.mtuPP.mainCamera, 0x000000, 0);
    //     this.taaRenderPass.unbiased = false;
    //     this.taaRenderPass.sampleLevel = 1;
    //     this.taaRenderPass.accumulate = false;
    // }
    // 2.1.1 设置用于SSAARenderPass的内置RT图
    // if (this.sampleRT) {
    //     this.sampleRT.setSize(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    // } else {
    //     this.sampleRT = new MTPostProcessing.THREE.WebGLRenderTarget(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    //     this.sampleRT.texture.name = 'SSAARenderPass.sample';
    //     this.sampleRT.texture.type = MTPostProcessing.THREE.FloatType;
    //     this.sampleRT.texture.format = MTPostProcessing.THREE.RGBAFormat;
    //     this.sampleRT.texture.encoding = MTPostProcessing.THREE.LinearSRGBColorSpace;
    //     this.sampleRT.texture.minFilter = MTPostProcessing.THREE.LinearFilter;
    //     this.sampleRT.texture.magFilter = MTPostProcessing.THREE.LinearFilter;
    //     this.sampleRT.depthTexture = this.mtuPP.effectComposer.renderTarget1.depthTexture;
    //     this.taaRenderPass.sampleRenderTarget = this.sampleRT;
    // }

    // 2.2单独渲染辉光物体到RT图
    if (this.bloomRenderPass) {
      this.bloomRenderPass.scene = this.mtuPP.mainScene;
      this.bloomRenderPass.camera = this.mtuPP.mainCamera;
    } else {
      this.bloomRenderPass = new MTRenderPass(
        this.mtuPP.mainScene,
        this.mtuPP.mainCamera
      );
      this.bloomRenderPass.layerIndex = this.mtuPP.BLOOM_SCENE;
      this.bloomRenderPass.clearDepth = false;
    }

    // 3. 添加UnrealBloomPass，以实现辉光效果
    if (this.bloomPass) {
      this.bloomPass.setSize(this.mtuPP.rtSize.x, this.mtuPP.rtSize.y);
    } else {
      this.bloomPass = new UnrealBloomPass(this.mtuPP.rtSize, 1.5, 0.4, 0.85);
    }
    this.bloomPass.radius = this.mtuPP.params.glow.radius;
    this.bloomPass.strength = this.mtuPP.params.glow.strength;
    this.bloomPass.threshold = this.mtuPP.params.glow.threshold;

    // 4. 自定义ShaderPass将上面的不带辉光RT图和带辉光RT图进行融合
    if (this.mixingPass) {
    } else {
      this.mixingPass = new MTMixShaderPass(
        GlowEffectShader,
        "baseTexture",
        "bloomTexture"
      );
      this.mixingPass.renderToScreen = false;
    }
    // 用于测试原场景的depthTexture有没有被改写
    // this.mixingPass = new MTMixShaderPass(DepthVisualizationShader, '', '');
    // this.mixingPass.material.uniforms.cameraNear.value = this.mainCamera.near;
    // this.mixingPass.material.uniforms.cameraFar.value = this.mainCamera.far;
    // this.mixingPass.material.uniforms.depthTexture.value = effectRT.depthTexture;

    // 5.按照顺序将Pass加入EffectComposer开始渲染
    if (this.effectCopy) {
    } else {
      this.effectCopy = new ShaderPass(CopyShader);
      this.effectCopy.clear = false;
      this.effectCopy.renderToScreen = false;
      this.effectCopy.needsSwap = false;
      this.effectCopy.material.depthWrite = false;
    }

    // 6. 创建自定义EffectComposer，并按顺序添加后处理通道
    // if (this.effectComposer) {
    //     this.effectComposer.renderer = this.mtuPP.renderer;
    // } else {
    //     this.effectComposer = new EffectComposer(this.mtuPP.renderer, this.effectRT);
    // }

    // 先将原场景渲染到RT图，同时添加抗锯齿
    // this.mtuPP.effectComposer.addPass(this.taaRenderPass);
    // 将渲染好的原场景RT图保存到WriteBuffer中，需要禁止深度写入，否则将破坏原场景RT图的深度数据
    this.mtuPP.effectComposer.addPass(this.effectCopy);
    // 其次渲染辉光物体到RT图
    this.mtuPP.effectComposer.addPass(this.bloomRenderPass);
    // 对辉光物体打上辉光特效
    this.mtuPP.effectComposer.addPass(this.bloomPass);
    // 将WriteBuffer中的原始RT图和ReadBuffer中的辉光RT图混合
    this.mtuPP.effectComposer.addPass(this.mixingPass);
  }

  public setGlowData(name: string, value: any) {
    this.bloomPass[name] = value;
  }

  /**
   * 废置
   */
  public dispose(): void {
    this.bloomRenderPass = null;
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    this.mixingPass = null;
    this.effectCopy = null;
  }

  public setSceneBg() {
    if (this.bloomRenderPass) {
      this.bloomRenderPass.sceneBg = this.mtuPP.sceneBackground;
    }
  }

  public enablePass(active: boolean) {
    if (this.bloomRenderPass && this.bloomRenderPass.enabled !== active) {
      this.bloomRenderPass.enabled = active;
      this.bloomPass.enabled = active;
      this.mixingPass.enabled = active;
      this.effectCopy.enabled = active;
    }
  }
}
