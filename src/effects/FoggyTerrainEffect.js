import { Uniform, Vector2, Vector3, Color } from "three";
import { BlendFunction } from "../enums/BlendFunction.js";
import { Effect } from "./Effect.js";

import { EffectAttribute } from "postprocessing";
import fragmentShader from "./shaders/foggy-terrain.glsl";

/**
 * 迷雾地形效果。
 * 基于IÃ±igo Quilez的光线追踪技术实现的地形渲染。
 */
export class FoggyTerrainEffect extends Effect {

	/**
     * 构造函数。
     *
     * @param {Object} [options] - 效果选项。
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合函数。
     * @param {Number} [options.terrainHeight=4.0] - 地形高度。
     * @param {Number} [options.fogDensity=2.0] - 雾气浓度。
     * @param {Number} [options.fogMinDistance=0.0] - 雾的最近距离。
     * @param {Number} [options.fogFalloff=0.05] - 雾的衰减速度。
     * @param {Color|String|Number} [options.fogColor=0xffffff] - 雾的颜色。
     * @param {Boolean} [options.hideTerrainMesh=false] - 是否隐藏地形网格。
     * @param {PerspectiveCamera} [options.camera=null] - 相机对象。
     */
	constructor({
		blendFunction = BlendFunction.NORMAL,
		terrainHeight = 4.0,
		fogDensity = 2.0,
		fogMinDistance = 0.0,
		fogFalloff = 0.05,
		fogColor = 0xffffff,
		hideTerrainMesh = false,
		camera = null
	} = {}) {

		super("FoggyTerrainEffect", fragmentShader, {
			blendFunction,
			attributes: EffectAttribute.DEPTH,
			defines: new Map([
				["USE_DEPTH", "1"]
			]),
			uniforms: new Map([
				["time", new Uniform(0.0)],
				["resolution", new Uniform(new Vector2())],
				["terrainHeight", new Uniform(terrainHeight)],
				["fogDensity", new Uniform(fogDensity)],
				["fogMinDistance", new Uniform(fogMinDistance)],
				["fogFalloff", new Uniform(fogFalloff)],
				["fogColor", new Uniform(new Color(fogColor))],
				["hideTerrainMesh", new Uniform(hideTerrainMesh)],
				["cameraPosition", new Uniform(null)],
				["viewMatrix", new Uniform(null)],
				["cameraNear", new Uniform(0.1)],
				["cameraFar", new Uniform(2000.0)]
			])
		});

		this.camera = camera;

	}

	/**
     * 设置相机。
     *
     * @param {PerspectiveCamera} camera - 相机对象。
     */
	setCamera(camera) {

		this.camera = camera;

	}

	/**
     * 更新方法。
     *
     * @param {WebGLRenderer} renderer - 渲染器。
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区。
     * @param {Number} [deltaTime] - 自上一帧以来的时间（秒）。
     */
	update(renderer, inputBuffer, deltaTime) {

		const uniforms = this.uniforms;

		// 更新时间
		uniforms.get("time").value += deltaTime;

		// 更新分辨率
		const resolution = uniforms.get("resolution").value;
		resolution.set(
			inputBuffer.width,
			inputBuffer.height
		);

		// 更新相机参数
		if(this.camera !== null) {

			uniforms.get("cameraPosition").value = this.camera.position;
			uniforms.get("viewMatrix").value = this.camera.matrixWorldInverse;
			uniforms.get("cameraNear").value = this.camera.near;
			uniforms.get("cameraFar").value = this.camera.far;

		}

	}

	/**
     * 获取地形高度。
     *
     * @return {Number} 地形高度。
     */
	get terrainHeight() {

		return this.uniforms.get("terrainHeight").value;

	}

	/**
     * 设置地形高度。
     *
     * @param {Number} value - 地形高度。
     */
	set terrainHeight(value) {

		this.uniforms.get("terrainHeight").value = value;

	}

	/**
     * 获取雾气浓度。
     *
     * @return {Number} 雾气浓度。
     */
	get fogDensity() {

		return this.uniforms.get("fogDensity").value;

	}

	/**
     * 设置雾气浓度。
     *
     * @param {Number} value - 雾气浓度。
     */
	set fogDensity(value) {

		this.uniforms.get("fogDensity").value = value;

	}

	/**
     * 获取雾的最近距离。
     *
     * @return {Number} 雾的最近距离。
     */
	get fogMinDistance() {

		return this.uniforms.get("fogMinDistance").value;

	}

	/**
     * 设置雾的最近距离。
     *
     * @param {Number} value - 雾的最近距离。
     */
	set fogMinDistance(value) {

		this.uniforms.get("fogMinDistance").value = value;

	}

	/**
     * 获取雾的衰减速度。
     *
     * @return {Number} 雾的衰减速度。
     */
	get fogFalloff() {

		return this.uniforms.get("fogFalloff").value;

	}

	/**
     * 设置雾的衰减速度。
     *
     * @param {Number} value - 雾的衰减速度。
     */
	set fogFalloff(value) {

		this.uniforms.get("fogFalloff").value = value;

	}

	/**
     * 获取雾的颜色。
     *
     * @return {Color} 雾的颜色。
     */
	get fogColor() {

		return this.uniforms.get("fogColor").value;

	}

	/**
     * 设置雾的颜色。
     *
     * @param {Color|String|Number} value - 雾的颜色。
     */
	set fogColor(value) {

		this.uniforms.get("fogColor").value.set(value);

	}

	/**
     * 获取是否隐藏地形网格。
     *
     * @return {Boolean} 是否隐藏地形网格。
     */
	get hideTerrainMesh() {

		return this.uniforms.get("hideTerrainMesh").value;

	}

	/**
     * 设置是否隐藏地形网格。
     *
     * @param {Boolean} value - 是否隐藏地形网格。
     */
	set hideTerrainMesh(value) {

		this.uniforms.get("hideTerrainMesh").value = value;

	}

}
