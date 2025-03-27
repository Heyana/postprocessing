import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import {
    Uniform, Color, Matrix4, Vector2, Vector3, WebGLRenderTarget, FloatType,
    NearestFilter, SRGBColorSpace
} from "three";
import { RenderPass } from "../passes/RenderPass.js";
import { Selection } from "../core/Selection.js";

// 从libs/realism-effects目录导入
import { GBufferPass } from "../../libs/realism-effects/src/gbuffer/GBufferPass.js";
import { SSGIPass } from "../../libs/realism-effects/src/ssgi/pass/SSGIPass.js";
import Denoiser from "../../libs/realism-effects/src/denoise/Denoiser.js";

import { VelocityDepthNormalPass } from "../../libs/realism-effects/src/temporal-reproject/pass/VelocityDepthNormalPass.js";
import { defaultSSGIOptions } from "../../libs/realism-effects/src/ssgi/SSGIOptions.js";

import ssgi_compose_fragmentShader from "../../libs/realism-effects/src/ssgi/shader/ssgi_compose.frag";

import { SSGIEffect } from "../../libs/realism-effects/src/ssgi/SSGIEffect.js";
export { VelocityDepthNormalPass, SSGIEffect }
/**
 * 屏幕空间全局光照 (SSGI) 效果
 *
 * 这个效果为场景增加了间接光照和反射，提升渲染的真实感。
 * SSGI 技术在屏幕空间中计算反射和间接照明，模拟光线在场景中的反弹。
 */
// export class SSGIEffect extends Effect {
//     /**
//      * 用于选择场景中特定对象的Selection对象
//      * @type {Selection}
//      */
//     selection = new Selection();

//     /**
//      * 标记是否使用RenderPass
//      * @type {Boolean}
//      */
//     isUsingRenderPass = true;

//     /**
//      * 构造一个新的SSGI效果
//      *
//      * @param {EffectComposer} composer - 效果合成器
//      * @param {Scene} scene - 要渲染的场景
//      * @param {Camera} camera - 相机
//      * @param {Object} [options] - 效果选项
//      */
//     constructor(composer, scene, camera, options = {}) {
//         // 合并默认选项
//         options = { ...defaultSSGIOptions, ...options };

//         // 处理SSGI组合片段着色器
//         let fragmentShader = ssgi_compose_fragmentShader;

//         // 设置定义
//         const defines = new Map();
//         if (scene.fog) defines.set("USE_FOG", "");
//         if (scene.fog?.isFogExp2) defines.set("FOG_EXP2", "");

//         super("SSGIEffect", fragmentShader, {
//             type: "FinalSSGIMaterial",
//             uniforms: new Map([
//                 ["inputTexture", new Uniform(null)],
//                 ["sceneTexture", new Uniform(null)],
//                 ["depthTexture", new Uniform(null)],
//                 ["isDebug", new Uniform(false)],
//                 ["fogColor", new Uniform(new Color())],
//                 ["fogNear", new Uniform(0)],
//                 ["fogFar", new Uniform(0)],
//                 ["fogDensity", new Uniform(0)],
//                 ["cameraNear", new Uniform(0)],
//                 ["cameraFar", new Uniform(0)]
//             ]),
//             defines: new Map([
//                 ["PERSPECTIVE_CAMERA", camera.isPerspectiveCamera ? "1" : "0"],
//                 ...defines
//             ]),
//             blendFunction: options.blendFunction || BlendFunction.NORMAL,
//             attributes: EffectAttribute.DEPTH
//         });

//         this._scene = scene;
//         this._camera = camera;
//         this.composer = composer;

//         // 设置SSGI模式
//         if (options.mode === "ssr") {
//             options.reprojectSpecular = true;
//             options.neighborhoodClamp = true;
//             options.inputType = "specular";
//         } else if (options.mode === "ssgi") {
//             options.reprojectSpecular = [false, true];
//             options.neighborhoodClamp = [false, true];
//         }

//         // 处理预设
//         if (typeof options.preset === "string") {
//             switch (options.preset) {
//                 case "low":
//                     options.steps = 10;
//                     options.refineSteps = 2;
//                     options.denoiseMode = "full_temporal";
//                     break;
//                 case "medium":
//                     options.steps = 20;
//                     options.refineSteps = 4;
//                     options.denoiseMode = "full";
//                     break;
//                 case "high":
//                     options.steps = 40;
//                     options.refineSteps = 4;
//                     options.denoiseMode = "full";
//                     break;
//             }
//         }

//         // 创建SSGI通道，确保所有必需的参数都设置好
//         options.useVelocityTexture = !!options.velocityDepthNormalPass;

//         this.ssgiPass = new SSGIPass(this, options);

//         // 添加缺失的属性，确保没有错误
//         if (!this.ssgiPass.fullscreenMaterial.defines.hasOwnProperty("useVelocityTexture")) {
//             this.ssgiPass.fullscreenMaterial.defines.useVelocityTexture = !!options.velocityDepthNormalPass;
//             this.ssgiPass.fullscreenMaterial.needsUpdate = true;
//         }

//         this.denoiser = new Denoiser(scene, camera, this.ssgiPass.texture, {
//             gBufferPass: this.ssgiPass.gBufferPass,
//             velocityDepthNormalPass: options.velocityDepthNormalPass,
//             ...options
//         });

//         this.lastSize = {
//             width: options.width,
//             height: options.height,
//             resolutionScale: options.resolutionScale
//         };

//         this.sceneRenderTarget = new WebGLRenderTarget(1, 1, {
//             colorSpace: SRGBColorSpace
//         });

//         this.renderPass = new RenderPass(this._scene, this._camera);
//         this.renderPass.renderToScreen = false;

//         // 设置尺寸
//         this.setSize(options.width, options.height);

//         // 设置响应式选项
//         this.makeOptionsReactive(options);

//         this.outputTexture = this.denoiser.texture;
//     }

//     /**
//      * 更新RenderPass状态
//      */
//     updateUsingRenderPass() {
//         if (this.isUsingRenderPass) {
//             this.ssgiPass.fullscreenMaterial.defines.useDirectLight = "";
//         } else {
//             delete this.ssgiPass.fullscreenMaterial.defines.useDirectLight;
//         }

//         this.ssgiPass.fullscreenMaterial.needsUpdate = true;
//     }

//     /**
//      * 重置效果
//      */
//     reset() {
//         this.denoiser.reset();
//     }

//     /**
//      * 使选项响应式
//      * @param {Object} options - 效果选项
//      */
//     makeOptionsReactive(options) {
//         let needsUpdate = false;

//         const ssgiPassFullscreenMaterialUniforms = this.ssgiPass.fullscreenMaterial.uniforms;

//         for (const key of Object.keys(options)) {
//             Object.defineProperty(this, key, {
//                 get() {
//                     return options[key];
//                 },
//                 set(value) {
//                     if (options[key] === value && needsUpdate) return;

//                     options[key] = value;

//                     switch (key) {
//                         // 降噪器选项
//                         case "denoiseIterations":
//                             if (this.denoiser.denoisePass)
//                                 this.denoiser.denoisePass.iterations = value;
//                             break;

//                         case "radius":
//                         case "phi":
//                         case "lumaPhi":
//                         case "depthPhi":
//                         case "normalPhi":
//                         case "roughnessPhi":
//                         case "specularPhi":
//                             if (this.denoiser.denoisePass?.fullscreenMaterial.uniforms[key]) {
//                                 this.denoiser.denoisePass.fullscreenMaterial.uniforms[key].value = value;
//                                 this.reset();
//                             }
//                             break;

//                         case "resolutionScale":
//                             this.setSize(this.lastSize.width, this.lastSize.height);
//                             this.reset();
//                             break;

//                         case "steps":
//                         case "refineSteps":
//                             this.ssgiPass.fullscreenMaterial.defines[key] = parseInt(value);
//                             this.ssgiPass.fullscreenMaterial.needsUpdate = needsUpdate;
//                             this.reset();
//                             break;

//                         case "importanceSampling":
//                         case "missedRays":
//                             if (value) {
//                                 this.ssgiPass.fullscreenMaterial.defines[key] = "";
//                             } else {
//                                 delete this.ssgiPass.fullscreenMaterial.defines[key];
//                             }
//                             this.ssgiPass.fullscreenMaterial.needsUpdate = needsUpdate;
//                             this.reset();
//                             break;

//                         case "distance":
//                             ssgiPassFullscreenMaterialUniforms.rayDistance.value = value;
//                             this.reset();
//                             break;
//                     }
//                 }
//             });
//         }
//     }

//     /**
//      * 初始化效果
//      * @param {WebGLRenderer} renderer - 渲染器
//      */
//     initialize(renderer, ...args) {
//         super.initialize(renderer, ...args);
//         this.ssgiPass.initialize(renderer, ...args);
//     }

//     /**
//      * 设置尺寸
//      * @param {Number} width - 宽度
//      * @param {Number} height - 高度
//      * @param {Boolean} force - 是否强制更新
//      */
//     setSize(width, height, force = false) {
//         const resolutionScale = this.resolutionScale;
//         const w = width * resolutionScale;
//         const h = height * resolutionScale;

//         this.lastSize.width = width;
//         this.lastSize.height = height;
//         this.lastSize.resolutionScale = resolutionScale;

//         this.ssgiPass?.setSize(width, height);
//         this.denoiser?.setSize(width, height);
//         this.sceneRenderTarget.setSize(width, height);
//     }

//     /**
//      * 释放资源
//      */
//     dispose() {
//         super.dispose();
//         this.ssgiPass.dispose();
//         this.denoiser.dispose();
//     }

//     /**
//      * 获取深度纹理
//      * @return {Texture} 深度纹理
//      */
//     get depthTexture() {
//         return this.ssgiPass.gBufferPass.depthTexture;
//     }

//     /**
//      * 更新效果
//      * @param {WebGLRenderer} renderer - 渲染器
//      * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
//      */
//     update(renderer, inputBuffer) {
//         // 更新场景灯光
//         if (this._scene.fog) {
//             const uniforms = this.uniforms.get("fogColor").value.copy(this._scene.fog.color);

//             if (this._scene.fog.isFogExp2) {
//                 this.uniforms.get("fogDensity").value = this._scene.fog.density;
//             } else {
//                 this.uniforms.get("fogNear").value = this._scene.fog.near;
//                 this.uniforms.get("fogFar").value = this._scene.fog.far;
//             }
//         }

//         // 渲染直接光照场景
//         const sceneRenderTarget = this.sceneRenderTarget;
//         const scene = this._scene;
//         const camera = this._camera;

//         renderer.setRenderTarget(sceneRenderTarget);
//         renderer.render(scene, camera);

//         // 更新SSGI通道
//         this.ssgiPass.render(renderer);
//         this.uniforms.get("inputTexture").value = this.outputTexture;
//         this.uniforms.get("sceneTexture").value = sceneRenderTarget.texture;
//         this.uniforms.get("depthTexture").value = this.depthTexture;
//         this.uniforms.get("cameraNear").value = camera.near;
//         this.uniforms.get("cameraFar").value = camera.far;
//     }
// } 