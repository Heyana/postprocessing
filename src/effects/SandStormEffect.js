import { Effect, EffectAttribute } from "postprocessing";
import { Color, Matrix4, Uniform, Vector2, Vector3 } from "three";
import fragmentShader from "./shaders/SandStormEffect.glsl";

/**
 * 沙尘暴中的宇宙飞船效果
 * 
 * 基于Shadertoy效果移植，提供体积雾、光线散射和阴影效果
 * 支持相机旋转，效果会跟随相机视角变化
 */
export class SandStormEffect extends Effect {

    /**
     * 构建一个新的沙尘暴中的宇宙飞船效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {Number} [options.volumeDensity=0.6] - 体积密度
     * @param {Number} [options.volumeAbsorbtion=1.0] - 体积吸收率
     * @param {Color|String|Number} [options.lightColor=0xffba59] - 光源颜色 (默认偏黄色)
     * @param {Number} [options.shadowQuality=1.5] - 阴影质量 (值越高质量越低但性能越好)
     * @param {Number} [options.numSteps=32] - 光线行进采样步数
     * @param {Boolean} [options.enableDithering=true] - 是否启用抖动
     * @param {Boolean} [options.enableVolumetricLighting=true] - 是否启用体积光照
     * @param {Object} [options.camera] - 相机对象，用于获取视图矩阵和位置
     */
    constructor({
        volumeDensity = 0.6,
        volumeAbsorbtion = 1.0,
        lightColor = 0xffba59,
        shadowQuality = 1.5,
        numSteps = 32,
        enableDithering = true,
        enableVolumetricLighting = true,
        camera = null
    } = {}) {

        // 转换颜色参数
        const lightColorValue = new Color(lightColor);

        super("SandStormEffect", fragmentShader, {
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["resolution", new Uniform(new Vector2())],
                ["time", new Uniform(0.0)],
                ["mouse", new Uniform(new Vector2(0.0, 0.0))],
                ["volumeDensity", new Uniform(volumeDensity)],
                ["volumeAbsorbtion", new Uniform(volumeAbsorbtion)],
                ["lightColor", new Uniform(new Vector3(lightColorValue.r, lightColorValue.g, lightColorValue.b))],
                ["shadowQuality", new Uniform(shadowQuality)],
                ["numSteps", new Uniform(numSteps)],
                ["enableDithering", new Uniform(enableDithering ? 1.0 : 0.0)],
                ["enableVolumetricLighting", new Uniform(enableVolumetricLighting ? 1.0 : 0.0)],
                ["cameraPosition", new Uniform(new Vector3())],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["cameraFov", new Uniform(45.0)],
                ["cameraNear", new Uniform(0.1)],
                ["cameraFar", new Uniform(1000.0)]
            ])
        });

        this.camera = camera;
    }

    /**
     * 更新效果
     * 
     * @param {WebGLRenderer} renderer - WebGL渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} [deltaTime] - 自上一帧以来经过的时间（秒）
     */
    update(renderer, inputBuffer, deltaTime) {
        this.uniforms.get("time").value += deltaTime;
        this.uniforms.get("resolution").value.set(
            inputBuffer.width, inputBuffer.height
        );

        // 如果有相机对象，更新相机相关的uniform
        if (this.camera) {
            this.uniforms.get("cameraPosition").value.copy(this.camera.position);
            this.uniforms.get("viewMatrix").value.copy(this.camera.matrixWorld);
            this.uniforms.get("cameraFov").value = this.camera.fov;
            this.uniforms.get("cameraNear").value = this.camera.near;
            this.uniforms.get("cameraFar").value = this.camera.far;
        }
    }

    /**
     * 相机对象
     */
    get camera() {
        return this._camera;
    }

    set camera(value) {
        this._camera = value;
        if (value) {
            // 初始化相机参数
            this.uniforms.get("cameraPosition").value.copy(value.position);
            this.uniforms.get("viewMatrix").value.copy(value.matrixWorld);
            this.uniforms.get("cameraFov").value = value.fov;
            this.uniforms.get("cameraNear").value = value.near;
            this.uniforms.get("cameraFar").value = value.far;
        }
    }

    /**
     * 体积密度
     */
    get volumeDensity() {
        return this.uniforms.get("volumeDensity").value;
    }

    set volumeDensity(value) {
        this.uniforms.get("volumeDensity").value = value;
    }

    /**
     * 体积吸收率
     */
    get volumeAbsorbtion() {
        return this.uniforms.get("volumeAbsorbtion").value;
    }

    set volumeAbsorbtion(value) {
        this.uniforms.get("volumeAbsorbtion").value = value;
    }

    /**
     * 光源颜色
     */
    get lightColor() {
        const lightColorVector = this.uniforms.get("lightColor").value;
        return new Color(lightColorVector.x, lightColorVector.y, lightColorVector.z);
    }

    set lightColor(value) {
        const color = new Color(value);
        this.uniforms.get("lightColor").value.set(color.r, color.g, color.b);
    }

    /**
     * 阴影质量
     */
    get shadowQuality() {
        return this.uniforms.get("shadowQuality").value;
    }

    set shadowQuality(value) {
        this.uniforms.get("shadowQuality").value = value;
    }

    /**
     * 采样步数
     */
    get numSteps() {
        return this.uniforms.get("numSteps").value;
    }

    set numSteps(value) {
        this.uniforms.get("numSteps").value = value;
    }

    /**
     * 是否启用抖动
     */
    get enableDithering() {
        return this.uniforms.get("enableDithering").value > 0.5;
    }

    set enableDithering(value) {
        this.uniforms.get("enableDithering").value = value ? 1.0 : 0.0;
    }

    /**
     * 是否启用体积光照
     */
    get enableVolumetricLighting() {
        return this.uniforms.get("enableVolumetricLighting").value > 0.5;
    }

    set enableVolumetricLighting(value) {
        this.uniforms.get("enableVolumetricLighting").value = value ? 1.0 : 0.0;
    }
} 