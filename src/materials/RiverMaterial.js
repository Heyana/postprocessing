import { ShaderMaterial, Uniform, Color, Vector2, FrontSide, Vector3, Matrix4 } from "three";
import vertexShader from "./glsl/river.vert";
import fragmentShader from "./glsl/river.frag";

/**
 * 河流材质 - 用于创建具有流动效果的河流水面
 * 参考自Shadertoy "Where the River Goes"
 *
 * 此版本使用模型空间坐标计算水流效果，因此河流模型可以自由移动而不影响水流效果
 */
export class RiverMaterial extends ShaderMaterial {

	/**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.flowSpeed=0.5] - 流动速度
     * @param {Number|Color} [options.waterColor=0x0055ff] - 水的颜色
     * @param {Number} [options.transparency=0.8] - 透明度
     * @param {Number} [options.foamIntensity=0.5] - 泡沫强度
     * @param {Number} [options.waterDepth=0.5] - 水深
     * @param {Number} [options.wavesHeight=0.2] - 波浪高度
     */
	constructor(options = {}) {

		const flowSpeed = options.flowSpeed !== undefined ? options.flowSpeed : 0.5;
		const waterColor = options.waterColor !== undefined ? options.waterColor : 0x0055ff;
		const transparency = options.transparency !== undefined ? options.transparency : 0.8;
		const foamIntensity = options.foamIntensity !== undefined ? options.foamIntensity : 0.5;
		const waterDepth = options.waterDepth !== undefined ? options.waterDepth : 0.5;
		const wavesHeight = options.wavesHeight !== undefined ? options.wavesHeight : 0.2;

		super({
			name: "RiverMaterial",
			uniforms: {
				time: new Uniform(0.0),
				flowMap: new Uniform(null),
				normalMap: new Uniform(null),
				foamMap: new Uniform(null),
				flowSpeed: new Uniform(flowSpeed),
				waterColor: new Uniform(new Color(waterColor)),
				transparency: new Uniform(transparency),
				foamIntensity: new Uniform(foamIntensity),
				waterDepth: new Uniform(waterDepth),
				wavesHeight: new Uniform(wavesHeight),
				textureSize: new Uniform(new Vector2(1, 1)),
				sunDirection: new Uniform(new Vector3(1.0, 0.7, 0.25).normalize()),
				sunColor: new Uniform(new Color(1.0, 0.85, 0.5).multiplyScalar(2.0)),
				skyColor: new Uniform(new Color(0.1, 0.5, 1.0)),
				modelMatrix: new Uniform(new Matrix4()),
				modelMatrixInverse: new Uniform(new Matrix4())
			},
			vertexShader,
			fragmentShader,
			transparent: true,
			side: FrontSide
		});

	}

	/**
     * 设置流动贴图
     * @param {Texture} value - 流动方向贴图
     */
	set flowMap(value) {

		this.uniforms.flowMap.value = value;
		if(value) {

			this.uniforms.textureSize.value.set(value.image.width, value.image.height);

		}

	}

	/**
     * 设置法线贴图
     * @param {Texture} value - 水面法线贴图
     */
	set normalMap(value) {

		this.uniforms.normalMap.value = value;

	}

	/**
     * 设置泡沫贴图
     * @param {Texture} value - 泡沫贴图
     */
	set foamMap(value) {

		this.uniforms.foamMap.value = value;

	}

	/**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     * @param {Matrix4} [modelMatrix] - 可选的模型矩阵，用于更新世界空间到模型空间的变换
     */
	update(deltaTime, modelMatrix) {

		this.uniforms.time.value += deltaTime * this.uniforms.flowSpeed.value;

		// 如果提供了模型矩阵，更新模型矩阵和逆矩阵
		if(modelMatrix) {

			this.uniforms.modelMatrix.value.copy(modelMatrix);
			this.uniforms.modelMatrixInverse.value.copy(modelMatrix).invert();

		}

	}

}
