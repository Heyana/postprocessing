const GlowEffectShader = {
    uniforms: {
        'baseTexture': { value: null },
        'bloomTexture': { value: null },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        
        varying vec2 vUv;
        
        void main() {
            vec4 lastColor = texture2D(baseTexture, vUv);
            
            // gl_FragColor = lastColor;
            // gl_FragColor = texture2D(bloomTexture, vUv);
            gl_FragColor = lastColor + texture2D(bloomTexture, vUv);
        }
    `,
};
export { GlowEffectShader };
