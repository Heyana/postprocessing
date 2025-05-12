import { ShaderMaterial, Uniform, Color } from "three";
import vertexShader from "./glsl/tangentSpaceInterior.vert";
import fragmentShader from "./glsl/tangentSpaceInterior.frag";

/**
 * 切线空间室内映射材质 - 专为曲面上的室内效果优化
 * 基于切线空间计算，实现更好的深度和立体感
 */
export class TangentSpaceInteriorMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.roomScale=1.0] - 房间尺寸缩放
     * @param {Number} [options.roomVariety=0.5] - 房间随机变化程度
     * @param {Number} [options.roomDepth=0.5] - 房间深度参数 (0.5为标准深度)
     * @param {Number} [options.roomsX=1] - 横向房间数量
     * @param {Number} [options.roomsY=1] - 纵向房间数量
     * @param {Number} [options.gapSize=0.05] - 房间间隔大小
     * @param {Number|Color} [options.gapColor=0x000000] - 房间间隔颜色
     * @param {Number} [options.glassStrength=0.25] - 前景玻璃反射强度 (0.0-1.0)
     * @param {Number|Color} [options.glassColor=0x88CCFF] - 前景玻璃颜色
     * @param {Boolean} [options.flipTextureY=true] - 是否在着色器中翻转贴图Y轴
     * @param {Boolean} [options.handleBackFaces=false] - 是否特殊处理背面 (对立方体有帮助)
     * @param {Boolean} [options.invert3DDepthOnBackFace=true] - 是否在背面时翻转Y轴方向 (保持垂直方向一致)
     * @param {Boolean} [options.useOriginalRaytracing=false] - 是否使用原始光线追踪算法 (可能对某些模型效果更好)
     */
    constructor(options = {}) {
        const roomScale = options.roomScale !== undefined ? options.roomScale : 1.0;
        const roomVariety = options.roomVariety !== undefined ? options.roomVariety : 0.5;
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 0.5; // 默认为0.5，标准深度
        const roomsX = options.roomsX !== undefined ? options.roomsX : 1;
        const roomsY = options.roomsY !== undefined ? options.roomsY : 1;
        const gapSize = options.gapSize !== undefined ? options.gapSize : 0.05;
        const gapColor = options.gapColor !== undefined ? options.gapColor : 0x000000;
        const glassStrength = options.glassStrength !== undefined ? options.glassStrength : 0.25;
        const glassColor = options.glassColor !== undefined ? options.glassColor : 0x88CCFF;
        const flipTextureY = options.flipTextureY !== undefined ? options.flipTextureY : true;
        const handleBackFaces = options.handleBackFaces !== undefined ? options.handleBackFaces : false;
        const invert3DDepthOnBackFace = options.invert3DDepthOnBackFace !== undefined ? options.invert3DDepthOnBackFace : true;
        const useOriginalRaytracing = options.useOriginalRaytracing !== undefined ? options.useOriginalRaytracing : false;

        super({
            name: "TangentSpaceInteriorMaterial",
            uniforms: {
                roomCube: new Uniform(null),
                roomMap: new Uniform(null),  // 单张图片立方体贴图
                useSingleTexture: new Uniform(true), // 是否使用单张图片贴图
                roomScale: new Uniform(roomScale),
                roomVariety: new Uniform(roomVariety),
                roomDepth: new Uniform(roomDepth), // 房间深度参数
                roomsX: new Uniform(roomsX), // 横向房间数量
                roomsY: new Uniform(roomsY), // 纵向房间数量
                gapSize: new Uniform(gapSize), // 房间间隔大小
                gapColor: new Uniform(new Color(gapColor)), // 房间间隔颜色
                glassStrength: new Uniform(glassStrength), // 前景玻璃反射强度
                glassColor: new Uniform(new Color(glassColor)), // 前景玻璃颜色
                flipTextureY: new Uniform(flipTextureY), // 是否翻转贴图Y轴
                time: new Uniform(0), // 时间，用于可能的动画效果
                handleBackFaces: new Uniform(handleBackFaces), // 是否特殊处理背面
                invert3DDepthOnBackFace: new Uniform(invert3DDepthOnBackFace), // 是否在背面时翻转Y轴方向
                useOriginalRaytracing: new Uniform(useOriginalRaytracing) // 是否使用原始光线追踪算法
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
            console.warn('TangentSpaceInteriorMaterial: 未提供任何房间贴图，请设置roomCube或roomMap');
        }

        // 更新着色器
        if (this.defines.USE_SINGLE_TEXTURE !== this.uniforms.useSingleTexture.value) {
            this.defines.USE_SINGLE_TEXTURE = this.uniforms.useSingleTexture.value;
            this.needsUpdate = true;
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
     * 设置房间随机变化程度
     * @param {Number} value - 房间随机变化程度 (0-1)
     */
    set roomVariety(value) {
        this.uniforms.roomVariety.value = value;
    }

    /**
     * 获取房间随机变化程度
     * @return {Number} 房间随机变化程度 (0-1)
     */
    get roomVariety() {
        return this.uniforms.roomVariety.value;
    }

    /**
     * 设置房间深度
     * @param {Number} value - 房间深度值 (0.0-1.0, 0.5为标准)
     */
    set roomDepth(value) {
        this.uniforms.roomDepth.value = Math.max(0.001, Math.min(0.999, value));
    }

    /**
     * 获取房间深度
     * @return {Number} 房间深度值
     */
    get roomDepth() {
        return this.uniforms.roomDepth.value;
    }

    /**
     * 设置是否翻转贴图Y轴
     * @param {Boolean} value - 是否翻转贴图Y轴
     */
    set flipTextureY(value) {
        this.uniforms.flipTextureY.value = value;
    }

    /**
     * 获取是否翻转贴图Y轴
     * @return {Boolean} 是否翻转贴图Y轴
     */
    get flipTextureY() {
        return this.uniforms.flipTextureY.value;
    }

    /**
     * 设置横向房间数量
     * @param {Number} value - 横向房间数量
     */
    set roomsX(value) {
        this.uniforms.roomsX.value = value;
    }

    /**
     * 获取横向房间数量
     * @return {Number} 横向房间数量
     */
    get roomsX() {
        return this.uniforms.roomsX.value;
    }

    /**
     * 设置纵向房间数量
     * @param {Number} value - 纵向房间数量
     */
    set roomsY(value) {
        this.uniforms.roomsY.value = value;
    }

    /**
     * 获取纵向房间数量
     * @return {Number} 纵向房间数量
     */
    get roomsY() {
        return this.uniforms.roomsY.value;
    }

    /**
     * 设置房间间隔大小
     * @param {Number} value - 房间间隔大小
     */
    set gapSize(value) {
        this.uniforms.gapSize.value = value;
    }

    /**
     * 获取房间间隔大小
     * @return {Number} 房间间隔大小
     */
    get gapSize() {
        return this.uniforms.gapSize.value;
    }

    /**
     * 设置房间间隔颜色
     * @param {Color|Number} value - 房间间隔颜色
     */
    set gapColor(value) {
        if (typeof value === 'number') {
            this.uniforms.gapColor.value.setHex(value);
        } else {
            this.uniforms.gapColor.value.copy(value);
        }
    }

    /**
     * 获取房间间隔颜色
     * @return {Color} 房间间隔颜色
     */
    get gapColor() {
        return this.uniforms.gapColor.value;
    }

    /**
     * 设置前景玻璃反射强度
     * @param {Number} value - 前景玻璃反射强度 (0.0-1.0)
     */
    set glassStrength(value) {
        this.uniforms.glassStrength.value = Math.max(0.0, Math.min(1.0, value));
    }

    /**
     * 获取前景玻璃反射强度
     * @return {Number} 前景玻璃反射强度
     */
    get glassStrength() {
        return this.uniforms.glassStrength.value;
    }

    /**
     * 设置前景玻璃颜色
     * @param {Color|Number|String} value - 前景玻璃颜色
     */
    set glassColor(value) {
        if (typeof value === 'number') {
            this.uniforms.glassColor.value.setHex(value);
        } else if (typeof value === 'string') {
            // 支持字符串格式的颜色值（如'#AADDFF'）
            this.uniforms.glassColor.value.set(value);
        } else {
            this.uniforms.glassColor.value.copy(value);
        }
    }

    /**
     * 获取前景玻璃颜色
     * @return {Color} 前景玻璃颜色
     */
    get glassColor() {
        return this.uniforms.glassColor.value;
    }

    /**
     * 设置是否特殊处理背面
     * @param {Boolean} value - 是否特殊处理背面
     */
    set handleBackFaces(value) {
        this.uniforms.handleBackFaces.value = value;
    }

    /**
     * 获取是否特殊处理背面
     * @return {Boolean} 是否特殊处理背面
     */
    get handleBackFaces() {
        return this.uniforms.handleBackFaces.value;
    }

    /**
     * 设置是否在背面时翻转Y轴方向
     * @param {Boolean} value - 是否在背面时翻转Y轴方向
     */
    set invert3DDepthOnBackFace(value) {
        this.uniforms.invert3DDepthOnBackFace.value = value;
    }

    /**
     * 获取是否在背面时翻转Y轴方向
     * @return {Boolean} 是否在背面时翻转Y轴方向
     */
    get invert3DDepthOnBackFace() {
        return this.uniforms.invert3DDepthOnBackFace.value;
    }

    /**
     * 设置是否使用原始光线追踪算法
     * @param {Boolean} value - 是否使用原始光线追踪算法
     */
    set useOriginalRaytracing(value) {
        this.uniforms.useOriginalRaytracing.value = value;
    }

    /**
     * 获取是否使用原始光线追踪算法
     * @return {Boolean} 是否使用原始光线追踪算法
     */
    get useOriginalRaytracing() {
        return this.uniforms.useOriginalRaytracing.value;
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     */
    update(deltaTime) {
        // 更新时间，用于可能的动画效果
        this.uniforms.time.value += deltaTime;
    }
} 