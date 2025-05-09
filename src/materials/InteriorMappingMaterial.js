import { ShaderMaterial, Uniform, Matrix4, Vector3, Color } from "three";
import vertexShader from "./glsl/interiorMapping.vert";
import fragmentShader from "./glsl/interiorMapping.frag";

/**
 * 室内映射材质 - 用于创建建筑物窗户内部空间的错觉
 * 改编自 http://www.humus.name/index.php?page=3D&ID=80
 */
export class InteriorMappingMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Boolean} [options.useObjectSpace=false] - 是否使用对象空间坐标（否则使用切线空间）
     * @param {Number} [options.roomScale=1.0] - 房间尺寸缩放
     * @param {Number} [options.roomVariety=0.5] - 房间随机变化程度
     * @param {Boolean} [options.fillFace=false] - 是否让房间填满整个面（适用于长方形）
     * @param {Number} [options.roomDepth=0.02] - 房间实际深度 (fillFace模式下有效，保持低值避免异常)
     * @param {Number} [options.visualDepth=1.2] - 房间视觉深度 (控制深度感，不会产生异常)
     * @param {Number} [options.roomAspect=1.0] - 房间纵横比 (fillFace模式下有效)
     * @param {Boolean} [options.flipTextureY=true] - 是否在着色器中翻转贴图Y轴 (避免在外部设置flipY=false)
     * @param {Number} [options.roomsX=1] - 横向房间数量
     * @param {Number} [options.roomsY=1] - 纵向房间数量
     * @param {Number} [options.gapSize=0.05] - 房间间隔大小
     * @param {Number|Color} [options.gapColor=0x000000] - 房间间隔颜色
     * @param {Number} [options.glassStrength=0.25] - 前景玻璃反射强度 (0.0-1.0)
     * @param {Number|Color} [options.glassColor=0x88CCFF] - 前景玻璃颜色
     * @param {Number} [options.glassBlurStrength=0.0] - 玻璃模糊强度 (0.0-1.0)
     */
    constructor(options = {}) {
        const useObjectSpace = options.useObjectSpace !== undefined ? options.useObjectSpace : true;
        const roomScale = options.roomScale !== undefined ? options.roomScale : 1.0;
        const roomVariety = options.roomVariety !== undefined ? options.roomVariety : 0.5;
        const fillFace = options.fillFace !== undefined ? options.fillFace : true;
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 0.02;
        const visualDepth = options.visualDepth !== undefined ? options.visualDepth : 1.2;
        const roomAspect = options.roomAspect !== undefined ? options.roomAspect : 1.0;
        const flipTextureY = options.flipTextureY !== undefined ? options.flipTextureY : true;
        const roomsX = options.roomsX !== undefined ? options.roomsX : 1;
        const roomsY = options.roomsY !== undefined ? options.roomsY : 1;
        const gapSize = options.gapSize !== undefined ? options.gapSize : 0.05;
        const gapColor = options.gapColor !== undefined ? options.gapColor : 0x000000;
        const glassStrength = options.glassStrength !== undefined ? options.glassStrength : 0.25;
        const glassColor = options.glassColor !== undefined ? options.glassColor : 0xffffff;
        const glassBlurStrength = options.glassBlurStrength !== undefined ? options.glassBlurStrength : 0.0;

        super({
            name: "InteriorMappingMaterial",
            uniforms: {
                roomCube: new Uniform(null),
                roomMap: new Uniform(null),  // 单张图片立方体贴图
                useSingleTexture: new Uniform(true), // 是否使用单张图片贴图
                useObjectSpace: new Uniform(useObjectSpace),
                roomScale: new Uniform(roomScale),
                roomVariety: new Uniform(roomVariety),
                fillFace: new Uniform(fillFace), // 是否让房间填满面
                roomDepth: new Uniform(roomDepth), // 房间实际深度 (fillFace模式下有效)
                visualDepth: new Uniform(visualDepth), // 房间视觉深度 (控制深度感)
                roomAspect: new Uniform(roomAspect), // 房间纵横比 (fillFace模式下有效)
                flipTextureY: new Uniform(flipTextureY), // 是否翻转贴图Y轴
                roomsX: new Uniform(roomsX), // 横向房间数量
                roomsY: new Uniform(roomsY), // 纵向房间数量
                gapSize: new Uniform(gapSize), // 房间间隔大小
                gapColor: new Uniform(new Color(gapColor)), // 房间间隔颜色
                glassStrength: new Uniform(glassStrength), // 前景玻璃反射强度
                glassColor: new Uniform(new Color(glassColor)), // 前景玻璃颜色
                glassBlurStrength: new Uniform(glassBlurStrength) // 玻璃模糊强度
            },
            vertexShader,
            fragmentShader,
            defines: {
                USE_OBJECTSPACE: useObjectSpace,
                USE_TANGENT: true,
                FILL_FACE: fillFace
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
            console.warn('InteriorMappingMaterial: 未提供任何房间贴图，请设置roomCube或roomMap');
        }

        // 更新着色器
        if (this.defines.USE_SINGLE_TEXTURE !== this.uniforms.useSingleTexture.value) {
            this.defines.USE_SINGLE_TEXTURE = this.uniforms.useSingleTexture.value;
            this.needsUpdate = true;
        }
    }

    /**
     * 设置是否使用对象空间坐标
     * @param {Boolean} value - 是否使用对象空间（否则使用切线空间）
     */
    set useObjectSpace(value) {
        this.uniforms.useObjectSpace.value = value;
        this.defines.USE_OBJECTSPACE = value;
        this.needsUpdate = true;
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
     * 设置是否让房间填满整个面
     * @param {Boolean} value - 是否让房间填满面
     */
    set fillFace(value) {
        this.uniforms.fillFace.value = value;

        // 当fillFace状态改变时，需要更新着色器的define
        if (this.defines.FILL_FACE !== value) {
            this.defines.FILL_FACE = value;
            this.needsUpdate = true;
        }
    }

    /**
     * 获取是否让房间填满整个面
     * @return {Boolean} 是否让房间填满面
     */
    get fillFace() {
        return this.uniforms.fillFace.value;
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

        // 确保uniform标记为需要更新
        this.uniformsNeedUpdate = true;
    }

    /**
     * 获取前景玻璃颜色
     * @return {Color} 前景玻璃颜色
     */
    get glassColor() {
        return this.uniforms.glassColor.value;
    }

    /**
     * 设置玻璃模糊强度
     * @param {Number} value - 玻璃模糊强度 (0.0-1.0)
     */
    set glassBlurStrength(value) {
        this.uniforms.glassBlurStrength.value = Math.max(0.0, Math.min(1.0, value));
    }

    /**
     * 获取玻璃模糊强度
     * @return {Number} 玻璃模糊强度
     */
    get glassBlurStrength() {
        return this.uniforms.glassBlurStrength.value;
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