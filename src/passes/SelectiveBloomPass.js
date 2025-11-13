import {
	Mesh,
	MeshBasicMaterial,
	OrthographicCamera,
	PlaneGeometry,
	Scene
} from "three";

import { Pass } from "./Pass.js";
import { EffectPass } from "./EffectPass.js";
import { UnrealBloomEffect } from "../effects/UnrealBloomEffect.js";

const overlayGeometry = /* @__PURE__ */ new PlaneGeometry(2, 2);

/**
 * 将 `UnrealBloomEffect` 封装为可直接插入 EffectComposer 的 Pass，
 * 并内置选择层调试输出。
 */
export class SelectiveBloomPass extends Pass {

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

		this.effectPass.render(renderer, inputBuffer, outputBuffer, deltaTime, stencilTest, depthPass, opts);

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

		const previousScissorTest = renderer.getScissorTest();
		renderer.clearDepth();
		renderer.setViewport(viewport.x, viewport.y, viewport.width, viewport.height);
		renderer.setScissor(viewport.x, viewport.y, viewport.width, viewport.height);
		renderer.setScissorTest(true);
		renderer.render(this.overlayScene, this.overlayCamera, {
			projectObject: true,
			updateMatrixWorld: false,
			useProgramCache: false
		});
		renderer.setScissorTest(previousScissorTest);
		renderer.setViewport(0, 0, this.bufferWidth, this.bufferHeight);
		renderer.setScissor(0, 0, this.bufferWidth, this.bufferHeight);

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

	}

}

