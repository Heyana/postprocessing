import { OverrideMaterialManager } from "../core/OverrideMaterialManager.js";
import { ClearPass } from "./ClearPass.js";
import { Pass } from "./Pass.js";
import { ObjectIdManager } from "../utils/ObjectIdManager.js";
import { WebGLRenderTarget, RawShaderMaterial, FloatType, RGBAFormat, Vector2, Color, GLSL3, Matrix4, Matrix3, LinearFilter, HalfFloatType, Mesh, PlaneGeometry } from "three";
const console = {
	log: () => { },
	warn: () => { },
	error: () => { },
};

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
		this.objectIdManager = null;
		this.enableObjectId = options.enableObjectId || false;

		// ObjectId注入优化相关
		this.injectedObjects = new WeakSet(); // 已注入ObjectId的对象
		this.objectIdUniforms = new WeakMap(); // 对象到ObjectId uniform的映射
		this.objectIdOutputUniforms = new WeakMap(); // 对象到ObjectId输出控制uniform的映射
		this.needsObjectIdSetup = true; // 是否需要重新设置ObjectId

		if (this.enableGBuffer) {
			this.initializeGBuffer();

			// 如果启用了对象ID，初始化对象ID管理器
			if (this.enableObjectId) {
				this.objectIdManager = new ObjectIdManager();
				this.objectIdManager.setDebug(true); // 启用调试模式
			}
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

		renderer.setRenderTarget(renderTarget);

		if (this.overrideMaterialManager !== null) {

			renderResult = this.overrideMaterialManager.render(renderer, scene, camera, renderOpts);

		} else {

			renderResult = renderer.render(scene, camera, renderOpts);

		}

		// G-Buffer rendering (after normal scene rendering)
		if (this.enableGBuffer && this.gBufferRenderTarget && this.gBufferMaterial) {
			this.prepareGBufferMaterial();

			// Save current overrideMaterial
			const originalOverrideMaterial = scene.overrideMaterial;

			// 如果启用了对象ID，使用优化的注入渲染
			if (this.enableObjectId && this.objectIdManager) {
				const scanResult = this.objectIdManager.scanScene(scene);
				// 减少日志输出
				if (scanResult.assigned > 0) {
					console.log(`🆔 场景扫描: ${scanResult.total}个对象，新分配${scanResult.assigned}个ID`);
				}

				// 使用智能ObjectId注入渲染
				this.renderGBufferWithSmartObjectId(renderer, scene, camera);
			} else {
				// 传统G-Buffer渲染（无对象ID）
				// 重要：RawShaderMaterial需要手动更新矩阵uniform
				this.gBufferMaterial.uniformsNeedUpdate = true;

				// 设置默认对象ID（背景）
				this.gBufferMaterial.uniforms.objectId.value = 0;

				// Render G-Buffer
				scene.overrideMaterial = this.gBufferMaterial;
				renderer.setRenderTarget(this.gBufferRenderTarget);
				renderer.clear();
				renderer.render(scene, camera);
			}

			// Restore original overrideMaterial
			scene.overrideMaterial = originalOverrideMaterial;

		}

		// Restore original values.
		camera.layers.mask = mask;
		scene.background = background;
		renderer.shadowMap.autoUpdate = shadowMapAutoUpdate;

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
			count: 5, // MRT: color, normal, depth, position, objectId
			type: FloatType,
			format: RGBAFormat,
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			type: HalfFloatType,
			depthBuffer: true,
			stencilBuffer: false
		});

		console.log("🔧 RenderPass: 初始化G-Buffer渲染目标 (带对象ID)");
		console.log("  - 尺寸:", width + "x" + height);
		console.log("  - MRT计数:", this.gBufferRenderTarget.count);
		console.log("  - 纹理格式:", RGBAFormat);
		console.log("  - 纹理类型:", FloatType);
		console.log("  - 生成纹理数量:", this.gBufferRenderTarget.textures?.length);
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

				// MRT 输出：同时输出到5个纹理
				layout(location = 0) out vec4 gColor;    // 颜色 + metalness (alpha)
				layout(location = 1) out vec4 gNormal;   // 法线 + roughness (alpha)
				layout(location = 2) out vec4 gDepth;    // 深度
				layout(location = 3) out vec4 gPosition; // 位置
				layout(location = 4) out vec4 gObjectId; // 对象ID

				in vec3 vNormal;
				in vec3 vViewPosition;
				in vec2 vUv;
				in float vDepth;

				// 使用默认的材质属性
				uniform vec3 diffuse;
				uniform float metalness;
				uniform float roughness;
				// 对象ID
				uniform float objectId;

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
					
					// 输出5：对象ID (归一化到0-1范围)
					float normalizedObjectId = objectId / 255.0;
					gObjectId = vec4(normalizedObjectId, normalizedObjectId, normalizedObjectId, 1.0);
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
				// 对象ID
				objectId: { value: 0.0 },

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
	 * Returns the G-Buffer textures.
	 *
	 * @returns {Object|null} An object containing the G-Buffer textures, or null if G-Buffer is disabled.
	 */
	getGBufferTextures() {

		if (!this.enableGBuffer || !this.gBufferRenderTarget) {
			return null;
		}

		return {
			gColor: this.gBufferRenderTarget.textures[0],
			gNormal: this.gBufferRenderTarget.textures[1],
			gDepth: this.gBufferRenderTarget.textures[2],
			gPosition: this.gBufferRenderTarget.textures[3],
			gObjectId: this.gBufferRenderTarget.textures[4]
		};

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

	}

	/**
	 * Disable G-Buffer generation.
	 */
	disableGBufferGeneration() {

		this.enableGBuffer = false;

		if (this.gBufferRenderTarget) {
			this.gBufferRenderTarget.dispose();
			this.gBufferRenderTarget = null;
		}

		if (this.gBufferMaterial) {
			this.gBufferMaterial.dispose();
			this.gBufferMaterial = null;
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
	 * ⚡ 智能ObjectId注入渲染 - 使用onBeforeCompile一次性注入，避免每帧材质替换
	 * 
	 * @param {WebGLRenderer} renderer - The renderer
	 * @param {Scene} scene - The scene to render
	 * @param {Camera} camera - The camera
	 * @private
	 */
	renderGBufferWithSmartObjectId(renderer, scene, camera) {
		if (!this.objectIdManager) {
			console.error("RenderPass: ObjectIdManager not initialized");
			return;
		}

		// 扫描场景并分配ObjectId
		const scanResult = this.objectIdManager.scanScene(scene);

		// 首次渲染时输出调试信息
		if (!this._hasLoggedObjectIds) {
			console.log("🆔 对象ID分配情况:");
			let count = 0;
			scene.traverse((object) => {
				if (object.isMesh && object.visible) {
					const id = this.objectIdManager.getObjectId(object);
					console.log(`  - ${object.name || 'Mesh'} [${object.uuid.substr(0, 8)}]: ID=${id}`);
					count++;
				}
			});
			console.log(`  总计: ${count}个对象`);
			this._hasLoggedObjectIds = true;
		}

		// 设置渲染目标
		renderer.setRenderTarget(this.gBufferRenderTarget);
		renderer.clear();

		// 🎯 方案：为每个对象创建独立的G-Buffer材质克隆，设置不同的ObjectId
		const originalMaterials = new WeakMap();
		const gBufferClones = new Map(); // 缓存材质克隆以提高性能

		// 第一步：保存原始材质并替换为G-Buffer材质克隆
		scene.traverse((object) => {
			if (object.isMesh && object.visible) {
				// 保存原始材质
				originalMaterials.set(object, object.material);

				// 获取对象ID
				const objectId = this.objectIdManager.getObjectId(object);

				// 检查是否已有该ID的材质克隆
				let gBufferClone;
				if (gBufferClones.has(objectId)) {
					gBufferClone = gBufferClones.get(objectId);
				} else {
					// 创建G-Buffer材质的克隆
					gBufferClone = this.gBufferMaterial.clone();

					// 深度克隆uniforms对象
					gBufferClone.uniforms = {};
					Object.keys(this.gBufferMaterial.uniforms).forEach(key => {
						const uniform = this.gBufferMaterial.uniforms[key];
						if (uniform && uniform.value !== undefined) {
							// 对于Matrix和Vector类型，直接引用（Three.js会自动更新）
							// 对于基本类型，创建新的引用
							if (key === 'objectId') {
								gBufferClone.uniforms[key] = { value: objectId };
							} else {
								gBufferClone.uniforms[key] = { value: uniform.value };
							}
						}
					});

					// 缓存该材质
					gBufferClones.set(objectId, gBufferClone);

					console.log(`  创建材质克隆 for ObjectId=${objectId}`);
				}

				// 替换对象的材质
				object.material = gBufferClone;
			}
		});

		// 第二步：渲染场景
		const originalOverrideMaterial = scene.overrideMaterial;
		scene.overrideMaterial = null; // 不使用overrideMaterial，使用每个对象自己的材质
		renderer.render(scene, camera);

		// 第三步：恢复原始材质
		scene.traverse((object) => {
			if (object.isMesh && originalMaterials.has(object)) {
				object.material = originalMaterials.get(object);
			}
		});

		scene.overrideMaterial = originalOverrideMaterial;
	}



	/**
	 * Get ObjectId Manager
	 * 
	 * @returns {ObjectIdManager|null} The object ID manager
	 */
	getObjectIdManager() {

		return this.objectIdManager;

	}

	/**
	 * Enable object ID generation
	 * 
	 * @param {boolean} enable - Whether to enable object ID
	 */
	enableObjectIdGeneration(enable = true) {
		this.enableObjectId = enable;

		if (enable && !this.objectIdManager && this.enableGBuffer) {
			this.objectIdManager = new ObjectIdManager();
			this.objectIdManager.setDebug(true);
			this.needsObjectIdSetup = true; // 标记需要重新设置
			console.log("🆔 RenderPass: 对象ID管理器已启用");
		}
	}

	/**
	 * 强制重新设置ObjectId注入（当场景发生变化时）
	 */
	forceObjectIdSetup() {
		this.needsObjectIdSetup = true;
		this.injectedObjects.clear();
		this.objectIdUniforms.clear();
		this.objectIdOutputUniforms.clear();
		console.log("🔄 强制重新设置ObjectId注入");
	}

	/**
	 * 清理ObjectId相关资源
	 * @private
	 */
	cleanupObjectIdInjection() {
		// 清理WeakMap和WeakSet会自动处理，但我们需要重置标记
		this.injectedObjects = new WeakSet();
		this.objectIdUniforms = new WeakMap();
		this.objectIdOutputUniforms = new WeakMap();
		this.needsObjectIdSetup = true;
		console.log("🧹 ObjectId注入资源已清理");
	}

	/**
	 * Dispose of resources.
	 */
	dispose() {
		this.disableGBufferGeneration();

		// 清理ObjectId注入相关资源
		this.cleanupObjectIdInjection();

		// 清理ObjectIdManager
		if (this.objectIdManager) {
			this.objectIdManager.clear();
			this.objectIdManager = null;
		}

		if (this.clearPass) {
			this.clearPass.dispose();
		}

		if (this.overrideMaterialManager) {
			this.overrideMaterialManager.dispose();
		}

		console.log("🧹 RenderPass: 所有资源已释放（包括ObjectId注入）");
	}

}
