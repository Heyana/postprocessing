/* eslint-disable camelcase */
import { Pass } from "postprocessing"
import { FloatType, NearestFilter, NoBlending, ShaderMaterial, WebGLRenderTarget } from "three"
import gbuffer_packing from "../../gbuffer/shader/gbuffer_packing.glsl"
import basicVertexShader from "../../utils/shader/basic.vert"
import ssgi_poisson_compose_functions from "../shader/denoiser_compose_functions.glsl"

export class DenoiserComposePass extends Pass {
	constructor(camera, textures, gBufferTexture, depthTexture, options = {}) {
		super("DenoiserComposePass")

		this._camera = camera

		this.renderTarget = new WebGLRenderTarget(1, 1, {
			depthBuffer: false,
			type: FloatType,
			minFilter: NearestFilter,
			magFilter: NearestFilter
		})

		this.renderTarget.texture.name = "DenoiserComposePass.Texture"

		let diffuseGiTexture
		let specularGiTexture

		// 保存原始纹理引用，用于更新
		this.originalTextures = textures;
		this.options = options;

		// 添加计数器以跟踪更新次数
		this._updateCount = 0;

		if (options.inputType === "diffuseSpecular") {
			diffuseGiTexture = textures[0]
			specularGiTexture = textures[1]
		} else if (options.inputType === "diffuse") {
			diffuseGiTexture = textures[0]
		} else if (options.inputType === "specular") {
			specularGiTexture = textures[0]
		}

		this.fullscreenMaterial = new ShaderMaterial({
			fragmentShader: /* glsl */ `
            varying vec2 vUv;
            uniform sampler2D sceneTexture;
            uniform highp sampler2D depthTexture;
            uniform sampler2D diffuseGiTexture;
            uniform sampler2D specularGiTexture;
            uniform mat4 cameraMatrixWorld;
            uniform mat4 projectionMatrix;
            uniform mat4 projectionMatrixInverse;
			uniform float cameraNear;
			uniform float cameraFar;

            #include <common>
            #include <packing>

			#define TYPE_DIFFUSE_SPECULAR 0
			#define TYPE_DIFFUSE 1
			#define TYPE_SPECULAR 2

            ${gbuffer_packing}
            ${ssgi_poisson_compose_functions}

            void main() {
                float depth = textureLod(depthTexture, vUv, 0.).r;

				if(depth == 1. && fwidth(depth) == 0.){
					discard;
					return;
				}

				// 防止天空或者无效像素

                Material mat = getMaterial(gBufferTexture, vUv);

                vec3 viewNormal = (vec4(mat.normal, 0.) * cameraMatrixWorld).xyz;

				float viewZ = -getViewZ(depth);

                // view-space position of the current texel
				vec3 viewPos = getViewPosition(viewZ);
                vec3 viewDir = normalize(viewPos);

                // 添加纹理有效性检查
                vec4 diffuseGi = vec4(0.0);
                vec4 specularGi = vec4(0.0);
                
                // 尝试读取纹理，如果纹理无效则使用默认值
                bool hasDiffuse = false;
                bool hasSpecular = false;
                
                #if inputType == TYPE_DIFFUSE_SPECULAR || inputType == TYPE_DIFFUSE
                    diffuseGi = textureLod(diffuseGiTexture, vUv, 0.);
                    hasDiffuse = true;
                #endif
                
                #if inputType == TYPE_DIFFUSE_SPECULAR || inputType == TYPE_SPECULAR
                    specularGi = textureLod(specularGiTexture, vUv, 0.);
                    hasSpecular = true;
                #endif
                
                // 如果纹理读取为NaN或INF，则使用安全的默认值
                if(hasDiffuse && (any(isnan(diffuseGi.rgb)) || any(isinf(diffuseGi.rgb)))) {
                    diffuseGi = vec4(0.0, 0.0, 0.0, 1.0);
                }
                
                if(hasSpecular && (any(isnan(specularGi.rgb)) || any(isinf(specularGi.rgb)))) {
                    specularGi = vec4(0.0, 0.0, 0.0, 1.0);
                }
                
                // 限制输入值范围，防止极端值
                diffuseGi.rgb = clamp(diffuseGi.rgb, vec3(0.0), vec3(10.0));
                specularGi.rgb = clamp(specularGi.rgb, vec3(0.0), vec3(10.0));

                vec3 gi = constructGlobalIllumination(diffuseGi.rgb, specularGi.rgb, viewDir, viewNormal, mat.diffuse.rgb, mat.emissive, mat.roughness, mat.metalness);

				gl_FragColor = vec4(gi, 1.);
            }
            `,
			vertexShader: basicVertexShader,
			uniforms: {
				sceneTexture: { value: null },
				viewMatrix: { value: camera.matrixWorldInverse },
				cameraMatrixWorld: { value: camera.matrixWorld },
				projectionMatrix: { value: camera.projectionMatrix },
				projectionMatrixInverse: { value: camera.projectionMatrixInverse },
				cameraNear: { value: camera.near },
				cameraFar: { value: camera.far },
				gBufferTexture: { value: gBufferTexture },
				depthTexture: { value: depthTexture },
				diffuseGiTexture: { value: diffuseGiTexture },
				specularGiTexture: { value: specularGiTexture }
			},
			defines: {
				inputType: ["diffuseSpecular", "diffuse", "specular"].indexOf(options.inputType) ?? 0
			},
			blending: NoBlending,
			depthWrite: false,
			depthTest: false,
			toneMapped: false
		})

		if (camera.isPerspectiveCamera) this.fullscreenMaterial.defines.PERSPECTIVE_CAMERA = ""
	}

	// 更新纹理引用
	updateTextures(textures) {
		if (!textures) return;

		// 更新内部保存的纹理引用
		this.originalTextures = textures;

		// 根据输入类型重新分配纹理
		if (this.options.inputType === "diffuseSpecular") {
			this.fullscreenMaterial.uniforms.diffuseGiTexture.value = textures[0];
			this.fullscreenMaterial.uniforms.specularGiTexture.value = textures[1];
		} else if (this.options.inputType === "diffuse") {
			this.fullscreenMaterial.uniforms.diffuseGiTexture.value = textures[0];
		} else if (this.options.inputType === "specular") {
			this.fullscreenMaterial.uniforms.specularGiTexture.value = textures[0];
		}

		// 递增更新计数并在第一次或过于频繁时记录
		this._updateCount++;
		if (this._updateCount === 1 || this._updateCount % 10 === 0) {
			console.log("DenoiserComposePass: 更新纹理引用 (次数: " + this._updateCount + ")");
		}
	}

	get texture() {
		return this.renderTarget.texture
	}

	dispose() {
		this.renderTarget.dispose()
	}

	setSize(width, height) {
		this.renderTarget.setSize(width, height)
	}

	setSceneTexture(texture) {
		this.fullscreenMaterial.uniforms.sceneTexture.value = texture
	}

	render(renderer) {
		// 不再每帧检查纹理引用，改为依赖Denoiser类手动触发updateTextures方法

		this.fullscreenMaterial.uniforms.cameraNear.value = this._camera.near
		this.fullscreenMaterial.uniforms.cameraFar.value = this._camera.far

		renderer.setRenderTarget(this.renderTarget)
		renderer.render(this.scene, this.camera)
	}
}
