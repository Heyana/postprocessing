import { NoBlending, ShaderMaterial, Uniform, Vector3 } from "three";

import fragmentShader from "./glsl/unreal-bloom-composite.frag";
import vertexShader from "./glsl/common.vert";

/**
 * An UnrealBloom composite material.
 *
 * Based on UnrealBloomPass implementation.
 */

export class UnrealBloomCompositeMaterial extends ShaderMaterial {

    /**
     * Constructs a new UnrealBloom composite material.
     *
     * @param {Number} nMips - The number of MIP levels.
     */

    constructor(nMips = 5) {

        const bloomFactors = [1.0, 0.8, 0.6, 0.4, 0.2];
        const bloomTintColors = [
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1),
            new Vector3(1, 1, 1)
        ];

        super({
            name: "UnrealBloomCompositeMaterial",
            defines: {
                NUM_MIPS: nMips
            },
            uniforms: {
                blurTexture1: new Uniform(null),
                blurTexture2: new Uniform(null),
                blurTexture3: new Uniform(null),
                blurTexture4: new Uniform(null),
                blurTexture5: new Uniform(null),
                bloomStrength: new Uniform(1.0),
                bloomFactors: new Uniform(bloomFactors),
                bloomTintColors: new Uniform(bloomTintColors),
                bloomRadius: new Uniform(0.0)
            },
            blending: NoBlending,
            toneMapped: false,
            depthWrite: false,
            depthTest: false,
            fragmentShader,
            vertexShader
        });

    }

}

