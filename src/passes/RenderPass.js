import { OverrideMaterialManager } from "../core/OverrideMaterialManager.js";
import { ClearPass } from "./ClearPass.js";
import { Pass } from "./Pass.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";
import { WebGLRenderTarget, RawShaderMaterial, FloatType, RGBAFormat, Vector2, Color, GLSL3, Matrix4, Matrix3, LinearFilter, HalfFloatType, ShaderMaterial, Mesh, PlaneGeometry, OrthographicCamera, Scene, DepthTexture, UnsignedShortType } from "three";
import { MRTGBufferMaterialPatcher } from "../materials/MRTGBufferMaterialPatcher.js";
import { ObjectIdManager } from "../utils/ObjectIdManager.js";

/**
 * A pass that renders a given scene into the input buffer or to screen.
 *
 * This pass uses a {@link ClearPass} to clear the target buffer.
 */

export class RenderPass extends Pass {

    isRenderPass = true;

    /**
     * Constructs a new render pass.
     *
     * @param {Scene} scene - The scene to render.
     * @param {Camera} camera - The camera to use to render the scene.
     * @param {Material} [overrideMaterial=null] - An override material.
     * @param {Object} [options={}] - Additional options.
     * @param {Boolean} [options.enableGBuffer=false] - Whether to enable G-Buffer generation.
     * @param {Number} [options.resolutionScale=1.0] - Resolution scale for G-Buffer.
     */

    constructor(scene, camera, overrideMaterial = null, options = {}) {

        super("RenderPass", scene, camera);

        this.needsSwap = false;

        // G-Buffer options
        this.enableGBuffer = options.enableGBuffer || false;
        this.resolutionScale = options.resolutionScale || 1.0;

        /**
         * A clear pass.
         *
         * @type {ClearPass}
         * @readonly
         */

        this.clearPass = new ClearPass();

        /**
         * An override material manager.
         *
         * @type {OverrideMaterialManager}
         * @private
         */

        this.overrideMaterialManager = (overrideMaterial === null) ? null : new OverrideMaterialManager(overrideMaterial);

        // G-Buffer properties
        this.gBufferRenderTarget = null;
        this.gBufferMaterial = null;

        /**
         * Object ID Manager for selective rendering
         * @type {ObjectIdManager}
         * @private
         */
        this.objectIdManager = new ObjectIdManager();

        /**
         * MRT G-Buffer Material Patcher
         * @type {MRTGBufferMaterialPatcher}
         * @private
         */
        this.gBufferPatcher = null;

        /**
         * Flag to track if scene materials have been patched
         * @type {boolean}
         * @private
         */
        this.sceneMaterialsPatched = false;

        if (this.enableGBuffer) {
            this.initializeGBuffer();
            // 初始化 G-Buffer Patcher
            this.gBufferPatcher = new MRTGBufferMaterialPatcher(this.objectIdManager);
            // 初始化复制材质和全屏四边形
            this.initializeCopyQuad();
        }

        /**
         * Indicates whether the scene background should be ignored.
         *
         * @type {Boolean}
         */

        this.ignoreBackground = false;

        /**
         * Indicates whether the shadow map auto update should be skipped.
         *
         * @type {Boolean}
         */

        this.skipShadowMapUpdate = false;

        /**
         * A selection of objects to render.
         *
         * @type {Selection}
         * @readonly
         */

        this.selection = null;


        this.useRealSize = true

    }

    set mainScene(value) {

        this.scene = value;

    }

    set mainCamera(value) {

        this.camera = value;

    }

    get renderToScreen() {

        return super.renderToScreen;

    }

    set renderToScreen(value) {

        super.renderToScreen = value;
        this.clearPass.renderToScreen = value;

    }

    /**
     * The current override material.
     *
     * @type {Material}
     */

    get overrideMaterial() {

        const manager = this.overrideMaterialManager;
        return (manager !== null) ? manager.material : null;

    }

    set overrideMaterial(value) {

        const manager = this.overrideMaterialManager;

        if (value !== null) {

            if (manager !== null) {

                manager.setMaterial(value);

            } else {

                this.overrideMaterialManager = new OverrideMaterialManager(value);

            }

        } else if (manager !== null) {

            manager.dispose();
            this.overrideMaterialManager = null;

        }

    }

    /**
     * Returns the current override material.
     *
     * @deprecated Use overrideMaterial instead.
     * @return {Material} The material.
     */

    getOverrideMaterial() {

        return this.overrideMaterial;

    }

    /**
     * Sets the override material.
     *
     * @deprecated Use overrideMaterial instead.
     * @return {Material} value - The material.
     */

    setOverrideMaterial(value) {

        this.overrideMaterial = value;

    }

    /**
     * Indicates whether the target buffer should be cleared before rendering.
     *
     * @type {Boolean}
     * @deprecated Use clearPass.enabled instead.
     */

    get clear() {

        return this.clearPass.enabled;

    }

    set clear(value) {

        this.clearPass.enabled = value;

    }

    /**
     * Returns the selection. Default is `null` (no restriction).
     *
     * @deprecated Use selection instead.
     * @return {Selection} The selection.
     */

    getSelection() {

        return this.selection;

    }

    /**
     * Sets the selection. Set to `null` to disable.
     *
     * @deprecated Use selection instead.
     * @param {Selection} value - The selection.
     */

    setSelection(value) {

        this.selection = value;

    }

    /**
     * Indicates whether the scene background is disabled.
     *
     * @deprecated Use ignoreBackground instead.
     * @return {Boolean} Whether the scene background is disabled.
     */

    isBackgroundDisabled() {

        return this.ignoreBackground;

    }

    /**
     * Enables or disables the scene background.
     *
     * @deprecated Use ignoreBackground instead.
     * @param {Boolean} value - Whether the scene background should be disabled.
     */

    setBackgroundDisabled(value) {

        this.ignoreBackground = value;

    }

    /**
     * Indicates whether the shadow map auto update is disabled.
     *
     * @deprecated Use skipShadowMapUpdate instead.
     * @return {Boolean} Whether the shadow map update is disabled.
     */

    isShadowMapDisabled() {

        return this.skipShadowMapUpdate;

    }

    /**
     * Enables or disables the shadow map auto update.
     *
     * @deprecated Use skipShadowMapUpdate instead.
     * @param {Boolean} value - Whether the shadow map auto update should be disabled.
     */

    setShadowMapDisabled(value) {

        this.skipShadowMapUpdate = value;

    }

    /**
     * Returns the clear pass.
     *
     * @deprecated Use clearPass.enabled instead.
     * @return {ClearPass} The clear pass.
     */

    getClearPass() {

        return this.clearPass;

    }

    /**
     * Renders the scene.
     *
     * @param {WebGLRenderer} renderer - The renderer.
     * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
     * @param {WebGLRenderTarget} outputBuffer - A frame buffer that serves as the output render target unless this pass renders to screen.
     * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
     * @param {Boolean} [stencilTest] - Indicates whether a stencil mask is active.
     */

    render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass, renderOpts = {}, effectPassOpts) {

        timeLog("RenderPass.render");
        const scene = this.scene;
        const camera = this.camera;
        const selection = this.selection;
        const mask = camera.layers.mask;
        const background = scene.background;
        const shadowMapAutoUpdate = renderer.shadowMap.autoUpdate;
        const renderTarget = this.renderToScreen ? null : inputBuffer;

        let renderResult = null;
        // 获取场景中第一个子对象的类名（如果存在）


        if (selection !== null) {

            camera.layers.set(selection.getLayer());

        }

        if (this.skipShadowMapUpdate) {

            renderer.shadowMap.autoUpdate = false;

        }

        if (this.ignoreBackground || this.clearPass.overrideClearColor !== null) {

            scene.background = null;

        }

        if (this.clearPass.enabled) {

            this.clearPass.render(renderer, inputBuffer);

        }

        // G-Buffer rendering using MRT Patcher (single-pass MRT approach)
        if (this.enableGBuffer && this.gBufferRenderTarget && this.gBufferPatcher) {

            // 只在第一次渲染时执行扫描和注入（优化性能）
            if (!this.sceneMaterialsPatched) {
                // 1. 扫描场景并为所有对象分配ID
                this.objectIdManager.scanScene(scene);

                // 2. 为场景中的所有材质注入MRT输出代码
                const patchCount = this.gBufferPatcher.patchScene(scene, camera);
                this.sceneMaterialsPatched = true;

                if (patchCount > 0) {
                    console.log(`✅ RenderPass: 成功注入 ${patchCount} 个材质`);
                } else {
                    console.warn("⚠️ RenderPass: 没有找到可注入的材质");
                }
            }

            // 3. 使用MRT渲染目标进行一次性渲染（同时生成G-Buffer和颜色）
            renderer.setRenderTarget(this.gBufferRenderTarget);
            renderer.clear();

            if (this.overrideMaterialManager !== null) {
                renderResult = this.overrideMaterialManager.render(renderer, scene, camera, renderOpts);
            } else {
                renderResult = renderer.render(scene, camera, renderOpts);
            }

            // 4. 将MRT的颜色输出（location 0）复制到正常的渲染目标
            // 这样后续的 pass（如 SSR）可以使用
            if (renderTarget && this.copyMaterial && this.copyQuad) {
                const oldAutoClear = renderer.autoClear;
                renderer.autoClear = false;

                // 复制 gLitColor 到 renderTarget
                this.copyMaterial.uniforms.tDiffuse.value = this.gBufferRenderTarget.textures[0];
                renderer.setRenderTarget(renderTarget);
                renderer.render(this.copyQuad, this.orthoCamera);

                renderer.autoClear = oldAutoClear;
            }

        } else {
            // 传统渲染（不使用 G-Buffer）
            renderer.setRenderTarget(renderTarget);

            if (this.overrideMaterialManager !== null) {
                renderResult = this.overrideMaterialManager.render(renderer, scene, camera, renderOpts);
            } else {
                renderResult = renderer.render(scene, camera, renderOpts);
            }
        }

        // Restore original values.
        camera.layers.mask = mask;
        scene.background = background;
        renderer.shadowMap.autoUpdate = shadowMapAutoUpdate;

        timeEndLog("RenderPass.render");
        return renderResult;

    }

    /**
     * Initialize G-Buffer rendering targets and materials.
     *
     * @private
     */
    initializeGBuffer() {

        // Create G-Buffer render target with MRT (Multiple Render Targets)
        const width = Math.max(1, Math.floor(512 * this.resolutionScale));
        const height = Math.max(1, Math.floor(512 * this.resolutionScale));

        this.gBufferRenderTarget = new WebGLRenderTarget(width, height, {
            count: 5, // MRT: litColor(0), normal(1), depth(2), position(3), objectId(4)
            type: FloatType,
            format: RGBAFormat,
            minFilter: LinearFilter,
            magFilter: LinearFilter,
            type: HalfFloatType,
            depthBuffer: true,
            stencilBuffer: false
        });

        // 🔑 关键：立即创建深度纹理（在初始化时，而不是第一次渲染时）
        const depthTexture = new DepthTexture();
        depthTexture.type = UnsignedShortType;
        this.gBufferRenderTarget.depthTexture = depthTexture;

        console.log("🔧 RenderPass: 初始化G-Buffer渲染目标 (使用MRT Patcher)");
        console.log("  - 尺寸:", width + "x" + height);
        console.log("  - MRT计数:", this.gBufferRenderTarget.count);
        console.log("  - 纹理格式:", RGBAFormat);
        console.log("  - 纹理类型:", HalfFloatType);
        console.log("  - 生成纹理数量:", this.gBufferRenderTarget.textures?.length);
        console.log("  - 深度纹理:", !!this.gBufferRenderTarget.depthTexture);
        console.log("  - 支持对象ID: ✅");

        // Create G-Buffer material using RawShaderMaterial with GLSL3 (like GBufferPass)
        this.gBufferMaterial = new RawShaderMaterial({
            name: 'G-Buffer Material (RenderPass)',
            vertexShader: /* glsl */`
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
			`,
            fragmentShader: /* glsl */`
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
			`,
            uniforms: {
                // RawShaderMaterial需要手动提供所有uniform，包括Three.js内置uniform
                // 相机参数
                diffuse: { value: new Color(1, 1, 1) },
                metalness: { value: 0.0 },
                roughness: { value: 1.0 },
                cameraNear: { value: 0.1 },
                cameraFar: { value: 1000 },

                // Three.js内置uniform - RawShaderMaterial需要手动提供
                modelViewMatrix: { value: new Matrix4() },
                projectionMatrix: { value: new Matrix4() },
                modelMatrix: { value: new Matrix4() },
                normalMatrix: { value: new Matrix3() }
            },
            glslVersion: GLSL3
        });

        console.log("🔧 RenderPass: G-Buffer材质初始化完成");
        console.log("  - 材质类型: RawShaderMaterial");
        console.log("  - GLSL版本: GLSL3");
        console.log("  - 支持MRT: layout(location = N)");
        console.log("  - 使用in/out语法: ✅");

    }

    /**
     * Initialize copy material and fullscreen quad for copying MRT results.
     *
     * @private
     */
    initializeCopyQuad() {

        // 创建复制材质
        this.copyMaterial = new ShaderMaterial({
            uniforms: {
                tDiffuse: { value: null }
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() {
                    gl_FragColor = texture2D(tDiffuse, vUv);
                }
            `,
            depthTest: false,
            depthWrite: false
        });

        // 创建全屏四边形
        const geometry = new PlaneGeometry(2, 2);
        const mesh = new Mesh(geometry, this.copyMaterial);
        this.copyQuad = new Scene();
        this.copyQuad.add(mesh);

        // 创建正交相机
        this.orthoCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

        console.log("🔧 RenderPass: 初始化MRT复制Quad");

    }

    /**
     * Returns the G-Buffer textures.
     *
     * @returns {Object|null} An object containing the G-Buffer textures, or null if G-Buffer is disabled.
     */
    getGBufferTextures() {

        if (!this.enableGBuffer || !this.gBufferRenderTarget) {
            return null;
        }

        return {
            gLitColor: this.gBufferRenderTarget.textures[0],  // 渲染的颜色（带光照）
            gNormal: this.gBufferRenderTarget.textures[1],
            gDepth: this.gBufferRenderTarget.textures[2],
            gPosition: this.gBufferRenderTarget.textures[3],
            gObjectId: this.gBufferRenderTarget.textures[4],  // 对象ID纹理
            depthTexture: this.gBufferRenderTarget.depthTexture  // 深度缓冲（用于SSR等）
        };

    }

    /**
     * Get the depth texture from G-Buffer render target.
     * 
     * @returns {DepthTexture|null} The depth texture or null if not available.
     */
    getDepthTexture() {

        if (!this.enableGBuffer || !this.gBufferRenderTarget) {
            return null;
        }

        return this.gBufferRenderTarget.depthTexture;

    }

    /**
     * Enable G-Buffer generation.
     *
     * @param {Number} [resolutionScale=1.0] - Resolution scale for G-Buffer.
     */
    enableGBufferGeneration(resolutionScale = 1.0) {

        this.enableGBuffer = true;
        this.resolutionScale = resolutionScale;

        if (!this.gBufferRenderTarget) {
            this.initializeGBuffer();
        }

        if (!this.gBufferPatcher) {
            this.gBufferPatcher = new MRTGBufferMaterialPatcher(this.objectIdManager);
        }

        if (!this.copyMaterial) {
            this.initializeCopyQuad();
        }

    }

    /**
     * Disable G-Buffer generation.
     */
    disableGBufferGeneration() {

        this.enableGBuffer = false;
        this.sceneMaterialsPatched = false;

        if (this.gBufferRenderTarget) {
            this.gBufferRenderTarget.dispose();
            this.gBufferRenderTarget = null;
        }

        if (this.gBufferMaterial) {
            this.gBufferMaterial.dispose();
            this.gBufferMaterial = null;
        }

        if (this.gBufferPatcher) {
            this.gBufferPatcher.clear();
            this.gBufferPatcher = null;
        }

    }

    /**
     * Set the size of the render targets.
     *
     * @param {Number} width - The width.
     * @param {Number} height - The height.
     */
    setSize(width, height) {

        if (this.enableGBuffer && this.gBufferRenderTarget) {
            const gBufferWidth = Math.max(1, Math.floor(width * this.resolutionScale));
            const gBufferHeight = Math.max(1, Math.floor(height * this.resolutionScale));

            this.gBufferRenderTarget.setSize(gBufferWidth, gBufferHeight);
            // RawShaderMaterial不需要resolution uniform，Three.js会自动处理
        }

    }

    /**
     * Prepare G-Buffer material uniforms.
     *
     * @private
     */
    prepareGBufferMaterial() {

        if (!this.gBufferMaterial) return;

        // 更新相机参数
        this.gBufferMaterial.uniforms.cameraNear.value = this.camera.near;
        this.gBufferMaterial.uniforms.cameraFar.value = this.camera.far;

        // 更新相机矩阵 - RawShaderMaterial需要手动提供
        this.gBufferMaterial.uniforms.projectionMatrix.value.copy(this.camera.projectionMatrix);

        // RawShaderMaterial需要手动设置材质属性，使用简单的默认值
        this.gBufferMaterial.uniforms.diffuse.value.setHex(0xffffff); // 白色默认
        this.gBufferMaterial.uniforms.metalness.value = 0.0; // 非金属
        this.gBufferMaterial.uniforms.roughness.value = 1.0; // 粗糙


    }

    /**
     * Force re-patching of all scene materials and re-scanning for object IDs.
     * Call this when you add new objects/materials to the scene dynamically.
     * This will trigger re-scanning and re-patching on the next render.
     */
    repatchSceneMaterials() {

        this.sceneMaterialsPatched = false;
        console.log("🔄 RenderPass: 场景将在下次渲染时重新扫描和注入材质");

    }

    /**
     * Get the Object ID Manager.
     * 
     * @returns {ObjectIdManager} The object ID manager instance.
     */
    getObjectIdManager() {

        return this.objectIdManager;

    }

    /**
     * Get the G-Buffer Material Patcher.
     * 
     * @returns {MRTGBufferMaterialPatcher|null} The patcher instance or null if G-Buffer is disabled.
     */
    getGBufferPatcher() {

        return this.gBufferPatcher;

    }

    /**
     * Get the object ID for a specific object.
     * 
     * @param {Object3D} object - The Three.js object.
     * @returns {number} The object's ID.
     */
    getObjectId(object) {

        return this.objectIdManager ? this.objectIdManager.getObjectId(object) : 0;

    }

    /**
     * Get object by its ID.
     * 
     * @param {number} id - The object ID.
     * @returns {Object3D|null} The object or null if not found.
     */
    getObjectById(id) {

        return this.objectIdManager ? this.objectIdManager.getObjectById(id) : null;

    }

    /**
     * Dispose of resources.
     */
    dispose() {

        this.disableGBufferGeneration();

        if (this.gBufferPatcher) {
            this.gBufferPatcher.clear();
            this.gBufferPatcher = null;
        }

        if (this.objectIdManager) {
            this.objectIdManager.clear();
        }

        if (this.copyMaterial) {
            this.copyMaterial.dispose();
            this.copyMaterial = null;
        }

        if (this.copyQuad) {
            this.copyQuad.traverse((obj) => {
                if (obj.geometry) obj.geometry.dispose();
            });
            this.copyQuad = null;
        }

        this.orthoCamera = null;

        if (this.clearPass) {
            this.clearPass.dispose();
        }

        if (this.overrideMaterialManager) {
            this.overrideMaterialManager.dispose();
        }

    }

}