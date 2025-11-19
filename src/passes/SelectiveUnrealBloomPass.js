import {
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	PlaneGeometry,
	Scene,
	Vector4
} from "three";

import { Pass } from "./Pass.js";
import { EffectPass } from "./EffectPass.js";
import { UnrealBloomEffect } from "../effects/UnrealBloomEffect.js";

const overlayGeometry = /* @__PURE__ */ new PlaneGeometry(2, 2);

/**
 * 将 `UnrealBloomEffect` 封装为可直接插入 EffectComposer 的 Pass，
 * 并内置选择层调试输出。
 */
export class SelectiveUnrealBloomPass extends Pass {

	/**
	 * @param {Scene} scene - 主场景。
	 * @param {Camera} camera - 主相机。
	 * @param {Object} [options.effect] - 传给 UnrealBloomEffect 的参数。
	 * @param {Object} [options.debug] - 调试视窗相关配置。
	 * @param {Boolean} [options.debug.showSelection=false] - 默认是否显示调试小窗。
	 * @param {Number} [options.debug.inset=0.28] - 调试小窗相对宽度（相对于主画面宽度的比例）。
	 * @param {Number} [options.debug.padding=18] - 调试小窗距离屏幕边缘的像素间距。
	 * @param {Number} [options.debug.minWidth=160] - 调试小窗最小宽度，像素。
	 */
	constructor(scene, camera, {
		effect: effectOptions = {},
		debug: {
			showSelection = false,
			inset = 0.28,
			padding = 18,
			minWidth = 160
		} = {}
	} = {}) {

		super("SelectiveBloomPass");

		this.effect = new UnrealBloomEffect(effectOptions);
		this.effect.mainScene = scene;
		this.effect.mainCamera = camera;

		this.effectPass = new EffectPass(camera, this.effect);

		this.overlayEnabled = showSelection;
		this.overlayInset = inset;
		this.overlayPadding = padding;
		this.overlayMinWidth = minWidth;

		this.bufferWidth = 1;
		this.bufferHeight = 1;

		this.selectionViewport = {
			x: 0,
			y: 0,
			width: 0,
			height: 0
		};

		this.overlayScene = new Scene();
		this.overlayScene.background = null;
		this.overlayCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
		this.overlayMaterial = new MeshBasicMaterial({
			map: this.effect.selectionTexture,
			toneMapped: false,
			depthTest: false,
			depthWrite: false
		});
		this.overlayQuad = new Mesh(overlayGeometry, this.overlayMaterial);
		this.overlayScene.add(this.overlayQuad);

		// 用于 Selection 输出模式的场景和材质（直接显示选中模型，不应用泛光）
		this.selectionDisplayScene = new Scene();
		this.selectionDisplayCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
		this.selectionDisplayMaterial = new MeshBasicMaterial({
			map: null,
			toneMapped: false,
			depthTest: false,
			depthWrite: false
		});
		this.selectionDisplayQuad = new Mesh(overlayGeometry, this.selectionDisplayMaterial);
		this.selectionDisplayScene.add(this.selectionDisplayQuad);

	}

	set renderToScreen(value) {

		super.renderToScreen = value;
		this.effectPass.renderToScreen = value;

	}

	get renderToScreen() {

		return super.renderToScreen;

	}

	set overlayVisible(value) {

		this.overlayEnabled = value;

	}

	get overlayVisible() {

		return this.overlayEnabled;

	}

	set mainScene(value) {

		this.effectPass.mainScene = value;

	}

	set mainCamera(value) {

		this.effectPass.mainCamera = value;

	}

	get selection() {

		return this.effect.getSelection();

	}

	get selectionTexture() {

		return this.effect.selectionTexture;

	}

	get selectionRenderTarget() {

		return this.effect.selectionRenderTarget;

	}

	render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass, opts = {}) {

		// 如果输出模式为 Selection，直接显示选中模型，不应用泛光效果
		if (this.effect.output === UnrealBloomEffect.OUTPUT.Selection) {

			// 需要先调用 effect.update 来生成 selectionRenderTarget
			// 但不渲染 EffectPass（跳过泛光混合）
			this.effect.update(renderer, inputBuffer, deltaTime, depthPass, outputBuffer);

			const selectionRT = this.effect.selectionRenderTarget;
			if (!selectionRT || selectionRT.texture === null) {

				return;

			}

			// 更新材质纹理
			if (this.selectionDisplayMaterial.map !== selectionRT.texture) {

				this.selectionDisplayMaterial.map = selectionRT.texture;
				this.selectionDisplayMaterial.needsUpdate = true;

			}

			// 保存当前渲染状态
			const previousRenderTarget = renderer.getRenderTarget();
			const previousViewport = renderer.getViewport(new Vector4());
			const previousScissor = renderer.getScissor(new Vector4());

			// 直接渲染选择纹理到输出
			renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
			renderer.setViewport(0, 0, this.bufferWidth, this.bufferHeight);
			renderer.setScissor(0, 0, this.bufferWidth, this.bufferHeight);
			renderer.render(this.selectionDisplayScene, this.selectionDisplayCamera, {
				projectObject: true,
				updateMatrixWorld: false,
				useProgramCache: false
			});

			// 恢复渲染状态
			renderer.setViewport(previousViewport.x, previousViewport.y, previousViewport.z, previousViewport.w);
			renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
			renderer.setRenderTarget(previousRenderTarget);

			// 渲染 overlay（如果启用）
			this._renderOverlay(renderer, outputBuffer);

			return;

		}

		// 正常渲染流程：应用泛光效果
		this.effectPass.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass, opts);

		// 渲染 overlay（如果启用）
		this._renderOverlay(renderer, outputBuffer);

	}

	/**
	 * 渲染选择层调试 overlay
	 * @private
	 */
	_renderOverlay(renderer, outputBuffer) {

		const selection = this.effect.getSelection
			? this.effect.getSelection()
			: this.effect.selection;

		if (!this.overlayEnabled || !selection || selection.size === 0) {

			return;

		}

		const selectionRT = this.effect.selectionRenderTarget;

		if (!selectionRT || selectionRT.texture === null) {

			return;

		}

		if (this.overlayMaterial.map !== selectionRT.texture) {

			this.overlayMaterial.map = selectionRT.texture;
			this.overlayMaterial.needsUpdate = true;

		}

		const viewport = this.selectionViewport;
		if (viewport.width <= 0 || viewport.height <= 0) {

			return;

		}

		// Save current render target state to avoid feedback loops
		const previousRenderTarget = renderer.getRenderTarget();
		const previousViewport = renderer.getViewport(new Vector4());
		const previousScissor = renderer.getScissor(new Vector4());
		const previousScissorTest = renderer.getScissorTest();

		// Explicitly set render target to outputBuffer to avoid feedback loop
		// This ensures we're not reading from a texture that's currently bound as a render target
		renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
		renderer.clearDepth();
		renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
		renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
		renderer.setScissorTest(true);
		renderer.render(this.overlayScene, this.overlayCamera, {
			projectObject: true,
			updateMatrixWorld: false,
			useProgramCache: false
		});

		// Restore previous render target state
		renderer.setScissorTest(previousScissorTest);
		renderer.setViewport(previousViewport.x, previousViewport.y, previousViewport.z, previousViewport.w);
		renderer.setScissor(previousScissor.x, previousScissor.y, previousScissor.z, previousScissor.w);
		renderer.setRenderTarget(previousRenderTarget);

	}

	setSize(width, height) {

		this.bufferWidth = width;
		this.bufferHeight = height;
		this.effectPass.setSize(width, height);

		const availableWidth = Math.max(0, width - this.overlayPadding * 2);
		const availableHeight = Math.max(0, height - this.overlayPadding * 2);

		let insetWidth = Math.round(width * this.overlayInset);
		insetWidth = Math.max(this.overlayMinWidth, insetWidth);
		insetWidth = Math.min(insetWidth, availableWidth);

		if (insetWidth <= 0 || availableHeight <= 0) {

			this.selectionViewport.width = 0;
			this.selectionViewport.height = 0;
			return;

		}

		const aspect = height / Math.max(width, 1);
		let insetHeight = Math.round(insetWidth * aspect);
		insetHeight = Math.min(insetHeight, availableHeight);

		this.selectionViewport.width = insetWidth;
		this.selectionViewport.height = insetHeight;
		this.selectionViewport.x = width - insetWidth - this.overlayPadding;
		this.selectionViewport.y = this.overlayPadding;

	}

	initialize(renderer, alpha, frameBufferType) {

		this.effectPass.initialize(renderer, alpha, frameBufferType);

	}

	dispose() {

		super.dispose();
		this.effectPass.dispose();

		if (this.overlayMaterial) {

			this.overlayMaterial.dispose();

		}

		if (this.selectionDisplayMaterial) {

			this.selectionDisplayMaterial.dispose();

		}

	}

}

