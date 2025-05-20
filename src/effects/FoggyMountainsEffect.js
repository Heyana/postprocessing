import { Uniform, Vector2, Vector3, TextureLoader, RepeatWrapping, Matrix4 } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";
import { EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/foggy-mountains.frag.glsl";

/**
 * 雾山效果
 * 移植并修改自Shadertoy的"Foggy Mountains 2"着色器
 * 移除山脉，仅保留天空和雾气，添加相机矩阵支持
 * 原始链接: https://www.shadertoy.com/view/MdsGzS
 */
export class FoggyMountainsEffect extends Effect {

	/**
     * 构造函数
     *
     * @param {Object} [options] - 配置选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.speed=1.0] - 动画速度
     * @param {Number} [options.fogDensity=1.0] - 雾气浓度
     * @param {String} [options.noiseTexturePath="img/textures/noise/blue-noise.png"] - 噪声纹理路径
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		composer,
		speed = 1.0,
		fogDensity = 1.0,
		noiseTexturePath = "img/textures/noise/blue-noise.png"
	} = {}) {

		// 加载噪声纹理
		const textureLoader = new TextureLoader();
		const noiseTexture = textureLoader.load(noiseTexturePath);

		// 设置纹理参数
		noiseTexture.wrapS = RepeatWrapping;
		noiseTexture.wrapT = RepeatWrapping;

		super("FoggyMountainsEffect", fragmentShader, {
			blendFunction,
			attributes: EffectAttribute.DEPTH,
			defines: new Map([
				["USE_DEPTH", "1"]
			]),
			uniforms: new Map([
				["time", new Uniform(0.0)],
				["resolution", new Uniform(new Vector2(1, 1))],
				["mouse", new Uniform(new Vector2(0.5, 0.5))],
				["cameraPosition", new Uniform(new Vector3(0, 0, 0))],
				["viewMatrix", new Uniform(new Matrix4())],
				["cameraFov", new Uniform(60.0)],
				["cameraNear", new Uniform(0.1)],
				["cameraFar", new Uniform(1000.0)],
				["fogDensity", new Uniform(fogDensity)],
				["noiseTexture", new Uniform(noiseTexture)]
			])
		});


		/**
         * 动画速度 - 控制云和雾气的移动速度
         * @type {Number}
         * @private
         */
		this._speed = speed;

		/**
         * 雾气浓度 - 控制雾气的浓度
         * @type {Number}
         * @private
         */
		this._fogDensity = fogDensity;

		/**
         * 鼠标位置
         * @type {Vector2}
         * @private
         */
		this._mouse = this.uniforms.get("mouse").value;

		/**
         * 相机
         * @type {Camera}
         * @private
         */
		this._camera = null;
		this.composer = composer;

	}

	/**
     * 动画速度 - 控制云和雾气的移动速度
     * @type {Number}
     */
	get speed() {

		return this._speed;

	}

	set speed(value) {

		this._speed = value;

	}

	/**
     * 雾气浓度 - 控制雾气的浓度
     * @type {Number}
     */
	get fogDensity() {

		return this._fogDensity;

	}

	set fogDensity(value) {

		this._fogDensity = value;
		this.uniforms.get("fogDensity").value = value;

	}

	/**
     * 设置相机
     * @param {Camera} camera - Three.js相机对象
     */
	setCamera(camera) {

		this._camera = camera;

		// 更新相机近平面和远平面参数
		if(camera) {

			this.uniforms.get("cameraNear").value = camera.near;
			this.uniforms.get("cameraFar").value = camera.far;

		}

	}

	/**
     * 设置鼠标位置
     * @param {Number} x - X坐标 (0-1)
     * @param {Number} y - Y坐标 (0-1)
     */
	setMousePosition(x, y) {

		this._mouse.set(x, y);

	}

	/**
     * 更新相机参数
     * @private
     */
	_updateCameraParameters() {

		if(!this._camera) { return; }

		// 更新相机位置
		this.uniforms.get("cameraPosition").value.copy(this._camera.position);

		// 更新视图矩阵 - 使用matrixWorld的逆矩阵作为视图矩阵
		const viewMatrix = this.uniforms.get("viewMatrix").value;
		viewMatrix.copy(this._camera.matrixWorld).invert();

		// 设置相机FOV
		this.uniforms.get("cameraFov").value = this._camera.fov;

		// 更新近平面和远平面
		this.uniforms.get("cameraNear").value = this._camera.near;
		this.uniforms.get("cameraFar").value = this._camera.far;

	}


	/**
     * 更新效果
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {Number} deltaTime - 时间增量
     */
	update(renderer, inputBuffer, deltaTime) {

		this.uniforms.get("time").value += deltaTime * this._speed;
		this.uniforms.get("resolution").value.set(
			inputBuffer.width,
			inputBuffer.height
		);

		// 更新相机参数
		this._updateCameraParameters();

	}

	/**
     * 更新大小
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
	setSize(width, height) {

		this.uniforms.get("resolution").value.set(width, height);

	}

	/**
     * 设置主相机
     * @param {Camera} value - 主相机
     * @override
     */
	set mainCamera(value) {

		this.setCamera(value);

	}

}
