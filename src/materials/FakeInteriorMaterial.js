import { ShaderMaterial, Uniform, Vector3, Color } from "three";
import vertexShader from "./glsl/fake-interior.vert";
import fragmentShader from "./glsl/fake-interior.frag";

/**
 * 假室内材质 - 用于模拟建筑内部空间效果，无需实际建模内部
 */
export class FakeInteriorMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.roomSizeX=2.0] - 房间X轴尺寸
     * @param {Number} [options.roomSizeY=2.0] - 房间Y轴尺寸
     * @param {Number} [options.roomSizeZ=2.0] - 房间Z轴尺寸
     * @param {Color|Number} [options.ceilingColor=0x6BD8A5] - 天花板颜色
     * @param {Color|Number} [options.floorColor=0xFFAB8C] - 地板颜色
     * @param {Color|Number} [options.rightWallColor=0xFFE57D] - 右墙颜色
     * @param {Color|Number} [options.leftWallColor=0xFFC580] - 左墙颜色
     * @param {Color|Number} [options.frontWallColor=0x80C7FF] - 前墙颜色
     * @param {Color|Number} [options.backWallColor=0x968EEB] - 后墙颜色
     * @param {Boolean} [options.useLayoutTexture=true] - 是否使用布局纹理图片 (默认使用)
     */
    constructor(options = {}) {
        const roomSizeX = options.roomSizeX !== undefined ? options.roomSizeX : 2.0;
        const roomSizeY = options.roomSizeY !== undefined ? options.roomSizeY : 2.0;
        const roomSizeZ = options.roomSizeZ !== undefined ? options.roomSizeZ : 2.0;

        const ceilingColor = options.ceilingColor !== undefined ? options.ceilingColor : 0x6BD8A5;  // 浅绿色
        const floorColor = options.floorColor !== undefined ? options.floorColor : 0xFFAB8C;        // 红色
        const rightWallColor = options.rightWallColor !== undefined ? options.rightWallColor : 0xFFE57D; // 黄色
        const leftWallColor = options.leftWallColor !== undefined ? options.leftWallColor : 0xFFC580;   // 橙色
        const frontWallColor = options.frontWallColor !== undefined ? options.frontWallColor : 0x80C7FF; // 蓝色
        const backWallColor = options.backWallColor !== undefined ? options.backWallColor : 0x968EEB;   // 紫色

        // 默认使用布局纹理
        const useLayoutTexture = options.useLayoutTexture !== undefined ? options.useLayoutTexture : true;

        super({
            name: "FakeInteriorMaterial",
            uniforms: {
                time: new Uniform(0),
                cameraPosition: new Uniform(new Vector3(0, 0, 0)),
                roomSize: new Uniform(new Vector3(roomSizeX, roomSizeY, roomSizeZ)),
                wallTexture: new Uniform(null),
                // 各个墙面颜色
                ceilingColor: new Uniform(new Color(ceilingColor)),
                floorColor: new Uniform(new Color(floorColor)),
                rightWallColor: new Uniform(new Color(rightWallColor)),
                leftWallColor: new Uniform(new Color(leftWallColor)),
                frontWallColor: new Uniform(new Color(frontWallColor)),
                backWallColor: new Uniform(new Color(backWallColor)),
                // 是否使用布局纹理
                useLayoutTexture: new Uniform(useLayoutTexture)
            },
            vertexShader,
            fragmentShader
        });
    }

    /**
     * 设置墙壁纹理 (布局纹理)
     * @param {Texture} value - 布局纹理贴图
     */
    set wallTexture(value) {
        this.uniforms.wallTexture.value = value;
    }

    /**
     * 设置房间尺寸
     * @param {Number} x - X轴房间尺寸
     * @param {Number} y - Y轴房间尺寸
     * @param {Number} z - Z轴房间尺寸
     */
    setRoomSize(x, y, z) {
        this.uniforms.roomSize.value.set(x, y, z);
    }

    /**
     * 设置是否使用布局纹理
     * @param {Boolean} value - 是否使用布局纹理
     */
    set useLayoutTexture(value) {
        this.uniforms.useLayoutTexture.value = value;
    }

    /**
     * 获取是否使用布局纹理
     * @return {Boolean} 是否使用布局纹理
     */
    get useLayoutTexture() {
        return this.uniforms.useLayoutTexture.value;
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     * @param {Vector3} cameraPosition - 相机位置
     */
    update(deltaTime, cameraPosition) {
        this.uniforms.time.value += deltaTime;
        if (cameraPosition) {
            this.uniforms.cameraPosition.value.copy(cameraPosition);
        }
    }
} 