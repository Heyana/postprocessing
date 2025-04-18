import { SSAOPass } from "../../index"
import { Vector3 } from "run-scene-core"
import { SelectiveAOEffect } from "./SelectiveAOEffect"
function getPointsOnSphere(n) {
    const points = [];
    const inc = Math.PI * (3 - Math.sqrt(5));
    const off = 2 / n;

    for (let k = 0; k < n; k++) {
        const y = k * off - 1 + off / 2;
        const r = Math.sqrt(1 - y * y);
        const phi = k * inc;
        points.push(new Vector3(Math.cos(phi) * r, y, Math.sin(phi) * r));
    }

    return points;
}

export class SelectiveSSAOEffect extends SelectiveAOEffect {
    constructor(composer, camera, scene, options = {
    }) {
        SelectiveAOEffect.DefaultOptions = {
            ...SelectiveAOEffect.DefaultOptions,
            ...{
                spp: 16,
                distance: 1,
                distancePower: 0.25,
                power: 2,

            }
        };
        options = {
            ...SelectiveSSAOEffect.DefaultOptions,
            ...options
        };
        const aoPass = new SSAOPass(camera, scene);
        super(composer, camera, scene, aoPass, options);
    }

    makeOptionsReactive(options) {
        super.makeOptionsReactive(options);
        for (const key of ["spp"]) {
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
                            const samples = getPointsOnSphere(value);
                            const samplesR = [];

                            for (let i = 0; i < value; i++) {
                                samplesR.push((i + 1) / value);
                            }

                            this.aoPass.fullscreenMaterial.uniforms.samples = {
                                value: samples
                            };
                            this.aoPass.fullscreenMaterial.uniforms.samplesR = {
                                value: samplesR
                            };
                            this.aoPass.fullscreenMaterial.needsUpdate = true;
                            break;
                    }
                },
                configurable: true
            });
        }
        this.spp = options["spp"];
    }

}
