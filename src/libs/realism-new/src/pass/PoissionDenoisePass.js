import {
	Pass
} from "postprocessing";
import {
	ShaderMaterial,
	Matrix4,
	Vector2,
	HalfFloatType,
	NoColorSpace, WebGLRenderTarget, TextureLoader, NearestFilter, RepeatWrapping
} from "run-scene-core";

import {
	sampleBlueNoise, generateDenoiseSamples, generatePoissonDiskConstant
} from "../../index";
import { blueNoiseBase64 } from "src/libs/realism-effects/src/utils/TextureAssets";

// 导入从外部文件分离的着色器
import { vertexShader, fragmentShader } from "../ao/shader/poission";

const defaultPoissonBlurOptions = {
	iterations: 1,
	radius: 8,
	rings: 5.625,
	lumaPhi: 10,
	depthPhi: 2,
	normalPhi: 3.25,
	samples: 16,
	normalTexture: null
};

export class PoissionDenoisePass extends Pass {

	constructor(camera, inputTexture, depthTexture, options = defaultPoissonBlurOptions) {

		super("PoissionBlurPass");
		this.iterations = defaultPoissonBlurOptions.iterations;
		this.index = 0;
		options = {
			...defaultPoissonBlurOptions,
			...options
		};
		this.inputTexture = inputTexture;

		// 处理着色器中的sampleBlueNoise包含
		const finalFragmentShader = fragmentShader.replace("#include <sampleBlueNoise>", sampleBlueNoise);

		this.fullscreenMaterial = new ShaderMaterial({
			fragmentShader: finalFragmentShader,
			vertexShader,
			uniforms: {
				depthTexture: {
					value: null
				},
				inputTexture: {
					value: null
				},
				projectionMatrixInverse: {
					value: new Matrix4()
				},
				cameraMatrixWorld: {
					value: new Matrix4()
				},
				lumaPhi: {
					value: 5.0
				},
				depthPhi: {
					value: 5.0
				},
				normalPhi: {
					value: 5.0
				},
				resolution: {
					value: new Vector2()
				},
				blueNoiseTexture: {
					value: null
				},
				index: {
					value: 0
				},
				blueNoiseRepeat: {
					value: new Vector2()
				}
			}
		});

		// 检查着色器是否包含亮度阈值定义
		if (!this.fullscreenMaterial.fragmentShader.includes("IGNORE_BRIGHTNESS_THRESHOLD")) {


		} else {


		}

		const renderTargetOptions = {
			type: HalfFloatType,
			depthBuffer: false
		};
		this.renderTargetA = new WebGLRenderTarget(1, 1, renderTargetOptions);
		this.renderTargetB = new WebGLRenderTarget(1, 1, renderTargetOptions);
		const {
			uniforms
		} = this.fullscreenMaterial;
		uniforms.inputTexture.value = this.inputTexture;
		uniforms.depthTexture.value = depthTexture;
		uniforms.projectionMatrixInverse.value = camera.projectionMatrixInverse;
		uniforms.cameraMatrixWorld.value = camera.matrixWorld;
		uniforms.depthPhi.value = options.depthPhi;
		uniforms.normalPhi.value = options.normalPhi;

		if (options.normalTexture) {

			uniforms.normalTexture.value = options.normalTexture;

		} else {

			this.fullscreenMaterial.defines.NORMAL_IN_RGB = "";

		} // these properties need the shader to be recompiled


		for (const prop of ["radius", "rings", "samples"]) {

			Object.defineProperty(this, prop, {
				get: () => options[prop],
				set: value => {

					options[prop] = value;
					this.setSize(this.renderTargetA.width, this.renderTargetA.height);

				}
			});

		}

		new TextureLoader().load(blueNoiseBase64, blueNoiseTexture => {

			blueNoiseTexture.minFilter = NearestFilter;
			blueNoiseTexture.magFilter = NearestFilter;
			blueNoiseTexture.wrapS = RepeatWrapping;
			blueNoiseTexture.wrapT = RepeatWrapping;
			blueNoiseTexture.colorSpace = NoColorSpace;
			this.fullscreenMaterial.uniforms.blueNoiseTexture.value = blueNoiseTexture;

		});

	}

	setSize(width, height) {

		this.renderTargetA.setSize(width, height);
		this.renderTargetB.setSize(width, height);
		this.fullscreenMaterial.uniforms.resolution.value.set(width, height);

		// 生成泊松盘采样点
		const poissonDisk = generateDenoiseSamples(this.samples, this.rings, this.radius, new Vector2(1 / width, 1 / height));
		const sampleDefine = `const int samples = ${this.samples};\n`;
		const poissonDiskConstant = generatePoissonDiskConstant(poissonDisk);

		// 重新处理着色器，确保保留亮度阈值定义
		let processedFragmentShader = fragmentShader;
		// 确保替换的是未处理的sampleBlueNoise标记
		if (processedFragmentShader.includes("#include <sampleBlueNoise>")) {

			processedFragmentShader = processedFragmentShader.replace("#include <sampleBlueNoise>", sampleBlueNoise);

		}

		// 添加采样点定义到着色器
		this.fullscreenMaterial.fragmentShader = sampleDefine + poissonDiskConstant + "\n" + processedFragmentShader;
		this.fullscreenMaterial.needsUpdate = true;

		// 再次检查是否保留了亮度阈值定义
		if (!this.fullscreenMaterial.fragmentShader.includes("IGNORE_BRIGHTNESS_THRESHOLD")) {

			console.warn("警告: 在setSize后，降噪着色器中未找到亮度阈值定义");

		}

	}

	get texture() {

		return this.renderTargetB.texture;

	}

	render(renderer) {

		this.fullscreenMaterial.uniforms.index.value = 0;
		const noiseTexture = this.fullscreenMaterial.uniforms.blueNoiseTexture.value;

		if (noiseTexture) {

			const {
				width,
				height
			} = noiseTexture.source.data;
			this.fullscreenMaterial.uniforms.blueNoiseRepeat.value.set(this.renderTargetA.width / width, this.renderTargetA.height / height);

		}

		for (let i = 0; i < 2 * this.iterations; i++) {

			const horizontal = i % 2 === 0;
			const inputRenderTarget = horizontal ? this.renderTargetB : this.renderTargetA;
			this.fullscreenMaterial.uniforms.inputTexture.value = i === 0 ? this.inputTexture : inputRenderTarget.texture;
			const renderTarget = horizontal ? this.renderTargetA : this.renderTargetB;
			renderer.setRenderTarget(renderTarget);
			renderer.clear(true, true, true); // 确保在渲染前清除渲染目标
			renderer.render(this.scene, this.camera);
			this.fullscreenMaterial.uniforms.index.value = (this.fullscreenMaterial.uniforms.index.value + 1) % 4;

		}

	}

}

PoissionDenoisePass.DefaultOptions = defaultPoissonBlurOptions;
