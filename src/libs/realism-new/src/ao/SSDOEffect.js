import { AOEffect } from "./AOEffect.js";
import { SSDOPass } from "./SSDOPass.js";

import { Uniform } from "three";


/**
 * 屏幕空间方向性遮蔽效果
 * 
 * 基于"Screen Space Directional Occlusion"技术
 * 扩展了SSAO，加入了间接照明和颜色渗透效果
 */
export class SSDOEffect extends AOEffect {
    /**
     * 创建SSDO效果
     * 
     * @param {Camera} camera - 相机
     * @param {Texture} normalBuffer - 场景法线纹理
     * @param {Texture} colorBuffer - 场景颜色纹理
     * @param {Object} options - 配置选项
     */
    constructor(composer, camera, scene, options = {}) {
        const defaultSSDOOptions = {
            ...AOEffect.DefaultOptions,
            indirectLightIntensity: 1.0,
            indirectLightDistance: 1.0,
            colorBleeding: true,
            spp: 16,
            rings: 7
        };

        options = {
            ...defaultSSDOOptions,
            ...options
        };

        // 创建SSDO Pass
        const ssdoPass = new SSDOPass(camera, scene);

        // 调用父类构造函数
        super(composer, camera, scene, ssdoPass, options);

        // 设置间接光相关参数
        this.uniforms.set("indirectLightIntensity", new Uniform(options.indirectLightIntensity));
    }

    /**
     * 设置反应式属性
     */
    makeOptionsReactive(options) {
        // 先调用父类的方法
        super.makeOptionsReactive(options);

        // 添加SSDO特有的属性
        const ssdoSpecificProps = [
            "indirectLightIntensity", "indirectLightDistance", "colorBleeding"
        ];

        for (const key of ssdoSpecificProps) {
            Object.defineProperty(this, key, {
                get() {
                    return options[key];
                },
                set(value) {
                    if (value === null || value === undefined) return;
                    options[key] = value;

                    switch (key) {
                        case "indirectLightIntensity":
                            console.log('Log-- ', this, value, 'this');
                            if (this.uniforms.get("indirectLightIntensity")) {
                                this.uniforms.get("indirectLightIntensity").value = value;

                            }

                            // 同时更新SSDO Pass中的uniform
                            if (this.aoPass && this.aoPass.fullscreenMaterial.uniforms.indirectLightIntensity) {
                                this.aoPass.fullscreenMaterial.uniforms.indirectLightIntensity.value = value;
                            }
                            break;
                        case "indirectLightDistance":
                            if (this.aoPass && this.aoPass.fullscreenMaterial.uniforms.indirectLightDistance) {
                                this.aoPass.fullscreenMaterial.uniforms.indirectLightDistance.value = value;
                            }
                            break;
                        case "colorBleeding":
                            if (this.aoPass && this.aoPass.fullscreenMaterial.uniforms.colorBleeding) {
                                this.aoPass.fullscreenMaterial.uniforms.colorBleeding.value = value;
                            }
                            break;
                    }
                },
                configurable: true
            });

            // 应用初始值
            this[key] = options[key];
        }
    }
}





// 导出SSDO效果和默认选项
SSDOEffect.DefaultOptions = {
    ...AOEffect.DefaultOptions,
    indirectLightIntensity: 1.0,
    indirectLightDistance: 1.0,
    colorBleeding: true,
    spp: 16,
    rings: 7
};
