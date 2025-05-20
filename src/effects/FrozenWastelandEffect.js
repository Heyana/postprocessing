import { Uniform, Vector2, Vector3, Matrix4 } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";
import { EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/frozen-wasteland.frag.glsl";

/**
 * 冰冻荒原天空效果
 * 移植并修改自Shadertoy的"Frozen wasteland"着色器
 * 本版本移除了山脉地形，只保留了天空和雾气效果
 * 并添加了深度测试，使效果不会覆盖前景模型
 * 原作者: Dave Hoskins
 * 原始链接: https://www.shadertoy.com/view/Xls3D2
 * 许可: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License
 */
export class FrozenWastelandEffect extends Effect {

	/**
     * 构造函数
     *
     * @param {Object} [options] - 配置选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.speed=1.0] - 动画速度
     * @param {Number} [options.fogDensity=1.0] - 雾气浓度
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		composer,
		speed = 1.0,
		fogDensity = 1.0
	} = {}) {

		super("FrozenWastelandEffect", fragmentShader, {
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
				["cameraForward", new Uniform(new Vector3(0, 0, -1))],
				["cameraUp", new Uniform(new Vector3(0, 1, 0))],
				["cameraRight", new Uniform(new Vector3(1, 0, 0))],
				["cameraFov", new Uniform(60.0)],
				["cameraNear", new Uniform(0.1)],
				["cameraFar", new Uniform(1000.0)],
				["fogDensity", new Uniform(fogDensity)]
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

		// 计算相机方向向量
		const forward = new Vector3(0, 0, -1);
		forward.applyQuaternion(this._camera.quaternion);
		this.uniforms.get("cameraForward").value.copy(forward);

		// 计算相机上方向
		const up = new Vector3(0, 1, 0);
		up.applyQuaternion(this._camera.quaternion);
		this.uniforms.get("cameraUp").value.copy(up);

		// 计算相机右方向
		const right = new Vector3(1, 0, 0);
		right.applyQuaternion(this._camera.quaternion);
		this.uniforms.get("cameraRight").value.copy(right);

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
