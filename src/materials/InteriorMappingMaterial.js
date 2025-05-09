import { ShaderMaterial, Uniform, Matrix4, Vector3 } from "three";
import vertexShader from "./glsl/interiorMapping.vert";
import fragmentShader from "./glsl/interiorMapping.frag";

/**
 * 室内映射材质 - 用于创建建筑物窗户内部空间的错觉
 * 改编自 http://www.humus.name/index.php?page=3D&ID=80
 * 简化版本 - 只支持单个房间模式
 */
export class InteriorMappingMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.roomScale=1.0] - 房间尺寸缩放
     * @param {Number} [options.roomDepth=0.02] - 房间实际深度 (保持低值避免异常)
     * @param {Number} [options.visualDepth=1.2] - 房间视觉深度 (控制深度感，不会产生异常)
     * @param {Number} [options.roomAspect=1.0] - 房间纵横比
     */
    constructor(options = {}) {
        const roomScale = options.roomScale !== undefined ? options.roomScale : 1.0;
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 0.02;
        const visualDepth = options.visualDepth !== undefined ? options.visualDepth : 1.2;
        const roomAspect = options.roomAspect !== undefined ? options.roomAspect : 1.0;

        super({
            name: "InteriorMappingMaterial",
            uniforms: {
                roomCube: new Uniform(null),
                roomMap: new Uniform(null),  // 单张图片立方体贴图
                useSingleTexture: new Uniform(true), // 是否使用单张图片贴图
                roomScale: new Uniform(roomScale),
                roomVariety: new Uniform(0.0), // 保留参数但不使用
                fillFace: new Uniform(true),  // 始终为true，保留参数以兼容旧代码
                roomDepth: new Uniform(roomDepth), // 房间实际深度
                visualDepth: new Uniform(visualDepth), // 房间视觉深度
                roomAspect: new Uniform(roomAspect) // 房间纵横比
            },
            vertexShader,
            fragmentShader,
            defines: {
                USE_TANGENT: true
            }
        });

        // 启用切线属性，这样着色器可以访问 tangent
        this.vertexTangents = true;
    }

    /**
     * 设置房间立方体贴图
     * @param {CubeTexture} value - 房间内部的立方体贴图
     */
    set roomCube(value) {
        this.uniforms.roomCube.value = value;
        this._updateTextureMode();
    }

    /**
     * 获取房间立方体贴图
     * @return {CubeTexture} 房间立方体贴图
     */
    get roomCube() {
        return this.uniforms.roomCube.value;
    }

    /**
     * 设置房间单张图片立方体贴图
     * @param {Texture} value - 包含六个面的单张图片贴图
     */
    set roomMap(value) {
        this.uniforms.roomMap.value = value;
        // 注意：现在不需要设置 flipY = false，因为我们在着色器中处理了
        this._updateTextureMode();
    }

    /**
     * 获取房间单张图片立方体贴图
     * @return {Texture} 单张图片立方体贴图
     */
    get roomMap() {
        return this.uniforms.roomMap.value;
    }

    /**
     * 更新纹理模式
     * 根据提供的纹理确定使用哪种模式
     * @private
     */
    _updateTextureMode() {
        const hasCubeMap = this.uniforms.roomCube.value !== null;
        const hasRoomMap = this.uniforms.roomMap.value !== null;

        // 优先使用立方体贴图
        this.uniforms.useSingleTexture.value = !hasCubeMap && hasRoomMap;

        // 如果两种贴图都没有，在控制台给出警告
        if (!hasCubeMap && !hasRoomMap) {
            console.warn('InteriorMappingMaterial: 未提供任何房间贴图，请设置roomCube或roomMap');
        }
    }

    /**
     * 设置房间尺寸缩放
     * @param {Number} value - 房间尺寸缩放因子
     */
    set roomScale(value) {
        this.uniforms.roomScale.value = value;
    }

    /**
     * 获取房间尺寸缩放
     * @return {Number} 房间尺寸缩放因子
     */
    get roomScale() {
        return this.uniforms.roomScale.value;
    }

    /**
     * 设置房间深度
     * @param {Number} value - 房间深度值
     */
    set roomDepth(value) {
        this.uniforms.roomDepth.value = value;
    }

    /**
     * 获取房间深度
     * @return {Number} 房间深度值
     */
    get roomDepth() {
        return this.uniforms.roomDepth.value;
    }

    /**
     * 设置房间视觉深度
     * @param {Number} value - 房间视觉深度值
     */
    set visualDepth(value) {
        this.uniforms.visualDepth.value = value;
    }

    /**
     * 获取房间视觉深度
     * @return {Number} 房间视觉深度值
     */
    get visualDepth() {
        return this.uniforms.visualDepth.value;
    }

    /**
     * 设置房间纵横比
     * @param {Number} value - 房间纵横比值
     */
    set roomAspect(value) {
        this.uniforms.roomAspect.value = value;
    }

    /**
     * 获取房间纵横比
     * @return {Number} 房间纵横比值
     */
    get roomAspect() {
        return this.uniforms.roomAspect.value;
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     * @param {Matrix4} modelMatrix - 模型矩阵
     */
    update(deltaTime, modelMatrix) {
        // 由于modelMatrix是Three.js内置的uniform，我们不需要手动更新它
        // 只保留这个方法作为API的一部分
    }
} 