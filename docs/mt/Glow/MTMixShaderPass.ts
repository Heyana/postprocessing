/***
 * 此通道有两个RT图作为参数，一个是不带特效的原图，一个是带特效的渲染图
 * 所以必须作为最后一个Pass使用
 */

import { ShaderMaterial, UniformsUtils } from "run-scene-core";
import { Pass, FullScreenQuad } from "run-scene-core/examples/jsm/postprocessing/Pass";
export class MTMixShaderPass extends Pass {
  private baseTextureID;
  private effectTextureID;
  private uniforms;
  private material;
  private fsQuad;

  constructor(shader: any, baseTextureID?: any, effectTextureID?: any) {
    super();
    this.baseTextureID = baseTextureID !== undefined ? baseTextureID : "tDiffuse";
    this.effectTextureID = effectTextureID !== undefined ? effectTextureID : "tDiffuse";
    if (shader instanceof ShaderMaterial) {
      this.uniforms = shader.uniforms;
      this.material = shader;
    } else if (shader) {
      this.uniforms = UniformsUtils.clone(shader.uniforms);
      this.material = new ShaderMaterial({
        defines: Object.assign({}, shader.defines),
        uniforms: this.uniforms,
        vertexShader: shader.vertexShader,
        fragmentShader: shader.fragmentShader,
      });
    }
    this.fsQuad = new FullScreenQuad(this.material);
  }

  public render(renderer: any, writeBuffer: any, readBuffer: any /*, deltaTime, maskActive */) {
    if (this.uniforms[this.baseTextureID]) {
      this.uniforms[this.baseTextureID].value = writeBuffer.texture;
    }
    if (this.uniforms[this.effectTextureID]) {
      this.uniforms[this.effectTextureID].value = readBuffer.texture;
    }

    // @ts-ignore
    this.fsQuad.material = this.material;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
      this.fsQuad.render(renderer);
    } else {
      renderer.setRenderTarget(writeBuffer);
      // TODO: Avoid using autoClear properties, see https://github.com/mrdoob/three.js/pull/15571#issuecomment-465669600
      if (this.clear)
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      this.fsQuad.render(renderer);
    }
  }
}
