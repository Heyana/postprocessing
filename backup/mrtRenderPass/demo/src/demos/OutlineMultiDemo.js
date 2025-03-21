import {
    AmbientLight,
    Color,
    CubeTextureLoader,
    DirectionalLight,
    Mesh,
    MeshPhongMaterial,
    PerspectiveCamera,
    Raycaster,
    SphereGeometry,
    TextureLoader,
    Vector2,
    SRGBColorSpace
} from "three";

import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV } from "three-demo";
import { ProgressManager } from "../utils/ProgressManager";
import { PostProcessingDemo } from "./PostProcessingDemo";

import {
    BlendFunction,
    EdgeDetectionMode,
    EffectPass,
    KernelSize,
    SMAAEffect,
    SMAAImageLoader,
    SMAAPreset
} from "../../../src";

// Import the OutlineMultiEffect
import { OutlineMultiEffect } from "../../../src/effects/OutlineMultiEffect";

/**
 * Normalized device coordinates.
 *
 * @type {Vector2}
 * @private
 */

const ndc = new Vector2();

/**
 * An outline multi demo that shows multiple colored outlines.
 *
 * @implements {EventListenerObject}
 */

export class OutlineMultiDemo extends PostProcessingDemo {

    /**
     * Constructs a new outline multi demo.
     *
     * @param {EffectComposer} composer - An effect composer.
     */

    constructor(composer) {

        super("outline-multi", composer);

        /**
         * A raycaster.
         *
         * @type {Raycaster}
         * @private
         */

        this.raycaster = null;

        /**
         * A selected object.
         *
         * @type {Object3D}
         * @private
         */

        this.selectedObject = null;

        /**
         * An effect.
         *
         * @type {OutlineMultiEffect}
         * @private
         */

        this.effect = null;

        /**
         * The sphere objects.
         *
         * @type {Array}
         * @private
         */
        this.spheres = [];

        /**
         * Available color sets for outlines.
         * 
         * @type {Object}
         * @private
         */
        this.colorSets = {
            red: {
                visible: 0xff0000,
                hidden: 0x330000
            },
            green: {
                visible: 0x00ff00,
                hidden: 0x003300
            },
            blue: {
                visible: 0x0000ff,
                hidden: 0x000033
            }
        };
    }

    /**
     * Raycasts the scene.
     *
     * @param {PointerEvent} event - An event.
     */

    raycast(event) {

        const raycaster = this.raycaster;

        ndc.x = (event.clientX / window.innerWidth) * 2.0 - 1.0;
        ndc.y = -(event.clientY / window.innerHeight) * 2.0 + 1.0;

        raycaster.setFromCamera(ndc, this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);

        this.selectedObject = null;

        if (intersects.length > 0) {

            const object = intersects[0].object;

            if (object !== undefined) {

                this.selectedObject = object;

            }

        }

    }

    /**
     * Handles the current selection and toggles the selection.
     *
     * @private
     */

    handleSelection() {

        const selection = this.effect.selection;
        const selectedObject = this.selectedObject;

        if (selectedObject !== null) {

            if (selection.has(selectedObject)) {

                selection.delete(selectedObject);

            } else {

                selection.add(selectedObject);

            }

        }

    }

    handleEvent(event) {

        switch (event.type) {

            case "pointerdown":
                this.raycast(event);
                this.handleSelection();
                break;

        }

    }

    load() {

        const assets = this.assets;
        const loadingManager = this.loadingManager;
        const textureLoader = new TextureLoader(loadingManager);
        const cubeTextureLoader = new CubeTextureLoader(loadingManager);
        const smaaImageLoader = new SMAAImageLoader(loadingManager);

        const path = "textures/skies/sunset/";
        const format = ".png";
        const urls = [
            path + "px" + format, path + "nx" + format,
            path + "py" + format, path + "ny" + format,
            path + "pz" + format, path + "nz" + format
        ];

        return new Promise((resolve, reject) => {

            if (assets.size === 0) {

                loadingManager.onLoad = () => setTimeout(resolve, 250);
                loadingManager.onProgress = ProgressManager.updateProgress;
                loadingManager.onError = url => console.error(`Failed to load ${url}`);

                cubeTextureLoader.load(urls, (t) => {

                    t.colorSpace = SRGBColorSpace;
                    assets.set("sky", t);

                });

                textureLoader.load("textures/pattern.png", (t) => {

                    t.colorSpace = SRGBColorSpace;
                    assets.set("pattern-color", t);

                });

                smaaImageLoader.load(([search, area]) => {

                    assets.set("smaa-search", search);
                    assets.set("smaa-area", area);

                });

            } else {

                resolve();

            }

        });

    }

    /**
     * Creates the scene.
     */

    initialize() {

        const scene = this.scene;
        const assets = this.assets;
        const composer = this.composer;
        const renderer = composer.getRenderer();
        const domElement = renderer.domElement;

        // Camera

        const aspect = window.innerWidth / window.innerHeight;
        const vFoV = calculateVerticalFoV(90, Math.max(aspect, 16 / 9));
        const camera = new PerspectiveCamera(vFoV, aspect, 0.3, 2000);
        this.camera = camera;

        // Controls

        const { position, quaternion } = camera;
        const controls = new SpatialControls(position, quaternion, domElement);
        const settings = controls.settings;
        settings.general.setMode(ControlMode.THIRD_PERSON);
        settings.rotation.setSensitivity(2.2);
        settings.rotation.setDamping(0.05);
        settings.translation.setEnabled(false);
        settings.translation.setDamping(0.1);
        controls.setPosition(0, 0, 5);
        this.controls = controls;

        // Sky

        scene.background = assets.get("sky");

        // Lights

        const ambientLight = new AmbientLight(0x666666);
        const directionalLight = new DirectionalLight(0xffbbaa);
        directionalLight.position.set(-1, 1, 1);
        directionalLight.target.position.copy(scene.position);
        scene.add(directionalLight, ambientLight);

        // Create three spheres with different colors
        const sphereGeometry = new SphereGeometry(0.8, 32, 32);
        const sphereColors = [0xff8888, 0x88ff88, 0x8888ff]; // Red, Green, Blue
        const colorSetKeys = Object.keys(this.colorSets);

        for (let i = 0; i < 3; i++) {
            const material = new MeshPhongMaterial({
                color: sphereColors[i],
                flatShading: false
            });

            const sphere = new Mesh(sphereGeometry, material);

            // Position spheres in a row
            sphere.position.x = (i - 1) * 2.5;

            scene.add(sphere);
            this.spheres.push(sphere);
        }

        // Raycaster
        this.raycaster = new Raycaster();
        renderer.domElement.addEventListener("pointerdown", this);

        // Passes

        // Create and configure outlineMultiEffect
        const effect = new OutlineMultiEffect(scene, camera, {
            blendFunction: BlendFunction.SCREEN,
            edgeStrength: 2.5,
            pulseSpeed: 0.5,
            kernelSize: KernelSize.SMALL,
            blur: true,
            xRay: true
        });

        // Set up color sets
        for (const [id, colors] of Object.entries(this.colorSets)) {
            effect.addColorSet(id, colors.visible, colors.hidden);
        }

        // Assign specific color sets to each sphere
        effect.assignColorSet(this.spheres[0], "red");
        effect.assignColorSet(this.spheres[1], "green");
        effect.assignColorSet(this.spheres[2], "blue");

        // Add all spheres to selection by default to show their outlines
        this.spheres.forEach(sphere => effect.selection.add(sphere));

        this.effect = effect;

        const smaaEffect = new SMAAEffect(
            assets.get("smaa-search"),
            assets.get("smaa-area"),
            SMAAPreset.HIGH,
            EdgeDetectionMode.COLOR
        );

        const effectPass = new EffectPass(camera, smaaEffect, effect);
        composer.addPass(effectPass);

    }

    /**
     * Updates this demo.
     *
     * @param {Number} deltaTime - The time since the last frame in seconds.
     * @param {Number} timestamp - The current time in milliseconds.
     */

    update(deltaTime, timestamp) {
        // Add gentle rotation to the spheres
        this.spheres.forEach(sphere => {
            sphere.rotation.y += deltaTime * 0.5;
            sphere.rotation.x += deltaTime * 0.2;
        });
    }

    /**
     * Registers configuration options.
     *
     * @param {GUI} menu - A menu.
     */

    registerOptions(menu) {

        const renderer = this.composer.getRenderer();
        const effect = this.effect;

        const params = {
            "blur": effect.blurPass.enabled,
            "kernel size": effect.blurPass.kernelSize,
            "use pattern": effect.patternTexture !== null,
            "pattern scale": effect.patternScale,
            "pulse speed": effect.pulseSpeed,
            "edge strength": effect.edgeStrength,
            "x-ray": effect.xRay,
            "opacity": 1.0
        };

        menu.add(params, "x-ray").onChange((value) => {

            effect.xRay = value;

        });

        menu.add(params, "blur").onChange((value) => {

            effect.blurPass.enabled = value;

        });

        menu.add(params, "kernel size").min(KernelSize.VERY_SMALL).max(KernelSize.HUGE).step(1)
            .onChange((value) => {

                effect.blurPass.kernelSize = value;

            });

        menu.add(params, "edge strength").min(0.0).max(10.0).step(0.01)
            .onChange((value) => {

                effect.edgeStrength = value;

            });

        const folder = menu.addFolder("Pattern");

        folder.add(params, "use pattern").onChange((value) => {

            if (value) {

                effect.patternTexture = this.assets.get("pattern-color");

            } else {

                effect.patternTexture = null;

            }

        });

        folder.add(params, "pattern scale").min(0.0).max(10.0).step(0.01).onChange((value) => {

            effect.patternScale = value;

        });

        folder.open();

        menu.add(params, "pulse speed").min(0.0).max(2.0).step(0.01).onChange((value) => {

            effect.pulseSpeed = value;

        });

        // Color Set controls
        const colorFolder = menu.addFolder("Color Sets");

        // For each available color set
        for (const [id, colors] of Object.entries(this.colorSets)) {
            const colorParams = {
                [`${id} visible`]: "#" + colors.visible.toString(16).padStart(6, "0"),
                [`${id} hidden`]: "#" + colors.hidden.toString(16).padStart(6, "0"),
            };

            colorFolder.addColor(colorParams, `${id} visible`).onChange((value) => {
                // Convert hex string to number
                const colorValue = parseInt(value.replace("#", ""), 16);
                // Update the color set
                this.colorSets[id].visible = colorValue;
                // Update the effect's color set
                effect.addColorSet(id, colorValue, this.colorSets[id].hidden);
            });

            colorFolder.addColor(colorParams, `${id} hidden`).onChange((value) => {
                const colorValue = parseInt(value.replace("#", ""), 16);
                this.colorSets[id].hidden = colorValue;
                effect.addColorSet(id, this.colorSets[id].visible, colorValue);
            });
        }

        colorFolder.open();

    }

    /**
     * Disposes this demo.
     */

    dispose() {

        const domElement = this.composer.getRenderer().domElement;
        domElement.removeEventListener("pointerdown", this);

        super.dispose();

    }

}