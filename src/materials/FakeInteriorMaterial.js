import { ShaderMaterial, Uniform, Vector2, Vector3, Clock, Color, TextureLoader } from "three";
import vertexShader from "./glsl/fake-interior.vert";
import fragmentShader from "./glsl/fake-interior.frag";

/**
 * 假室内材质 - 用于创建单面单个房间的假室内效果
 */
export class FakeInteriorMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.roomDepth=5.0] - 房间深度
     * @param {Number|Color} [options.lightColor=0xffffff] - 室内光颜色
     * @param {Number} [options.lightIntensity=1.0] - 室内光强度
     * @param {Boolean} [options.animated=true] - 是否启用动画效果
     */
    constructor(options = {}) {
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 5.0;
        const lightColor = options.lightColor !== undefined ? options.lightColor : 0xffffff;
        const lightIntensity = options.lightIntensity !== undefined ? options.lightIntensity : 1.0;
        const animated = options.animated !== undefined ? options.animated : true;

        const clock = new Clock();

        super({
            name: "FakeInteriorMaterial",
            uniforms: {
                time: new Uniform(0),
                roomDepth: new Uniform(roomDepth),
                lightColor: new Uniform(new Color(lightColor)),
                lightIntensity: new Uniform(lightIntensity),
                interiorMap: new Uniform(null),
                reflectionMap: new Uniform(null),
                resolution: new Uniform(new Vector2(1024, 1024)),
                cameraPosition: new Uniform(new Vector3()),
                animated: new Uniform(animated ? 1.0 : 0.0),
            },
            vertexShader,
            fragmentShader,
            transparent: false
        });
    }

    /**
     * 设置室内贴图
     * @param {Texture} value - 室内贴图
     */
    set interiorMap(value) {
        this.uniforms.interiorMap.value = value;
    }

    /**
     * 设置反射贴图
     * @param {Texture} value - 反射贴图
     */
    set reflectionMap(value) {
        this.uniforms.reflectionMap.value = value;
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     * @param {Vector3} cameraPosition - 相机位置
     */
    update(deltaTime, cameraPosition) {
        if (this.uniforms.animated.value > 0.5) {
            this.uniforms.time.value += deltaTime;
        }

        if (cameraPosition) {
            this.uniforms.cameraPosition.value.copy(cameraPosition);
        }
    }
} 