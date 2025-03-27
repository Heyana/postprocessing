import { Uniform, Vector2, Vector3, Color, Matrix4 } from "three";
import { Effect } from "./Effect.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { EffectAttribute } from "../enums/EffectAttribute.js";

import fragmentShader from "./glsl/volumetric-fog.frag";
import vertexShader from "./glsl/volumetric-fog.vert";

/**
 * 体积雾效果 - 模拟光线在大气中的散射
 * 
 * 该效果使用光线步进技术在屏幕空间实现真实的体积光照和雾气散射。
 * 效果考虑了场景深度、高度衰减和光源交互。
 */
export class VolumetricFogEffect extends Effect {
    /**
     * 构造一个新的体积雾效果
     * 
     * @param {Object} [options] - 效果选项
     * @param {BlendFunction} [options.blendFunction=BlendFunction.NORMAL] - 混合模式
     * @param {Number} [options.density=0.05] - 雾气密度
     * @param {Number} [options.heightFalloff=0.1] - 高度衰减系数
     * @param {Number} [options.baseHeight=0] - 基准高度
     * @param {Color|Number} [options.color=0xffffff] - 雾气颜色
     * @param {Number} [options.scattering=0.2] - 散射系数
     * @param {Number} [options.extinction=0.1] - 衰减系数
     * @param {Number} [options.samples=64] - 采样次数
     */
    constructor({
        blendFunction = BlendFunction.NORMAL,
        density = 0.1,
        heightFalloff = 0.1,
        baseHeight = 0,
        color = 0xccccff,
        scattering = 0.3,
        extinction = 0.05,
        samples = 32
    } = {}) {
        super("VolumetricFogEffect", fragmentShader, {
            blendFunction,
            vertexShader: vertexShader,
            attributes: EffectAttribute.DEPTH,
            uniforms: new Map([
                ["fog_depthBuffer", new Uniform(null)],
                ["fog_resolution", new Uniform(new Vector2())],
                ["fog_color", new Uniform(new Color(color))],
                ["fog_density", new Uniform(density)],
                ["fog_heightFalloff", new Uniform(heightFalloff)],
                ["fog_baseHeight", new Uniform(baseHeight)],
                ["fog_lightPosition", new Uniform(new Vector3(10, 40, 10))],
                ["fog_lightColor", new Uniform(new Color(0xffffcc))],
                ["fog_lightIntensity", new Uniform(2.0)],
                ["fog_scatteringCoefficient", new Uniform(scattering)],
                ["fog_extinction", new Uniform(extinction)],
                ["cameraMatrixWorld", new Uniform(new Matrix4())],
                ["projectionMatrixInv", new Uniform(new Matrix4())],
                ["fog_cameraNear", new Uniform(0.1)],
                ["fog_cameraFar", new Uniform(100.0)],
                ["fog_stepSize", new Uniform(1.0 / samples)],
                ["fog_time", new Uniform(0.0)],
                ["debug_mode", new Uniform(0.0)]
            ])
        });

        /**
         * 采样数量
         * @type {Number}
         * @private
         */
        this.samples = samples;

        /**
         * 用于深度信息的材质通道索引
         * @type {Number}
         */
        this.depthPacking = 0;
    }

    /**
     * 设置渲染深度通道
     * @param {Boolean} value - 是否需要深度通道
     */
    get needsDepthTexture() {
        return true;
    }

    /**
     * 体积雾密度
     * @type {Number}
     */
    get density() {
        return this.uniforms.get("fog_density").value;
    }

    set density(value) {
        this.uniforms.get("fog_density").value = value;
    }

    /**
     * 高度衰减系数
     * @type {Number}
     */
    get heightFalloff() {
        return this.uniforms.get("fog_heightFalloff").value;
    }

    set heightFalloff(value) {
        this.uniforms.get("fog_heightFalloff").value = value;
    }

    /**
     * 基准高度
     * @type {Number}
     */
    get baseHeight() {
        return this.uniforms.get("fog_baseHeight").value;
    }

    set baseHeight(value) {
        this.uniforms.get("fog_baseHeight").value = value;
    }

    /**
     * 雾气颜色
     * @type {Color}
     */
    get color() {
        return this.uniforms.get("fog_color").value;
    }

    set color(value) {
        this.uniforms.get("fog_color").value.set(value);
    }

    /**
     * 散射系数
     * @type {Number}
     */
    get scattering() {
        return this.uniforms.get("fog_scatteringCoefficient").value;
    }

    set scattering(value) {
        this.uniforms.get("fog_scatteringCoefficient").value = value;
    }

    /**
     * 衰减系数
     * @type {Number}
     */
    get extinction() {
        return this.uniforms.get("fog_extinction").value;
    }

    set extinction(value) {
        this.uniforms.get("fog_extinction").value = value;
    }

    /**
     * 设置主光源位置和颜色（将用于照亮雾气）
     * @param {Vector3} position - 光源位置
     * @param {Color|Number} color - 光源颜色
     * @param {Number} intensity - 光源强度
     */
    setLight(position, color, intensity = 1.0) {
        const lightPosition = this.uniforms.get("fog_lightPosition").value;
        const lightColor = this.uniforms.get("fog_lightColor").value;

        lightPosition.copy(position);

        if (color !== undefined) {
            if (color instanceof Color) {
                lightColor.copy(color);
            } else {
                lightColor.set(color);
            }
        }

        if (intensity !== undefined) {
            this.uniforms.get("fog_lightIntensity").value = intensity;
        }
    }

    /**
     * 设置深度纹理
     * @param {Texture} depthTexture - 深度纹理
     * @param {Number} [depthPacking=0] - 深度打包格式
     */
    setDepthTexture(depthTexture, depthPacking = 0) {
        // 增加详细的错误检查和日志
        if (!depthTexture) {
            console.warn("VolumetricFogEffect: 尝试设置空的深度纹理");
            return;
        }

        try {
            // 检查是否为有效的纹理对象
            if (!depthTexture.isTexture && typeof depthTexture.addEventListener !== 'function') {
                console.warn("VolumetricFogEffect: 提供的深度纹理不是有效的纹理对象");
                console.log("深度纹理类型:", typeof depthTexture);
                return;
            }

            // 确保纹理设置正确的过滤模式
            if (depthTexture.minFilter !== undefined) {
                depthTexture.minFilter = depthTexture.magFilter = 1003; // THREE.NearestFilter
                depthTexture.compareFunction = 0;
                depthTexture.generateMipmaps = false;
            }

            // 设置深度纹理
            this.uniforms.get("fog_depthBuffer").value = depthTexture;
            this.depthPacking = depthPacking;

            console.log("VolumetricFogEffect: 深度纹理已设置，纹理ID:", depthTexture.id,
                "格式:", depthTexture.format,
                "类型:", depthTexture.type);
        } catch (err) {
            console.error("VolumetricFogEffect: 设置深度纹理时出错:", err);
        }
    }

    /**
     * 更新效果
     * @param {WebGLRenderer} renderer - 渲染器
     * @param {WebGLRenderTarget} inputBuffer - 输入缓冲
     * @param {Number} deltaTime - 时间增量
     */
    update(renderer, inputBuffer, deltaTime) {
        // 获取当前相机
        const camera = this.uniforms.get("camera")?.value;

        // 更新相机矩阵
        const cameraMatrixWorld = this.uniforms.get("cameraMatrixWorld").value;
        const projectionMatrixInv = this.uniforms.get("projectionMatrixInv").value;

        if (camera) {
            // 复制相机世界矩阵
            cameraMatrixWorld.copy(camera.matrixWorld);

            // 确保投影矩阵逆矩阵计算正确
            projectionMatrixInv.copy(camera.projectionMatrix).invert();

            // 更新相机近远平面值
            this.uniforms.get("fog_cameraNear").value = camera.near;
            this.uniforms.get("fog_cameraFar").value = camera.far;

            // 打印相机信息用于调试
            if (this.debug) {
                console.log("相机位置:", camera.position);
                console.log("相机近平面:", camera.near, "远平面:", camera.far);
                console.log("相机矩阵:", cameraMatrixWorld.elements);
                this.debug = false;
            }
        } else {
            console.warn("VolumetricFogEffect: 未设置相机对象，使用默认值");
        }

        // 更新时间
        const time = this.uniforms.get("fog_time");
        time.value += deltaTime;
    }

    /**
     * 设置渲染尺寸
     * @param {Number} width - 宽度
     * @param {Number} height - 高度
     */
    setSize(width, height) {
        this.uniforms.get("fog_resolution").value.set(width, height);
    }
} 