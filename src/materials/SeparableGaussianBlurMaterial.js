import { NoBlending, ShaderMaterial, Uniform, Vector2 } from "three";

import fragmentShader from "./glsl/separable-gaussian-blur.frag";
import vertexShader from "./glsl/common.vert";

/**
 * A separable Gaussian blur material.
 *
 * Based on UnrealBloomPass implementation.
 */

export class SeparableGaussianBlurMaterial extends ShaderMaterial {

    /**
     * Constructs a new separable Gaussian blur material.
     *
     * @param {Number} kernelRadius - The kernel radius.
     */

    constructor(kernelRadius) {

        const coefficients = [];

        for (let i = 0; i < kernelRadius; i++) {

            coefficients.push(0.39894 * Math.exp(-0.5 * i * i / (kernelRadius * kernelRadius)) / kernelRadius);

        }

        super({
            name: "SeparableGaussianBlurMaterial",
            defines: {
                KERNEL_RADIUS: kernelRadius
            },
            uniforms: {
                colorTexture: new Uniform(null),
                invSize: new Uniform(new Vector2(0.5, 0.5)),
                direction: new Uniform(new Vector2(0.5, 0.5)),
                gaussianCoefficients: new Uniform(coefficients)
            },
            blending: NoBlending,
            toneMapped: false,
            depthWrite: false,
            depthTest: false,
            fragmentShader,
            vertexShader
        });

    }

    /**
     * Sets the size of this object.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */

    setSize(width, height) {

        this.uniforms.invSize.value.set(1.0 / width, 1.0 / height);

    }

}

