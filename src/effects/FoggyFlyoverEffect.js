import { Uniform, Vector2, Vector3, Matrix4 } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";
import { EffectAttribute } from "postprocessing";

import fragmentShader from "./shaders/foggy-flyover.glsl";

/**
 * 雾霾飞越效果
 * 基于Shadertoy的Foggy Flyover效果
 * 原作者：Kristian Sivonen (ruojake)
 * 原始许可：CC BY-SA 4.0
 */
export class FoggyFlyoverEffect extends Effect {

	/**
     * 构造一个新的雾霾飞越效果
     *
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.fogDensity=1.0] - 雾气密度
     * @param {Boolean} [options.enableLowCameraOptimization=true] - 是否启用低位置相机优化
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		fogDensity = 1.0,
		enableLowCameraOptimization = true
	} = {}) {

		super("FoggyFlyoverEffect", fragmentShader, {
			blendFunction,
			attributes: EffectAttribute.DEPTH,
			uniforms: new Map([
				["time", new Uniform(0.0)],
				["resolution", new Uniform(new Vector2(1, 1))],
				["mouse", new Uniform(new Vector2(0, 0))],
				["frame", new Uniform(0)],
				["cameraPosition", new Uniform(new Vector3(0, 0, 0))],
				["viewMatrix", new Uniform(new Matrix4())],
				["cameraFov", new Uniform(60.0)],
				["cameraNear", new Uniform(0.1)],
				["cameraFar", new Uniform(1000.0)],
				["fogDensity", new Uniform(fogDensity)],
				["enableLowCameraOptimization", new Uniform(enableLowCameraOptimization ? 1.0 : 0.0)]
			])
		});

		/**
         * 相机
         * @type {Camera}
         * @private
         */
		this._camera = null;

		/**
         * 低位置相机优化开关
         * @type {Boolean}
         * @private
         */
		this._enableLowCameraOptimization = enableLowCameraOptimization;

	}

	/**
     * 更新效果
     *
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} deltaTime - 自上次更新后经过的时间（秒）
     */
	update(renderer, inputBuffer, deltaTime) {

		this.uniforms.get("time").value += deltaTime;
		this.uniforms.get("frame").value++;

		// 更新分辨率
		const size = renderer.getSize(new Vector2());
		this.uniforms.get("resolution").value.set(size.width, size.height);

		// 更新相机参数
		this._updateCameraParameters();

	}

	/**
     * 更新相机参数
     * @private
     */
	_updateCameraParameters() {

		if(!this._camera) { return; }

		// 更新相机位置
		this.uniforms.get("cameraPosition").value.copy(this._camera.position);

		// 更新视图矩阵 - 使用matrixWorldInverse而不是手动求逆，提高效率
		const viewMatrix = this.uniforms.get("viewMatrix").value;
		viewMatrix.copy(this._camera.matrixWorldInverse);

		// 设置相机FOV
		this.uniforms.get("cameraFov").value = this._camera.fov;

		// 更新近平面和远平面
		this.uniforms.get("cameraNear").value = this._camera.near;
		this.uniforms.get("cameraFar").value = this._camera.far;

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
     * 更新鼠标位置 - 现在作为次要控制方式
     *
     * @param {Number} x - 鼠标X坐标
     * @param {Number} y - 鼠标Y坐标
     */
	setMousePosition(x, y) {

		this.uniforms.get("mouse").value.set(x, y);

	}

	/**
     * 雾气密度
     */
	get fogDensity() {

		return this.uniforms.get("fogDensity").value;

	}

	set fogDensity(value) {

		this.uniforms.get("fogDensity").value = value;

	}

	/**
     * 低位置相机优化
     */
	get enableLowCameraOptimization() {

		return this._enableLowCameraOptimization;

	}

	set enableLowCameraOptimization(value) {

		this._enableLowCameraOptimization = value;
		this.uniforms.get("enableLowCameraOptimization").value = value ? 1.0 : 0.0;

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
