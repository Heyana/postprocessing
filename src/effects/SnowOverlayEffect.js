import { Color, DataTexture, TextureLoader, RepeatWrapping, Uniform, Vector2, Vector3, Matrix4, WebGLRenderTarget } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/snow-overlay.frag";
import vertexShader from "./glsl/snow-overlay.vert";
import { blueNoiseBase64 } from "src/libs/realism-effects/src/utils/TextureAssets.js";

/**
 * 积雪覆盖效果 - 为场景添加表面积雪
 *
 * 该效果使用深度和法线信息来确定哪些表面应该被覆盖积雪，
 * 通常朝上的表面和高处会有更多积雪。
 */
export class SnowOverlayEffect extends Effect {

	/**
     * 构造一个新的积雪覆盖效果
     *
     * @param {Camera} camera - 相机对象，用于深度计算
     * @param {Texture} normalBuffer - 法线信息缓冲区
     * @param {Texture} depthBuffer - 深度信息缓冲区
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.snowAmount=0.5] - 积雪量，0-1
     * @param {Number} [options.snowHeight=20.0] - 雪线高度，越高积雪越少
     * @param {Number} [options.snowBrightness=1.5] - 雪的亮度
     * @param {Boolean} [options.additiveBlending=false] - 是否使用加性混合
     * @param {Color|String|Number} [options.snowColor=0xffffff] - 雪的颜色
     * @param {Number} [options.alphaTest=0.1] - 透明度测试阈值
     * @param {Number} [options.slopeMinAngle=0.1] - 最小积雪角度（约6度）
     * @param {Number} [options.slopeMaxAngle=0.5] - 最大积雪角度（约30度）
     * @param {Number} [options.normalThreshold=0.3] - 法线阈值，决定多垂直的表面可以积雪
     * @param {Number} [options.viewStability=0.5] - 视角稳定性，值越高在极端视角下积雪效果越稳定
     * @param {Number} [options.snowNoisiness=0.5] - 积雪不均匀度，值越高积雪分布越不均匀
     * @param {Number} [options.snowAccumulation=0.5] - 积雪堆积强度，值越高在坡度变化处积雪堆积越明显
     */
	composer;
	constructor(camera, normalBuffer, composer, {
		blendFunction = BlendFunction.NORMAL,
		snowAmount = 0.5,
		snowHeight = 20.0,
		snowBrightness = 1.5,
		additiveBlending = false,
		snowColor = 0xffffff,
		alphaTest = 0.1,
		slopeMinAngle = 0.1,
		slopeMaxAngle = 0.5,
		normalThreshold = 0.3,
		viewStability = 0.5,
		snowNoisiness = 0.5,
		snowAccumulation = 0.5
	} = {}) {

		super("SnowOverlayEffect", fragmentShader, {
			blendFunction,
			uniforms: new Map([
				["depthBuffer", new Uniform(composer.createDepthTexture())],
				["normalBuffer", new Uniform(normalBuffer)],
				["cameraNear", new Uniform(camera.near)],
				["cameraFar", new Uniform(camera.far)],
				["cameraPosition", new Uniform(new Vector3().copy(camera.position))],
				["cameraMatrixWorld", new Uniform(new Matrix4().copy(camera.matrixWorld))],
				["projectionMatrixInverse", new Uniform(new Matrix4().copy(camera.projectionMatrix).invert())],
				["texelSize", new Uniform(new Vector2())],
				["snowHeight", new Uniform(snowHeight)],
				["snowAmount", new Uniform(snowAmount)],
				["snowBrightness", new Uniform(snowBrightness)],
				["additiveBlending", new Uniform(additiveBlending)],
				["snowColor", new Uniform(new Color(snowColor))],
				["noiseTexture", new Uniform(null)],
				["alphaTest", new Uniform(alphaTest)],
				["slopeMinAngle", new Uniform(slopeMinAngle)],
				["slopeMaxAngle", new Uniform(slopeMaxAngle)],
				["normalThreshold", new Uniform(normalThreshold)],
				["viewStability", new Uniform(viewStability)],
				["snowNoisiness", new Uniform(snowNoisiness)],
				["snowAccumulation", new Uniform(snowAccumulation)]
			])
		});
		this.composer = composer;


		this.camera = camera;
		this.uniforms.get("depthBuffer").value = this.composer.createDepthTexture();
		this.depthBuffer = composer.createDepthTexture();
		console.log("Log-- ", this.depthBuffer, "      this.depthBuffer");
		this.normalBuffer = normalBuffer;

		// 创建或加载噪声纹理
		this._createNoiseTexture();

	}

	/**
     * 创建噪声纹理，用于雪花的随机变化
     *
     * @private
     */
	_createNoiseTexture() {

		const texture = new TextureLoader().load(blueNoiseBase64);
		console.log("Log-- ", texture, "texture");
		texture.wrapS = RepeatWrapping;
		texture.wrapT = RepeatWrapping;
		texture.needsUpdate = true;

		this.uniforms.get("noiseTexture").value = texture;

	}

	/**
     * 积雪量
     *
     * @type {Number}
     */
	get snowAmount() {

		return this.uniforms.get("snowAmount").value;

	}

	set snowAmount(value) {

		this.uniforms.get("snowAmount").value = value;

	}

	/**
     * 雪线高度
     *
     * @type {Number}
     */
	get snowHeight() {

		return this.uniforms.get("snowHeight").value;

	}

	set snowHeight(value) {

		this.uniforms.get("snowHeight").value = value;

	}

	/**
     * 雪的亮度
     *
     * @type {Number}
     */
	get snowBrightness() {

		return this.uniforms.get("snowBrightness").value;

	}

	set snowBrightness(value) {

		this.uniforms.get("snowBrightness").value = value;

	}

	/**
     * 是否使用加性混合
     *
     * @type {Boolean}
     */
	get additiveBlending() {

		return this.uniforms.get("additiveBlending").value;

	}

	set additiveBlending(value) {

		this.uniforms.get("additiveBlending").value = value;

	}

	/**
     * 雪的颜色
     *
     * @type {Color}
     */
	get snowColor() {

		return this.uniforms.get("snowColor").value;

	}

	set snowColor(value) {

		this.uniforms.get("snowColor").value.set(value);

	}

	/**
     * 透明度测试阈值，低于此值的片段将不会应用积雪
     *
     * @type {Number}
     */
	get alphaTest() {

		return this.uniforms.get("alphaTest").value;

	}

	set alphaTest(value) {

		this.uniforms.get("alphaTest").value = value;

	}

	/**
     * 坡度最小角度，低于此值的表面将不会积雪
     *
     * @type {Number}
     */
	get slopeMinAngle() {

		return this.uniforms.get("slopeMinAngle").value;

	}

	set slopeMinAngle(value) {

		this.uniforms.get("slopeMinAngle").value = value;

	}

	/**
     * 坡度最大角度，高于此值的表面将完全积雪
     *
     * @type {Number}
     */
	get slopeMaxAngle() {

		return this.uniforms.get("slopeMaxAngle").value;

	}

	set slopeMaxAngle(value) {

		this.uniforms.get("slopeMaxAngle").value = value;

	}

	/**
     * 法线阈值，决定多垂直的表面可以积雪
     * 值越小，越垂直的表面也会积雪
     *
     * @type {Number}
     */
	get normalThreshold() {

		return this.uniforms.get("normalThreshold").value;

	}

	set normalThreshold(value) {

		this.uniforms.get("normalThreshold").value = value;

	}

	/**
     * 视角稳定性，值越高在极端视角下积雪效果越稳定
     *
     * @type {Number}
     */
	get viewStability() {

		return this.uniforms.get("viewStability").value;

	}

	set viewStability(value) {

		this.uniforms.get("viewStability").value = value;

	}

	/**
     * 积雪不均匀度，值越高积雪分布越不均匀
     *
     * @type {Number}
     */
	get snowNoisiness() {

		return this.uniforms.get("snowNoisiness").value;

	}

	set snowNoisiness(value) {

		this.uniforms.get("snowNoisiness").value = value;

	}

	/**
     * 积雪堆积强度，值越高在坡度变化处积雪堆积越明显
     *
     * @type {Number}
     */
	get snowAccumulation() {

		return this.uniforms.get("snowAccumulation").value;

	}

	set snowAccumulation(value) {

		this.uniforms.get("snowAccumulation").value = value;

	}

	/**
     * 更新效果
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 渲染帧间隔时间
     */
	update(renderer, inputBuffer, deltaTime) {

		// 如果相机参数改变，更新着色器中的相机参数
		this.uniforms.get("depthBuffer").value = this.composer.depthTexture;
		if(this.camera) {

			this.uniforms.get("cameraNear").value = this.camera.near;
			this.uniforms.get("cameraFar").value = this.camera.far;

			// 更新相机位置和矩阵
			this.uniforms.get("cameraPosition").value.copy(this.camera.position);
			this.uniforms.get("cameraMatrixWorld").value.copy(this.camera.matrixWorld);
			this.uniforms.get("projectionMatrixInverse").value.copy(this.camera.projectionMatrix).invert();

		}

	}

	/**
     * 当渲染尺寸改变时更新纹素大小
     *
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		this.uniforms.get("texelSize").value.set(1.0 / width, 1.0 / height);

	}

}
