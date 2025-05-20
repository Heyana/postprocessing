import { ShaderMaterial, Uniform, Vector2 } from "three";
import vertexShader from "./glsl/interior-room.vert";
import fragmentShader from "./glsl/interior-room.frag";

/**
 * 假室内材质 - 用于创建单面单房间的假3D室内效果
 */
export class InteriorRoomMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.roomDepth=5.0] - 房间深度
     * @param {Texture} [options.interiorTexture=null] - 室内纹理
     */
    constructor(options = {}) {
        const roomDepth = options.roomDepth !== undefined ? options.roomDepth : 5.0;

        super({
            name: "InteriorRoomMaterial",
            uniforms: {
                time: new Uniform(0),
                resolution: new Uniform(new Vector2(1, 1)),
                roomDepth: new Uniform(roomDepth),
                interiorTexture: new Uniform(options.interiorTexture || null)
            },
            vertexShader,
            fragmentShader,
            transparent: false
        });
    }

    /**
     * 设置室内纹理
     * @param {Texture} value - 室内纹理
     */
    set interiorTexture(value) {
        this.uniforms.interiorTexture.value = value;
    }

    /**
     * 获取室内纹理
     * @return {Texture} 室内纹理
     */
    get interiorTexture() {
        return this.uniforms.interiorTexture.value;
    }

    /**
     * 设置房间深度
     * @param {Number} value - 房间深度
     */
    set roomDepth(value) {
        this.uniforms.roomDepth.value = value;
    }

    /**
     * 获取房间深度
     * @return {Number} 房间深度
     */
    get roomDepth() {
        return this.uniforms.roomDepth.value;
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     */
    update(deltaTime) {
        this.uniforms.time.value += deltaTime;
    }

    /**
     * 设置分辨率
     * @param {Number} width - 渲染宽度
     * @param {Number} height - 渲染高度
     */
    setResolution(width, height) {
        this.uniforms.resolution.value.set(width, height);
    }
} 