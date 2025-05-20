import { ShaderMaterial, Uniform, Color, Vector2, FrontSide } from "three";
import vertexShader from "./glsl/flow-river.vert";
import fragmentShader from "./glsl/flow-river.frag";

/**
 * 流动河流材质 - 基于分形噪声的流动水面效果
 */
export class FlowRiverMaterial extends ShaderMaterial {

    /**
     * 构造函数
     * @param {Object} [options] - 可选配置项
     * @param {Number} [options.flowSpeed=0.5] - 流动速度
     * @param {Number|Color} [options.waterColor=0x0055ff] - 水的颜色
     * @param {Number} [options.transparency=0.8] - 透明度
     * @param {Number} [options.waveHeight=0.2] - 波浪高度
     * @param {Number} [options.waveScale=1.0] - 波浪缩放
     * @param {Number} [options.waveSpeed=1.0] - 波浪速度
     */
    constructor(options = {}) {
        const flowSpeed = options.flowSpeed !== undefined ? options.flowSpeed : 0.5;
        const waterColor = options.waterColor !== undefined ? options.waterColor : 0x0055ff;
        const transparency = options.transparency !== undefined ? options.transparency : 0.8;
        const waveHeight = options.waveHeight !== undefined ? options.waveHeight : 0.2;
        const waveScale = options.waveScale !== undefined ? options.waveScale : 1.0;
        const waveSpeed = options.waveSpeed !== undefined ? options.waveSpeed : 1.0;

        super({
            name: "FlowRiverMaterial",
            uniforms: {
                time: new Uniform(0.0),
                flowSpeed: new Uniform(flowSpeed),
                waterColor: new Uniform(new Color(waterColor)),
                transparency: new Uniform(transparency),
                waveHeight: new Uniform(waveHeight),
                waveScale: new Uniform(waveScale),
                waveSpeed: new Uniform(waveSpeed),
                resolution: new Uniform(new Vector2(1, 1))
            },
            vertexShader,
            fragmentShader,
            transparent: true,
            side: FrontSide
        });
    }

    /**
     * 更新材质
     * @param {Number} deltaTime - 时间差
     */
    update(deltaTime) {
        this.uniforms.time.value += deltaTime * this.uniforms.flowSpeed.value;
    }
} 