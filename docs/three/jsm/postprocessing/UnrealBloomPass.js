import {
	AdditiveBlending,
	Color,
	HalfFloatType,
	MeshBasicMaterial,
	ShaderMaterial,
	UniformsUtils,
	Vector2,
	Vector3,
	WebGLRenderTarget
} from 'run-scene-core';
import { Pass, FullScreenQuad } from './Pass.js';
import { CopyShader } from '../shaders/CopyShader.js';
import { LuminosityHighPassShader } from '../shaders/LuminosityHighPassShader.js';

/**
 * UnrealBloomPass is inspired by the bloom pass of Unreal Engine. It creates a
 * mip map chain of bloom textures and blurs them with different radii. Because
 * of the weighted combination of mips, and because larger blurs are done on
 * higher mips, this effect provides good quality and performance.
 *
 * Reference:
 * - https://docs.unrealengine.com/latest/INT/Engine/Rendering/PostProcessEffects/Bloom/
 */
class UnrealBloomPass extends Pass {

	constructor(resolution, strength, radius, threshold) {

		super();

		this.strength = (strength !== undefined) ? strength : 1;
		this.radius = radius;
		this.threshold = threshold;
		this.resolution = (resolution !== undefined) ? new Vector2(resolution.x, resolution.y) : new Vector2(256, 256);

		// 添加输出模式，默认为Default
		this.output = UnrealBloomPass.OUTPUT.Default;

		// create color only once here, reuse it later inside the render function
		this.clearColor = new Color(0, 0, 0);

		// render targets
		this.renderTargetsHorizontal = [];
		this.renderTargetsVertical = [];
		this.nMips = 5;
		let resx = Math.round(this.resolution.x / 2);
		let resy = Math.round(this.resolution.y / 2);

		this.renderTargetBright = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });
		this.renderTargetBright.texture.name = 'UnrealBloomPass.bright';
		this.renderTargetBright.texture.generateMipmaps = false;

		for (let i = 0; i < this.nMips; i++) {

			const renderTargetHorizontal = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });

			renderTargetHorizontal.texture.name = 'UnrealBloomPass.h' + i;
			renderTargetHorizontal.texture.generateMipmaps = false;

			this.renderTargetsHorizontal.push(renderTargetHorizontal);

			const renderTargetVertical = new WebGLRenderTarget(resx, resy, { type: HalfFloatType });

			renderTargetVertical.texture.name = 'UnrealBloomPass.v' + i;
			renderTargetVertical.texture.generateMipmaps = false;

			this.renderTargetsVertical.push(renderTargetVertical);

			resx = Math.round(resx / 2);

			resy = Math.round(resy / 2);

		}

		// luminosity high pass material

		const highPassShader = LuminosityHighPassShader;
		this.highPassUniforms = UniformsUtils.clone(highPassShader.uniforms);

		this.highPassUniforms['luminosityThreshold'].value = threshold;
		this.highPassUniforms['smoothWidth'].value = 0.01;

		this.materialHighPassFilter = new ShaderMaterial({
			uniforms: this.highPassUniforms,
			vertexShader: highPassShader.vertexShader,
			fragmentShader: highPassShader.fragmentShader
		});

		// gaussian blur materials

		this.separableBlurMaterials = [];
		const kernelSizeArray = [3, 5, 7, 9, 11];
		resx = Math.round(this.resolution.x / 2);
		resy = Math.round(this.resolution.y / 2);

		for (let i = 0; i < this.nMips; i++) {

			this.separableBlurMaterials.push(this.getSeperableBlurMaterial(kernelSizeArray[i]));

			this.separableBlurMaterials[i].uniforms['invSize'].value = new Vector2(1 / resx, 1 / resy);

			resx = Math.round(resx / 2);

			resy = Math.round(resy / 2);

		}

		// composite material

		this.compositeMaterial = this.getCompositeMaterial(this.nMips);
		this.compositeMaterial.uniforms['blurTexture1'].value = this.renderTargetsVertical[0].texture;
		this.compositeMaterial.uniforms['blurTexture2'].value = this.renderTargetsVertical[1].texture;
		this.compositeMaterial.uniforms['blurTexture3'].value = this.renderTargetsVertical[2].texture;
		this.compositeMaterial.uniforms['blurTexture4'].value = this.renderTargetsVertical[3].texture;
		this.compositeMaterial.uniforms['blurTexture5'].value = this.renderTargetsVertical[4].texture;
		this.compositeMaterial.uniforms['bloomStrength'].value = strength;
		this.compositeMaterial.uniforms['bloomRadius'].value = 0.1;

		const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
		this.compositeMaterial.uniforms['bloomFactors'].value = bloomFactors;
		this.bloomTintColors = [new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1), new Vector3(1, 1, 1)];
		this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

		// blend material

		const copyShader = CopyShader;

		this.copyUniforms = UniformsUtils.clone(copyShader.uniforms);

		this.blendMaterial = new ShaderMaterial({
			uniforms: this.copyUniforms,
			vertexShader: copyShader.vertexShader,
			fragmentShader: copyShader.fragmentShader,
			blending: AdditiveBlending,
			depthTest: false,
			depthWrite: false,
			transparent: true
		});

		this.enabled = true;
		this.needsSwap = false;

		this._oldClearColor = new Color();
		this.oldClearAlpha = 1;

		this.basic = new MeshBasicMaterial();

		this.fsQuad = new FullScreenQuad(null);

	}

	dispose() {

		for (let i = 0; i < this.renderTargetsHorizontal.length; i++) {

			this.renderTargetsHorizontal[i].dispose();

		}

		for (let i = 0; i < this.renderTargetsVertical.length; i++) {

			this.renderTargetsVertical[i].dispose();

		}

		this.renderTargetBright.dispose();

		//

		for (let i = 0; i < this.separableBlurMaterials.length; i++) {

			this.separableBlurMaterials[i].dispose();

		}

		this.compositeMaterial.dispose();
		this.blendMaterial.dispose();
		this.basic.dispose();

		//

		this.fsQuad.dispose();

	}

	setSize(width, height) {

		let resx = Math.round(width / 2);
		let resy = Math.round(height / 2);

		this.renderTargetBright.setSize(resx, resy);

		for (let i = 0; i < this.nMips; i++) {

			this.renderTargetsHorizontal[i].setSize(resx, resy);
			this.renderTargetsVertical[i].setSize(resx, resy);

			this.separableBlurMaterials[i].uniforms['invSize'].value = new Vector2(1 / resx, 1 / resy);

			resx = Math.round(resx / 2);
			resy = Math.round(resy / 2);

		}

	}

	render(renderer, writeBuffer, readBuffer, deltaTime, maskActive) {

		renderer.getClearColor(this._oldClearColor);
		this.oldClearAlpha = renderer.getClearAlpha();
		const oldAutoClear = renderer.autoClear;
		renderer.autoClear = false;

		renderer.setClearColor(this.clearColor, 0);

		if (maskActive) renderer.state.buffers.stencil.setTest(false);

		// 根据输出模式决定渲染内容
		switch (this.output) {
			case UnrealBloomPass.OUTPUT.Beauty:
				// 只显示原始场景，不应用泛光效果
				if (this.renderToScreen) {
					this.fsQuad.material = this.basic;
					this.basic.map = readBuffer.texture;
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					this.copyUniforms['tDiffuse'].value = readBuffer.texture;
					this.fsQuad.material = this.blendMaterial;
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Brightness:
				// 只显示亮度提取结果
				this.highPassUniforms['tDiffuse'].value = readBuffer.texture;
				this.highPassUniforms['luminosityThreshold'].value = this.threshold;
				this.fsQuad.material = this.materialHighPassFilter;
				renderer.setRenderTarget(this.renderTargetBright);
				renderer.clear();
				this.fsQuad.render(renderer);

				// 输出亮度提取结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetBright.texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Blur1:
				// 显示第一级模糊结果
				this.renderBlurPasses(renderer, readBuffer, 0);

				// 输出第一级模糊结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsVertical[0].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Blur2:
				// 显示第二级模糊结果
				this.renderBlurPasses(renderer, readBuffer, 1);

				// 输出第二级模糊结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsVertical[1].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Blur3:
				// 显示第三级模糊结果
				this.renderBlurPasses(renderer, readBuffer, 2);

				// 输出第三级模糊结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsVertical[2].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Blur4:
				// 显示第四级模糊结果
				this.renderBlurPasses(renderer, readBuffer, 3);

				// 输出第四级模糊结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsVertical[3].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Blur5:
				// 显示第五级模糊结果
				this.renderBlurPasses(renderer, readBuffer, 4);

				// 输出第五级模糊结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsVertical[4].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Composite:
				// 显示合成结果，但不与原始场景混合
				this.renderBlurPasses(renderer, readBuffer, -1);

				// 合成所有mips
				this.fsQuad.material = this.compositeMaterial;
				this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
				this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
				this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

				renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
				renderer.clear();
				this.fsQuad.render(renderer);

				// 输出合成结果
				this.copyUniforms['tDiffuse'].value = this.renderTargetsHorizontal[0].texture;
				this.fsQuad.material = this.blendMaterial;
				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(writeBuffer);
					renderer.clear();
					this.fsQuad.render(renderer);
				}
				break;

			case UnrealBloomPass.OUTPUT.Default:
			default:
				// 原始的完整渲染流程
				// Render input to screen
				if (this.renderToScreen) {
					this.fsQuad.material = this.basic;
					this.basic.map = readBuffer.texture;
					renderer.setRenderTarget(null);
					renderer.clear();
					this.fsQuad.render(renderer);
				}

				// 1. Extract Bright Areas
				this.highPassUniforms['tDiffuse'].value = readBuffer.texture;
				this.highPassUniforms['luminosityThreshold'].value = this.threshold;
				this.fsQuad.material = this.materialHighPassFilter;

				renderer.setRenderTarget(this.renderTargetBright);
				renderer.clear();
				this.fsQuad.render(renderer);

				// 2. Blur All the mips progressively
				let inputRenderTarget = this.renderTargetBright;

				for (let i = 0; i < this.nMips; i++) {
					this.fsQuad.material = this.separableBlurMaterials[i];

					this.separableBlurMaterials[i].uniforms['colorTexture'].value = inputRenderTarget.texture;
					this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionX;
					renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
					renderer.clear();
					this.fsQuad.render(renderer);

					this.separableBlurMaterials[i].uniforms['colorTexture'].value = this.renderTargetsHorizontal[i].texture;
					this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionY;
					renderer.setRenderTarget(this.renderTargetsVertical[i]);
					renderer.clear();
					this.fsQuad.render(renderer);

					inputRenderTarget = this.renderTargetsVertical[i];
				}

				// Composite All the mips
				this.fsQuad.material = this.compositeMaterial;
				this.compositeMaterial.uniforms['bloomStrength'].value = this.strength;
				this.compositeMaterial.uniforms['bloomRadius'].value = this.radius;
				this.compositeMaterial.uniforms['bloomTintColors'].value = this.bloomTintColors;

				renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
				renderer.clear();
				this.fsQuad.render(renderer);

				// Blend it additively over the input texture
				this.fsQuad.material = this.blendMaterial;
				this.copyUniforms['tDiffuse'].value = this.renderTargetsHorizontal[0].texture;

				if (maskActive) renderer.state.buffers.stencil.setTest(true);

				if (this.renderToScreen) {
					renderer.setRenderTarget(null);
					this.fsQuad.render(renderer);
				} else {
					renderer.setRenderTarget(readBuffer);
					this.fsQuad.render(renderer);
				}
				break;
		}

		// Restore renderer settings
		renderer.setClearColor(this._oldClearColor, this.oldClearAlpha);
		renderer.autoClear = oldAutoClear;
	}

	// 辅助方法：渲染模糊通道
	renderBlurPasses(renderer, readBuffer, targetLevel) {
		// 1. Extract Bright Areas
		this.highPassUniforms['tDiffuse'].value = readBuffer.texture;
		this.highPassUniforms['luminosityThreshold'].value = this.threshold;
		this.fsQuad.material = this.materialHighPassFilter;
		renderer.setRenderTarget(this.renderTargetBright);
		renderer.clear();
		this.fsQuad.render(renderer);

		// 2. Blur All the mips progressively
		let inputRenderTarget = this.renderTargetBright;

		// 如果指定了目标级别，则只渲染到该级别
		const maxLevel = targetLevel >= 0 ? targetLevel + 1 : this.nMips;

		for (let i = 0; i < maxLevel; i++) {
			this.fsQuad.material = this.separableBlurMaterials[i];

			this.separableBlurMaterials[i].uniforms['colorTexture'].value = inputRenderTarget.texture;
			this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionX;
			renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
			renderer.clear();
			this.fsQuad.render(renderer);

			this.separableBlurMaterials[i].uniforms['colorTexture'].value = this.renderTargetsHorizontal[i].texture;
			this.separableBlurMaterials[i].uniforms['direction'].value = UnrealBloomPass.BlurDirectionY;
			renderer.setRenderTarget(this.renderTargetsVertical[i]);
			renderer.clear();
			this.fsQuad.render(renderer);

			inputRenderTarget = this.renderTargetsVertical[i];
		}
	}

	getSeperableBlurMaterial(kernelRadius) {

		const coefficients = [];

		for (let i = 0; i < kernelRadius; i++) {

			coefficients.push(0.39894 * Math.exp(- 0.5 * i * i / (kernelRadius * kernelRadius)) / kernelRadius);

		}

		return new ShaderMaterial({

			defines: {
				'KERNEL_RADIUS': kernelRadius
			},

			uniforms: {
				'colorTexture': { value: null },
				'invSize': { value: new Vector2(0.5, 0.5) }, // inverse texture size
				'direction': { value: new Vector2(0.5, 0.5) },
				'gaussianCoefficients': { value: coefficients } // precomputed Gaussian coefficients
			},

			vertexShader:
				`varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,

			fragmentShader:
				`#include <common>
				varying vec2 vUv;
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

	getCompositeMaterial(nMips) {

		return new ShaderMaterial({

			defines: {
				'NUM_MIPS': nMips
			},

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


	/**
	 * 设置输出模式
	 * @param {Number} mode - 输出模式，使用UnrealBloomPass.OUTPUT枚举
	 */
	setOutputMode(mode) {
		this.output = mode;
		console.log(`已设置输出模式：${Object.keys(UnrealBloomPass.OUTPUT).find(key => UnrealBloomPass.OUTPUT[key] === mode) || "未知"}`);
	}

	/**
	 * 循环切换输出模式，便于调试
	 */
	cycleOutputMode() {
		const modes = Object.values(UnrealBloomPass.OUTPUT);
		const currentIndex = modes.indexOf(this.output);
		const nextIndex = (currentIndex + 1) % modes.length;
		this.setOutputMode(modes[nextIndex]);
	}
}

UnrealBloomPass.OUTPUT = {
	"Default": 0,
	"Beauty": 1,
	"Brightness": 2,
	"Blur1": 3,
	"Blur2": 4,
	"Blur3": 5,
	"Blur4": 6,
	"Blur5": 7,
	"Composite": 8
};

UnrealBloomPass.BlurDirectionX = new Vector2(1.0, 0.0);
UnrealBloomPass.BlurDirectionY = new Vector2(0.0, 1.0);

export { UnrealBloomPass };
