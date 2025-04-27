import { Effect, EffectAttribute } from "postprocessing";
import { Color, Matrix4, Uniform, Vector2, Vector3 } from "three";
import fragmentShader from "./shaders/LakesMountainsEffect.glsl";

/**
 * 天空和雾气效果
 * 
 * 修改自湖泊与山脉效果，移除了山脉和湖泊部分，仅保留天空和雾气。
 * 支持相机旋转，天空会跟随相机视角变化。
 */
export class LakesMountainsEffect extends Effect {

    /**
     * 构建一个新的天空和雾气效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {Number} [options.fogDensity=1.0] - 雾气密度
     * @param {Color|String|Number} [options.fogColor=0xaaaaaa] - 雾气颜色
     * @param {Number} [options.fogDecay=1.0] - 雾气衰减速度
     * @param {Number} [options.fogMinDist=0.0] - 雾气最小距离
     * @param {Number} [options.quality=0.5] - 质量设置 (0-1)
     * @param {Boolean} [options.enableClouds=true] - 是否启用云效果
     * @param {Boolean} [options.enableVolumeFog=false] - 是否启用体积雾
     * @param {Number} [options.volumeDetail=0.6] - 体积雾细节程度 (0-1)
     * @param {Number} [options.volumeSteps=0.5] - 体积雾采样步数 (0-1)
     * @param {Object} [options.camera] - 相机对象，用于获取视图矩阵和位置
     * @param {Texture} [options.noiseTexture] - 噪声纹理
     */
    constructor({
        fogDensity = 1.0,
        fogColor = 0xaaaaaa,
        fogDecay = 1.0,
        fogMinDist = 0.0,
        quality = 0.5,
        enableClouds = true,
        enableVolumeFog = false,
        volumeDetail = 0.6,
        volumeSteps = 0.5,
        camera = null,
        noiseTexture
    } = {}) {

        // 转换颜色参数
        const fogColorValue = new Color(fogColor);

        super("LakesMountainsEffect", fragmentShader, {
            attributes: EffectAttribute.DEPTH,
            defines: new Map([
                ["USE_DEPTH", "1"]
            ]),
            uniforms: new Map([
                ["resolution", new Uniform(new Vector2())],
                ["time", new Uniform(0.0)],
                ["noiseTexture", new Uniform(noiseTexture)],
                ["fogDensity", new Uniform(fogDensity)],
                ["fogColor", new Uniform(new Vector3(fogColorValue.r, fogColorValue.g, fogColorValue.b))],
                ["fogDecay", new Uniform(fogDecay)],
                ["fogMinDist", new Uniform(fogMinDist)],
                ["quality", new Uniform(quality)],
                ["enableClouds", new Uniform(enableClouds)],
                ["enableVolumeFog", new Uniform(enableVolumeFog)],
                ["volumeDetail", new Uniform(volumeDetail)],
                ["volumeSteps", new Uniform(volumeSteps)],
                ["cameraPosition", new Uniform(new Vector3())],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["cameraFov", new Uniform(45.0)]
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
        }
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
     * 雾气颜色
     */
    get fogColor() {
        const fogColorVector = this.uniforms.get("fogColor").value;
        return new Color(fogColorVector.x, fogColorVector.y, fogColorVector.z);
    }

    set fogColor(value) {
        const color = new Color(value);
        this.uniforms.get("fogColor").value.set(color.r, color.g, color.b);
    }

    /**
     * 雾气衰减速度
     */
    get fogDecay() {
        return this.uniforms.get("fogDecay").value;
    }

    set fogDecay(value) {
        this.uniforms.get("fogDecay").value = value;
    }

    /**
     * 雾气最小距离
     */
    get fogMinDist() {
        return this.uniforms.get("fogMinDist").value;
    }

    set fogMinDist(value) {
        this.uniforms.get("fogMinDist").value = value;
    }

    /**
     * 质量设置
     */
    get quality() {
        return this.uniforms.get("quality").value;
    }

    set quality(value) {
        this.uniforms.get("quality").value = value;
    }

    /**
     * 是否启用云
     */
    get enableClouds() {
        return this.uniforms.get("enableClouds").value;
    }

    set enableClouds(value) {
        this.uniforms.get("enableClouds").value = value;
    }

    /**
     * 是否启用体积雾
     */
    get enableVolumeFog() {
        return this.uniforms.get("enableVolumeFog").value;
    }

    set enableVolumeFog(value) {
        this.uniforms.get("enableVolumeFog").value = value;
    }

    /**
     * 体积雾细节程度
     */
    get volumeDetail() {
        return this.uniforms.get("volumeDetail").value;
    }

    set volumeDetail(value) {
        this.uniforms.get("volumeDetail").value = value;
    }

    /**
     * 体积雾采样步数
     */
    get volumeSteps() {
        return this.uniforms.get("volumeSteps").value;
    }

    set volumeSteps(value) {
        this.uniforms.get("volumeSteps").value = value;
    }

    /**
     * 噪声纹理
     */
    get noiseTexture() {
        return this.uniforms.get("noiseTexture").value;
    }

    set noiseTexture(value) {
        this.uniforms.get("noiseTexture").value = value;
    }
} 