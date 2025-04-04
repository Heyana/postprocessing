import { Effect, NormalPass } from "postprocessing"
import { Color, Uniform } from "three"
import { TRAAEffect } from '../../index'
import { PoissionDenoisePass } from '../pass/PoissionDenoisePass'
import ao_compose from './shader/ao_compose_origin.frag'
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
    ...PoissionDenoisePass.DefaultOptions
};

class AOEffect extends Effect {
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

        // check if TRAA is being used so we can animate the noise
        const hasTRAA = this.composer.passes.some(pass => {
            var _pass$effects;

            return pass.enabled && !pass.skipRendering && ((_pass$effects = pass.effects) == null ? void 0 : _pass$effects.some(effect => effect instanceof TRAAEffect));
        }); // set animated noise depending on TRAA

        if (hasTRAA && !("animatedNoise" in this.aoPass.fullscreenMaterial.defines)) {
            this.aoPass.fullscreenMaterial.defines.animatedNoise = "";
            this.aoPass.fullscreenMaterial.needsUpdate = true;
        } else if (!hasTRAA && "animatedNoise" in this.aoPass.fullscreenMaterial.defines) {
            delete this.aoPass.fullscreenMaterial.defines.animatedNoise;
            this.aoPass.fullscreenMaterial.needsUpdate = true;
        } // set input texture
        if (this.iterations > 0) {
            this.uniforms.get("inputTexture").value = this.poissionDenoisePass.texture;
        } else {
            this.uniforms.get("inputTexture").value = this.aoPass.texture;
        }

        (_this$normalPass2 = this.normalPass) == null ? void 0 : _this$normalPass2.render(renderer);
        this.aoPass.render(renderer);
        this.poissionDenoisePass.render(renderer);
    }

}

AOEffect.DefaultOptions = defaultAOOptions;