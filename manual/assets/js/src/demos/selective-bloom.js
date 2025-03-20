import {
    AnimationMixer,
    Color,
    CubeTextureLoader,
    GLTFLoader,
    LoadingManager,
    PerspectiveCamera,
    Raycaster,
    Scene,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    VSMShadowMap,
    WebGLRenderer
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    KernelSize,
    RenderPass,
    Selection,
    SelectiveBloomEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Shapes from "../objects/Shapes";

function load() {

    const assets = new Map();
    const loadingManager = new LoadingManager();
    const gltfLoader = new GLTFLoader(loadingManager);
    const textureLoader = new TextureLoader(loadingManager);
    const cubeTextureLoader = new CubeTextureLoader(loadingManager);

    const path = document.baseURI + "img/textures/skies/sunset/";
    const format = ".png";
    const urls = [
        path + "px" + format, path + "nx" + format,
        path + "py" + format, path + "ny" + format,
        path + "pz" + format, path + "nz" + format
    ];

    return new Promise((resolve, reject) => {

        loadingManager.onLoad = () => resolve(assets);
        loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

        gltfLoader.load(`${document.baseURI}models/rigged-simple/RiggedSimple.gltf`, (gltf) => {

            gltf.scene.traverse((object) => {

                if (object.isMesh) {

                    object.castShadow = object.receiveShadow = true;

                }

            });

            assets.set("rigged-simple", gltf);

        });

        textureLoader.load(`${document.baseURI}img/textures/pattern.png`, (t) => {

            t.colorSpace = SRGBColorSpace;
            assets.set("pattern", t);

        });

        cubeTextureLoader.load(urls, (t) => {

            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);

        });

    });

}

window.addEventListener("load", () => load().then((assets) => {

    // Renderer

    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    renderer.shadowMap.type = VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    renderer.shadowMap.enabled = true;

    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 创建左上角开关面板的容器
    const switchContainer = document.createElement("div");
    switchContainer.style.position = "absolute";
    switchContainer.style.top = "20px";
    switchContainer.style.left = "20px";
    switchContainer.style.zIndex = "1000";
    switchContainer.style.background = "rgba(0, 0, 0, 0.7)";
    switchContainer.style.padding = "15px";
    switchContainer.style.borderRadius = "8px";
    switchContainer.style.color = "white";
    switchContainer.style.boxShadow = "0 4px 8px rgba(0,0,0,0.5)";
    switchContainer.style.minWidth = "220px";
    container.appendChild(switchContainer);

    // Camera & Controls

    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = false;
    controls.position.set(2, 2, 10);

    // Scene, Lights, Objects

    const scene = new Scene();
    scene.background = assets.get("sky");
    scene.add(Shapes.createLights());
    const actors = Shapes.createActors();
    scene.add(actors);

    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    actors.add(riggedSimple.scene);

    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    const step = 2.0 * Math.PI / actors.children.length;
    const radius = 3.0;
    let angle = 3.5;

    for (const mesh of actors.children) {
        // Arrange the objects in a circle.
        mesh.position.set(radius * Math.cos(angle), 0, radius * Math.sin(angle));
        angle += step;
    }

    // Post Processing

    const multisampling = Math.min(4, renderer.capabilities.maxSamples);
    const composer = new EffectComposer(renderer, { multisampling });

    // Create a single selective bloom effect
    const bloomEffect = new SelectiveBloomEffect(scene, camera, {
        blendFunction: BlendFunction.SCREEN,
        luminanceThreshold: 0.3,
        luminanceSmoothing: 0.2,
        intensity: 3.0,
        mipmapBlur: true
    });

    // Set selection layer
    bloomEffect.selection.layer = 21;

    // Add first two objects to the bloom effect
    bloomEffect.selection.add(actors.children[0]);
    bloomEffect.selection.add(actors.children[1]);

    // Enable dithering for smoother bloom
    bloomEffect.mipmapBlurPass.dithering = true;

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, bloomEffect));

    // Object Picking

    const ndc = new Vector2();
    const raycaster = new Raycaster();
    renderer.domElement.addEventListener("pointerdown", (event) => {

        const clientRect = container.getBoundingClientRect();
        const clientX = event.clientX - clientRect.left;
        const clientY = event.clientY - clientRect.top;
        ndc.x = (clientX / container.clientWidth) * 2.0 - 1.0;
        ndc.y = -(clientY / container.clientHeight) * 2.0 + 1.0;
        raycaster.setFromCamera(ndc, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;

            // Toggle the selection
            if (bloomEffect.selection.has(object)) {
                bloomEffect.selection.delete(object);
            } else {
                bloomEffect.selection.add(object);
            }
        }

    });

    // Settings

    const fpsMeter = new FPSMeter();
    const color = new Color();

    const params = {
        "intensity": bloomEffect.intensity,
        "resolutionScale": 0.5
    };

    // 创建左上角的控制面板容器
    const switchPane = new Pane({ container: switchContainer });

    // Add title
    const titleElement = document.createElement("div");
    titleElement.textContent = "Selective Bloom Effect";
    titleElement.style.fontSize = "16px";
    titleElement.style.fontWeight = "bold";
    titleElement.style.marginBottom = "10px";
    titleElement.style.textAlign = "center";
    switchContainer.prepend(titleElement);

    // Add usage instructions
    const instructions = document.createElement("div");
    instructions.style.marginTop = "15px";
    instructions.style.fontSize = "12px";
    instructions.style.lineHeight = "1.4";
    instructions.style.color = "rgba(255, 255, 255, 0.8)";
    instructions.innerHTML = "点击场景中的对象切换泛光效果<br>通过控制面板调整泛光参数";
    switchContainer.appendChild(instructions);

    // Add basic controls to left panel
    switchPane.addBinding(bloomEffect, "inverted", { label: "反转选择" });
    switchPane.addBinding(bloomEffect, "ignoreBackground", { label: "忽略背景" });
    switchPane.addBinding(params, "intensity", { label: "强度", min: 0, max: 5, step: 0.1 })
        .on("change", (e) => {
            bloomEffect.intensity = e.value;
        });

    // 右侧主控制面板
    const mainPane = new Pane({ container: container.querySelector(".tp") });
    mainPane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // Global explanation
    const folderInfo = mainPane.addFolder({ title: "Selective Bloom 说明" });
    const infoParams = {
        "info": "SelectiveBloomEffect可以对选定的对象应用泛光效果。点击物体可以添加或移除泛光效果。",
        "features": "• 只对选中的对象应用泛光\n• 可以反转选择\n• 可以忽略背景\n• 可以调整多种参数"
    };
    folderInfo.addBinding(infoParams, "info", { label: "说明", multiline: true, readonly: true, rows: 2 });
    folderInfo.addBinding(infoParams, "features", { label: "功能", multiline: true, readonly: true, rows: 4 });

    // Bloom settings
    const folderBloom = mainPane.addFolder({ title: "Bloom Settings" });
    folderBloom.addBinding(params, "intensity", { min: 0, max: 10, step: 0.1 })
        .on("change", (e) => {
            bloomEffect.intensity = e.value;
        });
    folderBloom.addBinding(bloomEffect.mipmapBlurPass, "radius", { min: 0, max: 1, step: 0.001 });
    folderBloom.addBinding(bloomEffect.mipmapBlurPass, "levels", { min: 1, max: 8, step: 1 });
    folderBloom.addBinding(bloomEffect.mipmapBlurPass, "dithering");

    // Luminance settings
    const folderLuminance = mainPane.addFolder({ title: "Luminance Settings" });
    folderLuminance.addBinding(bloomEffect.luminanceMaterial, "threshold", { min: 0, max: 1, step: 0.01 });
    folderLuminance.addBinding(bloomEffect.luminanceMaterial, "smoothing", { min: 0, max: 1, step: 0.01 });
    folderLuminance.addBinding(bloomEffect.luminancePass, "enabled", { label: "Apply Luminance" });

    // Selection settings
    const folderSelection = mainPane.addFolder({ title: "Selection Settings" });
    folderSelection.addBinding(bloomEffect, "inverted", { label: "Invert Selection" });
    folderSelection.addBinding(bloomEffect, "ignoreBackground", { label: "Ignore Background" });
    folderSelection.addBinding(params, "resolutionScale", { min: 0.1, max: 1, step: 0.05 })
        .on("change", (e) => {
            bloomEffect.resolution.scale = e.value;
            bloomEffect.setSize(container.clientWidth, container.clientHeight);
        });

    // Blend settings
    const folderBlend = mainPane.addFolder({ title: "Blend Settings" });
    folderBlend.addBinding(bloomEffect.blendMode, "blendFunction", { options: BlendFunction });
    folderBlend.addBinding(bloomEffect.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });

    // Add color settings
    const folderColor = mainPane.addFolder({ title: "Color Settings" });
    const colorParams = {
        // Default color tint
        r: 1.0,
        g: 1.0,
        b: 1.0
    };
    folderColor.addBinding(colorParams, "r", { min: 0, max: 2, step: 0.1, label: "Red" })
        .on("change", updateTint);
    folderColor.addBinding(colorParams, "g", { min: 0, max: 2, step: 0.1, label: "Green" })
        .on("change", updateTint);
    folderColor.addBinding(colorParams, "b", { min: 0, max: 2, step: 0.1, label: "Blue" })
        .on("change", updateTint);

    function updateTint() {
        bloomEffect.tint = new Color(colorParams.r, colorParams.g, colorParams.b);
    }

    // Call once to initialize
    updateTint();

    // Resize Handler

    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // Render Loop

    let t0 = 0;

    requestAnimationFrame(function render(timestamp) {

        const deltaTime = timestamp - t0;
        t0 = timestamp;

        fpsMeter.update(timestamp);
        controls.update(timestamp);
        animationMixer.update(deltaTime * 1e-3);
        composer.render();
        requestAnimationFrame(render);

    });

})); 