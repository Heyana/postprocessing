import { Effect, Selection, NormalPass } from "postprocessing"
import { Color, Uniform, Layers } from "three"
import { ao_compose, TRAAEffect, PoissionDenoisePass } from '../../index'
const defaultAOOptions = {
    resolutionScale: 1,
    spp: 8,
    distance: 2,
    distancePower: 1,
    power: 2,
    bias: 40,
    thickness: 0.075,
    color: new Color("black"),
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
            uniforms: new Map([["inputTexture", new Uniform(null)], ["depthTexture", new Uniform(null)], ["power", new Uniform(0)], ["color", new Uniform(new Color("black"))]])
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
        // 添加hideSelection功能
        this.hideSelection = new Selection();

        // 为AO创建特定的层系统 - 使用31作为AO专用层
        this.aoLayerMask = new Layers();
        this.aoLayerMask.enableAll(); // 默认所有层都参与AO

        // 存储对象的原始层信息
        this.originalLayers = new Map();

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

    update(renderer, input, out) {
        var _this$normalPass2;

        this.options?.renderBefore?.(this.scene)

        // 处理hideSelection，临时将选中对象移出渲染层
        const hiddenObjects = Array.from(this.hideSelection);
        const tempDisabledLayers = new Map();

        console.log("AOEffect: 准备处理", hiddenObjects.length, "个被排除的对象");

        // 在进行AO计算前，保存并修改对象的层设置
        for (const object of hiddenObjects) {
            // 递归处理对象及其子对象
            this._processObjectAndChildren(object, tempDisabledLayers);
        }

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

        // 渲染完成后恢复原始层设置
        for (const object of hiddenObjects) {
            // 递归恢复对象及其子对象
            this._restoreObjectAndChildren(object, tempDisabledLayers);
        }
    }

    // 新增：递归处理对象及其子对象的层设置
    _processObjectAndChildren(object, tempDisabledLayers) {
        if (!object) return;

        // 处理当前对象
        if (object.isMesh || object.isGroup || object.isObject3D) {
            // 保存当前层状态
            tempDisabledLayers.set(object, object.layers.mask);

            // 完全从渲染中移除 - 对于AO计算也会被忽略
            // 使用位运算移到第1层并关闭第0层
            object.layers.set(1);
            object.layers.disable(0);

            console.log(`AOEffect: 排除对象 ${object.name || "未命名"}, 原层: ${tempDisabledLayers.get(object)}, 新层: ${object.layers.mask}`);
        }

        // 递归处理子对象
        if (object.children && object.children.length > 0) {
            for (const child of object.children) {
                this._processObjectAndChildren(child, tempDisabledLayers);
            }
        }
    }

    // 新增：递归恢复对象及其子对象的层设置
    _restoreObjectAndChildren(object, tempDisabledLayers) {
        if (!object) return;

        // 恢复当前对象
        if (object.isMesh || object.isGroup || object.isObject3D) {
            const originalMask = tempDisabledLayers.get(object);
            if (originalMask !== undefined) {
                object.layers.mask = originalMask;
                console.log(`AOEffect: 恢复对象 ${object.name || "未命名"} 到原层: ${originalMask}`);
            }
        }

        // 递归恢复子对象
        if (object.children && object.children.length > 0) {
            for (const child of object.children) {
                this._restoreObjectAndChildren(child, tempDisabledLayers);
            }
        }
    }

    // 添加新方法，用于控制对象是否参与AO计算
    excludeFromAO(object) {
        if (!object) {
            console.warn("AOEffect: 尝试排除null或undefined对象");
            return;
        }

        console.log(`AOEffect: 添加对象 ${object.name || "未命名"} 到排除列表`);
        this.hideSelection.add(object);
    }

    // 将对象恢复到AO计算中
    includeInAO(object) {
        if (!object) return;

        console.log(`AOEffect: 从排除列表中移除对象 ${object.name || "未命名"}`);
        this.hideSelection.delete(object);
    }

    // 清除所有排除项
    clearAOExclusions() {
        console.log("AOEffect: 清除所有排除项, 原排除数量:", this.hideSelection.size);
        this.hideSelection.clear();
    }
}