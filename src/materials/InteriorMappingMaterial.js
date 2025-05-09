import { ShaderMaterial, Uniform, Matrix4, Vector3 } from "three";
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
     * @param {Number} [options.roomDepth=1.2] - 房间深度 (fillFace模式下有效)
     * @param {Number} [options.roomAspect=1.0] - 房间纵横比 (fillFace模式下有效)
     */
    constructor(options = {}) {
        const useObjectSpace = options.useObjectSpace !== undefined ? options.useObjectSpace : false;
        const roomScale = options.roomScale !== undefined ? options.roomScale : 1.0;
        const roomVariety = options.roomVariety !== undefined ? options.roomVariety : 0.5;
        const fillFace = options.fillFace !== undefined ? options.fillFace : false;
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 1.2;
        const roomAspect = options.roomAspect !== undefined ? options.roomAspect : 1.0;

        super({
            name: "InteriorMappingMaterial",
            uniforms: {
                roomCube: new Uniform(null),
                roomMap: new Uniform(null),  // 单张图片立方体贴图
                useSingleTexture: new Uniform(false), // 是否使用单张图片贴图
                useObjectSpace: new Uniform(useObjectSpace),
                roomScale: new Uniform(roomScale),
                roomVariety: new Uniform(roomVariety),
                fillFace: new Uniform(fillFace), // 是否让房间填满面
                roomDepth: new Uniform(roomDepth), // 房间深度 (fillFace模式下有效)
                roomAspect: new Uniform(roomAspect) // 房间纵横比 (fillFace模式下有效)
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