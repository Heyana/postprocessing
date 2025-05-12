import { Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector2, Vector3, Vector4, DataTexture, RGBAFormat, FloatType, NearestFilter, WebGLRenderTarget } from "three";
import fragmentShader from "./glsl/volumetric-shadow.frag";
import vertexShader from "./glsl/volumetric-shadow.vert";

/**
 * 体积阴影效果 - 创建逼真的体积光和阴影
 */
export class VolumetricShadowEffect extends Effect {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.blendFunction] - 混合模式
     * @param {Number} [options.downSample=2] - 降采样级别，提高性能
     * @param {Number} [options.rayMarchingStep=16] - 射线行进采样步数
     * @param {Number} [options.maxRayLength=15.0] - 最大光线长度
     * @param {Number} [options.samplerScale=1.0] - 采样比例
     * @param {Number} [options.volumetricLightIntensity=0.05] - 体积光强度
     * @param {Number} [options.lightScatteringFactor=0.5] - 光散射因子
     * @param {Number} [options.volumetricShadowIntensity=0.0] - 体积阴影强度
     * @param {Number} [options.shadowAttenuation=0.08] - 阴影衰减
     * @param {Number} [options.minShadow=0.5] - 最小阴影值
     */
    constructor({
        blendFunction,
        downSample = 2,
        rayMarchingStep = 16,
        maxRayLength = 15.0,
        samplerScale = 1.0,
        volumetricLightIntensity = 0.05,
        lightScatteringFactor = 0.5,
        volumetricShadowIntensity = 0.0,
        shadowAttenuation = 0.08,
        minShadow = 0.5
    } = {}) {
        // 调用父类构造函数，设置基本属性
        super("VolumetricShadowEffect", fragmentShader, {
            vertexShader, // 注意：这会合并到框架的顶点着色器中，而不是完全替换
            blendFunction,
            attributes: EffectAttribute.DEPTH | EffectAttribute.CONVOLUTION,
            defines: new Map([
                ["USE_FRUSTUM_CORNERS", "1"]
            ]),
            uniforms: new Map([
                ["rayMarchingStep", new Uniform(rayMarchingStep)],
                ["maxRayLength", new Uniform(maxRayLength)],
                ["samplerScale", new Uniform(samplerScale)],
                ["volumetricLightIntensity", new Uniform(volumetricLightIntensity)],
                ["lightScatteringFactor", new Uniform(lightScatteringFactor)],
                ["volumetricShadowIntensity", new Uniform(volumetricShadowIntensity)],
                ["shadowAttenuation", new Uniform(shadowAttenuation)],
                ["minShadow", new Uniform(minShadow)],
                ["ditherMap", new Uniform(null)],
                ["offsets", new Uniform(new Vector4(0, 0, 0, 0))],
                ["frustumCorners", new Uniform(null)],
                ["marchingTex", new Uniform(null)],
                ["lightPosition", new Uniform(new Vector3(5, 10, 5))]
            ])
        });

        this.downSample = downSample;
        this.samplerScale = samplerScale;  // 添加成员变量以便于访问

        // 创建抖动贴图
        this.createDitherMap();

        // 初始化视锥体角矩阵
        this.frustumCorners = null;
        this.uniforms.get("frustumCorners").value = this.frustumCorners;

        // 创建渲染目标
        this.marchingRT = null;
        this.tempRT = null;
    }

    /**
     * 创建抖动纹理图
     * 用于随机化采样点，减少走样
     */
    createDitherMap() {
        const texSize = 4;
        const data = new Float32Array(texSize * texSize * 4);

        // 抖动图案数据
        const pattern = [
            0.0, 8.0, 2.0, 10.0,
            12.0, 4.0, 14.0, 6.0,
            3.0, 11.0, 1.0, 9.0,
            15.0, 7.0, 13.0, 5.0
        ];

        // 填充纹理数据
        for (let i = 0; i < pattern.length; i++) {
            const value = pattern[i] / 16.0;
            data[i * 4] = value;
            data[i * 4 + 1] = value;
            data[i * 4 + 2] = value;
            data[i * 4 + 3] = value;
        }

        // 创建纹理
        const ditherMap = new DataTexture(data, texSize, texSize, RGBAFormat, FloatType);
        ditherMap.minFilter = NearestFilter;
        ditherMap.magFilter = NearestFilter;
        ditherMap.needsUpdate = true;

        this.uniforms.get("ditherMap").value = ditherMap;
        return ditherMap;
    }

    /**
     * 更新视锥体角向量
     * @param {Camera} camera - 相机
     */
    updateFrustumCorners(camera) {
        // 计算视锥体的四个角向量
        const near = camera.near;
        const aspect = camera.aspect;

        // 计算近裁面高度的一半
        const halfHeight = near * Math.tan(camera.fov * 0.5 * Math.PI / 180);
        const halfWidth = halfHeight * aspect;

        // 基于相机方向计算四个角点的向量
        const forward = new Vector3();
        camera.getWorldDirection(forward);
        const right = forward.clone().cross(camera.up).normalize();
        const up = right.clone().cross(forward).normalize();

        // 计算四个角点的方向向量
        const topLeft = forward.clone().multiplyScalar(near).add(up.clone().multiplyScalar(halfHeight)).sub(right.clone().multiplyScalar(halfWidth));
        const topRight = forward.clone().multiplyScalar(near).add(up.clone().multiplyScalar(halfHeight)).add(right.clone().multiplyScalar(halfWidth));
        const bottomLeft = forward.clone().multiplyScalar(near).sub(up.clone().multiplyScalar(halfHeight)).sub(right.clone().multiplyScalar(halfWidth));
        const bottomRight = forward.clone().multiplyScalar(near).sub(up.clone().multiplyScalar(halfHeight)).add(right.clone().multiplyScalar(halfWidth));

        // 归一化并缩放
        const scale = topLeft.length() / near;
        topLeft.normalize().multiplyScalar(scale);
        topRight.normalize().multiplyScalar(scale);
        bottomLeft.normalize().multiplyScalar(scale);
        bottomRight.normalize().multiplyScalar(scale);

        // 如果矩阵不存在，创建一个新的
        if (!this.frustumCorners) {
            this.frustumCorners = [
                bottomLeft, bottomRight, topLeft, topRight
            ];
        } else {
            this.frustumCorners[0].copy(bottomLeft);
            this.frustumCorners[1].copy(bottomRight);
            this.frustumCorners[2].copy(topLeft);
            this.frustumCorners[3].copy(topRight);
        }

        this.uniforms.get("frustumCorners").value = this.frustumCorners;
    }

    /**
     * 设置射线行进采样步数
     * @param {Number} value - 采样步数
     */
    set rayMarchingStep(value) {
        this.uniforms.get("rayMarchingStep").value = value;
    }

    get rayMarchingStep() {
        return this.uniforms.get("rayMarchingStep").value;
    }

    /**
     * 设置最大光线长度
     * @param {Number} value - 最大光线长度
     */
    set maxRayLength(value) {
        this.uniforms.get("maxRayLength").value = value;
    }

    get maxRayLength() {
        return this.uniforms.get("maxRayLength").value;
    }

    /**
     * 设置体积光强度
     * @param {Number} value - 体积光强度
     */
    set volumetricLightIntensity(value) {
        this.uniforms.get("volumetricLightIntensity").value = value;
    }

    get volumetricLightIntensity() {
        return this.uniforms.get("volumetricLightIntensity").value;
    }

    /**
     * 设置光散射因子
     * @param {Number} value - 光散射因子
     */
    set lightScatteringFactor(value) {
        this.uniforms.get("lightScatteringFactor").value = value;
    }

    get lightScatteringFactor() {
        return this.uniforms.get("lightScatteringFactor").value;
    }

    /**
     * 设置体积阴影强度
     * @param {Number} value - 体积阴影强度
     */
    set volumetricShadowIntensity(value) {
        this.uniforms.get("volumetricShadowIntensity").value = value;
    }

    get volumetricShadowIntensity() {
        return this.uniforms.get("volumetricShadowIntensity").value;
    }

    /**
     * 设置阴影衰减
     * @param {Number} value - 阴影衰减
     */
    set shadowAttenuation(value) {
        this.uniforms.get("shadowAttenuation").value = value;
    }

    get shadowAttenuation() {
        return this.uniforms.get("shadowAttenuation").value;
    }

    /**
     * 设置最小阴影值
     * @param {Number} value - 最小阴影值
     */
    set minShadow(value) {
        this.uniforms.get("minShadow").value = value;
    }

    get minShadow() {
        return this.uniforms.get("minShadow").value;
    }

    /**
     * 设置采样比例
     * @param {Number} value - 采样比例
     */
    set samplerScale(value) {
        this.uniforms.get("samplerScale").value = value;
    }

    get samplerScale() {
        return this.uniforms.get("samplerScale").value;
    }

    /**
     * 初始化渲染目标
     * @param {WebGLRenderer} renderer - 渲染器
     */
    initialize(renderer, width, height) {
        const w = width >> this.downSample;
        const h = height >> this.downSample;

        this.marchingRT = new WebGLRenderTarget(w, h);
        this.tempRT = new WebGLRenderTarget(w, h);
        this.uniforms.get("marchingTex").value = this.marchingRT.texture;
    }

    /**
     * 更新效果
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲区
     * @param {Number} deltaTime - 时间增量
     */
    update(renderer, inputBuffer, deltaTime, depthPass, outputBuffer, stencilTest) {
        // 确保相机和场景已经设置
        if (!this.camera || !this.scene) {
            console.warn('VolumetricShadowEffect: 必须设置相机和场景!');
            return;
        }

        // 更新视锥体角向量
        this.updateFrustumCorners(this.camera);

        // 如果渲染目标不存在，初始化它们
        if (!this.marchingRT || !this.tempRT) {
            this.initialize(renderer, inputBuffer.width, inputBuffer.height);
        }

        // 处理渲染流程
        this._performRenderPasses(renderer, inputBuffer, outputBuffer);
    }

    /**
     * 执行全部渲染通道
     * @param {WebGLRenderer} renderer - 渲染器 
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲
     */
    _performRenderPasses(renderer, inputBuffer, outputBuffer) {
        // 更新光源位置
        this._updateLightPosition();

        // 1. 首先渲染射线行进和阴影计算
        this._renderRayMarching(renderer);

        // 2. 然后应用模糊
        this._renderBlur(renderer);

        // 3. 最后合并结果到输出
        this._renderFinalComposition(renderer, inputBuffer, outputBuffer);
    }

    /**
     * 更新光源位置
     */
    _updateLightPosition() {
        const directionalLights = this.scene.children.filter(
            obj => obj.type === 'DirectionalLight'
        );

        if (directionalLights.length > 0) {
            this.uniforms.get("lightPosition").value.copy(directionalLights[0].position);
        }
    }

    /**
     * 渲染射线行进阶段
     * @param {WebGLRenderer} renderer - 渲染器
     */
    _renderRayMarching(renderer) {
        // 设置为射线行进阶段 (阶段1)
        // 确保offsets.xy完全为0，表示射线行进阶段
        this.uniforms.get("offsets").value.set(0, 0, 0, 0);

        // 保存当前渲染目标
        const originalRT = renderer.getRenderTarget();

        // 设置渲染目标
        renderer.setRenderTarget(this.marchingRT);
        renderer.clear();

        // 临时清除marchingTex以避免自引用
        const originalTexture = this.uniforms.get("marchingTex").value;
        this.uniforms.get("marchingTex").value = null;

        // 渲染射线行进阶段
        renderer.render(this.scene, this.camera);

        // 恢复marchingTex
        this.uniforms.get("marchingTex").value = this.marchingRT.texture;

        // 恢复原始渲染目标
        renderer.setRenderTarget(originalRT);
    }

    /**
     * 渲染模糊阶段
     * @param {WebGLRenderer} renderer - 渲染器
     */
    _renderBlur(renderer) {
        // 获取采样比例参数
        const sampleScale = this.uniforms.get("samplerScale").value;

        // 保存当前渲染目标
        const originalRT = renderer.getRenderTarget();

        // 应用水平模糊
        this.uniforms.get("offsets").value.set(sampleScale, 0, 0, 0);
        renderer.setRenderTarget(this.tempRT);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // 应用垂直模糊
        this.uniforms.get("offsets").value.set(0, sampleScale, 0, 0);
        renderer.setRenderTarget(this.marchingRT);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // 额外的模糊传递以获得更平滑的结果
        this.uniforms.get("offsets").value.set(sampleScale, 0, 0, 0);
        renderer.setRenderTarget(this.tempRT);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        this.uniforms.get("offsets").value.set(0, sampleScale, 0, 0);
        renderer.setRenderTarget(this.marchingRT);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // 恢复原始渲染目标
        renderer.setRenderTarget(originalRT);
    }

    /**
     * 渲染最终合成阶段
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {WebGLRenderTarget} outputBuffer - 输出缓冲
     */
    _renderFinalComposition(renderer, inputBuffer, outputBuffer) {
        // 确保marchingTex已正确设置
        this.uniforms.get("marchingTex").value = this.marchingRT.texture;

        // 设置为合成阶段(阶段3) - 使用一个特定的小值
        this.uniforms.get("offsets").value.set(0.0001, 0.0001, 0, 0);

        // 设置渲染目标
        renderer.setRenderTarget(outputBuffer);
        renderer.render(this.scene, this.camera);
    }

    // 添加访问器方法，允许动态更改参数
    setVolumetricLightIntensity(value) {
        this.uniforms.get("volumetricLightIntensity").value = value;
    }

    setVolumetricShadowIntensity(value) {
        this.uniforms.get("volumetricShadowIntensity").value = value;
    }

    setLightScatteringFactor(value) {
        this.uniforms.get("lightScatteringFactor").value = value;
    }

    setShadowAttenuation(value) {
        this.uniforms.get("shadowAttenuation").value = value;
    }

    setMinShadow(value) {
        this.uniforms.get("minShadow").value = value;
    }

    setRayMarchingStep(value) {
        this.uniforms.get("rayMarchingStep").value = parseInt(value);
    }

    setMaxRayLength(value) {
        this.uniforms.get("maxRayLength").value = value;
    }

    setSamplerScale(value) {
        this.samplerScale = value;
        this.uniforms.get("samplerScale").value = value;
    }

    /**
     * 设置相机
     * @param {Camera} camera - 相机
     */
    setCamera(camera) {
        this.camera = camera;
    }

    /**
     * 设置场景
     * @param {Scene} scene - 场景
     */
    setScene(scene) {
        this.scene = scene;
    }
} 