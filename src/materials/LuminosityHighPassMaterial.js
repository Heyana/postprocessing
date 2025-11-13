import { Color, NoBlending, ShaderMaterial, Uniform } from "three";

import fragmentShader from "./glsl/luminosity-high-pass.frag";
import vertexShader from "./glsl/common.vert";

/**
 * A luminosity high pass material.
 *
 * Based on UnrealBloomPass LuminosityHighPassShader.
 */

export class LuminosityHighPassMaterial extends ShaderMaterial {

    /**
     * Constructs a new luminosity high pass material.
     */

    constructor() {

        super({
            name: "LuminosityHighPassMaterial",
            uniforms: {
                tDiffuse: new Uniform(null),
                luminosityThreshold: new Uniform(1.0),
                smoothWidth: new Uniform(1.0),
                defaultColor: new Uniform(new Color(0x000000)),
                defaultOpacity: new Uniform(0.0)
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

