import {
	DepthStencilFormat,
	DepthTexture,
	LinearFilter,
	SRGBColorSpace,
	UnsignedByteType,
	UnsignedIntType,
	UnsignedInt248Type,
	Vector2,
	WebGLRenderTarget
} from "three";

import { Timer } from "./Timer.js";
import { ClearMaskPass } from "../passes/ClearMaskPass.js";
import { CopyPass } from "../passes/CopyPass.js";
import { MaskPass } from "../passes/MaskPass.js";
import { Pass } from "../passes/Pass.js";
import { timeLog, timeEndLog, log } from "../utils/PerformanceLogger.js";
import { DepthPass } from "../passes/DepthPass.js";
import { MRTRenderPass } from "../passes/MRTRenderPass.js";
import { SharedDepthPass } from "../core/SharedDepthPass.js";
import { RenderPass } from "../passes/RenderPass.js";
import { EffectPass } from "../passes/EffectPass.js";
/**
 * The EffectComposer may be used in place of a normal WebGLRenderer.
 *
 * The auto clear behaviour of the provided renderer will be disabled to prevent unnecessary clear operations.
 *
 * It is common practice to use a {@link RenderPass} as the first pass to automatically clear the buffers and render a
 * scene for further processing.
 *
 * @implements {Resizable}
 * @implements {Disposable}
 */

export class EffectComposer {

	/**
	 * Constructs a new effect composer.
	 *
	 * @param {WebGLRenderer} renderer - The renderer that should be used.
	 * @param {Object} [options] - The options.
	 * @param {Boolean} [options.depthBuffer=true] - Whether the main render targets should have a depth buffer.
	 * @param {Boolean} [options.stencilBuffer=false] - Whether the main render targets should have a stencil buffer.
	 * @param {Boolean} [options.alpha] - Deprecated. Buffers are always RGBA since three r137.
	 * @param {Number} [options.multisampling=0] - The number of samples used for multisample antialiasing. Requires WebGL 2.
	 * @param {Number} [options.frameBufferType] - The type of the internal frame buffers. It's recommended to use HalfFloatType if possible.
	 */

	constructor(renderer = null, {
		depthBuffer = true,
		stencilBuffer = false,
		multisampling = 0,
		frameBufferType = UnsignedByteType
	} = {}) {

		/**
		 * The renderer.
		 *
		 * @type {WebGLRenderer}
		 * @private
		 */

		this.renderer = null;

		/**
		 * The input buffer.
		 *
		 * Two identical buffers are used to avoid reading from and writing to the same render target.
		 *
		 * @type {WebGLRenderTarget}
		 * @private
		 */

		this.inputBuffer = this.createBuffer(depthBuffer, stencilBuffer, frameBufferType, multisampling);

		/**
		 * The output buffer.
		 *
		 * @type {WebGLRenderTarget}
		 * @private
		 */

		this.outputBuffer = this.inputBuffer.clone();

		/**
		 * A copy pass used for copying masked scenes.
		 *
		 * @type {CopyPass}
		 * @private
		 */

		this.copyPass = new CopyPass();

		/**
		 * A depth texture.
		 *
		 * @type {DepthTexture}
		 * @private
		 */

		this.depthTexture = null;

		/**
		 * The passes.
		 *
		 * @type {Pass[]}
		 * @private
		 */

		this.passes = [];

		/**
		 * A timer.
		 *
		 * @type {Timer}
		 * @private
		 */

		this.timer = new Timer();

		/**
		 * Determines whether the last pass automatically renders to screen.
		 *
		 * @type {Boolean}
		 */

		this.autoRenderToScreen = true;

		/**
		 * 是否启用了MRT渲染。
		 * @type {Boolean}
		 * @private
		 */
		this._useMRT = false;

		/**
		 * MRT渲染通道。
		 * @type {MRTRenderPass}
		 * @private
		 */
		this._mrtRenderPass = null;

		/**
		 * 共享的虚拟深度通道。
		 * @type {SharedDepthPass}
		 * @private
		 */
		this._sharedDepthPass = null;

		this.setRenderer(renderer);

	}

	/**
	 * The current amount of samples used for multisample anti-aliasing.
	 *
	 * @type {Number}
	 */

	get multisampling() {

		// TODO Raise min three version to 138 and remove || 0.
		return this.inputBuffer.samples || 0;

	}

	/**
	 * Sets the amount of MSAA samples.
	 *
	 * Requires WebGL 2. Set to zero to disable multisampling.
	 *
	 * @type {Number}
	 */

	set multisampling(value) {

		const buffer = this.inputBuffer;
		const multisampling = this.multisampling;

		if (multisampling > 0 && value > 0) {

			this.inputBuffer.samples = value;
			this.outputBuffer.samples = value;
			this.inputBuffer.dispose();
			this.outputBuffer.dispose();

		} else if (multisampling !== value) {

			this.inputBuffer.dispose();
			this.outputBuffer.dispose();

			// Enable or disable MSAA.
			this.inputBuffer = this.createBuffer(
				buffer.depthBuffer,
				buffer.stencilBuffer,
				buffer.texture.type,
				value
			);

			this.inputBuffer.depthTexture = this.depthTexture;
			this.outputBuffer = this.inputBuffer.clone();

		}

	}

	/**
	 * Returns the internal timer.
	 *
	 * @return {Timer} The timer.
	 */

	getTimer() {

		return this.timer;

	}

	/**
	 * Returns the renderer.
	 *
	 * @return {WebGLRenderer} The renderer.
	 */

	getRenderer() {

		return this.renderer;

	}

	/**
	 * Sets the renderer.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 */

	setRenderer(renderer) {

		this.renderer = renderer;

		if (renderer !== null) {

			const size = renderer.getSize(new Vector2());
			const alpha = renderer.getContext().getContextAttributes().alpha;
			const frameBufferType = this.inputBuffer.texture.type;

			if (frameBufferType === UnsignedByteType && renderer.outputColorSpace === SRGBColorSpace) {

				this.inputBuffer.texture.colorSpace = SRGBColorSpace;
				this.outputBuffer.texture.colorSpace = SRGBColorSpace;

				this.inputBuffer.dispose();
				this.outputBuffer.dispose();

			}

			renderer.autoClear = false;
			this.setSize(size.width, size.height);

			for (const pass of this.passes) {

				pass.initialize(renderer, alpha, frameBufferType);

			}

			/**
			 * 检查MRT支持并初始化相关功能。
			 */
			this._checkMRTSupport(renderer);

		}

	}

	/**
	 * Replaces the current renderer with the given one.
	 *
	 * The auto clear mechanism of the provided renderer will be disabled. If the new render size differs from the
	 * previous one, all passes will be updated.
	 *
	 * By default, the DOM element of the current renderer will automatically be removed from its parent node and the DOM
	 * element of the new renderer will take its place.
	 *
	 * @deprecated Use setRenderer instead.
	 * @param {WebGLRenderer} renderer - The new renderer.
	 * @param {Boolean} updateDOM - Indicates whether the old canvas should be replaced by the new one in the DOM.
	 * @return {WebGLRenderer} The old renderer.
	 */

	replaceRenderer(renderer, updateDOM = true) {

		const oldRenderer = this.renderer;
		const parent = oldRenderer.domElement.parentNode;

		this.setRenderer(renderer);

		if (updateDOM && parent !== null) {

			parent.removeChild(oldRenderer.domElement);
			parent.appendChild(renderer.domElement);

		}

		return oldRenderer;

	}

	/**
	 * Creates a depth texture attachment that will be provided to all passes.
	 *
	 * Note: When a shader reads from a depth texture and writes to a render target that uses the same depth texture
	 * attachment, the depth information will be lost. This happens even if `depthWrite` is disabled.
	 *
	 * @private
	 * @return {DepthTexture} The depth texture.
	 */

	createDepthTexture() {

		const depthTexture = this.depthTexture = new DepthTexture();

		// Hack: Make sure the input buffer uses the depth texture.
		this.inputBuffer.depthTexture = depthTexture;
		this.inputBuffer.dispose();

		if (this.inputBuffer.stencilBuffer) {

			depthTexture.format = DepthStencilFormat;
			depthTexture.type = UnsignedInt248Type;

		} else {

			depthTexture.type = UnsignedIntType;

		}

		return depthTexture;

	}

	/**
	 * Deletes the current depth texture.
	 *
	 * @private
	 */

	deleteDepthTexture() {

		if (this.depthTexture !== null) {

			this.depthTexture.dispose();
			this.depthTexture = null;

			// Update the input buffer.
			this.inputBuffer.depthTexture = null;
			this.inputBuffer.dispose();

			for (const pass of this.passes) {

				pass.setDepthTexture(null);

			}

		}

	}

	/**
	 * Creates a new render target.
	 *
	 * @deprecated Create buffers manually via WebGLRenderTarget instead.
	 * @param {Boolean} depthBuffer - Whether the render target should have a depth buffer.
	 * @param {Boolean} stencilBuffer - Whether the render target should have a stencil buffer.
	 * @param {Number} type - The frame buffer type.
	 * @param {Number} multisampling - The number of samples to use for antialiasing.
	 * @return {WebGLRenderTarget} A new render target that equals the renderer's canvas.
	 */

	createBuffer(depthBuffer, stencilBuffer, type, multisampling) {

		const renderer = this.renderer;
		const size = (renderer === null) ? new Vector2() : renderer.getDrawingBufferSize(new Vector2());

		const options = {
			minFilter: LinearFilter,
			magFilter: LinearFilter,
			stencilBuffer,
			depthBuffer,
			type
		};

		const renderTarget = new WebGLRenderTarget(size.width, size.height, options);

		if (multisampling > 0) {

			renderTarget.ignoreDepthForMultisampleCopy = false;
			renderTarget.samples = multisampling;

		}

		if (type === UnsignedByteType && renderer !== null && renderer.outputColorSpace === SRGBColorSpace) {

			renderTarget.texture.colorSpace = SRGBColorSpace;

		}

		renderTarget.texture.name = "EffectComposer.Buffer";
		renderTarget.texture.generateMipmaps = false;

		return renderTarget;

	}

	/**
	 * Can be used to change the main scene for all registered passes and effects.
	 *
	 * @param {Scene} scene - The scene.
	 */

	setMainScene(scene) {

		for (const pass of this.passes) {

			pass.mainScene = scene;

		}

	}

	/**
	 * Can be used to change the main camera for all registered passes and effects.
	 *
	 * @param {Camera} camera - The camera.
	 */

	setMainCamera(camera) {

		for (const pass of this.passes) {

			pass.mainCamera = camera;

		}

	}

	/**
	 * 检查MRT支持并初始化相关功能。
	 * @param {WebGLRenderer} renderer - 渲染器。
	 * @private
	 */
	_checkMRTSupport(renderer) {
		// 检查WebGL2支持
		try {
			if (!renderer) {
				console.warn("EffectComposer: 渲染器未定义，无法检查MRT支持");
				this._useMRT = false;
				return;
			}

			const isWebGL2 = renderer.capabilities.isWebGL2;

			// 检查扩展支持
			let hasDrawBuffers = false;
			if (isWebGL2) {
				hasDrawBuffers = true; // WebGL2原生支持drawBuffers
			} else {
				// 在WebGL1中，检查扩展支持
				try {
					const gl = renderer.getContext();
					const extension = gl && gl.getExtension('WEBGL_draw_buffers');
					hasDrawBuffers = !!extension;
				} catch (e) {
					console.warn("检查WebGL扩展支持时出错:", e);
					hasDrawBuffers = false;
				}
			}

			// 测试创建MRT以确认实际支持
			let mrtSupported = false;
			if (isWebGL2 && hasDrawBuffers) {
				try {
					// 创建测试MRT渲染目标
					const testMRT = new WebGLRenderTarget(1, 1, {
						count: 2
					});

					// 检查纹理数组是否存在和有效
					if (testMRT && testMRT.textures && Array.isArray(testMRT.textures) && testMRT.textures.length === 2) {
						mrtSupported = true;
						console.log("MRT支持测试通过: WebGLRenderTarget.textures存在且有效");
					} else {
						console.warn("MRT支持测试失败: WebGLRenderTarget.textures无效或不存在");
					}

					// 清理测试资源
					if (testMRT) testMRT.dispose();
				} catch (e) {
					console.warn("创建MRT测试渲染目标时出错:", e);
					mrtSupported = false;
				}
			}

			this._useMRT = isWebGL2 && hasDrawBuffers && mrtSupported;

			if (this._useMRT) {
				console.log("检测到WebGL2和MRT支持，启用MRT渲染优化。");
			} else {
				console.log(`MRT支持状态: WebGL2=${isWebGL2}, drawBuffers=${hasDrawBuffers}, MRT测试=${mrtSupported}`);

				// 清除任何先前创建的MRT相关资源
				if (this._mrtRenderPass || this._sharedDepthPass) {
					console.warn("当前环境不支持MRT，清除先前创建的MRT资源");
					this._cleanupMRTResources();
				}
			}
		} catch (error) {
			console.error("检查MRT支持时发生未知错误:", error);
			this._useMRT = false;
		}
	}

	/**
	 * 清理MRT相关资源
	 * @private
	 */
	_cleanupMRTResources() {
		try {
			// 清理MRTRenderPass
			if (this._mrtRenderPass) {
				if (typeof this._mrtRenderPass.dispose === 'function') {
					this._mrtRenderPass.dispose();
				}
				this._mrtRenderPass = null;
			}

			// 清理SharedDepthPass
			this._sharedDepthPass = null;

		} catch (error) {
			console.error("清理MRT资源时出错:", error);
		}
	}

	/**
	 * 设置MRT渲染通道，替代常规RenderPass。
	 * @param {Scene} scene - 要渲染的场景。
	 * @param {Camera} camera - 要使用的相机。
	 * @param {Object} [options] - 选项。
	 * @returns {MRTRenderPass|null} MRT渲染通道或null（如果创建失败）。
	 */
	setMRTRenderPass(scene, camera, options = {}) {
		try {
			// 首先检查是否已启用MRT
			if (!this._useMRT) {
				console.warn("无法创建MRTRenderPass: WebGL2或MRT不受支持");
				return null;
			}

			// 创建MRT渲染通道
			this._mrtRenderPass = new MRTRenderPass(scene, camera, options);

			// 初始化MRT渲染通道
			const renderer = this.renderer;
			if (!renderer) {
				console.error("渲染器未初始化，无法创建MRTRenderPass");
				this._mrtRenderPass = null;
				return null;
			}

			const alpha = renderer.getContext().getContextAttributes().alpha;
			// 根据输入缓冲区的类型确定帧缓冲类型
			const frameBufferType = this.inputBuffer.textures ?
				this.inputBuffer.textures[0].type :
				this.inputBuffer.texture.type;

			const initResult = this._mrtRenderPass.initialize(
				renderer,
				alpha,
				frameBufferType
			);

			// 检查MRT初始化是否成功
			if (!initResult) {
				console.warn("MRTRenderPass初始化失败，无法创建共享深度通道");
				this._mrtRenderPass = null;
				return null;
			}

			// 确保深度纹理有效
			if (!this._mrtRenderPass.depthTexture) {
				console.warn("MRTRenderPass创建成功但深度纹理无效，无法创建共享深度通道");
				return this._mrtRenderPass;
			}

			// 创建共享深度通道
			this._sharedDepthPass = new SharedDepthPass(
				this._mrtRenderPass.depthTexture,
				this._mrtRenderPass.depthPacking
			);

			// 验证创建是否成功
			if (!this._sharedDepthPass || !this._sharedDepthPass.texture) {
				console.warn("SharedDepthPass创建失败或纹理无效");
				this._sharedDepthPass = null;
			} else {
				console.log("成功创建SharedDepthPass和MRTRenderPass");
			}

			return this._mrtRenderPass;
		} catch (error) {
			console.error("创建MRTRenderPass时发生错误:", error);
			this._mrtRenderPass = null;
			this._sharedDepthPass = null;
			return null;
		}
	}

	/**
	 * 获取共享深度通道。
	 * @returns {SharedDepthPass} 共享深度通道。
	 */
	getSharedDepthPass() {
		return this._sharedDepthPass;
	}

	/**
	 * Adds a pass, optionally at a specific index.
	 *
	 * @param {Pass} pass - A new pass.
	 * @param {Number} [index] - An index at which the pass should be inserted.
	 */

	addPass(pass, index) {

		const passes = this.passes;
		const renderer = this.renderer;

		// 如果是第一个通道且是RenderPass，且支持MRT，考虑使用MRT替代
		if (this._useMRT && passes.length === 0 && pass instanceof RenderPass) {
			// 创建MRT通道替代RenderPass
			const mrtPass = this.setMRTRenderPass(pass.scene, pass.camera);

			// 如果MRT通道创建成功，添加它而不是原始的RenderPass
			if (mrtPass) {
				const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());
				mrtPass.setSize(drawingBufferSize.width, drawingBufferSize.height);
				this.passes.push(mrtPass);
				log("已用MRTRenderPass替代RenderPass作为第一个通道");
				return;
			} else {
				log("MRTRenderPass创建失败，添加原始RenderPass");
			}
		}

		const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());
		const alpha = renderer.getContext().getContextAttributes().alpha;
		const frameBufferType = this.inputBuffer.texture.type;

		pass.setRenderer(renderer);
		pass.setSize(drawingBufferSize.width, drawingBufferSize.height);
		pass.initialize(renderer, alpha, frameBufferType);

		if (this.autoRenderToScreen) {

			if (passes.length > 0) {

				passes[passes.length - 1].renderToScreen = false;

			}

			if (pass.renderToScreen) {

				this.autoRenderToScreen = false;

			}

		}

		if (index !== undefined) {

			passes.splice(index, 0, pass);

		} else {

			passes.push(pass);

		}

		if (this.autoRenderToScreen) {

			passes[passes.length - 1].renderToScreen = true;

		}

		if (pass.needsDepthTexture || this.depthTexture !== null) {

			if (this.depthTexture === null) {

				const depthTexture = this.createDepthTexture();

				for (pass of passes) {

					pass.setDepthTexture(depthTexture);

				}

			} else {

				pass.setDepthTexture(this.depthTexture);

			}

		}
	}

	/**
	 * Removes a pass.
	 *
	 * @param {Pass} pass - The pass.
	 */

	removePass(pass) {

		const passes = this.passes;
		const index = passes.indexOf(pass);
		const exists = (index !== -1);
		const removed = exists && (passes.splice(index, 1).length > 0);

		if (removed) {

			if (this.depthTexture !== null) {

				// Check if the depth texture is still required.
				const reducer = (a, b) => (a || b.needsDepthTexture);
				const depthTextureRequired = passes.reduce(reducer, false);

				if (!depthTextureRequired) {

					if (pass.getDepthTexture() === this.depthTexture) {

						pass.setDepthTexture(null);

					}

					this.deleteDepthTexture();

				}

			}

			if (this.autoRenderToScreen) {

				// Check if the removed pass was the last one.
				if (index === passes.length) {

					pass.renderToScreen = false;

					if (passes.length > 0) {

						passes[passes.length - 1].renderToScreen = true;

					}

				}

			}

		}

	}

	/**
	 * Removes all passes.
	 */

	removeAllPasses() {

		const passes = this.passes;

		this.deleteDepthTexture();

		if (passes.length > 0) {

			if (this.autoRenderToScreen) {

				passes[passes.length - 1].renderToScreen = false;

			}

			this.passes = [];

		}

	}

	getSize() {
		return {

		}
	}
	/**
	 * Renders all enabled passes in the order in which they were added.
	 *
	 * @param {Number} [deltaTime] - The time since the last frame in seconds.
	 */

	render(deltaTime) {
		timeLog("EffectComposer.render");

		// 获取上一个deltaTime
		const dt = typeof deltaTime !== "number" ? this.timer.getDelta() : deltaTime;

		// 第一个通道渲染到输出缓冲区，后续的通道使用输出缓冲区作为输入
		const passes = this.passes;
		const renderer = this.renderer;

		if (!renderer) {
			console.error("EffectComposer: 渲染器未定义，无法执行渲染");
			timeEndLog("EffectComposer.render");
			return;
		}

		// 防止EffectComposer在每一帧重新检查WebGL版本，仅在未初始化时执行
		if (this._useMRT === undefined) {
			this._checkMRTSupport(renderer);
		}

		let inputBuffer = this.inputBuffer;
		let outputBuffer = this.outputBuffer;

		let depthPassIndex = -1;

		// 记录常规深度通道索引（如果有）
		for (let i = 0; i < passes.length; i++) {
			if (passes[i] instanceof DepthPass && !(passes[i] instanceof SharedDepthPass)) {
				depthPassIndex = i;
				break;
			}
		}

		// 检查共享深度通道是否有效
		let sharedDepthPass = this._sharedDepthPass;
		let validSharedDepth = false;

		if (sharedDepthPass) {
			try {
				if (sharedDepthPass.texture) {
					validSharedDepth = true;
					log(`EffectComposer: 共享深度通道有效，纹理ID: ${sharedDepthPass.texture.id || '未知'}`);
				} else {
					log('EffectComposer: 共享深度通道存在但纹理无效');
				}
			} catch (e) {
				console.warn("访问共享深度通道时出错:", e);
				validSharedDepth = false;
			}
		} else {
			log('EffectComposer: 未配置共享深度通道');
		}

		// 如果使用MRT且存在常规深度通道，跳过常规深度通道渲染
		const skipDepthPass = this._useMRT && depthPassIndex !== -1 && validSharedDepth;

		// 标记MRT渲染通道是否已完成渲染
		let mrtRendered = false;

		// 渲染通道
		for (let i = 0, l = passes.length; i < l; ++i) {
			const pass = passes[i];

			if (pass.enabled) {
				// 获取通道类型名
				let passClassName = "未知通道";
				if (pass.constructor && pass.constructor.name) {
					passClassName = pass.constructor.name;
				}

				// 获取效果类型名（如果是EffectPass）
				let effectClassName = "";
				if (pass instanceof EffectPass && pass.effects.length > 0) {
					effectClassName = pass.effects[0].constructor.name;
				}

				log(`执行 pass: ${passClassName}, 效果类型: ${effectClassName}`);

				// 如果是需要跳过的深度通道，不执行渲染
				if (skipDepthPass && i === depthPassIndex) {
					log("跳过常规DepthPass渲染，使用MRT共享深度");
					continue;
				}

				// 渲染通道
				try {
					// 如果是MRTRenderPass且不支持WebGL2或MRT，跳过渲染
					if (pass instanceof MRTRenderPass && !this._useMRT) {
						log(`跳过 ${passClassName} 渲染: 当前环境不支持WebGL2或MRT`);
						continue;
					}

					// 如果是MRTRenderPass，渲染后更新共享深度通道
					if (pass instanceof MRTRenderPass) {
						// 获取输入/输出缓冲区的纹理ID（兼容新旧API）
						const inputTextureId = inputBuffer ?
							(inputBuffer.textures ?
								(inputBuffer.textures[0] ? inputBuffer.textures[0].id : '未知') :
								(inputBuffer.texture ? inputBuffer.texture.id : '未知')) :
							'无';

						const outputTextureId = outputBuffer ?
							(outputBuffer.textures ?
								(outputBuffer.textures[0] ? outputBuffer.textures[0].id : '未知') :
								(outputBuffer.texture ? outputBuffer.texture.id : '未知')) :
							'无';

						console.log(`开始渲染MRTRenderPass，输入缓冲区ID: ${inputTextureId}, 输出缓冲区ID: ${outputTextureId}`);

						// 执行MRT渲染通道
						pass.render(renderer, inputBuffer, outputBuffer, dt, this.stencilTest);

						// 在MRT渲染后更新共享深度通道纹理
						if (this._updateSharedDepthPass()) {
							// 如果更新成功，重新获取共享深度通道和状态
							sharedDepthPass = this._sharedDepthPass;
							validSharedDepth = true;
							console.log("已更新共享深度通道纹理");
						}

						// 检查渲染结果
						console.log(`MRTRenderPass渲染完成，颜色纹理ID: ${pass.colorTexture ? pass.colorTexture.id : '无'}, 深度纹理ID: ${pass.depthTexture ? pass.depthTexture.id : '无'}`);
						console.log(`输出缓冲区状态: ${outputBuffer ? '有效' : '无效'}, needsSwap: ${pass.needsSwap}`);

						mrtRendered = true;
					}
					// 如果是效果通道并且共享深度通道有效，传递共享深度通道
					else if (pass instanceof EffectPass && validSharedDepth) {
						// 传递共享深度通道到效果
						log(`为EffectPass(${effectClassName})提供共享深度通道`);
						pass.render(renderer, inputBuffer, outputBuffer, dt, this.stencilTest, sharedDepthPass);
					} else {
						// 正常渲染
						log(`${passClassName}不使用共享深度通道`);
						pass.render(renderer, inputBuffer, outputBuffer, dt, this.stencilTest);
					}
				} catch (e) {
					console.error(`渲染通道 ${passClassName} 时出错:`, e);
				}

				// 如果通道需要交换缓冲区，交换输入和输出缓冲区
				if (pass.needsSwap) {
					if (pass instanceof MaskPass) {
						const maskActive = pass.enabled && !pass.clearPass.enabled;

						// 强制清除，否则前面的内容会被保留
						if (maskActive) {
							const autoClear = renderer.autoClear;
							renderer.autoClear = false;
							renderer.clearDepth();
							renderer.autoClear = autoClear;
						}
					}

					// 交换缓冲区
					const temp = inputBuffer;
					inputBuffer = outputBuffer;
					outputBuffer = temp;
				}

				// 处理通过MaskPass定义的遮罩
				if (pass instanceof MaskPass) {
					if (pass.enabled && !pass.clearPass.enabled) {
						this.stencilTest = true;
					} else if (pass.clearPass.enabled) {
						this.stencilTest = false;
					}
				}
			}
		}

		timeEndLog("EffectComposer.render");
	}

	/**
	 * Sets the size of the buffers, passes and the renderer.
	 *
	 * @param {Number} width - The width.
	 * @param {Number} height - The height.
	 * @param {Boolean} [updateStyle] - Determines whether the style of the canvas should be updated.
	 */

	setSize(width, height, updateStyle) {

		const renderer = this.renderer;
		const currentSize = renderer.getSize(new Vector2());

		if (width === undefined || height === undefined) {

			width = currentSize.width;
			height = currentSize.height;

		}

		if (currentSize.width !== width || currentSize.height !== height) {

			// Update the logical render size.
			renderer.setSize(width, height, updateStyle);

		}

		// The drawing buffer size takes the device pixel ratio into account.
		const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());
		this.inputBuffer.setSize(drawingBufferSize.width, drawingBufferSize.height);
		this.outputBuffer.setSize(drawingBufferSize.width, drawingBufferSize.height);

		for (const pass of this.passes) {

			pass.setSize(drawingBufferSize.width, drawingBufferSize.height);

		}

	}

	/**
	 * Resets this composer by deleting all passes and creating new buffers.
	 */

	reset() {

		this.dispose();
		this.autoRenderToScreen = true;

	}

	/**
	 * Disposes this composer and all passes.
	 */

	dispose() {

		for (const pass of this.passes) {

			pass.dispose();

		}

		this.passes = [];

		if (this.inputBuffer !== null) {

			this.inputBuffer.dispose();

		}

		if (this.outputBuffer !== null) {

			this.outputBuffer.dispose();

		}

		this.deleteDepthTexture();
		this.copyPass.dispose();
		this.timer.dispose();

		Pass.fullscreenGeometry.dispose();

	}

	/**
	 * 更新共享深度通道纹理。
	 * 在MRT渲染完成后调用，以确保深度纹理是最新的。
	 * 
	 * @private
	 * @returns {Boolean} 更新是否成功
	 */
	_updateSharedDepthPass() {
		try {
			// 检查MRT渲染通道和共享深度通道是否存在
			if (!this._mrtRenderPass || !this._sharedDepthPass) {
				return false;
			}

			// 获取MRT通道的深度纹理
			const depthTexture = this._mrtRenderPass.depthTexture;

			// 检查深度纹理是否有效
			if (!depthTexture) {
				console.warn("_updateSharedDepthPass: MRT深度纹理无效");
				return false;
			}

			// 更新共享深度通道的纹理
			this._sharedDepthPass.setTexture(depthTexture);

			return true;
		} catch (error) {
			console.error("更新共享深度通道时出错:", error);
			return false;
		}
	}

}
