import {
    Color,
    EqualDepth,
    HalfFloatType,
    NotEqualDepth,
    RGBAFormat,
    RGBADepthPacking,
    SRGBColorSpace,
    Uniform,
    UniformsUtils,
    Vector2,
    Vector3,
    WebGLRenderTarget,
    ShaderMaterial
} from "three";

import { BlendFunction } from "../enums/BlendFunction.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";
import { Selection } from "../core/Selection.js";
import { DepthTestStrategy } from "../enums/DepthTestStrategy.js";
import { DepthMaskMaterial } from "../materials/DepthMaskMaterial.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/unreal-bloom.frag";

const copyVertexShader = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const copyFragmentShader = /* glsl */`
varying vec2 vUv;
uniform sampler2D inputBuffer;
void main() {
	gl_FragColor = texture2D(inputBuffer, vUv);
}
`;

/**
 * UnrealBloomEffect
 *
 * 与 three.js UnrealBloomPass 等价的泛光实现，采用多级 MIP 链与可分离高斯模糊，
 * 最终的合成结果通过 effect 的 fragmentShader 与混合函数进行叠加（建议使用 ADD）。
 */
export class UnrealBloomEffect extends Effect {

    /**
     * @param {Object} [options]
     * @param {BlendFunction} [options.blendFunction=BlendFunction.ADD] - 最终混合函数，建议 ADD 以模拟 UnrealBloomPass 的 AdditiveBlending
     * @param {number} [options.strength=1.0] - 泛光强度（应用在合成材质中）
     * @param {number} [options.radius=0.1] - 泛光半径（影响 bloomFactors 的插值）
     * @param {number} [options.threshold=0.85] - 亮度阈值（高通滤波）
     * @param {number} [options.smoothWidth=0.01] - 阈值平滑宽度
     * @param {number} [options.nMips=5] - MIP 级数
     * @param {number} [options.intensity=1.0] - 额外的强度细调（在最终片元中乘上）
     * @param {Color|number|string} [options.bloomColor=0xffffff] - 泛光颜色调节
     */
    constructor({
        blendFunction = BlendFunction.ADD,
        strength = 1.0,
        radius = 0.1,
        threshold = 0.85,
        smoothWidth = 0.01,
        nMips = 5,
        intensity = 1.0,
        bloomColor = 0xffffff,
        useHighPass = true
    } = {}) {

        super("UnrealBloomEffect", fragmentShader, {
            blendFunction,
            uniforms: new Map([
                ["map", new Uniform(null)],
                ["intensity", new Uniform(intensity)],
                ["bloomColor", new Uniform(new Color(bloomColor))]
            ])
        });

        // 输出模式
        this.output = UnrealBloomEffect.OUTPUT.Default;

        /**
         * 是否进行亮度高通筛选。
         * 设为 false 时，对选中区域直接做模糊合成，实现“只要选中就发光”的效果。
         *
         * @type {Boolean}
         */
        this.useHighPass = useHighPass;

        // 选择性泛光：启用深度属性
        this.setAttributes(this.getAttributes() | EffectAttribute.DEPTH);

        // 亮度高通滤波（内联材质）
        this.materialHighPassFilter = this._createHighPassMaterial();
        this.materialHighPassFilter.uniforms.luminosityThreshold.value = threshold;
        this.materialHighPassFilter.uniforms.smoothWidth.value = smoothWidth;

        // 合成材质（负责把各级 MIP 模糊结果合成，内联材质）
        this.compositeMaterial = this._createCompositeMaterial(nMips);
        this.compositeMaterial.uniforms.bloomStrength.value = strength;
        this.compositeMaterial.uniforms.bloomRadius.value = radius;

        // MIP 级别配置
        this.nMips = nMips;
        this.bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2].slice(0, nMips);
        this.bloomTintColors = new Array(nMips).fill(0).map(() => new Vector3(1, 1, 1));

        // 渲染目标
        this.renderTargetBright = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
        this.renderTargetBright.texture.name = "UnrealBloom.bright";
        this.renderTargetBright.texture.generateMipmaps = false;

        this.renderTargetsHorizontal = [];
        this.renderTargetsVertical = [];

        // 模糊材质（可分离高斯，内联材质）
        this.separableBlurMaterials = [];
        this.blurDirectionX = new Vector2(1.0, 0.0);
        this.blurDirectionY = new Vector2(0.0, 1.0);

        // —— 选择性泛光（基于深度比较）相关 ——
        this.scene = null;
        this.camera = null;
        this.depthPass = null;
        this.clearPass = new ClearPass(true, false, false);
        this.clearPass.overrideClearColor = new Color(0x000000);
        this.depthMaskPass = new ShaderPass(new DepthMaskMaterial());
        this.renderTargetMasked = new WebGLRenderTarget(1, 1, { depthBuffer: false });
        this.renderTargetMasked.texture.name = "UnrealBloom.Masked";

        this.renderTargetSelection = new WebGLRenderTarget(1, 1, { 
            depthBuffer: false,
            format: RGBAFormat,
            stencilBuffer: false
        });
        this.renderTargetSelection.texture.name = "UnrealBloom.Selection";
        this.renderTargetSelection.texture.generateMipmaps = false;
        this.selectionCopyMaterial = new ShaderMaterial({
            uniforms: {
                inputBuffer: new Uniform(null)
            },
            vertexShader: copyVertexShader,
            fragmentShader: copyFragmentShader,
            depthWrite: false,
            depthTest: false
        });
        this.selectionCopyPass = new ShaderPass(this.selectionCopyMaterial);

        this.selection = new Selection();
        this._inverted = false;
        this._ignoreBackground = false;
        this.gBufferTextures = null;

        this.sceneDepthPass = null;
        this._initializeRenderTargetsAndMaterials();

        // —— 调试输出 ----
        this._debugMode = UnrealBloomEffect.DebugMode.NONE;
        this._debugStoredIntensity = null;
        this._debugStoredColor = new Color();
        this._depthEpsilon = this.depthMaskMaterial.epsilon;
    }

    // —— 选择性泛光配置 ——
    set mainScene(value) {
        this.scene = value;
        if (this.depthPass) this.depthPass.mainScene = value;
        if (this.sceneDepthPass) {
            this.sceneDepthPass.mainScene = value;
        } else if (value && this.camera) {
            this.sceneDepthPass = new DepthPass(value, this.camera);
            this.depthMaskMaterial.depthBuffer0 = this.sceneDepthPass.texture;
            this.depthMaskMaterial.depthPacking0 = this.sceneDepthPass.depthPacking || RGBADepthPacking;
        }
    }

    set mainCamera(value) {
        this.camera = value;
        if (!this.depthPass) this.depthPass = new DepthPass(this.scene, value);
        this.depthPass.mainCamera = value;

        if (!this.sceneDepthPass) {
            this.sceneDepthPass = new DepthPass(this.scene, value);
        }
        this.sceneDepthPass.mainCamera = value;

        this.depthMaskMaterial.copyCameraSettings(value);
        this.depthMaskMaterial.depthBuffer1 = this.depthPass.texture;
        this.depthMaskMaterial.depthPacking1 = this.depthPass.depthPacking || RGBADepthPacking;
        this.depthMaskMaterial.depthBuffer0 = this.sceneDepthPass.texture;
        this.depthMaskMaterial.depthPacking0 = this.sceneDepthPass.depthPacking || RGBADepthPacking;
        this.depthMaskMaterial.depthMode = EqualDepth;
        this.depthMaskMaterial.epsilon = 0.000009;
    }

    get depthMaskMaterial() {
        return this.depthMaskPass.fullscreenMaterial;
    }

    get inverted() { return this._inverted; }
    set inverted(value) {
        this._inverted = value;
        this.depthMaskMaterial.depthMode = value ? NotEqualDepth : EqualDepth;
    }

    get ignoreBackground() { return this._ignoreBackground; }
    set ignoreBackground(value) {
        this._ignoreBackground = value;
        this.depthMaskMaterial.maxDepthStrategy = value ?
            DepthTestStrategy.DISCARD_MAX_DEPTH :
            DepthTestStrategy.KEEP_MAX_DEPTH;
    }

    get depthEpsilon() {
        return this.depthMaskMaterial.epsilon;
    }

    set depthEpsilon(value) {
        this._depthEpsilon = value;
        this.depthMaskMaterial.epsilon = value;
    }

    get selectionTexture() {
        return this.renderTargetSelection.texture;
    }

    get selectionRenderTarget() {
        return this.renderTargetSelection;
    }

    static get DebugMode() {
        return {
            NONE: "none",
            SELECTION_MASK: "selection-mask",
            HIGH_PASS: "high-pass"
        };
    }

    get debugMode() {
        return this._debugMode;
    }

    set debugMode(value) {
        const modes = UnrealBloomEffect.DebugMode;
        const allowed = value === modes.NONE || value === modes.SELECTION_MASK || value === modes.HIGH_PASS;
        if (!allowed) {
            console.warn(`[UnrealBloomEffect] Unsupported debug mode: ${value}`);
            return;
        }

        if (this._debugMode === value) return;

        if (this._debugMode !== modes.NONE && value === modes.NONE) {
            if (this._debugStoredIntensity !== null) {
                this.intensity = this._debugStoredIntensity;
            }
            if (this._debugStoredColor) {
                this.uniforms.get("bloomColor").value.copy(this._debugStoredColor);
            }
            this._debugStoredIntensity = null;
        } else if (this._debugMode === modes.NONE && value !== modes.NONE) {
            this._debugStoredIntensity = this.intensity;
            this._debugStoredColor.copy(this.uniforms.get("bloomColor").value);
            this.intensity = 1.0;
            this.uniforms.get("bloomColor").value.set(1, 1, 1);
        }

        this._debugMode = value;
    }

    getSelection() { return this.selection; }

    setDepthTexture(depthTexture, depthPacking) {
        this.depthMaskMaterial.depthBuffer0 = depthTexture;
        if (depthPacking !== undefined) this.depthMaskMaterial.depthPacking0 = depthPacking;
    }

    setGBufferTextures(gBufferTextures) {
        this.gBufferTextures = gBufferTextures;
        if (gBufferTextures && gBufferTextures.gDepth) {
            this.depthMaskMaterial.depthBuffer0 = gBufferTextures.gDepth;
        }
    }

    _initializeRenderTargetsAndMaterials() {

        const kernelSizeArray = [3, 5, 7, 9, 11];

        // 初始占位，最终尺寸在 setSize 中设置
        let resx = Math.round(1 / 2);
        let resy = Math.round(1 / 2);

        for (let i = 0; i < this.nMips; i++) {

            const rtH = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            rtH.texture.name = "UnrealBloom.h" + i;
            rtH.texture.generateMipmaps = false;
            this.renderTargetsHorizontal.push(rtH);

            const rtV = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
            rtV.texture.name = "UnrealBloom.v" + i;
            rtV.texture.generateMipmaps = false;
            this.renderTargetsVertical.push(rtV);

            const blurMat = this._getSeparableBlurMaterial(kernelSizeArray[i] ?? kernelSizeArray[kernelSizeArray.length - 1]);
            blurMat.uniforms.invSize.value = new Vector2(1 / resx, 1 / resy);
            this.separableBlurMaterials.push(blurMat);

            resx = Math.max(1, Math.round(resx / 2));
            resy = Math.max(1, Math.round(resy / 2));
            // 连接合成输入
            this.compositeMaterial.uniforms.blurTexture1.value = (this.renderTargetsVertical[0] && this.renderTargetsVertical[0].texture) ? this.renderTargetsVertical[0].texture : null;
            this.compositeMaterial.uniforms.blurTexture2.value = (this.renderTargetsVertical[1] && this.renderTargetsVertical[1].texture) ? this.renderTargetsVertical[1].texture : null;
            this.compositeMaterial.uniforms.blurTexture3.value = (this.renderTargetsVertical[2] && this.renderTargetsVertical[2].texture) ? this.renderTargetsVertical[2].texture : null;
            this.compositeMaterial.uniforms.blurTexture4.value = (this.renderTargetsVertical[3] && this.renderTargetsVertical[3].texture) ? this.renderTargetsVertical[3].texture : null;
            this.compositeMaterial.uniforms.blurTexture5.value = (this.renderTargetsVertical[4] && this.renderTargetsVertical[4].texture) ? this.renderTargetsVertical[4].texture : null;
            this.compositeMaterial.uniforms.bloomFactors.value = this.bloomFactors;
            this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
        }

    }

    _createHighPassMaterial() {

        // 对齐 three/examples/jsm/shaders/LuminosityHighPassShader
        const uniforms = UniformsUtils.clone({
            "tDiffuse": { value: null },
            "luminosityThreshold": { value: 1.0 },
            "smoothWidth": { value: 1.0 },
            "defaultColor": { value: new Color(0x000000) },
            "defaultOpacity": { value: 0.0 }
        });

        const material = new ShaderMaterial({
            uniforms,
            vertexShader:
                `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
            fragmentShader:
                `uniform sampler2D tDiffuse;
				uniform float luminosityThreshold;
				uniform float smoothWidth;
				uniform vec3 defaultColor;
				uniform float defaultOpacity;

				varying vec2 vUv;

				void main() {
					vec4 texel = texture2D( tDiffuse, vUv );
					vec3 luma = vec3( 0.299, 0.587, 0.114 );
					float v = dot( texel.xyz, luma );

					vec4 outputColor = vec4( defaultColor.rgb, defaultOpacity );
					float alpha = smoothstep( luminosityThreshold, luminosityThreshold + smoothWidth, v );

					gl_FragColor = mix( outputColor, texel, alpha );
				}`
        });

        return material;
    }

    _getSeparableBlurMaterial(kernelRadius) {

        // 参考 UnrealBloomPass.getSeperableBlurMaterial
        const coefficients = [];
        for (let i = 0; i < kernelRadius; i++) {
            coefficients.push(0.39894 * Math.exp(-0.5 * i * i / (kernelRadius * kernelRadius)) / kernelRadius);
        }

        return new ShaderMaterial({
            defines: {
                'KERNEL_RADIUS': kernelRadius
            },
            uniforms: {
                'colorTexture': { value: null },
                'invSize': { value: new Vector2(0.5, 0.5) },
                'direction': { value: new Vector2(0.5, 0.5) },
                'gaussianCoefficients': { value: coefficients }
            },
            vertexShader:
                `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
            fragmentShader:
                `varying vec2 vUv;
				uniform sampler2D colorTexture;
				uniform vec2 invSize;
				uniform vec2 direction;
				uniform float gaussianCoefficients[KERNEL_RADIUS];

				void main() {
					float weightSum = gaussianCoefficients[0];
					vec3 diffuseSum = texture2D( colorTexture, vUv ).rgb * weightSum;
					for( int i = 1; i < KERNEL_RADIUS; i ++ ) {
						float x = float(i);
						float w = gaussianCoefficients[i];
						vec2 uvOffset = direction * invSize * x;
						vec3 sample1 = texture2D( colorTexture, vUv + uvOffset ).rgb;
						vec3 sample2 = texture2D( colorTexture, vUv - uvOffset ).rgb;
						diffuseSum += (sample1 + sample2) * w;
						weightSum += 2.0 * w;
					}
					gl_FragColor = vec4(diffuseSum/weightSum, 1.0);
				}`
        });
    }

    _createCompositeMaterial(nMips) {

        // 参考 UnrealBloomPass.getCompositeMaterial
        return new ShaderMaterial({
            defines: { 'NUM_MIPS': nMips },
            uniforms: {
                'blurTexture1': { value: null },
                'blurTexture2': { value: null },
                'blurTexture3': { value: null },
                'blurTexture4': { value: null },
                'blurTexture5': { value: null },
                'bloomStrength': { value: 1.0 },
                'bloomFactors': { value: null },
                'bloomTintColors': { value: null },
                'bloomRadius': { value: 0.0 }
            },
            vertexShader:
                `varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
            fragmentShader:
                `varying vec2 vUv;
				uniform sampler2D blurTexture1;
				uniform sampler2D blurTexture2;
				uniform sampler2D blurTexture3;
				uniform sampler2D blurTexture4;
				uniform sampler2D blurTexture5;
				uniform float bloomStrength;
				uniform float bloomRadius;
				uniform float bloomFactors[NUM_MIPS];
				uniform vec3 bloomTintColors[NUM_MIPS];

				float lerpBloomFactor(const in float factor) {
					float mirrorFactor = 1.2 - factor;
					return mix(factor, mirrorFactor, bloomRadius);
				}

				void main() {
					gl_FragColor = bloomStrength * ( lerpBloomFactor(bloomFactors[0]) * vec4(bloomTintColors[0], 1.0) * texture2D(blurTexture1, vUv) +
						lerpBloomFactor(bloomFactors[1]) * vec4(bloomTintColors[1], 1.0) * texture2D(blurTexture2, vUv) +
						lerpBloomFactor(bloomFactors[2]) * vec4(bloomTintColors[2], 1.0) * texture2D(blurTexture3, vUv) +
						lerpBloomFactor(bloomFactors[3]) * vec4(bloomTintColors[3], 1.0) * texture2D(blurTexture4, vUv) +
						lerpBloomFactor(bloomFactors[4]) * vec4(bloomTintColors[4], 1.0) * texture2D(blurTexture5, vUv) );
				}`
        });
    }

    update(renderer, inputBuffer, deltaTime) {

        // 如果配置了相机与场景，则根据选择层生成掩码
        let source = inputBuffer;
        if (this.camera) {

            if (this.sceneDepthPass) {
                this.sceneDepthPass.render(renderer, undefined, undefined, undefined, undefined, undefined, {
                    projectObject: true,
                    updateMatrixWorld: false,
                    useProgramCache: false
                });
            }

            if (this.ignoreBackground || !this.inverted || this.selection.size > 0) {
                const mask = this.camera.layers.mask;
                const selectionLayer = this.selection.layer;
                this.camera.layers.set(selectionLayer);

                const modifiedChildren = [];
                this.selection.forEach((object) => {
                    if (!object) return;
                    object.traverse((child) => {
                        if (!child.layers) return;
                        if (!child.visible) return;
                        if (!child.layers.isEnabled(selectionLayer)) {
                            modifiedChildren.push({ child, mask: child.layers.mask });
                            if (this.selection.exclusive) {
                                child.layers.set(selectionLayer);
                            } else {
                                child.layers.enable(selectionLayer);
                            }
                        }
                    });
                });

                if (!this.depthPass) this.depthPass = new DepthPass(this.scene, this.camera);
                this.depthPass.render(renderer, undefined, undefined, undefined, undefined, undefined, {
                    projectObject: true,
                    updateMatrixWorld: false,
                    useProgramCache: false
                });

                this.camera.layers.mask = mask;
                modifiedChildren.forEach(({ child, mask: originalMask }) => {
                    child.layers.mask = originalMask;
                });

                this.depthMaskMaterial.depthBuffer1 = this.depthPass.texture;
                this.depthMaskMaterial.depthBuffer0 = this.sceneDepthPass ? this.sceneDepthPass.texture : null;
                this.depthMaskMaterial.uniforms.inputBuffer.value = inputBuffer.texture;

                source = this.renderTargetMasked;
                this.clearPass.render(renderer, source);
                this.depthMaskPass.render(renderer, inputBuffer, source, undefined, undefined, {
                    projectObject: true,
                    updateMatrixWorld: false,
                    useProgramCache: false
                });

                this.selectionCopyPass.render(renderer, source, this.renderTargetSelection);
                
                // 创建一个材质，只显示选中的模型，完全隐藏未选中的部分
                if (!this.selectionOnlyMaterial) {
                    this.selectionOnlyMaterial = new ShaderMaterial({
                        uniforms: {
                            'tOriginal': { value: null },
                            'tSelection': { value: null }
                        },
                        vertexShader: `
                            varying vec2 vUv;
                            void main() {
                                vUv = uv;
                                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                            }
                        `,
                        fragmentShader: `
                            uniform sampler2D tOriginal;
                            uniform sampler2D tSelection;
                            varying vec2 vUv;
                            
                            void main() {
                                vec4 originalTexel = texture2D(tOriginal, vUv);
                                vec4 selectionTexel = texture2D(tSelection, vUv);
                                
                                // 使用RGB通道的平均值作为选择掩码
                                float selection = (selectionTexel.r + selectionTexel.g + selectionTexel.b) / 3.0;
                                
                                // 只在选择区域内显示原始模型，非选择区域完全透明
                                if (selection > 0.01) {
                                    gl_FragColor = vec4(originalTexel.rgb, 1.0);
                                } else {
                                    discard; // 完全丢弃未选中的像素
                                }
                            }
                        `
                    });
                }
                
                // 使用这个材质重新渲染选择层，确保只显示选中的模型
                this.selectionOnlyMaterial.uniforms.tOriginal.value = inputBuffer.texture;
                this.selectionOnlyMaterial.uniforms.tSelection.value = this.renderTargetSelection.texture;
                const selectionOnlyPass = new ShaderPass(this.selectionOnlyMaterial, "tOriginal");
                selectionOnlyPass.render(renderer, inputBuffer, this.renderTargetSelection);
            } else {
                this.clearPass.render(renderer, this.renderTargetSelection);
            }
        }

        // 1) 高通滤波提取高亮区域（可选）
        let brightInput = source;
        if (this.useHighPass) {
            this.materialHighPassFilter.uniforms.tDiffuse.value = source.texture;
            const highPass = new ShaderPass(this.materialHighPassFilter, "tDiffuse");
            highPass.render(renderer, source, this.renderTargetBright);
            brightInput = this.renderTargetBright;
        }

        if (this._debugMode === UnrealBloomEffect.DebugMode.SELECTION_MASK) {
            const targetTexture = source && source.texture ? source.texture : null;
            if (targetTexture) {
                this.uniforms.get("map").value = targetTexture;
            }
            return;
        }

        // 2) 逐级进行可分离高斯模糊（横向→纵向），构建 MIP 链
        let currentInput = this.useHighPass ? this.renderTargetBright : brightInput;

        for (let i = 0; i < this.nMips; i++) {

            const blurMaterial = this.separableBlurMaterials[i];
            const blurPass = new ShaderPass(blurMaterial, "colorTexture");

            // 水平模糊
            blurMaterial.uniforms.colorTexture.value = currentInput.texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionX;
            blurPass.render(renderer, currentInput, this.renderTargetsHorizontal[i]);

            // 垂直模糊
            blurMaterial.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
            blurMaterial.uniforms.direction.value = this.blurDirectionY;
            blurPass.render(renderer, this.renderTargetsHorizontal[i], this.renderTargetsVertical[i]);

            currentInput = this.renderTargetsVertical[i];
        }

        if (this._debugMode === UnrealBloomEffect.DebugMode.HIGH_PASS) {
            const debugTexture = (this.useHighPass ? this.renderTargetBright : brightInput).texture;
            if (debugTexture) {
                this.uniforms.get("map").value = debugTexture;
            }
            return;
        }

        // 3) 合成所有 MIP 结果
        this.compositeMaterial.uniforms.bloomTintColors.value = this.bloomTintColors;
        const compositePass = new ShaderPass(this.compositeMaterial);
        compositePass.render(renderer, this.renderTargetsVertical[0], this.renderTargetsHorizontal[0]);

        // 4) 将结果纹理传给最终 effect 的片元着色器，由混合函数叠加到主图
        this.uniforms.get("map").value = this.renderTargetsHorizontal[0].texture;
        
        // 根据输出模式设置不同的纹理
        switch(this.output) {
            case UnrealBloomEffect.OUTPUT.Beauty:
                this.uniforms.get("map").value = source.texture;
                break;
            case UnrealBloomEffect.OUTPUT.Brightness:
                this.uniforms.get("map").value = this.renderTargetBright.texture;
                break;
            case UnrealBloomEffect.OUTPUT.Blur1:
                this.uniforms.get("map").value = this.renderTargetsVertical[0].texture;
                break;
            case UnrealBloomEffect.OUTPUT.Blur2:
                if (this.renderTargetsVertical[1]) {
                    this.uniforms.get("map").value = this.renderTargetsVertical[1].texture;
                }
                break;
            case UnrealBloomEffect.OUTPUT.Blur3:
                if (this.renderTargetsVertical[2]) {
                    this.uniforms.get("map").value = this.renderTargetsVertical[2].texture;
                }
                break;
            case UnrealBloomEffect.OUTPUT.Blur4:
                if (this.renderTargetsVertical[3]) {
                    this.uniforms.get("map").value = this.renderTargetsVertical[3].texture;
                }
                break;
            case UnrealBloomEffect.OUTPUT.Blur5:
                if (this.renderTargetsVertical[4]) {
                    this.uniforms.get("map").value = this.renderTargetsVertical[4].texture;
                }
                break;
            case UnrealBloomEffect.OUTPUT.Composite:
                this.uniforms.get("map").value = this.renderTargetsHorizontal[0].texture;
                break;
            case UnrealBloomEffect.OUTPUT.Selection:
                if (this.renderTargetSelection) {
                    // 确保渲染目标支持透明度
                    if (this.renderTargetSelection.texture.format !== RGBAFormat) {
                        this.renderTargetSelection.texture.format = RGBAFormat;
                    }
                    // 直接使用已经处理好的选择层纹理，它现在只包含选中的模型，背景完全透明
                    this.uniforms.get("map").value = this.renderTargetSelection.texture;
                }
                break;
            case UnrealBloomEffect.OUTPUT.Default:
            default:
                // 保持默认行为
                break;
        }
    }

    setSize(width, height) {

        let resx = Math.max(1, Math.round(width / 2));
        let resy = Math.max(1, Math.round(height / 2));

        this.renderTargetBright.setSize(resx, resy);
        this.renderTargetMasked.setSize(width, height);
        this.renderTargetSelection.setSize(width, height);
        if (this.depthPass) this.depthPass.setSize(width, height);
        if (this.sceneDepthPass) this.sceneDepthPass.setSize(width, height);

        for (let i = 0; i < this.nMips; i++) {

            this.renderTargetsHorizontal[i].setSize(resx, resy);
            this.renderTargetsVertical[i].setSize(resx, resy);
            this.separableBlurMaterials[i].uniforms.invSize.value.set(1 / resx, 1 / resy);

            resx = Math.max(1, Math.round(resx / 2));
            resy = Math.max(1, Math.round(resy / 2));
        }
    }

    initialize(renderer, alpha, frameBufferType) {

        if (frameBufferType !== undefined) {

            this.renderTargetBright.texture.type = frameBufferType;
            this.renderTargetMasked.texture.type = frameBufferType;
            this.renderTargetSelection.texture.type = frameBufferType;
            for (let i = 0; i < this.nMips; i++) {
                this.renderTargetsHorizontal[i].texture.type = frameBufferType;
                this.renderTargetsVertical[i].texture.type = frameBufferType;
            }

            if (renderer !== null && renderer.outputColorSpace === SRGBColorSpace) {
                this.renderTargetBright.texture.colorSpace = SRGBColorSpace;
                this.renderTargetMasked.texture.colorSpace = SRGBColorSpace;
                this.renderTargetSelection.texture.colorSpace = SRGBColorSpace;
                for (let i = 0; i < this.nMips; i++) {
                    this.renderTargetsHorizontal[i].texture.colorSpace = SRGBColorSpace;
                    this.renderTargetsVertical[i].texture.colorSpace = SRGBColorSpace;
                }
            }
        }

        this.selectionCopyPass.initialize(renderer, alpha, frameBufferType);
        this.clearPass.initialize(renderer, alpha, frameBufferType);
        this.depthMaskPass.initialize(renderer, alpha, frameBufferType);
        if (this.depthPass) this.depthPass.initialize(renderer, alpha, frameBufferType);
        if (this.sceneDepthPass) this.sceneDepthPass.initialize(renderer, alpha, frameBufferType);
    }

    get intensity() {
        return this.uniforms.get("intensity").value;
    }

    set intensity(value) {
        this.uniforms.get("intensity").value = value;
    }

    get bloomColor() {
        return this.uniforms.get("bloomColor").value;
    }

    set bloomColor(value) {
        this.uniforms.get("bloomColor").value.copy(new Color(value));
    }

    /**
     * 输出模式枚举
     */
    static get OUTPUT() {
        return {
            Default: "Default",
            Beauty: "Beauty",
            Brightness: "Brightness",
            Blur1: "Blur1",
            Blur2: "Blur2",
            Blur3: "Blur3",
            Blur4: "Blur4",
            Blur5: "Blur5",
            Composite: "Composite",
            Selection: "Selection"
        };
    }

    /**
     * 设置输出模式
     * @param {string} mode - 输出模式
     */
    setOutputMode(mode) {
        const modes = Object.values(UnrealBloomEffect.OUTPUT);
        if (modes.includes(mode)) {
            this.output = mode;
        } else {
            console.warn(`[UnrealBloomEffect] Invalid output mode: ${mode}`);
        }
    }

    /**
     * 循环切换输出模式
     */
    cycleOutputMode() {
        const modes = Object.values(UnrealBloomEffect.OUTPUT);
        const currentIndex = modes.indexOf(this.output);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.output = modes[nextIndex];
        return this.output;
    }

}

