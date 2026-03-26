import { Effect, EffectAttribute } from "postprocessing";
import { DataTexture, LinearFilter, Matrix4, RepeatWrapping, Uniform, Vector2, Vector3, WebGLRenderTarget } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import fragmentShader from "./shaders/sky-atmosphere.frag.glsl";
import { SkyAtmosphereUtils } from "./utils/SkyAtmosphereUtils.js";

/**
 * 高级体积云和大气散射效果
 *
 * 此效果模拟真实的体积云、体积光和大气散射
 * 基于robobo1221的PBR体积云技术
 */
export class SkyAtmosphereEffect extends Effect {

	/**
	 * 构造函数
	 *
	 * @param {Object} [options] - 效果选项
	 * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - 混合模式
	 * @param {Vector3} [options.sunPosition=new Vector3(0.1, 0.05, -1).normalize()] - 太阳位置（方向向量）
	 * @param {Boolean} [options.animateClouds=true] - 是否启用云层动画
	 * @param {Number} [options.intensity=12.0] - 散射强度
	 * @param {Number} [options.sunBrightness=3.0] - 太阳亮度
	 * @param {Number} [options.rayleighCoefficient=1.0] - 瑞利散射系数
	 * @param {Number} [options.mieCoefficient=0.8] - 米氏散射系数
	 * @param {Number} [options.mieDirectionalG=0.8] - 米氏散射方向性参数（0-1）
	 * @param {Number} [options.cloudiness=1.0] - 云层密度
	 * @param {Number} [options.fov=60.0] - 视场角（度）
	 * @param {Number} [options.skyBlueness=0.5] - 天空蓝度增强
	 * @param {Number} [options.cloudAmount=1.0] - 云层数量
	 * @param {Number} [options.cloudScale=1.0] - 云层尺度
	 * @param {Number} [options.cloudThreshold=0.0] - 云层阈值
	 * @param {Number} [options.volumetricCloudSteps=16] - 体积云采样步数
	 * @param {Number} [options.volumetricLightSteps=8] - 体积光采样步数
	 * @param {Number} [options.cloudShadowingSteps=12] - 云阴影采样步数
	 * @param {Number} [options.volumetricLightShadowSteps=4] - 体积光阴影采样步数
	 * @param {Boolean} [options.enableStars=false] - 是否启用星空
	 * @param {Number} [options.starIntensity=1.0] - 星星亮度
	 * @param {Number} [options.starDensity=0.5] - 星星密度
	 * @param {Number} [options.starSize=1.0] - 星星大小
	 * @param {Boolean} [options.enableMoon=false] - 是否启用月亮
	 * @param {Vector3} [options.moonPosition=new Vector3(-0.1, 0.05, -1).normalize()] - 月亮位置（方向向量）
	 * @param {Number} [options.moonSize=0.02] - 月亮大小
	 * @param {Number} [options.moonIntensity=1.0] - 月亮亮度
	 * @param {Boolean} [options.enableAurora=false] - 是否启用极光
	 * @param {Number} [options.auroraIntensity=1.5] - 极光强度
	 * @param {Number} [options.auroraDensity=1.0] - 极光密度
	 * @param {Vector3} [options.auroraColor=new Vector3(2.15, -1.0, 1.0)] - 极光颜色 (R,G,B)系数
	 * @param {Number} [options.nightIntensity=0.2] - 夜晚强度（值越小，夜空越暗）
	 * @param {Boolean} [options.autoUpdateMoon=true] - 是否根据太阳位置自动更新月亮位置
	 * @param {Vector3} [options.moonOffset=new Vector3(0, 0, 0)] - 月亮位置偏移量（弧度）
	 * @param {Number} [options.resolutionScale=1.0] - 分辨率缩放比例（0-1）
	 * @param {Vector3} [options.colorOverlay=new Vector3(1.0, 1.0, 1.0)] - 颜色叠加（RGB系数，用于调整天空整体色调）
	 * @param {Number} [options.colorOverlayStrength=0.0] - 颜色叠加强度（0-1，0表示无叠加）
	 * @param {Boolean} [options.colorOverlayAffectsClouds=false] - 颜色叠加是否影响云层
	 * @param {Vector3} [options.sunColor=new Vector3(1.0, 1.0, 1.0)] - 太阳基础颜色（RGB系数）
	 */
	constructor({
		blendFunction = BlendFunction.SCREEN,
		sunPosition = new Vector3(0.1, 0.05, -1).normalize(),
		animateClouds = true,
		intensity = 12.0,
		sunBrightness = 3.0,
		rayleighCoefficient = 1.0,
		mieCoefficient = 0.8,
		mieDirectionalG = 0.8,
		cloudiness = 1.0,
		fov = 60.0,
		skyBlueness = 0.5,
		cloudAmount = 1.0,
		cloudScale = 1.0,
		cloudThreshold = 0.0,
		volumetricCloudSteps = 12,
		volumetricLightSteps = 4,
		cloudShadowingSteps = 4,
		volumetricLightShadowSteps = 1,
		enableStars = false,
		starIntensity = 1.0,
		starDensity = 0.5,
		starSize = 1.0,
		enableMoon = false,
		moonPosition = new Vector3(-0.1, 0.05, -1).normalize(),
		moonSize = 0.02,
		moonIntensity = 1.0,
		enableAurora = false,
		auroraIntensity = 1.5,
		auroraDensity = 1.0,
		auroraColor = new Vector3(2.15, -1.0, 1.0),
		nightIntensity = 0.2,
		autoUpdateMoon = true,
		moonOffset = new Vector3(0, 0, 0),
		resolutionScale = 1.0,
		colorOverlay = new Vector3(1.0, 1.0, 1.0),
		colorOverlayStrength = 0.0,
		colorOverlayAffectsClouds = false,
		sunColor = new Vector3(1.0, 1.0, 1.0)
	} = {}) {

		super("SkyAtmosphereEffect", fragmentShader, {
			blendFunction,
			attributes: EffectAttribute.DEPTH,
			defines: new Map([
				["USE_DEPTH", "1"]
			]),
			uniforms: new Map([
				["sunPosition", new Uniform(sunPosition)],
				["intensity", new Uniform(intensity)],
				["sunBrightness", new Uniform(sunBrightness)],
				["animateClouds", new Uniform(animateClouds ? 1 : 0)],
				["time", new Uniform(0.0)],
				["resolution", new Uniform(new Vector2(1, 1))],
				["noiseTexture", new Uniform(null)],
				["rayleighCoefficient", new Uniform(rayleighCoefficient)],
				["mieCoefficient", new Uniform(mieCoefficient)],
				["mieDirectionalG", new Uniform(mieDirectionalG)],
				["cloudiness", new Uniform(cloudiness)],
				["viewMatrix", new Uniform(new Matrix4())],
				["fov", new Uniform(fov)],
				["skyBlueness", new Uniform(skyBlueness)],
				["cloudAmount", new Uniform(cloudAmount)],
				["cloudScale", new Uniform(cloudScale)],
				["cloudThreshold", new Uniform(cloudThreshold)],
				["volumetricCloudStepsUniform", new Uniform(volumetricCloudSteps)],
				["volumetricLightStepsUniform", new Uniform(volumetricLightSteps)],
				["cloudShadowingStepsUniform", new Uniform(cloudShadowingSteps)],
				["volumetricLightShadowStepsUniform", new Uniform(volumetricLightShadowSteps)],
				["enableStars", new Uniform(enableStars ? 1 : 0)],
				["starIntensity", new Uniform(starIntensity)],
				["starDensity", new Uniform(starDensity)],
				["starSize", new Uniform(starSize)],
				["enableMoon", new Uniform(enableMoon ? 1 : 0)],
				["moonPosition", new Uniform(moonPosition)],
				["moonSize", new Uniform(moonSize)],
				["moonIntensity", new Uniform(moonIntensity)],
				["enableAurora", new Uniform(enableAurora ? 1 : 0)],
				["auroraIntensity", new Uniform(auroraIntensity)],
				["auroraDensity", new Uniform(auroraDensity)],
				["auroraColor", new Uniform(auroraColor)],
				["nightIntensity", new Uniform(nightIntensity)],
				["colorOverlay", new Uniform(colorOverlay)],
				["colorOverlayStrength", new Uniform(colorOverlayStrength)],
				["colorOverlayAffectsClouds", new Uniform(colorOverlayAffectsClouds ? 1 : 0)],
				["sunColor", new Uniform(sunColor)]
			])
		});

		/**
		 * 太阳位置方向
		 * @type {Vector3}
		 */
		this.sunPosition = sunPosition;

		/**
		 * 云层动画开关
		 * @type {Boolean}
		 */
		this.animateClouds = animateClouds;

		/**
		 * 散射强度
		 * @type {Number}
		 */
		this.intensity = intensity;

		/**
		 * 太阳亮度
		 * @type {Number}
		 */
		this._sunBrightness = sunBrightness;

		/**
		 * 瑞利散射系数
		 * @type {Number}
		 */
		this.rayleighCoefficient = rayleighCoefficient;

		/**
		 * 米氏散射系数
		 * @type {Number}
		 */
		this.mieCoefficient = mieCoefficient;

		/**
		 * 米氏散射方向性参数
		 * @type {Number}
		 */
		this.mieDirectionalG = mieDirectionalG;

		/**
		 * 云层密度
		 * @type {Number}
		 */
		this.cloudiness = cloudiness;

		/**
		 * 视场角（度）
		 * @type {Number}
		 */
		this._fov = fov;

		/**
		 * 天空蓝度增强
		 * @type {Number}
		 */
		this._skyBlueness = skyBlueness;

		/**
		 * 云层数量
		 * @type {Number}
		 */
		this._cloudAmount = cloudAmount;

		/**
		 * 云层尺度
		 * @type {Number}
		 */
		this._cloudScale = cloudScale;

		/**
		 * 云层阈值
		 * @type {Number}
		 */
		this._cloudThreshold = cloudThreshold;

		/**
		 * 体积云采样步数
		 * @type {Number}
		 * @private
		 */
		this._volumetricCloudSteps = volumetricCloudSteps;

		/**
		 * 体积光采样步数
		 * @type {Number}
		 * @private
		 */
		this._volumetricLightSteps = volumetricLightSteps;

		/**
		 * 云阴影采样步数
		 * @type {Number}
		 * @private
		 */
		this._cloudShadowingSteps = cloudShadowingSteps;

		/**
		 * 体积光阴影采样步数
		 * @type {Number}
		 * @private
		 */
		this._volumetricLightShadowSteps = volumetricLightShadowSteps;

		/**
		 * 相机对象，用于获取视图矩阵
		 * @type {Camera}
		 * @private
		 */
		this._camera = null;

		// 新增夜空、星空和极光相关属性
		/**
		 * 是否启用星空
		 * @type {Boolean}
		 */
		this._enableStars = enableStars;

		/**
		 * 星星亮度
		 * @type {Number}
		 */
		this._starIntensity = starIntensity;

		/**
		 * 星星密度
		 * @type {Number}
		 */
		this._starDensity = starDensity;

		/**
		 * 星星大小
		 * @type {Number}
		 */
		this._starSize = starSize;

		/**
		 * 是否启用月亮
		 * @type {Boolean}
		 */
		this._enableMoon = enableMoon;

		/**
		 * 月亮位置
		 * @type {Vector3}
		 */
		this.moonPosition = moonPosition;

		/**
		 * 月亮大小
		 * @type {Number}
		 */
		this._moonSize = moonSize;

		/**
		 * 月亮亮度
		 * @type {Number}
		 */
		this._moonIntensity = moonIntensity;

		/**
		 * 是否启用极光
		 * @type {Boolean}
		 */
		this._enableAurora = enableAurora;

		/**
		 * 极光强度
		 * @type {Number}
		 */
		this._auroraIntensity = auroraIntensity;

		/**
		 * 极光颜色 (R,G,B系数)
		 * @type {Vector3}
		 */
		this.auroraColor = auroraColor;

		/**
		 * 夜晚强度（值越小，夜空越暗）
		 * @type {Number}
		 */
		this._nightIntensity = nightIntensity;

		/**
		 * 极光密度
		 * @type {Number}
		 */
		this._auroraDensity = auroraDensity;

		// 添加自动更新月亮位置选项
		/**
		 * 是否自动根据太阳位置更新月亮位置
		 * @type {Boolean}
		 * @private
		 */
		this._autoUpdateMoon = autoUpdateMoon;

		/**
		 * 月亮位置偏移量（弧度）
		 * 可用于微调月亮相对于太阳的位置
		 * @type {Vector3}
		 */
		this.moonOffset = moonOffset.clone();

		/**
		 * 分辨率缩放比例（0-1）
		 * 用于控制效果渲染质量，较低的值提高性能但降低画质
		 * @type {Number}
		 * @private
		 */
		this._resolutionScale = Math.max(0.1, Math.min(1.0, resolutionScale));

		/**
		 * 颜色叠加（RGB系数）
		 * 用于调整天空整体色调，比如让白天更蓝，傍晚更红
		 * @type {Vector3}
		 */
		this.colorOverlay = colorOverlay.clone();

		/**
		 * 颜色叠加强度
		 * 控制颜色叠加的强度（0-1，0表示无叠加）
		 * @type {Number}
		 * @private
		 */
		this._colorOverlayStrength = Math.max(0.0, Math.min(1.0, colorOverlayStrength));

		/**
		 * 颜色叠加是否影响云层
		 * 当启用时，颜色叠加会影响整个天空系统包括云层
		 * @type {Boolean}
		 * @private
		 */
		this._colorOverlayAffectsClouds = colorOverlayAffectsClouds;

		/**
		 * 太阳基础颜色
		 * 用于调整太阳光的基础色调
		 * @type {Vector3}
		 */
		this.sunColor = sunColor.clone();

		// 初始化月亮位置
		if (this._autoUpdateMoon) {

			this.calculateMoonPosition();

		}

		// 创建默认噪声纹理
		this.createDefaultNoiseTexture();

	}

	/**
	 * 获取视场角
	 * @return {Number} 视场角（度）
	 */
	get fov() {

		return this._fov;

	}

	/**
	 * 设置视场角
	 * @param {Number} value - 视场角（度）
	 */
	set fov(value) {

		this._fov = value;
		this.uniforms.get("fov").value = value;

	}

	/**
	 * 获取天空蓝度增强值
	 * @return {Number} 蓝度增强值
	 */
	get skyBlueness() {

		return this._skyBlueness;

	}

	/**
	 * 设置天空蓝度增强值
	 * @param {Number} value - 蓝度增强值
	 */
	set skyBlueness(value) {

		this._skyBlueness = value;
		this.uniforms.get("skyBlueness").value = value;

	}

	/**
	 * 获取云层数量
	 * @return {Number} 云层数量
	 */
	get cloudAmount() {

		return this._cloudAmount;

	}

	/**
	 * 设置云层数量
	 * @param {Number} value - 云层数量
	 */
	set cloudAmount(value) {

		this._cloudAmount = value;
		this.uniforms.get("cloudAmount").value = value;

	}

	/**
	 * 获取云层尺度
	 * @return {Number} 云层尺度
	 */
	get cloudScale() {

		return this._cloudScale;

	}

	/**
	 * 设置云层尺度
	 * @param {Number} value - 云层尺度
	 */
	set cloudScale(value) {

		this._cloudScale = value;
		this.uniforms.get("cloudScale").value = value;

	}

	/**
	 * 获取云层阈值
	 * @return {Number} 云层阈值
	 */
	get cloudThreshold() {

		return this._cloudThreshold;

	}

	/**
	 * 设置云层阈值
	 * @param {Number} value - 云层阈值
	 */
	set cloudThreshold(value) {

		this._cloudThreshold = value;
		this.uniforms.get("cloudThreshold").value = value;

	}

	/**
	 * 获取体积云采样步数
	 * @return {Number} 体积云采样步数
	 */
	get volumetricCloudSteps() {

		return this._volumetricCloudSteps;

	}

	/**
	 * 设置体积云采样步数
	 * @param {Number} value - 体积云采样步数
	 */
	set volumetricCloudSteps(value) {

		this._volumetricCloudSteps = Math.max(1, Math.floor(value));
		this.uniforms.get("volumetricCloudStepsUniform").value = this._volumetricCloudSteps;

	}

	/**
	 * 获取体积光采样步数
	 * @return {Number} 体积光采样步数
	 */
	get volumetricLightSteps() {

		return this._volumetricLightSteps;

	}

	/**
	 * 设置体积光采样步数
	 * @param {Number} value - 体积光采样步数
	 */
	set volumetricLightSteps(value) {

		this._volumetricLightSteps = Math.max(1, Math.floor(value));
		this.uniforms.get("volumetricLightStepsUniform").value = this._volumetricLightSteps;

	}

	/**
	 * 获取云阴影采样步数
	 * @return {Number} 云阴影采样步数
	 */
	get cloudShadowingSteps() {

		return this._cloudShadowingSteps;

	}

	/**
	 * 设置云阴影采样步数
	 * @param {Number} value - 云阴影采样步数
	 */
	set cloudShadowingSteps(value) {

		this._cloudShadowingSteps = Math.max(1, Math.floor(value));
		this.uniforms.get("cloudShadowingStepsUniform").value = this._cloudShadowingSteps;

	}

	/**
	 * 获取体积光阴影采样步数
	 * @return {Number} 体积光阴影采样步数
	 */
	get volumetricLightShadowSteps() {

		return this._volumetricLightShadowSteps;

	}

	/**
	 * 设置体积光阴影采样步数
	 * @param {Number} value - 体积光阴影采样步数
	 */
	set volumetricLightShadowSteps(value) {

		this._volumetricLightShadowSteps = Math.max(1, Math.floor(value));
		this.uniforms.get("volumetricLightShadowStepsUniform").value = this._volumetricLightShadowSteps;

	}

	/**
	 * 获取星空启用状态
	 * @return {Boolean} 是否启用星空
	 */
	get enableStars() {

		return this._enableStars;

	}

	/**
	 * 设置星空启用状态
	 * @param {Boolean} value - 是否启用星空
	 */
	set enableStars(value) {

		this._enableStars = value;
		this.uniforms.get("enableStars").value = value ? 1 : 0;

	}

	/**
	 * 获取星星亮度
	 * @return {Number} 星星亮度
	 */
	get starIntensity() {

		return this._starIntensity;

	}

	/**
	 * 设置星星亮度
	 * @param {Number} value - 星星亮度
	 */
	set starIntensity(value) {

		this._starIntensity = value;
		this.uniforms.get("starIntensity").value = value;

	}

	/**
	 * 获取星星密度
	 * @return {Number} 星星密度
	 */
	get starDensity() {

		return this._starDensity;

	}

	/**
	 * 设置星星密度
	 * @param {Number} value - 星星密度
	 */
	set starDensity(value) {

		this._starDensity = value;
		this.uniforms.get("starDensity").value = value;

	}

	/**
	 * 获取星星大小
	 * @return {Number} 星星大小
	 */
	get starSize() {

		return this._starSize;

	}

	/**
	 * 设置星星大小
	 * @param {Number} value - 星星大小
	 */
	set starSize(value) {

		this._starSize = value;
		this.uniforms.get("starSize").value = value;

	}

	/**
	 * 获取月亮启用状态
	 * @return {Boolean} 是否启用月亮
	 */
	get enableMoon() {

		return this._enableMoon;

	}

	/**
	 * 设置月亮启用状态
	 * @param {Boolean} value - 是否启用月亮
	 */
	set enableMoon(value) {

		this._enableMoon = value;
		this.uniforms.get("enableMoon").value = value ? 1 : 0;

	}

	/**
	 * 获取月亮大小
	 * @return {Number} 月亮大小
	 */
	get moonSize() {

		return this._moonSize;

	}

	/**
	 * 设置月亮大小
	 * @param {Number} value - 月亮大小
	 */
	set moonSize(value) {

		this._moonSize = value;
		this.uniforms.get("moonSize").value = value;

	}

	/**
	 * 获取月亮亮度
	 * @return {Number} 月亮亮度
	 */
	get moonIntensity() {

		return this._moonIntensity;

	}

	/**
	 * 设置月亮亮度
	 * @param {Number} value - 月亮亮度
	 */
	set moonIntensity(value) {

		this._moonIntensity = value;
		this.uniforms.get("moonIntensity").value = value;

	}

	/**
	 * 获取极光启用状态
	 * @return {Boolean} 是否启用极光
	 */
	get enableAurora() {

		return this._enableAurora;

	}

	/**
	 * 设置极光启用状态
	 * @param {Boolean} value - 是否启用极光
	 */
	set enableAurora(value) {

		this._enableAurora = value;
		this.uniforms.get("enableAurora").value = value ? 1 : 0;

	}

	/**
	 * 获取极光强度
	 * @return {Number} 极光强度
	 */
	get auroraIntensity() {

		return this._auroraIntensity;

	}

	/**
	 * 设置极光强度
	 * @param {Number} value - 极光强度
	 */
	set auroraIntensity(value) {

		this._auroraIntensity = value;
		this.uniforms.get("auroraIntensity").value = value;

	}

	/**
	 * 获取夜晚强度
	 * @return {Number} 夜晚强度
	 */
	get nightIntensity() {

		return this._nightIntensity;

	}

	/**
	 * 设置夜晚强度
	 * @param {Number} value - 夜晚强度
	 */
	set nightIntensity(value) {

		this._nightIntensity = value;
		this.uniforms.get("nightIntensity").value = value;

	}

	/**
	 * 获取极光密度
	 * @return {Number} 极光密度
	 */
	get auroraDensity() {

		return this._auroraDensity;

	}

	/**
	 * 设置极光密度
	 * @param {Number} value - 极光密度
	 */
	set auroraDensity(value) {

		this._auroraDensity = value;
		this.uniforms.get("auroraDensity").value = value;

	}

	/**
	 * 获取太阳亮度
	 * @return {Number} 太阳亮度
	 */
	get sunBrightness() {

		return this._sunBrightness;

	}

	/**
	 * 设置太阳亮度
	 * @param {Number} value - 太阳亮度
	 */
	set sunBrightness(value) {

		this._sunBrightness = value;
		this.uniforms.get("sunBrightness").value = value;

	}

	/**
	 * 创建默认噪声纹理
	 * 用于在没有设置纹理时提供基本云噪声
	 * @private
	 */
	createDefaultNoiseTexture() {

		const size = 64;
		const data = new Uint8Array(size * size * 4);

		for (let i = 0; i < size * size; i++) {

			data[i * 4] = Math.random() * 255;
			data[i * 4 + 1] = Math.random() * 255;
			data[i * 4 + 2] = Math.random() * 255;
			data[i * 4 + 3] = 255;

		}

		const texture = new DataTexture(data, size, size);
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.minFilter = LinearFilter;
		texture.magFilter = LinearFilter;
		texture.needsUpdate = true;

		this.uniforms.get("noiseTexture").value = texture;

	}

	/**
	 * 设置相机
	 *
	 * @param {Camera} camera - 相机对象
	 */
	setCamera(camera) {

		this._camera = camera;
		if (camera) {

			// 当设置相机时，自动同步FOV
			this.fov = camera.fov;

		}

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

		// 更新分辨率 - 应用分辨率缩放
		const size = renderer.getSize(new Vector2());
		this.uniforms.get("resolution").value.set(
			size.width * this._resolutionScale,
			size.height * this._resolutionScale
		);

		// 更新云层动画开关
		this.uniforms.get("animateClouds").value = this.animateClouds ? 1 : 0;

		// 更新强度和散射参数
		this.uniforms.get("intensity").value = this.intensity;
		this.uniforms.get("sunBrightness").value = this._sunBrightness;
		this.uniforms.get("rayleighCoefficient").value = this.rayleighCoefficient;
		this.uniforms.get("mieCoefficient").value = this.mieCoefficient;
		this.uniforms.get("mieDirectionalG").value = this.mieDirectionalG;
		this.uniforms.get("cloudiness").value = this.cloudiness;

		// 更新新增参数
		this.uniforms.get("skyBlueness").value = this._skyBlueness;
		this.uniforms.get("cloudAmount").value = this._cloudAmount;
		this.uniforms.get("cloudScale").value = this._cloudScale;
		this.uniforms.get("cloudThreshold").value = this._cloudThreshold;

		// 更新采样步数参数
		this.uniforms.get("volumetricCloudStepsUniform").value = this._volumetricCloudSteps;
		this.uniforms.get("volumetricLightStepsUniform").value = this._volumetricLightSteps;
		this.uniforms.get("cloudShadowingStepsUniform").value = this._cloudShadowingSteps;
		this.uniforms.get("volumetricLightShadowStepsUniform").value = this._volumetricLightShadowSteps;

		// 更新夜空、星空和极光相关参数
		this.uniforms.get("enableStars").value = this._enableStars ? 1 : 0;
		this.uniforms.get("starIntensity").value = this._starIntensity;
		this.uniforms.get("starDensity").value = this._starDensity;
		this.uniforms.get("starSize").value = this._starSize;
		this.uniforms.get("enableMoon").value = this._enableMoon ? 1 : 0;
		this.uniforms.get("moonPosition").value.copy(this.moonPosition);
		this.uniforms.get("moonSize").value = this._moonSize;
		this.uniforms.get("moonIntensity").value = this._moonIntensity;
		this.uniforms.get("enableAurora").value = this._enableAurora ? 1 : 0;
		this.uniforms.get("auroraIntensity").value = this._auroraIntensity;
		this.uniforms.get("auroraDensity").value = this._auroraDensity;
		this.uniforms.get("auroraColor").value.copy(this.auroraColor);
		this.uniforms.get("nightIntensity").value = this._nightIntensity;

		// 更新颜色叠加参数
		this.uniforms.get("colorOverlay").value.copy(this.colorOverlay);
		this.uniforms.get("colorOverlayStrength").value = this._colorOverlayStrength;
		this.uniforms.get("colorOverlayAffectsClouds").value = this._colorOverlayAffectsClouds ? 1 : 0;

		// 更新太阳颜色参数
		this.uniforms.get("sunColor").value.copy(this.sunColor);

		// 更新相机视图矩阵
		if (this._camera) {

			const viewMatrix = this.uniforms.get("viewMatrix").value;
			viewMatrix.copy(this._camera.matrixWorld);

			// 如果相机FOV已更改，同步到着色器
			if (this._camera.fov !== this._fov) {

				this.fov = this._camera.fov;

			}

		}

		// 如果启用自动更新月亮位置，确保月亮位置被正确更新
		if (this._autoUpdateMoon) {

			this.uniforms.get("moonPosition").value.copy(this.moonPosition);

		}

	}

	/**
	 * 设置噪声纹理
	 *
	 * @param {Texture} texture - 噪声纹理
	 */
	setNoiseTexture(texture) {

		if (texture !== null) {

			texture.minFilter = LinearFilter;
			texture.magFilter = LinearFilter;
			texture.wrapS = texture.wrapT = RepeatWrapping;

		}
		this.uniforms.get("noiseTexture").value = texture;

	}

	/**
	 * 设置物理尺寸参数
	 *
	 * @param {Object} parameters - 物理参数
	 * @param {Number} [parameters.earthRadius=6360e3] - 地球半径（米）
	 * @param {Number} [parameters.atmosphereRadius=6380e3] - 大气层半径（米）
	 * @param {Number} [parameters.rayleighHeight=8e3] - 瑞利散射高度（米）
	 * @param {Number} [parameters.mieHeight=1.2e3] - 米氏散射高度（米）
	 */
	setPhysicalParameters({
		earthRadius = 6360e3,
		atmosphereRadius = 6380e3,
		rayleighHeight = 8e3,
		mieHeight = 1.2e3
	} = {}) {
		// 在实际实现中，这些参数可以通过uniforms传递给着色器
		// 目前示例中这些值是硬编码的
	}

	/**
	 * 获取是否自动更新月亮位置
	 * @return {Boolean} 是否自动更新
	 */
	get autoUpdateMoon() {

		return this._autoUpdateMoon;

	}

	/**
	 * 设置是否自动更新月亮位置
	 * @param {Boolean} value - 是否自动更新
	 */
	set autoUpdateMoon(value) {

		this._autoUpdateMoon = value;
		if (value) {

			// 如果启用自动更新，立即更新月亮位置
			this.calculateMoonPosition();

		}

	}

	/**
	 * 根据太阳位置计算月亮位置
	 * 月亮位置从太阳下山的地方升起，基于地平线
	 */
	calculateMoonPosition() {

		if (!this._autoUpdateMoon) { return; }

		// 使用工具类计算月亮位置
		this.moonPosition.copy(SkyAtmosphereUtils.calculateMoonPositionFromSun(this.sunPosition, this.moonOffset));
		this.uniforms.get("moonPosition").value = this.moonPosition;

	}

	/**
	 * 从日期时间更新太阳位置
	 * 基于给定的日期时间自动设置太阳位置，同时更新月亮位置（如果启用）
	 *
	 * @param {Date} date - 日期时间对象，默认为当前时间
	 * @param {Number} latitude - 纬度（度），默认为35°（东京附近）
	 * @param {Number} longitude - 经度（度），默认为139°（东京附近）
	 */
	updateSunPositionFromDate(date = new Date(), latitude = 35, longitude = 139) {

		date = date || new Date();

		// 使用工具类计算太阳位置
		const sunPosition = SkyAtmosphereUtils.calculateSunPositionFromDate(date, latitude, longitude);

		// 更新太阳位置
		this.sunPosition.copy(sunPosition);
		this.uniforms.get("sunPosition").value = this.sunPosition;

		// 根据太阳高度自动设置场景参数
		this.autoAdjustParameters(sunPosition.y);

		// 更新月亮位置（如果启用）
		if (this._autoUpdateMoon) {

			this.calculateMoonPosition();

		}

	}

	/**
	 * 根据太阳高度自动调整场景参数
	 *
	 * @param {Number} sunHeight - 太阳高度（-1到1之间）
	 * @private
	 */
	autoAdjustParameters(sunHeight) {

		// 使用工具类自动调整参数
		SkyAtmosphereUtils.autoAdjustParameters(this, sunHeight);

	}

	/**
	 * 获取分辨率缩放比例
	 * @return {Number} 分辨率缩放比例（0-1）
	 */
	get resolutionScale() {

		return this._resolutionScale;

	}

	/**
	 * 设置分辨率缩放比例
	 * @param {Number} value - 分辨率缩放比例（0-1）
	 */
	set resolutionScale(value) {

		this._resolutionScale = Math.max(0.1, Math.min(1.0, value));

	}

	/**
	 * 获取颜色叠加强度
	 * @return {Number} 颜色叠加强度（0-1）
	 */
	get colorOverlayStrength() {

		return this._colorOverlayStrength;

	}

	/**
	 * 设置颜色叠加强度
	 * @param {Number} value - 颜色叠加强度（0-1，0表示无叠加）
	 */
	set colorOverlayStrength(value) {

		this._colorOverlayStrength = Math.max(0.0, Math.min(1.0, value));
		this.uniforms.get("colorOverlayStrength").value = this._colorOverlayStrength;

	}

	/**
	 * 获取颜色叠加是否影响云层
	 * @return {Boolean} 是否影响云层
	 */
	get colorOverlayAffectsClouds() {

		return this._colorOverlayAffectsClouds;

	}

	/**
	 * 设置颜色叠加是否影响云层
	 * @param {Boolean} value - 是否影响云层
	 */
	set colorOverlayAffectsClouds(value) {

		this._colorOverlayAffectsClouds = value;
		this.uniforms.get("colorOverlayAffectsClouds").value = value ? 1 : 0;

	}

}
