import { ShaderMaterial, Uniform, Color, Vector2, Vector3 } from "three";
import vertexShader from "./glsl/ocean.vert";
import fragmentShader from "./glsl/ocean.frag";

/**
 * 程序化海洋材质 - 用于创建逼真的海洋水面效果
 * 基于Shadertoy的"Very fast procedural ocean"
 */
export class OceanMaterial extends ShaderMaterial {
    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.waterDepth=1.0] - 水的深度
     * @param {Number} [options.dragMult=0.38] - 波浪拉动水面的强度
     * @param {Number} [options.cameraHeight=1.5] - 相机高度，影响计算
     * @param {Number} [options.iterationsVertex=16] - 顶点着色器中的波浪迭代次数
     * @param {Number} [options.iterationsRaymarch=8] - 光线行进时的波浪迭代次数
     * @param {Number} [options.iterationsNormal=24] - 计算法线时的波浪迭代次数
     * @param {Number|Color} [options.waterColor=0x0055ff] - 水的颜色
     * @param {Vector3} [options.sunDirection] - 太阳方向，默认从右上方照射
     */
    constructor(options = {}) {
        const waterDepth = options.waterDepth !== undefined ? options.waterDepth : 1.0;
        const dragMult = options.dragMult !== undefined ? options.dragMult : 0.38;
        const cameraHeight = options.cameraHeight !== undefined ? options.cameraHeight : 1.5;
        const iterationsVertex = options.iterationsVertex !== undefined ? options.iterationsVertex : 16;
        const iterationsRaymarch = options.iterationsRaymarch !== undefined ? options.iterationsRaymarch : 8;
        const iterationsNormal = options.iterationsNormal !== undefined ? options.iterationsNormal : 24;
        const waterColor = options.waterColor !== undefined ? options.waterColor : 0x0055ff;

        // 默认太阳方向
        const defaultSunDirection = new Vector3(0.5, 1.0, 0.5).normalize();
        const sunDirection = options.sunDirection !== undefined ? options.sunDirection : defaultSunDirection;

        super({
            name: "OceanMaterial",
            uniforms: {
                time: new Uniform(0),
                waterDepth: new Uniform(waterDepth),
                dragMult: new Uniform(dragMult),
                cameraHeight: new Uniform(cameraHeight),
                iterationsVertex: new Uniform(iterationsVertex),
                iterationsRaymarch: new Uniform(iterationsRaymarch),
                iterationsNormal: new Uniform(iterationsNormal),
                resolution: new Uniform(new Vector2(1, 1)),
                sunDirection: new Uniform(sunDirection),
                waterColor: new Uniform(new Color(waterColor)),
                skyColor: new Uniform(new Color(0x87CEEB))
            },
            vertexShader,
            fragmentShader,
            transparent: false
        });
    }

    /**
     * 设置水深
     * @param {Number} value - 水深度值
     */
    set waterDepth(value) {
        this.uniforms.waterDepth.value = value;
    }

    /**
     * 获取水深
     * @return {Number} 当前水深度值
     */
    get waterDepth() {
        return this.uniforms.waterDepth.value;
    }

    /**
     * 设置拖动系数
     * @param {Number} value - 拖动系数值
     */
    set dragMult(value) {
        this.uniforms.dragMult.value = value;
    }

    /**
     * 获取拖动系数
     * @return {Number} 当前拖动系数值
     */
    get dragMult() {
        return this.uniforms.dragMult.value;
    }

    /**
     * 设置相机高度
     * @param {Number} value - 相机高度值
     */
    set cameraHeight(value) {
        this.uniforms.cameraHeight.value = value;
    }

    /**
     * 获取相机高度
     * @return {Number} 当前相机高度值
     */
    get cameraHeight() {
        return this.uniforms.cameraHeight.value;
    }

    /**
     * 设置顶点着色器的波浪迭代次数
     * @param {Number} value - 迭代次数
     */
    set iterationsVertex(value) {
        this.uniforms.iterationsVertex.value = value;
    }

    /**
     * 获取顶点着色器的波浪迭代次数
     * @return {Number} 当前迭代次数
     */
    get iterationsVertex() {
        return this.uniforms.iterationsVertex.value;
    }

    /**
     * 设置光线行进时的波浪迭代次数
     * @param {Number} value - 迭代次数
     */
    set iterationsRaymarch(value) {
        this.uniforms.iterationsRaymarch.value = value;
    }

    /**
     * 获取光线行进时的波浪迭代次数
     * @return {Number} 当前迭代次数
     */
    get iterationsRaymarch() {
        return this.uniforms.iterationsRaymarch.value;
    }

    /**
     * 设置计算法线时的波浪迭代次数
     * @param {Number} value - 迭代次数
     */
    set iterationsNormal(value) {
        this.uniforms.iterationsNormal.value = value;
    }

    /**
     * 获取计算法线时的波浪迭代次数
     * @return {Number} 当前迭代次数
     */
    get iterationsNormal() {
        return this.uniforms.iterationsNormal.value;
    }

    /**
     * 设置太阳方向
     * @param {Vector3} value - 太阳方向向量
     */
    set sunDirection(value) {
        this.uniforms.sunDirection.value.copy(value.normalize());
    }

    /**
     * 获取太阳方向
     * @return {Vector3} 当前太阳方向向量
     */
    get sunDirection() {
        return this.uniforms.sunDirection.value;
    }

    /**
     * 设置水体颜色
     * @param {Color|Number|String} value - 水体颜色
     */
    set waterColor(value) {
        this.uniforms.waterColor.value.set(value);
    }

    /**
     * 获取水体颜色
     * @return {Color} 当前水体颜色
     */
    get waterColor() {
        return this.uniforms.waterColor.value;
    }

    /**
     * 设置分辨率
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setResolution(width, height) {
        this.uniforms.resolution.value.set(width, height);
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     */
    update(deltaTime) {
        // 更新时间
        this.uniforms.time.value += deltaTime;
    }
} 