
import {
    Pass
} from 'postprocessing'
import {
    ShaderMaterial,
    Matrix4,
    Vector2,
    HalfFloatType,
    NoColorSpace, WebGLRenderTarget, TextureLoader, NearestFilter, RepeatWrapping,
} from 'run-scene-core'

import {
    sampleBlueNoise, generateDenoiseSamples, generatePoissonDiskConstant
} from '../../index'
import { blueNoiseBase64 } from 'src/libs/realism-effects/src/utils/TextureAssets';

var fragmentShader$2 = "#define GLSLIFY 1\nvarying vec2 vUv;uniform sampler2D inputTexture;uniform sampler2D depthTexture;uniform sampler2D normalTexture;uniform mat4 projectionMatrixInverse;uniform mat4 cameraMatrixWorld;uniform float lumaPhi;uniform float depthPhi;uniform float normalPhi;uniform sampler2D blueNoiseTexture;uniform vec2 blueNoiseRepeat;uniform int index;uniform vec2 resolution;\n#include <common>\n#include <sampleBlueNoise>\nvec3 getWorldPos(float depth,vec2 coord){float z=depth*2.0-1.0;vec4 clipSpacePosition=vec4(coord*2.0-1.0,z,1.0);vec4 viewSpacePosition=projectionMatrixInverse*clipSpacePosition;vec4 worldSpacePosition=cameraMatrixWorld*viewSpacePosition;worldSpacePosition.xyz/=worldSpacePosition.w;return worldSpacePosition.xyz;}\n#define luminance(a) dot(vec3(0.2125, 0.7154, 0.0721), a)\nvec3 getNormal(vec2 uv,vec4 texel){\n#ifdef NORMAL_IN_RGB\nreturn texel.rgb;\n#else\nreturn normalize(textureLod(normalTexture,uv,0.).xyz*2.0-1.0);\n#endif\n}float distToPlane(const vec3 worldPos,const vec3 neighborWorldPos,const vec3 worldNormal){vec3 toCurrent=worldPos-neighborWorldPos;float distToPlane=abs(dot(toCurrent,worldNormal));return distToPlane;}void main(){vec4 depthTexel=textureLod(depthTexture,vUv,0.);if(depthTexel.r==1.0||dot(depthTexel.rgb,depthTexel.rgb)==0.){discard;return;}vec4 texel=textureLod(inputTexture,vUv,0.0);vec3 normal=getNormal(vUv,texel);\n#ifdef NORMAL_IN_RGB\nfloat denoised=texel.a;float center=texel.a;\n#else\nvec3 denoised=texel.rgb;float center=texel.rgb;\n#endif\nfloat depth=depthTexel.x;vec3 worldPos=getWorldPos(depth,vUv);float totalWeight=1.0;vec4 blueNoise=sampleBlueNoise(blueNoiseTexture,0,blueNoiseRepeat,resolution);float angle=blueNoise[index];float s=sin(angle),c=cos(angle);mat2 rotationMatrix=mat2(c,-s,s,c);for(int i=0;i<samples;i++){vec2 offset=rotationMatrix*poissonDisk[i];vec2 neighborUv=vUv+offset;vec4 neighborTexel=textureLod(inputTexture,neighborUv,0.0);vec3 neighborNormal=getNormal(neighborUv,neighborTexel);float neighborColor=neighborTexel.a;float sampleDepth=textureLod(depthTexture,neighborUv,0.0).x;vec3 worldPosSample=getWorldPos(sampleDepth,neighborUv);float tangentPlaneDist=abs(dot(worldPos-worldPosSample,normal));float normalDiff=dot(normal,neighborNormal);float normalSimilarity=pow(max(normalDiff,0.),normalPhi);\n#ifdef NORMAL_IN_RGB\nfloat lumaDiff=abs(neighborColor-center);\n#else\nfloat lumaDiff=abs(luminance(neighborColor)-luminance(center));\n#endif\nfloat lumaSimilarity=max(1.0-lumaDiff/lumaPhi,0.0);float depthDiff=1.-distToPlane(worldPos,worldPosSample,normal);float depthSimilarity=max(depthDiff/depthPhi,0.);float w=lumaSimilarity*depthSimilarity*normalSimilarity;denoised+=w*neighborColor;totalWeight+=w;}if(totalWeight>0.)denoised/=totalWeight;\n#ifdef NORMAL_IN_RGB\ngl_FragColor=vec4(normal,denoised);\n#else\ngl_FragColor=vec4(denoised,1.);\n#endif\n}"; // eslint-disable-line

var vertexShader = "#define GLSLIFY 1\nvarying vec2 vUv;void main(){vUv=position.xy*0.5+0.5;gl_Position=vec4(position.xy,1.0,1.0);}"; // eslint-disable-line


const finalFragmentShader$1 = fragmentShader$2.replace("#include <sampleBlueNoise>", sampleBlueNoise);
const defaultPoissonBlurOptions = {
    iterations: 1,
    radius: 8,
    rings: 5.625,
    lumaPhi: 10,
    depthPhi: 2,
    normalPhi: 3.25,
    samples: 16,
    normalTexture: null
};
export class PoissionDenoisePass extends Pass {
    constructor(camera, inputTexture, depthTexture, options = defaultPoissonBlurOptions) {
        super("PoissionBlurPass");
        this.iterations = defaultPoissonBlurOptions.iterations;
        this.index = 0;
        options = {
            ...defaultPoissonBlurOptions,
            ...options
        };
        this.inputTexture = inputTexture;
        this.fullscreenMaterial = new ShaderMaterial({
            fragmentShader: finalFragmentShader$1,
            vertexShader,
            uniforms: {
                depthTexture: {
                    value: null
                },
                inputTexture: {
                    value: null
                },
                projectionMatrixInverse: {
                    value: new Matrix4()
                },
                cameraMatrixWorld: {
                    value: new Matrix4()
                },
                lumaPhi: {
                    value: 5.0
                },
                depthPhi: {
                    value: 5.0
                },
                normalPhi: {
                    value: 5.0
                },
                resolution: {
                    value: new Vector2()
                },
                blueNoiseTexture: {
                    value: null
                },
                index: {
                    value: 0
                },
                blueNoiseRepeat: {
                    value: new Vector2()
                }
            }
        });
        const renderTargetOptions = {
            type: HalfFloatType,
            depthBuffer: false
        };
        this.renderTargetA = new WebGLRenderTarget(1, 1, renderTargetOptions);
        this.renderTargetB = new WebGLRenderTarget(1, 1, renderTargetOptions);
        const {
            uniforms
        } = this.fullscreenMaterial;
        uniforms["inputTexture"].value = this.inputTexture;
        uniforms["depthTexture"].value = depthTexture;
        uniforms["projectionMatrixInverse"].value = camera.projectionMatrixInverse;
        uniforms["cameraMatrixWorld"].value = camera.matrixWorld;
        uniforms["depthPhi"].value = options.depthPhi;
        uniforms["normalPhi"].value = options.normalPhi;

        if (options.normalTexture) {
            uniforms["normalTexture"].value = options.normalTexture;
        } else {
            this.fullscreenMaterial.defines.NORMAL_IN_RGB = "";
        } // these properties need the shader to be recompiled


        for (const prop of ["radius", "rings", "samples"]) {
            Object.defineProperty(this, prop, {
                get: () => options[prop],
                set: value => {
                    options[prop] = value;
                    this.setSize(this.renderTargetA.width, this.renderTargetA.height);
                }
            });
        }

        new TextureLoader().load(blueNoiseBase64, blueNoiseTexture => {
            blueNoiseTexture.minFilter = NearestFilter;
            blueNoiseTexture.magFilter = NearestFilter;
            blueNoiseTexture.wrapS = RepeatWrapping;
            blueNoiseTexture.wrapT = RepeatWrapping;
            blueNoiseTexture.colorSpace = NoColorSpace;
            this.fullscreenMaterial.uniforms.blueNoiseTexture.value = blueNoiseTexture;
        });
    }

    setSize(width, height) {
        this.renderTargetA.setSize(width, height);
        this.renderTargetB.setSize(width, height);
        this.fullscreenMaterial.uniforms.resolution.value.set(width, height);
        const poissonDisk = generateDenoiseSamples(this.samples, this.rings, this.radius, new Vector2(1 / width, 1 / height));
        const sampleDefine = `const int samples = ${this.samples};\n`;
        const poissonDiskConstant = generatePoissonDiskConstant(poissonDisk);
        this.fullscreenMaterial.fragmentShader = sampleDefine + poissonDiskConstant + "\n" + finalFragmentShader$1;
        this.fullscreenMaterial.needsUpdate = true;
    }
    get texture() {
        return this.renderTargetB.texture;
    }
    render(renderer) {
        this.fullscreenMaterial.uniforms.index.value = 0;
        const noiseTexture = this.fullscreenMaterial.uniforms.blueNoiseTexture.value;

        if (noiseTexture) {
            const {
                width,
                height
            } = noiseTexture.source.data;
            this.fullscreenMaterial.uniforms.blueNoiseRepeat.value.set(this.renderTargetA.width / width, this.renderTargetA.height / height);
        }

        for (let i = 0; i < 2 * this.iterations; i++) {
            const horizontal = i % 2 === 0;
            const inputRenderTarget = horizontal ? this.renderTargetB : this.renderTargetA;
            this.fullscreenMaterial.uniforms["inputTexture"].value = i === 0 ? this.inputTexture : inputRenderTarget.texture;
            const renderTarget = horizontal ? this.renderTargetA : this.renderTargetB;
            renderer.setRenderTarget(renderTarget);
            renderer.render(this.scene, this.camera);
            this.fullscreenMaterial.uniforms.index.value = (this.fullscreenMaterial.uniforms.index.value + 1) % 4;
        }
    }

}
PoissionDenoisePass.DefaultOptions = defaultPoissonBlurOptions;