import { Color, RepeatWrapping, Uniform, UnsignedByteType, WebGLRenderTarget } from "three";
import { Resolution } from "../core/Resolution.js";
import { Selection } from "../core/Selection.js";
import { BlendFunction } from "../enums/BlendFunction.js";
import { KernelSize } from "../enums/KernelSize.js";
import { DepthComparisonMaterial } from "../materials/DepthComparisonMaterial.js";
import { OutlineMaterial } from "../materials/OutlineMaterial.js";
import { KawaseBlurPass } from "../passes/KawaseBlurPass.js";
import { ClearPass } from "../passes/ClearPass.js";
import { DepthPass } from "../passes/DepthPass.js";
import { RenderPass } from "../passes/RenderPass.js";
import { ShaderPass } from "../passes/ShaderPass.js";
import { Effect } from "./Effect.js";

import fragmentShader from "./glsl/outline.frag";
import vertexShader from "./glsl/outline.vert";

/**
 * An outline effect.
 */

export class OutlineEffect extends Effect {

	/**
	 * Constructs a new outline effect.
	 *
	 * @param {Scene} scene - The main scene.
	 * @param {Camera} camera - The main camera.
	 * @param {Object} [options] - The options.
	 * @param {BlendFunction} [options.blendFunction=BlendFunction.SCREEN] - The blend function. Use `BlendFunction.ALPHA` for dark outlines.
	 * @param {Texture} [options.patternTexture=null] - A pattern texture.
	 * @param {Number} [options.patternScale=1.0] - The pattern scale.
	 * @param {Number} [options.edgeStrength=1.0] - The edge strength.
	 * @param {Number} [options.pulseSpeed=0.0] - The pulse speed. A value of zero disables the pulse effect.
	 * @param {Number} [options.visibleEdgeColor=0xffffff] - The color of visible edges.
	 * @param {Number} [options.hiddenEdgeColor=0x22090a] - The color of hidden edges.
	 * @param {KernelSize} [options.kernelSize=KernelSize.VERY_SMALL] - The blur kernel size.
	 * @param {Boolean} [options.blur=false] - Whether the outline should be blurred.
	 * @param {Boolean} [options.xRay=true] - Whether occluded parts of selected objects should be visible.
	 * @param {Number} [options.multisampling=0] - The number of samples used for multisample antialiasing. Requires WebGL 2.
	 * @param {Number} [options.resolutionScale=0.5] - The resolution scale.
	 * @param {Number} [options.resolutionX=Resolution.AUTO_SIZE] - The horizontal resolution.
	 * @param {Number} [options.resolutionY=Resolution.AUTO_SIZE] - The vertical resolution.
	 * @param {Number} [options.width=Resolution.AUTO_SIZE] - Deprecated. Use resolutionX instead.
	 * @param {Number} [options.height=Resolution.AUTO_SIZE] - Deprecated. Use resolutionY instead.
	 */

	constructor(scene, camera, {
		blendFunction = BlendFunction.SCREEN,
		patternTexture = null,
		patternScale = 1.0,
		edgeStrength = 1.0,
		pulseSpeed = 0.0,
		visibleEdgeColor = 0xffffff,
		hiddenEdgeColor = 0x22090a,
		kernelSize = KernelSize.VERY_SMALL,
		blur = false,
		xRay = true,
		multisampling = 0,
		resolutionScale = 0.5,
		width = Resolution.AUTO_SIZE,
		height = Resolution.AUTO_SIZE,
		resolutionX = width,
		resolutionY = height
	} = {}) {

		super("OutlineEffect", fragmentShader, {
			uniforms: new Map([
				["maskTexture", new Uniform(null)],
				["edgeTexture", new Uniform(null)],
				["edgeStrength", new Uniform(edgeStrength)],
				["visibleEdgeColor", new Uniform(new Color(visibleEdgeColor))],
				["hiddenEdgeColor", new Uniform(new Color(hiddenEdgeColor))],
				["pulse", new Uniform(1.0)],
				["patternScale", new Uniform(patternScale)],
				["patternTexture", new Uniform(null)]
			])
		});

		// Handle alpha blending.
		this.blendMode.addEventListener("change", (event) => {

			if (this.blendMode.blendFunction === BlendFunction.ALPHA) {

				this.defines.set("ALPHA", "1");

			} else {

				this.defines.delete("ALPHA");

			}

			this.setChanged();

		});

		this.blendMode.blendFunction = blendFunction;
		this.patternTexture = patternTexture;
		this.xRay = xRay;

		/**
		 * The main scene.
		 *
		 * @type {Scene}
		 * @private
		 */

		this.scene = scene;

		/**
		 * The main camera.
		 *
		 * @type {Camera}
		 * @private
		 */

		this.camera = camera;

		/**
		 * A render target for the outline mask.
		 *
		 * @type {WebGLRenderTarget}
		 * @private
		 */

		this.renderTargetMask = new WebGLRenderTarget(1, 1);
		this.renderTargetMask.samples = multisampling;
		this.renderTargetMask.texture.name = "Outline.Mask";
		this.uniforms.get("maskTexture").value = this.renderTargetMask.texture;

		/**
		 * A render target for the edge detection.
		 *
		 * @type {WebGLRenderTarget}
		 * @private
		 */

		this.renderTargetOutline = new WebGLRenderTarget(1, 1, { depthBuffer: false });
		this.renderTargetOutline.texture.name = "Outline.Edges";
		this.uniforms.get("edgeTexture").value = this.renderTargetOutline.texture;

		/**
		 * A clear pass.
		 *
		 * @type {ClearPass}
		 * @private
		 */

		this.clearPass = new ClearPass();
		this.clearPass.overrideClearColor = new Color(0x000000);
		this.clearPass.overrideClearAlpha = 1;

		/**
		 * A depth pass.
		 *
		 * @type {DepthPass}
		 * @private
		 */

		this.depthPass = new DepthPass(scene, camera);

		/**
		 * A depth comparison mask pass.
		 *
		 * @type {RenderPass}
		 * @private
		 */

		this.maskPass = new RenderPass(scene, camera, new DepthComparisonMaterial(this.depthPass.texture, camera));
		const clearPass = this.maskPass.clearPass;
		clearPass.overrideClearColor = new Color(0xffffff);
		clearPass.overrideClearAlpha = 1;

		/**
		 * A blur pass.
		 *
		 * @type {KawaseBlurPass}
		 */

		this.blurPass = new KawaseBlurPass({ resolutionScale, resolutionX, resolutionY, kernelSize });
		this.blurPass.enabled = blur;
		const resolution = this.blurPass.resolution;
		resolution.addEventListener("change", (e) => this.setSize(resolution.baseWidth, resolution.baseHeight));

		/**
		 * An outline detection pass.
		 *
		 * @type {ShaderPass}
		 * @private
		 */

		this.outlinePass = new ShaderPass(new OutlineMaterial());
		const outlineMaterial = this.outlinePass.fullscreenMaterial;
		outlineMaterial.inputBuffer = this.renderTargetMask.texture;

		/**
		 * The current animation time.
		 *
		 * @type {Number}
		 * @private
		 */

		this.time = 0;

		/**
		 * Indicates whether the outlines should be updated.
		 *
		 * @type {Boolean}
		 * @private
		 */

		this.forceUpdate = true;

		/**
		 * A selection of objects that will be outlined.
		 *
		 * @type {Selection}
		 */

		this.selection = new Selection();

		/**
		 * The pulse speed. Set to 0 to disable.
		 *
		 * @type {Number}
		 */

		this.pulseSpeed = pulseSpeed;

	}

	set mainScene(value) {

		this.scene = value;
		this.depthPass.mainScene = value;
		this.maskPass.mainScene = value;

	}

	set mainCamera(value) {

		this.camera = value;
		this.depthPass.mainCamera = value;
		this.maskPass.mainCamera = value;
		this.maskPass.overrideMaterial.copyCameraSettings(value);

	}

	/**
	 * The resolution of this effect.
	 *
	 * @type {Resolution}
	 */

	get resolution() {

		return this.blurPass.resolution;

	}

	/**
	 * Returns the resolution.
	 *
	 * @return {Resizer} The resolution.
	 */

	getResolution() {

		return this.blurPass.getResolution();

	}

	/**
	 * The amount of MSAA samples.
	 *
	 * Requires WebGL 2. Set to zero to disable multisampling.
	 *
	 * @experimental Requires three >= r138.
	 * @type {Number}
	 */

	get multisampling() {

		return this.renderTargetMask.samples;

	}

	set multisampling(value) {

		this.renderTargetMask.samples = value;
		this.renderTargetMask.dispose();

	}

	/**
	 * The pattern scale.
	 *
	 * @type {Number}
	 */

	get patternScale() {

		return this.uniforms.get("patternScale").value;

	}

	set patternScale(value) {

		this.uniforms.get("patternScale").value = value;

	}

	/**
	 * The edge strength.
	 *
	 * @type {Number}
	 */

	get edgeStrength() {

		return this.uniforms.get("edgeStrength").value;

	}

	set edgeStrength(value) {

		this.uniforms.get("edgeStrength").value = value;

	}

	/**
	 * The visible edge color.
	 *
	 * @type {Color}
	 */

	get visibleEdgeColor() {

		return this.uniforms.get("visibleEdgeColor").value;

	}

	set visibleEdgeColor(value) {

		this.uniforms.get("visibleEdgeColor").value = value;

	}

	/**
	 * The hidden edge color.
	 *
	 * @type {Color}
	 */

	get hiddenEdgeColor() {

		return this.uniforms.get("hiddenEdgeColor").value;

	}

	set hiddenEdgeColor(value) {

		this.uniforms.get("hiddenEdgeColor").value = value;

	}

	/**
	 * Returns the blur pass.
	 *
	 * @deprecated Use blurPass instead.
	 * @return {KawaseBlurPass} The blur pass.
	 */

	getBlurPass() {

		return this.blurPass;

	}

	/**
	 * Returns the selection.
	 *
	 * @deprecated Use selection instead.
	 * @return {Selection} The selection.
	 */

	getSelection() {

		return this.selection;

	}

	/**
	 * Returns the pulse speed.
	 *
	 * @deprecated Use pulseSpeed instead.
	 * @return {Number} The speed.
	 */

	getPulseSpeed() {

		return this.pulseSpeed;

	}

	/**
	 * Sets the pulse speed. Set to zero to disable.
	 *
	 * @deprecated Use pulseSpeed instead.
	 * @param {Number} value - The speed.
	 */

	setPulseSpeed(value) {

		this.pulseSpeed = value;

	}

	/**
	 * The current width of the internal render targets.
	 *
	 * @type {Number}
	 * @deprecated Use resolution.width instead.
	 */

	get width() {

		return this.resolution.width;

	}

	set width(value) {

		this.resolution.preferredWidth = value;

	}

	/**
	 * The current height of the internal render targets.
	 *
	 * @type {Number}
	 * @deprecated Use resolution.height instead.
	 */

	get height() {

		return this.resolution.height;

	}

	set height(value) {

		this.resolution.preferredHeight = value;

	}

	/**
	 * The selection layer.
	 *
	 * @type {Number}
	 * @deprecated Use selection.layer instead.
	 */

	get selectionLayer() {

		return this.selection.layer;

	}

	set selectionLayer(value) {

		this.selection.layer = value;

	}

	/**
	 * Indicates whether dithering is enabled.
	 *
	 * @type {Boolean}
	 * @deprecated
	 */

	get dithering() {

		return this.blurPass.dithering;

	}

	set dithering(value) {

		this.blurPass.dithering = value;

	}

	/**
	 * The blur kernel size.
	 *
	 * @type {KernelSize}
	 * @deprecated Use blurPass.kernelSize instead.
	 */

	get kernelSize() {

		return this.blurPass.kernelSize;

	}

	set kernelSize(value) {

		this.blurPass.kernelSize = value;

	}

	/**
	 * Indicates whether the outlines should be blurred.
	 *
	 * @type {Boolean}
	 * @deprecated Use blurPass.enabled instead.
	 */

	get blur() {

		return this.blurPass.enabled;

	}

	set blur(value) {

		this.blurPass.enabled = value;

	}

	/**
	 * Indicates whether X-ray mode is enabled.
	 *
	 * @type {Boolean}
	 */

	get xRay() {

		return this.defines.has("X_RAY");

	}

	set xRay(value) {

		if (this.xRay !== value) {

			if (value) {

				this.defines.set("X_RAY", "1");

			} else {

				this.defines.delete("X_RAY");

			}

			this.setChanged();

		}

	}

	/**
	 * Indicates whether X-ray mode is enabled.
	 *
	 * @deprecated Use xRay instead.
	 * @return {Boolean} Whether X-ray mode is enabled.
	 */

	isXRayEnabled() {

		return this.xRay;

	}

	/**
	 * Enables or disables X-ray outlines.
	 *
	 * @deprecated Use xRay instead.
	 * @param {Boolean} value - Whether X-ray should be enabled.
	 */

	setXRayEnabled(value) {

		this.xRay = value;

	}

	/**
	 * The pattern texture. Set to `null` to disable.
	 *
	 * @type {Texture}
	 */

	get patternTexture() {

		return this.uniforms.get("patternTexture").value;

	}

	set patternTexture(value) {

		if (value !== null) {

			value.wrapS = value.wrapT = RepeatWrapping;
			this.defines.set("USE_PATTERN", "1");
			this.setVertexShader(vertexShader);

		} else {

			this.defines.delete("USE_PATTERN");
			this.setVertexShader(null);

		}

		this.uniforms.get("patternTexture").value = value;
		this.setChanged();

	}

	/**
	 * Sets the pattern texture.
	 *
	 * @deprecated Use patternTexture instead.
	 * @param {Texture} value - The new texture.
	 */

	setPatternTexture(value) {

		this.patternTexture = value;

	}

	/**
	 * Returns the current resolution scale.
	 *
	 * @return {Number} The resolution scale.
	 * @deprecated Use resolution instead.
	 */

	getResolutionScale() {

		return this.resolution.scale;

	}

	/**
	 * Sets the resolution scale.
	 *
	 * @param {Number} scale - The new resolution scale.
	 * @deprecated Use resolution instead.
	 */

	setResolutionScale(scale) {

		this.resolution.scale = scale;

	}

	/**
	 * Clears the current selection and selects a list of objects.
	 *
	 * @param {Object3D[]} objects - The objects that should be outlined. This array will be copied.
	 * @return {OutlinePass} This pass.
	 * @deprecated Use selection.set() instead.
	 */

	setSelection(objects) {

		this.selection.set(objects);
		return this;

	}

	/**
	 * Clears the list of selected objects.
	 *
	 * @return {OutlinePass} This pass.
	 * @deprecated Use selection.clear() instead.
	 */

	clearSelection() {

		this.selection.clear();
		return this;

	}

	/**
	 * Selects an object.
	 *
	 * @param {Object3D} object - The object that should be outlined.
	 * @return {OutlinePass} This pass.
	 * @deprecated Use selection.add() instead.
	 */

	selectObject(object) {

		this.selection.add(object);
		return this;

	}

	/**
	 * Deselects an object.
	 *
	 * @param {Object3D} object - The object that should no longer be outlined.
	 * @return {OutlinePass} This pass.
	 * @deprecated Use selection.delete() instead.
	 */

	deselectObject(object) {

		this.selection.delete(object);
		return this;

	}

	/**
	 * Updates this effect.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {WebGLRenderTarget} inputBuffer - A frame buffer that contains the result of the previous pass.
	 * @param {Number} [deltaTime] - The time between the last frame and the current one in seconds.
	 */

	update(renderer, inputBuffer, deltaTime) {

		const scene = this.scene;
		const camera = this.camera;
		const selection = this.selection;
		const uniforms = this.uniforms;
		const pulse = uniforms.get("pulse");

		const background = scene.background;
		const mask = camera.layers.mask;

		console.time("OutlineEffect.update");
		console.log("OutlineEffect update called, selection size:", selection.size);

		if (this.forceUpdate || selection.size > 0) {
			console.time("OutlineEffect.update.preparation");
			scene.background = null;
			pulse.value = 1;

			if (this.pulseSpeed > 0) {
				pulse.value = Math.cos(this.time * this.pulseSpeed * 10.0) * 0.375 + 0.625;
			}

			this.time += deltaTime;
			console.timeEnd("OutlineEffect.update.preparation");

			// Render a custom depth texture and ignore selected objects.
			console.time("OutlineEffect.update.depthPass");
			selection.setVisible(false);
			this.depthPass.render(renderer);
			selection.setVisible(true);
			console.timeEnd("OutlineEffect.update.depthPass");

			// Compare the depth of the selected objects with the depth texture.
			console.time("OutlineEffect.update.maskPass");
			camera.layers.set(selection.layer);
			this.maskPass.render(renderer, this.renderTargetMask);
			console.timeEnd("OutlineEffect.update.maskPass");

			// Restore the camera layer mask and the scene background.
			console.time("OutlineEffect.update.restoration");
			camera.layers.mask = mask;
			scene.background = background;
			console.timeEnd("OutlineEffect.update.restoration");

			// Detect the outline.
			console.time("OutlineEffect.update.outlinePass");
			this.outlinePass.render(renderer, null, this.renderTargetOutline);
			console.timeEnd("OutlineEffect.update.outlinePass");

			if (this.blurPass.enabled) {
				console.time("OutlineEffect.update.blurPass");
				this.blurPass.render(renderer, this.renderTargetOutline, this.renderTargetOutline);
				console.timeEnd("OutlineEffect.update.blurPass");
			}
		} else {
			console.log("OutlineEffect update skipped (no selection or update not forced)");
		}

		this.forceUpdate = selection.size > 0;
		console.timeEnd("OutlineEffect.update");
		console.log("OutlineEffect.update completed, forceUpdate set to:", this.forceUpdate);
	}

	/**
	 * Updates the size of internal render targets.
	 *
	 * @param {Number} width - The width.
	 * @param {Number} height - The height.
	 */

	setSize(width, height) {

		this.blurPass.setSize(width, height);
		this.renderTargetMask.setSize(width, height);

		const resolution = this.resolution;
		resolution.setBaseSize(width, height);
		const w = resolution.width, h = resolution.height;

		this.depthPass.setSize(w, h);
		this.renderTargetOutline.setSize(w, h);
		this.outlinePass.fullscreenMaterial.setSize(w, h);

	}

	/**
	 * Performs initialization tasks.
	 *
	 * @param {WebGLRenderer} renderer - The renderer.
	 * @param {Boolean} alpha - Whether the renderer uses the alpha channel or not.
	 * @param {Number} frameBufferType - The type of the main frame buffers.
	 */

	initialize(renderer, alpha, frameBufferType) {

		// No need for high precision: the blur pass operates on a mask texture.
		this.blurPass.initialize(renderer, alpha, UnsignedByteType);

		if (frameBufferType !== undefined) {

			// These passes ignore the buffer type.
			this.depthPass.initialize(renderer, alpha, frameBufferType);
			this.maskPass.initialize(renderer, alpha, frameBufferType);
			this.outlinePass.initialize(renderer, alpha, frameBufferType);

		}

	}

}
