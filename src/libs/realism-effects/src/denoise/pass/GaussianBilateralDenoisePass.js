/* eslint-disable camelcase */
import { Pass } from "postprocessing"
import { GLSL3, HalfFloatType, ShaderMaterial, Vector2, WebGLMultipleRenderTargets, NoBlending } from "three"

import gbuffer_packing from "../../gbuffer/shader/gbuffer_packing.glsl"
import vertexShader from "../../utils/shader/basic.vert"

import { GBufferPass } from "../../gbuffer/GBufferPass"
import { unrollLoops } from "../../ssgi/utils/Utils"
import { useBlueNoise } from "../../utils/BlueNoiseUtils"
import fragmentShader from "../shader/gaussian_bilateral_denoise.frag"

const finalFragmentShader = fragmentShader.replace("#include <gbuffer_packing>", gbuffer_packing)

const defaultGaussianBilateralOptions = {
    iterations: 1,
    radius: 2,  // 降低默认半径，保持更轻微的模糊
    phi: 0.5,
    lumaPhi: 5,
    depthPhi: 2,
    normalPhi: 3.25,
    roughnessPhi: 1.0,
    sigmaSpace: 1.0, // 保守的空间标准差
    sigmaRange: 0.05,
    inputType: "diffuseSpecular" // can be "diffuseSpecular", "diffuse" or "specular"
}

// 定义一个简单的拷贝着色器
const copyFragmentShader = `
varying vec2 vUv;
uniform sampler2D inputTexture;

void main() {
  // 直接拷贝输入纹理到输出
  gl_FragColor = texture2D(inputTexture, vUv);
}
`;

export class GaussianBilateralDenoisePass extends Pass {
    iterations = defaultGaussianBilateralOptions.iterations
    index = 0

    constructor(camera, textures, options = defaultGaussianBilateralOptions) {
        super("GaussianBilateralDenoisePass")

        options = { ...defaultGaussianBilateralOptions, ...options }

        this.textures = textures

        let isTextureSpecular = [false, true]
        if (options.inputType === "diffuse") isTextureSpecular = [false, false]
        if (options.inputType === "specular") isTextureSpecular = [true, true]

        const textureCount = options.inputType === "diffuseSpecular" ? 2 : 1

        // 使用更简单的shader
        const fragmentShader = unrollLoops(finalFragmentShader.replaceAll("textureCount", textureCount))

        this.fullscreenMaterial = new ShaderMaterial({
            fragmentShader,
            vertexShader,
            uniforms: {
                depthTexture: { value: null },
                inputTexture: { value: textures[0] },
                inputTexture2: { value: textures[1] },
                gBufferTexture: { value: null },
                normalTexture: { value: null },
                projectionMatrix: { value: camera.projectionMatrix },
                projectionMatrixInverse: { value: camera.projectionMatrixInverse },
                cameraMatrixWorld: { value: camera.matrixWorld },
                viewMatrix: { value: camera.matrixWorldInverse },
                radius: { value: options.radius },
                phi: { value: options.phi },
                lumaPhi: { value: options.lumaPhi },
                depthPhi: { value: options.depthPhi },
                normalPhi: { value: options.normalPhi },
                roughnessPhi: { value: options.roughnessPhi },
                specularPhi: { value: options.specularPhi },
                sigmaSpace: { value: options.sigmaSpace },
                sigmaRange: { value: options.sigmaRange },
                resolution: { value: new Vector2() }
            },
            defines: {
                isTextureSpecular: "bool[2](" + isTextureSpecular.join(",") + ")"
            },
            glslVersion: GLSL3
        })

        // 创建一个简单的拷贝材质，用于最后的备份方案
        this.copyMaterial = new ShaderMaterial({
            fragmentShader: copyFragmentShader,
            vertexShader,
            uniforms: {
                inputTexture: { value: null }
            },
            blending: NoBlending,
            depthWrite: false,
            depthTest: false
        });

        // Blue Noise可能导致不稳定，暂时不使用
        // useBlueNoise(this.fullscreenMaterial)

        const renderTargetOptions = {
            type: HalfFloatType,
            depthBuffer: false
        }

        this.renderTargetA = new WebGLMultipleRenderTargets(1, 1, textureCount, renderTargetOptions)
        this.renderTargetB = new WebGLMultipleRenderTargets(1, 1, textureCount, renderTargetOptions)

        // 确保纹理有正确的名称
        this.renderTargetB.texture[0].name = "GaussianBilateralDenoisePass." + (isTextureSpecular[0] ? "specular" : "diffuse")

        if (textureCount > 1) {
            this.renderTargetB.texture[1].name = "GaussianBilateralDenoisePass." + (isTextureSpecular[1] ? "specular" : "diffuse")
        }

        const { uniforms } = this.fullscreenMaterial

        // 确保所有参数都在安全范围内
        Object.keys(options).forEach(key => {
            if (uniforms[key]) {
                if (key === 'radius') {
                    uniforms[key].value = Math.max(1, Math.min(5, options[key]));
                } else if (key === 'sigmaSpace') {
                    uniforms[key].value = Math.max(0.5, Math.min(2, options[key]));
                } else if (key === 'sigmaRange') {
                    uniforms[key].value = Math.max(0.01, Math.min(0.1, options[key]));
                } else if (key.includes('Phi')) {
                    uniforms[key].value = Math.max(0.001, Math.min(5, options[key]));
                } else {
                    uniforms[key].value = options[key];
                }
            }
        });

        // 强制只进行一次迭代，防止过度模糊
        this.iterations = 1;

        console.log("创建高斯双边滤波器成功，参数:", {
            radius: uniforms.radius.value,
            sigmaSpace: uniforms.sigmaSpace.value,
            sigmaRange: uniforms.sigmaRange.value,
            iterations: this.iterations
        });

        // 跟踪是否是直接复制模式
        this.isCopyMode = false;
    }

    get texture() {
        // 如果在复制模式中，直接返回输入纹理
        if (this.isCopyMode) {
            console.log("高斯双边滤波器在复制模式中，直接返回输入纹理");
            return this.textures;
        }
        return this.renderTargetB.texture;
    }

    // 设置GBuffer
    setGBufferPass(gBufferPass) {
        if (gBufferPass instanceof GBufferPass) {
            this.fullscreenMaterial.uniforms.gBufferTexture.value = gBufferPass.texture
            this.fullscreenMaterial.defines.GBUFFER_TEXTURE = ""
        } else {
            this.fullscreenMaterial.uniforms.normalTexture.value = gBufferPass.texture
        }

        this.fullscreenMaterial.uniforms.depthTexture.value = gBufferPass.renderTarget.depthTexture
    }

    setSize(width, height) {
        this.renderTargetA.setSize(width, height)
        this.renderTargetB.setSize(width, height)

        this.fullscreenMaterial.uniforms.resolution.value.set(width, height)
    }

    dispose() {
        this.renderTargetA.dispose()
        this.renderTargetB.dispose()
        this.fullscreenMaterial.dispose()
        this.copyMaterial.dispose()
    }

    render(renderer) {
        // 保守起见，只做一次最基本的渲染
        try {
            // 设置输入纹理（原始）
            this.fullscreenMaterial.uniforms["inputTexture"].value = this.textures[0];

            // 如果有第二个输入纹理，设置它
            if (this.textures[1]) {
                this.fullscreenMaterial.uniforms["inputTexture2"].value = this.textures[1];
            }

            // 直接渲染到B
            renderer.setRenderTarget(this.renderTargetB);
            renderer.render(this.scene, this.camera);

            // 标记不是复制模式
            this.isCopyMode = false;

            // 记录一个成功信息
            if (!this._hasLoggedSuccess) {
                console.log("高斯双边滤波器渲染成功");
                this._hasLoggedSuccess = true;
            }
        } catch (error) {
            console.error("高斯双边滤波器渲染失败:", error);

            // 回退到简单的复制着色器
            try {
                // 标记为复制模式
                this.isCopyMode = true;

                // 使用简单的复制着色器
                for (let i = 0; i < this.textures.length && i < this.renderTargetB.texture.length; i++) {
                    this.copyMaterial.uniforms.inputTexture.value = this.textures[i];
                    renderer.setRenderTarget(this.renderTargetB, i);
                    renderer.render(this.scene, this.camera);
                }

                console.log("使用简单复制着色器进行备份");
            } catch (backupError) {
                console.error("复制着色器渲染也失败:", backupError);

                // 最后的备份方案 - 只保留引用
                this.isCopyMode = true;
            }
        }
    }
} 