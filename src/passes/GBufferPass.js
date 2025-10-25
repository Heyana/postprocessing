import {
    Color,
    GLSL3,
    NearestFilter,
    FloatType,
    RawShaderMaterial,
    WebGLRenderTarget,
    Vector2,
    Matrix4,
    Matrix3
} from "three";

import { Pass } from "./Pass.js";
import { ClearPass } from "./ClearPass.js";

/**
 * G-Buffer Pass for Multiple Render Targets (MRT)
 * 
 * Renders scene geometry to multiple textures simultaneously:
 * - gColor: Base color information
 * - gNormal: View-space normals
 * - gDepth: Linear depth values  
 * - gPosition: View-space positions
 */
export class GBufferPass extends Pass {

    /**
     * Constructs a new G-Buffer pass.
     *
     * @param {Scene} scene - The scene to render.
     * @param {Camera} camera - The camera to use for rendering.
     * @param {Object} [options] - Additional options.
     * @param {Number} [options.resolutionScale=1.0] - The resolution scale.
     */
    constructor(scene, camera, { resolutionScale = 1.0 } = {}) {

        super("GBufferPass");

        this.needsSwap = false;
        this.needsDepthTexture = false;

        /**
         * The scene to render.
         *
         * @type {Scene}
         */
        this.scene = scene;

        /**
         * The camera.
         *
         * @type {Camera}
         */
        this.camera = camera;

        /**
         * The resolution scale.
         *
         * @type {Number}
         */
        this.resolutionScale = resolutionScale;

        /**
         * The G-Buffer render target (MRT).
         *
         * @type {WebGLRenderTarget}
         */
        this.gBufferRenderTarget = null;

        /**
         * A clear pass.
         *
         * @type {ClearPass}
         * @readonly
         */
        this.clearPass = new ClearPass();

        /**
         * 不需要swap，类似RenderPass
         */
        this.needsSwap = false;


        /**
         * G-Buffer material template.
         *
         * @type {RawShaderMaterial}
         * @private
         */
        this.gBufferMaterial = this.createGBufferMaterial();

    }

    /**
     * Creates the G-Buffer shader material.
     *
     * @returns {RawShaderMaterial} The G-Buffer material.
     * @private
     */
    createGBufferMaterial() {

        const vertexShader = /* glsl */`
			in vec3 position;
			in vec3 normal;
			in vec2 uv;

			out vec3 vNormal;
			out vec3 vViewPosition;
			out vec2 vUv;
			out float vDepth;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;
			uniform mat4 modelMatrix;
			uniform mat3 normalMatrix;
			uniform float cameraNear;
			uniform float cameraFar;

			void main() {
				vUv = uv;
				
				// 计算视图空间位置
				vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
				vViewPosition = mvPosition.xyz;
				
				// 计算世界空间法线
				vec3 transformedNormal = normalMatrix * normal;
				vNormal = normalize(transformedNormal);
				
				// 计算归一化深度 (0=near, 1=far)
				vDepth = (-mvPosition.z - cameraNear) / (cameraFar - cameraNear);
				vDepth = clamp(vDepth, 0.0, 1.0);
				
				gl_Position = projectionMatrix * mvPosition;
			}
		`;

        const fragmentShader = /* glsl */`
			precision highp float;
			precision highp int;

			// MRT 输出：同时输出到4个纹理
			layout(location = 0) out vec4 gColor;    // 颜色 + metalness (alpha)
			layout(location = 1) out vec4 gNormal;   // 法线 + roughness (alpha)
			layout(location = 2) out vec4 gDepth;    // 深度
			layout(location = 3) out vec4 gPosition; // 位置

			in vec3 vNormal;
			in vec3 vViewPosition;
			in vec2 vUv;
			in float vDepth;

			// 使用默认的材质属性
			uniform vec3 diffuse;
			uniform float metalness;
			uniform float roughness;

			void main() {
				// 基础颜色 - 使用uniform提供的默认值
				vec3 baseColor = diffuse;

				// 金属度
				float metallicValue = metalness;

				// 粗糙度  
				float roughnessValue = roughness;

				// 输出1：基础颜色 + metalness (在alpha通道)
				gColor = vec4(baseColor, metallicValue);
				
				// 输出2：视图空间法线 + roughness (在alpha通道)
				gNormal = vec4(normalize(vNormal) * 0.5 + 0.5, roughnessValue);
				
				// 输出3：归一化深度（只使用R通道）
				gDepth = vec4(vDepth, vDepth, vDepth, 1.0);
				
				// 输出4：视图空间位置
				gPosition = vec4(vViewPosition, 1.0);
			}
		`;

        return new RawShaderMaterial({
            name: 'G-Buffer Material',
            vertexShader,
            fragmentShader,
            uniforms: {
                // RawShaderMaterial需要手动提供所有uniform，包括Three.js内置uniform
                diffuse: { value: new Color(1, 1, 1) },
                metalness: { value: 0.0 },
                roughness: { value: 1.0 },
                cameraNear: { value: 0.1 },
                cameraFar: { value: 100 },

                // Three.js内置uniform - RawShaderMaterial需要手动提供
                modelViewMatrix: { value: new Matrix4() },
                projectionMatrix: { value: new Matrix4() },
                modelMatrix: { value: new Matrix4() },
                normalMatrix: { value: new Matrix3() }
            },
            defines: {
                // 这些defines会根据材质属性自动设置
            },
            glslVersion: GLSL3
        });

    }

    /**
     * Returns the G-Buffer textures.
     *
     * @returns {Object} An object containing the G-Buffer textures.
     */
    getGBufferTextures() {

        if (!this.gBufferRenderTarget) {
            return null;
        }

        return {
            gColor: this.gBufferRenderTarget.textures[0],
            gNormal: this.gBufferRenderTarget.textures[1],
            gDepth: this.gBufferRenderTarget.textures[2],
            gPosition: this.gBufferRenderTarget.textures[3]
        };

    }

    /**
     * 获取renderToScreen属性
     */
    get renderToScreen() {
        return super.renderToScreen;
    }

    /**
     * 设置renderToScreen属性
     */
    set renderToScreen(value) {
        super.renderToScreen = value;
        this.clearPass.renderToScreen = value;
    }

    /**
     * 准备G-Buffer材质用于override渲染
     * 使用更高效的方法，不需要修改场景中的所有材质
     *
     * @private
     */
    prepareGBufferMaterial() {

        // 更新相机参数
        this.gBufferMaterial.uniforms.cameraNear.value = this.camera.near;
        this.gBufferMaterial.uniforms.cameraFar.value = this.camera.far;

        // 更新相机矩阵 - RawShaderMaterial需要手动提供
        this.gBufferMaterial.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);

        // 设置默认材质属性值 - 提供可见的基础颜色
        this.gBufferMaterial.uniforms.diffuse.value.set(0.8, 0.8, 0.8); // 浅灰色，确保可见
        this.gBufferMaterial.uniforms.metalness.value = 0.1;
        this.gBufferMaterial.uniforms.roughness.value = 0.8;

        console.log("🎨 GBufferPass: 准备G-Buffer材质，使用RawShaderMaterial");
        console.log("  - 相机near/far:", this.camera.near, this.camera.far);
        console.log("  - 投影矩阵已更新");

    }

    /**
     * Renders the G-Buffer.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {WebGLRenderTarget} outputBuffer - A frame buffer that serves as the output render target unless this pass renders to screen.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     * @param {Boolean} [stencilTest] - Indicates whether a stencil mask is active.
     */
    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest) {

        const currentRenderTarget = renderer.getRenderTarget();
        const currentXrEnabled = renderer.xr.enabled;
        const currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;
        const originalOverrideMaterial = this.scene.overrideMaterial;

        // 保存场景状态（参考RenderPass的逻辑）
        const background = this.scene.background;

        // 禁用XR和阴影自动更新
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;

        // 1. 渲染正常场景到输出缓冲区（像RenderPass一样）
        const renderTarget = this.renderToScreen ? null : outputBuffer;

        // 使用ClearPass清屏（参考RenderPass）
        if (this.clearPass.enabled) {
            this.clearPass.render(renderer, outputBuffer);
        }

        renderer.setRenderTarget(renderTarget);

        // 使用原始材质渲染正常场景（不使用overrideMaterial）
        renderer.render(this.scene, this.camera);

        // 2. 渲染G-Buffer数据（用于SSR等后续效果）
        this.prepareGBufferMaterial();

        // 重要：RawShaderMaterial需要手动更新矩阵uniform
        // 使用overrideMaterial时Three.js会自动为每个对象更新这些矩阵
        this.gBufferMaterial.uniformsNeedUpdate = true;

        this.scene.overrideMaterial = this.gBufferMaterial;

        renderer.setRenderTarget(this.gBufferRenderTarget);
        renderer.clear();
        renderer.render(this.scene, this.camera);

        // 恢复场景的原始overrideMaterial
        this.scene.overrideMaterial = originalOverrideMaterial;

        // 恢复渲染器状态
        renderer.xr.enabled = currentXrEnabled;
        renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
        renderer.setRenderTarget(currentRenderTarget);

    }


    /**
     * Updates the size of this pass.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {

        const effectiveWidth = Math.max(1, Math.floor(width * this.resolutionScale));
        const effectiveHeight = Math.max(1, Math.floor(height * this.resolutionScale));

        // 创建或更新G-Buffer渲染目标
        if (this.gBufferRenderTarget) {
            this.gBufferRenderTarget.dispose();
        }

        this.gBufferRenderTarget = new WebGLRenderTarget(effectiveWidth, effectiveHeight, {
            count: 4, // 创建4个纹理附件
            minFilter: NearestFilter,
            magFilter: NearestFilter,
            type: FloatType
        });

        // 命名纹理方便调试
        this.gBufferRenderTarget.textures[0].name = 'gColor';
        this.gBufferRenderTarget.textures[1].name = 'gNormal';
        this.gBufferRenderTarget.textures[2].name = 'gDepth';
        this.gBufferRenderTarget.textures[3].name = 'gPosition';

    }

    /**
     * Performs initialization tasks.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
     * @param {Number} frameBufferType - The type of the main frame buffers.
     */
    initialize(renderer, alpha, frameBufferType) {

        // 检查WebGL2支持
        if (!renderer.capabilities.isWebGL2) {
            console.warn("GBufferPass: WebGL 2.0 is required for Multiple Render Targets");
            return;
        }

        // 初始化时设置默认尺寸
        const size = renderer.getSize(new Vector2());
        this.setSize(size.width, size.height);

    }

    /**
     * Disposes this pass.
     */
    dispose() {

        if (this.gBufferRenderTarget) {
            this.gBufferRenderTarget.dispose();
            this.gBufferRenderTarget = null;
        }

        this.gBufferMaterial.dispose();
        this.clearPass.dispose();

    }

}
