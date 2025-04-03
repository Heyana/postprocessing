import { Effect, Selection, NormalPass } from "postprocessing"
import { Color, Uniform, Layers } from "three"
import { TRAAEffect, PoissionDenoisePass } from '../../index'
import ao_compose from './shader/ao_compose.frag'
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
    useNormalPass: false,
    velocityDepthNormalPass: null,
    normalTexture: null,
    renderBefore: () => {
        console.log('Log-- ', 890, '890');
    },
    ...PoissionDenoisePass.DefaultOptions
};
export class AOEffect extends Effect {
    constructor(composer, camera, scene, aoPass, options = defaultAOOptions) {
        super("AOEffect", ao_compose, {
            type: "FinalAOMaterial",
            uniforms: new Map([
                ["inputTexture", new Uniform(null)],
                ["depthTexture", new Uniform(null)],
                ["power", new Uniform(0)],
                ["color", new Uniform(new Color("black"))],
                ["brightnessThreshold", new Uniform(0.7)]
            ])
        });
        this.lastSize = {
            width: 0,
            height: 0,
            resolutionScale: 0
        };
        this.composer = composer;
        this.aoPass = aoPass;
        options = {
            ...defaultAOOptions,
            ...options
        }; // set up depth texture
        this.options = options
        this.scene = scene

        // 初始化Selection对象（如果没有提供）并存储为私有变量
        this._ignoreSelection = options.ignoreSelection || new Selection();

        // 存储原始发光值的映射
        this.originalEmissives = new Map();

        console.log('Log-- ', composer.depthTexture, 'composer.depthTexture');

        if (!composer.depthTexture) composer.createDepthTexture();
        this.aoPass.fullscreenMaterial.uniforms.depthTexture.value = composer.depthTexture;
        this.uniforms.get("depthTexture").value = composer.depthTexture; // set up optional normal texture

        if (options.useNormalPass || options.normalTexture) {
            var _options$normalTextur;

            if (options.useNormalPass) this.normalPass = new NormalPass(scene, camera);
            const normalTexture = (_options$normalTextur = options.normalTexture) !== null && _options$normalTextur !== void 0 ? _options$normalTextur : this.normalPass.texture;
            this.aoPass.fullscreenMaterial.uniforms.normalTexture.value = normalTexture;
            this.aoPass.fullscreenMaterial.defines.useNormalTexture = "";
        }

        this.poissionDenoisePass = new PoissionDenoisePass(camera, this.aoPass.texture, composer.depthTexture);
        this.makeOptionsReactive(options);
        // scene.traverse(object => {
        //     if (object.isMesh) {
        //         object.visible = true;
        //     }
        // });

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
                            console.log('Log-- ', value, 'value');
                            this.uniforms.get("color").value.copy(new Color(value));
                            break;

                        case "brightnessThreshold":
                            this.uniforms.get("brightnessThreshold").value = value;
                            break;

                        case "ignoreSelection":
                            // 更新Selection对象，但使用私有变量避免递归
                            this._ignoreSelection = value || new Selection();
                            break;

                        case "highlightValue":
                            // 更新高亮值
                            break;
                        // denoiser

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
            }); // apply all uniforms and defines

            this[key] = options[key];
        }
    }

    setSize(width, height) {
        var _this$normalPass;

        if (width === undefined || height === undefined) return;

        if (width === this.lastSize.width && height === this.lastSize.height && this.resolutionScale === this.lastSize.resolutionScale) {
            return;
        }

        (_this$normalPass = this.normalPass) == null ? void 0 : _this$normalPass.setSize(width, height);
        this.aoPass.setSize(width * this.resolutionScale, height * this.resolutionScale);
        this.poissionDenoisePass.setSize(width, height);
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


    update(renderer, input, out) {
        var _this$normalPass2;


        // 在渲染AO效果前，设置忽略对象的高亮
        if (this._ignoreSelection) {
            // 使用辅助方法获取选中的对象
            const selectionItems = this.getSelectionItems();

            // 对每个被选中的物体应用高亮效果
            selectionItems.forEach(object => {
                this.setObjectHighlight(object, true);
            });
        }
        this.options?.renderBefore?.(this.scene)

        // check if TRAA is being used so we can animate the noise
        const hasTRAA = this.composer.passes.some(pass => {
            var _pass$effects;

            return pass.enabled && !pass.skipRendering && ((_pass$effects = pass.effects) == null ? void 0 : _pass$effects.some(effect => effect instanceof TRAAEffect));
        }); // set animated noise depending on TRAA
        this.aoPass.fullscreenMaterial.needsUpdate = true;
        if (hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {
            this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
            this.aoPass.fullscreenMaterial.needsUpdate = true;
        } else if (!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {
            delete this.aoPass.fullscreenMaterial.defines.animatedNoise;

        } // set input texture
        if (this.iterations > 0) {
            this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
        } else {
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
        }

        (_this$normalPass2 = this.normalPass) == null ? void 0 : _this$normalPass2.render(renderer);

        // 渲染AO效果
        this.aoPass.render(renderer);
        this.poissionDenoisePass.render(renderer);

        // 在渲染完成后，恢复忽略对象的原始亮度
        if (this._ignoreSelection) {
            // 使用辅助方法获取选中的对象
            const selectionItems = this.getSelectionItems();

            // 恢复每个被选中的物体的原始亮度
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

        console.log('Log-- ', object, highlight, 'object,highlight');
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