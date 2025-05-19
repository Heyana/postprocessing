import { Effect, EffectAttribute } from "postprocessing";
import { Color, Matrix4, Uniform, Vector2, Vector3 } from "three";
import fragmentShader from "./shaders/LakesMountainsEffect.glsl";

/**
 * 雾气效果
 * 
 * 仅保留雾气效果部分
 */
export class LakesMountainsEffect extends Effect {

    /**
     * 构建一个新的雾气效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {Number} [options.fogDensity=1.0] - 雾气密度
     * @param {Color|String|Number} [options.fogColor=0xaaaaaa] - 雾气颜色
     * @param {Number} [options.fogDecay=1.0] - 雾气衰减速度
     * @param {Number} [options.fogMinDist=0.0] - 雾气最小距离
     * @param {Number} [options.quality=0.5] - 质量设置 (0-1)
     * @param {Number} [options.occludeSky=0.0] - 雾气遮挡天空的程度 (0-1)
     * @param {Boolean} [options.useHeightFog=false] - 是否使用高度雾，根据高度和噪声生成雾效果
     * @param {Boolean} [options.combineFog=false] - 是否同时启用普通雾和高度雾（叠加显示）
     * @param {Number} [options.fogMaxHeight=50.0] - 雾气最大高度，超过此高度不会有雾
     * @param {Number} [options.fogMinHeight=-10.0] - 雾气最小高度，低于此高度不会有雾
     * @param {Number} [options.fogNoiseScale=0.01] - 雾气噪声缩放，影响噪声的密度
     * @param {Number} [options.fogNoiseStrength=15.0] - 雾气噪声强度，影响噪声对高度的扰动量
     * @param {Number} [options.heightFogStrength=2.5] - 高度雾强度，独立控制高度雾的强度
     * @param {Number} [options.heightFogDecay=0.5] - 高度雾衰减速度，独立控制高度雾的衰减
     * @param {Number} [options.heightFogMinDist=0.0] - 高度雾的最小距离，独立于标准雾的最小距离
     * @param {Number} [options.heightFogMaxDist=4000.0] - 高度雾的最大距离，超过此距离不会显示高度雾
     * @param {Number} [options.heightFogTransition=5.0] - 高度雾的过渡距离，控制上下边缘的平滑过渡
     * @param {Object} [options.camera] - 相机对象，用于获取视图矩阵和位置
     */
    constructor({
        fogDensity = 1.0,
        fogColor = 0xffffff,
        fogDecay = 1.0,
        fogMinDist = 0.0,
        quality = 0.5,
        occludeSky = 0.1,
        useHeightFog = false,
        combineFog = false,
        fogMaxHeight = 50.0,
        fogMinHeight = -10.0,
        fogNoiseScale = 0.01,
        fogNoiseStrength = 15.0,
        heightFogStrength = 2.5,
        heightFogDecay = 0.5,
        heightFogMinDist = 0.0,
        heightFogMaxDist = 4000.0,
        heightFogTransition = 5.0,
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
                ["occludeSky", new Uniform(occludeSky)],
                ["useHeightFog", new Uniform(useHeightFog)],
                ["combineFog", new Uniform(combineFog)],
                ["fogMaxHeight", new Uniform(fogMaxHeight)],
                ["fogMinHeight", new Uniform(fogMinHeight)],
                ["fogNoiseScale", new Uniform(fogNoiseScale)],
                ["fogNoiseStrength", new Uniform(fogNoiseStrength)],
                ["heightFogStrength", new Uniform(heightFogStrength)],
                ["heightFogDecay", new Uniform(heightFogDecay)],
                ["heightFogMinDist", new Uniform(heightFogMinDist)],
                ["heightFogMaxDist", new Uniform(heightFogMaxDist)],
                ["heightFogTransition", new Uniform(heightFogTransition)],
                ["cameraPosition", new Uniform(new Vector3())],
                ["viewMatrix", new Uniform(new Matrix4())],
                ["cameraFov", new Uniform(45.0)]
            ])
        });

        this.camera = camera;
        this.useHeightFog = useHeightFog;
        this.combineFog = combineFog;
        this.fogMaxHeight = fogMaxHeight;
        this.fogMinHeight = fogMinHeight;
        this.fogNoiseScale = fogNoiseScale;
        this.fogNoiseStrength = fogNoiseStrength;
        this.heightFogStrength = heightFogStrength;
        this.heightFogDecay = heightFogDecay;
        this.heightFogMinDist = heightFogMinDist;
        this.heightFogMaxDist = heightFogMaxDist;
        this.heightFogTransition = heightFogTransition;
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
     * 雾气遮挡天空的程度 (0-1)
     */
    get occludeSky() {
        return this.uniforms.get("occludeSky").value;
    }

    set occludeSky(value) {
        this.uniforms.get("occludeSky").value = value;
    }

    /**
     * 是否使用高度雾
     */
    get useHeightFog() {
        return this.uniforms.get("useHeightFog").value;
    }

    set useHeightFog(value) {
        this.uniforms.get("useHeightFog").value = value;
    }

    /**
     * 是否同时启用普通雾和高度雾（叠加显示）
     */
    get combineFog() {
        return this.uniforms.get("combineFog").value;
    }

    set combineFog(value) {
        this.uniforms.get("combineFog").value = value;
    }

    /**
     * 雾气最大高度
     */
    get fogMaxHeight() {
        return this.uniforms.get("fogMaxHeight").value;
    }

    set fogMaxHeight(value) {
        this.uniforms.get("fogMaxHeight").value = value;
    }

    /**
     * 雾气最小高度
     */
    get fogMinHeight() {
        return this.uniforms.get("fogMinHeight").value;
    }

    set fogMinHeight(value) {
        this.uniforms.get("fogMinHeight").value = value;
    }

    /**
     * 雾气噪声缩放
     */
    get fogNoiseScale() {
        return this.uniforms.get("fogNoiseScale").value;
    }

    set fogNoiseScale(value) {
        this.uniforms.get("fogNoiseScale").value = value;
    }

    /**
     * 雾气噪声强度
     */
    get fogNoiseStrength() {
        return this.uniforms.get("fogNoiseStrength").value;
    }

    set fogNoiseStrength(value) {
        this.uniforms.get("fogNoiseStrength").value = value;
    }

    /**
     * 高度雾强度
     */
    get heightFogStrength() {
        return this.uniforms.get("heightFogStrength").value;
    }

    set heightFogStrength(value) {
        this.uniforms.get("heightFogStrength").value = value;
    }

    /**
     * 高度雾衰减速度
     */
    get heightFogDecay() {
        return this.uniforms.get("heightFogDecay").value;
    }

    set heightFogDecay(value) {
        this.uniforms.get("heightFogDecay").value = value;
    }

    /**
     * 高度雾最小距离
     */
    get heightFogMinDist() {
        return this.uniforms.get("heightFogMinDist").value;
    }

    set heightFogMinDist(value) {
        this.uniforms.get("heightFogMinDist").value = value;
    }

    /**
     * 高度雾最大距离
     */
    get heightFogMaxDist() {
        return this.uniforms.get("heightFogMaxDist").value;
    }

    set heightFogMaxDist(value) {
        this.uniforms.get("heightFogMaxDist").value = value;
    }

    /**
     * 高度雾过渡距离
     */
    get heightFogTransition() {
        return this.uniforms.get("heightFogTransition").value;
    }

    set heightFogTransition(value) {
        this.uniforms.get("heightFogTransition").value = value;
    }
} 