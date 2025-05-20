import { Uniform, Vector2, Vector3, Color, LinearFilter, RGBAFormat, WebGLRenderTarget, HalfFloatType, Matrix4, RepeatWrapping, DataTexture } from "three";
import { Effect, EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/weather-system.frag.glsl";
import { BlendFunction } from "../enums/BlendFunction.js";
/**
 * 天气系统效果
 *
 * 该效果提供了基于Shadertoy实现的天空散射及云层效果
 * 基于StillTravelling的"The sun, the sky and the clouds"着色器
 */
export class WeatherSystemEffect extends Effect {

	/**
     * 构造函数
     *
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
     * @param {Vector3} [options.sunPosition=new Vector3(0.1, 0.05, -1).normalize()] - 太阳位置（方向向量）
     * @param {Boolean} [options.animateEffects=true] - 是否启用动画效果
     * @param {Number} [options.intensity=10.0] - 散射强度
     * @param {Number} [options.cloudiness=0.5] - 云层密度
     */
	constructor({
		blendFunction = BlendFunction.SCREEN,
		sunPosition = new Vector3(0.1, 0.05, -1).normalize(),
		animateEffects = true,
		intensity = 10.0,
		cloudiness = 0.5
	} = {}) {

		super(
			"WeatherSystemEffect",
			fragmentShader,
			{
				blendFunction,
				attributes: EffectAttribute.DEPTH,
				defines: new Map([
					["USE_DEPTH", "1"]
				]),
				uniforms: new Map([
					["sunPosition", new Uniform(sunPosition)],
					["intensity", new Uniform(intensity)],
					["animateEffects", new Uniform(animateEffects ? 1 : 0)],
					["time", new Uniform(0.0)],
					["resolution", new Uniform(new Vector2(1, 1))],
					["noiseTexture", new Uniform(null)],
					["cloudiness", new Uniform(cloudiness)]
				])
			}
		);

		/**
         * 太阳位置方向
         * @type {Vector3}
         */
		this.sunPosition = sunPosition;

		/**
         * 特效动画开关
         * @type {Boolean}
         */
		this.animateEffects = animateEffects;

		/**
         * 散射强度
         * @type {Number}
         */
		this.intensity = intensity;

		/**
         * 云层密度
         * @type {Number}
         */
		this.cloudiness = cloudiness;

		// 创建默认噪声纹理
		this.createDefaultNoiseTexture();

	}

	/**
     * 创建默认噪声纹理
     * 当没有提供噪声纹理时使用
     */
	createDefaultNoiseTexture() {

		const size = 256;
		const data = new Float32Array(size * size * 4);

		for(let i = 0; i < size * size; i++) {

			data[i * 4] = Math.random();
			data[i * 4 + 1] = Math.random();
			data[i * 4 + 2] = Math.random();
			data[i * 4 + 3] = 1.0;

		}

		const texture = new DataTexture(data, size, size, RGBAFormat, HalfFloatType);
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.needsUpdate = true;

		this.uniforms.get("noiseTexture").value = texture;

	}

	/**
     * 更新效果
     *
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 时间增量
     */
	update(renderer, inputBuffer, deltaTime) {

		this.uniforms.get("time").value += deltaTime;

		// 更新分辨率
		const size = renderer.getSize(new Vector2());
		this.uniforms.get("resolution").value.set(size.width, size.height);

		// 更新动画开关
		this.uniforms.get("animateEffects").value = this.animateEffects ? 1 : 0;

		// 更新强度和散射参数
		this.uniforms.get("intensity").value = this.intensity;
		this.uniforms.get("cloudiness").value = this.cloudiness;

	}

	/**
     * 设置噪声纹理
     *
     * @param {Texture} texture - 噪声纹理
     */
	setNoiseTexture(texture) {

		if(texture !== null) {

			texture.wrapS = texture.wrapT = RepeatWrapping;
			texture.minFilter = texture.magFilter = LinearFilter;
			this.uniforms.get("noiseTexture").value = texture;

		}

	}

	/**
     * 设置天气预设
     *
     * @param {String} preset - 预设名称，可选值："clear", "cloudy", "overcast", "storm"
     */
	setWeatherPreset(preset) {

		// 恢复默认值
		this.cloudiness = 0.5;
		this.intensity = 10.0;

		// 设置预设值
		switch(preset.toLowerCase()) {

			case "clear":
				this.cloudiness = 0.3;
				this.intensity = 12.0;
				break;

			case "cloudy":
				this.cloudiness = 1.2;
				this.intensity = 9.0;
				break;

			case "overcast":
				this.cloudiness = 1.8;
				this.intensity = 8.0;
				break;

			case "storm":
				this.cloudiness = 2.5;
				this.intensity = 7.0;
				break;

		}

	}

}
