import { Effect, Selection, NormalPass } from "postprocessing"
import { Color, Uniform, Layers, WebGLRenderTarget } from "three"
import { TRAAEffect, PoissionDenoisePass } from '../../index'
import ao_compose from './shader/ao_compose.frag'
import passthrough from './shader/passthrough.frag'

const defaultAOOptions = {
    resolutionScale: 1,
    spp: 8,
    distance: 2,
    distancePower: 1,
    power: 2,
    bias: 40,
    thickness: 0.075,
    color: new Color("black"),
    brightnessThreshold: 0.7,
    ignoreSelection: null,
    highlightValue: 0.8,
    closeAutoUpdate: false,
    useNormalPass: false,
    velocityDepthNormalPass: null,
    normalTexture: null,
    renderBefore: () => {
    },
    ...PoissionDenoisePass.DefaultOptions
};

export class AOEffect extends Effect {
    constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {
        // 合并选项
        options = {
            ...defaultAOOptions,
            ...options
        };

        // 使用AO着色器作为基础效果着色器，通过enableEffect控制
        super("AOEffect", ao_compose, {
            type: "FinalAOMaterial",
            uniforms: new Map([
                ["inputTexture", new Uniform(null)],
                ["depthTexture", new Uniform(null)],
                ["power", new Uniform(0)],
                ["color", new Uniform(new Color("black"))],
                ["brightnessThreshold", new Uniform(0.7)],
                ["enableEffect", new Uniform(!options.closeAutoUpdate)] // 默认值基于closeAutoUpdate
            ])
        });

        // 存储上次大小设置
        this.lastSize = {
            width: 0,
            height: 0,
            resolutionScale: 0
        };

        // 保存引用
        this.composer = composer;
        this.aoPass = aoPass;
        this.options = options;
        this.scene = scene;
        this.camera = camera;

        // 初始化Selection对象（如果没有提供）并存储为私有变量
        this._ignoreSelection = options.ignoreSelection || new Selection();

        // 存储原始发光值的映射
        this.originalEmissives = new Map();

        // 设置深度纹理
        if (!composer.depthTexture) composer.createDepthTexture();
        this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = composer.depthTexture;
        this.uniforms.get("depthTexture").value = composer.depthTexture;

        // 设置法线纹理（如果需要）
        if (options.useNormalPass || options.normalTexture) {
            if (options.useNormalPass) {
                this.normalPass = new NormalPass(scene, camera);
            }
            const normalTexture = options.normalTexture || this.normalPass.texture;
            this.aoPass.fullscreenMaterial.uniforms.normalTexture.value = normalTexture;
            this.aoPass.fullscreenMaterial.defines.useNormalTexture = "";
        }

        // 创建降噪通道
        this.poissionDenoisePass = new PoissionDenoisePass(camera, this.aoPass.texture, composer.depthTexture);

        // 使选项响应式
        this.makeOptionsReactive(options);
    }

    makeOptionsReactive(options) {
        for (const key of Object.keys(options)) {
            Object.defineProperty(this, key, {
                get() {
                    // 为ignoreSelection属性提供特殊处理
                    if (key === "ignoreSelection") {
                        return this._ignoreSelection;
                    }
                    return options[key];
                },

                set(value) {
                    if (value === null || value === undefined) return;
                    options[key] = value;

                    switch (key) {
                        case "spp":
                            this.aoPass.fullscreenMaterial.defines.spp = value.toFixed(0);
                            this.aoPass.fullscreenMaterial.needsUpdate = true;
                            break;

                        case "distance":
                            this.aoPass.fullscreenMaterial.uniforms.aoDistance.value = value;
                            break;

                        case "resolutionScale":
                            this.setSize(this.lastSize.width, this.lastSize.height);
                            break;

                        case "power":
                            this.uniforms.get("power").value = value;
                            break;

                        case "color":
                            this.uniforms.get("color").value.copy(new Color(value));
                            break;

                        case "brightnessThreshold":
                            this.uniforms.get("brightnessThreshold").value = value;
                            break;

                        // 处理closeAutoUpdate变化
                        case "closeAutoUpdate":
                            // 更新enableEffect uniform而不是切换着色器
                            this.uniforms.get("enableEffect").value = !value;
                            break;

                        case "ignoreSelection":
                            // 更新Selection对象，但使用私有变量避免递归
                            this._ignoreSelection = value || new Selection();
                            break;

                        case "highlightValue":
                            // 更新高亮值
                            break;

                        // 降噪参数
                        case "iterations":
                        case "radius":
                        case "rings":
                        case "samples":
                            this.poissionDenoisePass[key] = value;
                            break;

                        case "lumaPhi":
                        case "depthPhi":
                        case "normalPhi":
                            this.poissionDenoisePass.fullscreenMaterial.uniforms[key].value = Math.max(value, 0.0001);
                            break;

                        default:
                            if (key in this.aoPass.fullscreenMaterial.uniforms) {
                                this.aoPass.fullscreenMaterial.uniforms[key].value = value;
                            }
                    }
                },

                configurable: true
            });

            // 应用初始值
            this[key] = options[key];
        }
    }

    setSize(width, height) {
        if (width === undefined || height === undefined) return;

        if (width === this.lastSize.width && height === this.lastSize.height && this.resolutionScale === this.lastSize.resolutionScale) {
            return;
        }

        // 更新法线通道尺寸
        if (this.normalPass) {
            this.normalPass.setSize(width, height);
        }

        // 更新AO和降噪通道尺寸
        this.aoPass.setSize(width * this.resolutionScale, height * this.resolutionScale);
        this.poissionDenoisePass.setSize(width, height);

        // 保存新尺寸
        this.lastSize = {
            width,
            height,
            resolutionScale: this.resolutionScale
        };
    }

    // 获取Selection中的对象
    getSelectionItems() {
        if (!this._ignoreSelection) return [];

        // 检查各种可能的访问方式
        if (Array.isArray(this._ignoreSelection.items)) {
            return this._ignoreSelection.items;
        }

        if (Array.isArray(this._ignoreSelection.objects)) {
            return this._ignoreSelection.objects;
        }

        if (typeof this._ignoreSelection.getItems === 'function') {
            return this._ignoreSelection.getItems();
        }

        if (typeof this._ignoreSelection.getSelection === 'function') {
            return this._ignoreSelection.getSelection();
        }

        // 如果Selection是一个可迭代对象
        if (typeof this._ignoreSelection[Symbol.iterator] === 'function') {
            return Array.from(this._ignoreSelection);
        }

        console.warn('无法确定Selection API的使用方式');
        return [];
    }

    update(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass) {

        console.log('Log-- ', this.scene, 'this.scene');

        // 在渲染AO效果前，设置忽略对象的高亮
        if (this._ignoreSelection) {
            const selectionItems = this.getSelectionItems();
            selectionItems.forEach(object => {
                this.setObjectHighlight(object, true);
            });
        }

        // 执行渲染前回调
        this.options?.renderBefore?.(this.scene);

        // 检查是否使用TRAA动画噪声
        const hasTRAA = this.composer.passes.some(pass => {
            const effects = pass.effects;
            return pass.enabled && !pass.skipRendering &&
                effects && effects.some(effect => effect instanceof TRAAEffect);
        });

        // 设置动画噪声
        this.aoPass.fullscreenMaterial.needsUpdate = true;
        if (hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {
            this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
            this.aoPass.fullscreenMaterial.needsUpdate = true;
        } else if (!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {
            delete this.aoPass.fullscreenMaterial.defines.animatedNoise;
        }

        // 渲染法线通道（如果有）
        if (this.normalPass) {
            this.normalPass.render(renderer);
        }

        // 渲染AO效果和降噪
        this.aoPass.render(renderer);
        this.poissionDenoisePass.render(renderer);

        if (this.iterations > 0) {
            this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
        } else {
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
        }


        // 根据模式处理效果应用
        if (this.closeAutoUpdate) {
            // 在closeAutoUpdate模式下，临时启用效果仅用于当前帧

            // 1. 保存原始启用状态
            const originalEnabled = this.uniforms.get("enableEffect").value;

            // 2. 临时启用AO效果
            this.uniforms.get("enableEffect").value = true;

            this.setChanged()
            // 3. 调用标准update实现，会使用当前设置的uniform值
            this.setUpdateEffectPass({
                renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass
            });

            // 4. 恢复原始状态
            // this.uniforms.get("enableEffect").value = originalEnabled;
            // this.setChanged()
            // this.setUpdateEffectPass({
            //     renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass
            // });


        } else {
            // 标准模式：直接应用AO效果，enableEffect已经设置为true
            // super.update(renderer, inputBuffer, deltaTime);
        }

        // 在渲染完成后，恢复忽略对象的原始亮度
        if (this._ignoreSelection) {
            const selectionItems = this.getSelectionItems();
            selectionItems.forEach(object => {
                this.setObjectHighlight(object, false);
            });
        }
    }

    // 存储原始发光值的方法
    storeOriginalEmissive(object) {
        if (!this.originalEmissives.has(object.uuid)) {
            if (object.material) {
                if (object.material.emissive) {
                    this.originalEmissives.set(object.uuid, object.material.emissive.clone());
                } else if (Array.isArray(object.material)) {
                    const emissives = [];
                    object.material.forEach(mat => {
                        if (mat.emissive) {
                            emissives.push(mat.emissive.clone());
                        } else {
                            emissives.push(null);
                        }
                    });
                    this.originalEmissives.set(object.uuid, emissives);
                }
            }
        }
    }

    // 设置对象高亮的方法
    setObjectHighlight(object, highlight) {
        // 确保存储了原始发光值
        this.storeOriginalEmissive(object);

        if (object.material) {
            if (object.material.emissive) {
                if (highlight) {
                    object.material.emissive.set(
                        this.highlightValue,
                        this.highlightValue,
                        this.highlightValue
                    );
                } else {
                    const originalEmissive = this.originalEmissives.get(object.uuid);
                    if (originalEmissive) {
                        object.material.emissive.copy(originalEmissive);
                    }
                }
            } else if (Array.isArray(object.material)) {
                const originalEmissives = this.originalEmissives.get(object.uuid);
                object.material.forEach((mat, index) => {
                    if (mat.emissive) {
                        if (highlight) {
                            mat.emissive.set(
                                this.highlightValue,
                                this.highlightValue,
                                this.highlightValue
                            );
                        } else if (originalEmissives && originalEmissives[index]) {
                            mat.emissive.copy(originalEmissives[index]);
                        }
                    }
                });
            }
        }
    }
}