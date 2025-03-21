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
    OutlineManager,
    SharedOutlineEffect,
    OverrideMaterialManager
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

    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });

    // Create a shared outline manager
    const outlineManager = new OutlineManager(scene, camera, {
        resolutionScale: 0.75,
        multisampling
    });

    // Create multiple outline effects with different colors
    const redOutlineEffect = new SharedOutlineEffect(outlineManager, {
        blendFunction: BlendFunction.SCREEN,
        patternScale: 40,
        visibleEdgeColor: 0xff0000, // Red
        hiddenEdgeColor: 0x550000, // Dark Red
        resolutionScale: 0.75,
        blur: false,
        xRay: true,
    });

    const blueOutlineEffect = new SharedOutlineEffect(outlineManager, {
        blendFunction: BlendFunction.SCREEN,
        patternScale: 40,
        visibleEdgeColor: 0x0000ff, // Blue
        hiddenEdgeColor: 0x000055, // Dark Blue
        resolutionScale: 0.75,
        blur: false,
        xRay: true,
    });

    // Set different selection layers to prevent color mixing
    redOutlineEffect.selectionLayer = 21; // 使用单独的层
    blueOutlineEffect.selectionLayer = 22; // 使用另一个单独的层

    // Add first two objects to red outline
    redOutlineEffect.selection.add(actors.children[0]);
    redOutlineEffect.selection.add(actors.children[1]);

    // Add next two objects to blue outline
    blueOutlineEffect.selection.add(actors.children[2]);
    blueOutlineEffect.selection.add(actors.children[3]);

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, redOutlineEffect, blueOutlineEffect));

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

            // First make sure object is removed from both effects to prevent color blending
            // This is defensive; our SharedOutlineEffect tracking should handle this too
            if (redOutlineEffect.selection.has(object)) {
                redOutlineEffect.selection.delete(object);
            }
            if (blueOutlineEffect.selection.has(object)) {
                blueOutlineEffect.selection.delete(object);
            }

            // 根据开关状态决定使用哪个轮廓效果
            if (params.useBlueOutline) {
                // 使用蓝色轮廓
                blueOutlineEffect.selection.add(object);
            } else {
                // 使用红色轮廓
                redOutlineEffect.selection.add(object);
            }

            // Force the shared manager to update
            outlineManager.setNeedsUpdate();
        }

    });

    // Settings

    const fpsMeter = new FPSMeter();
    const color = new Color();

    const params = {
        "patternTexture": false,
        "multisampling": true,
        "redVisibleEdgeColor": color.copy(redOutlineEffect.visibleEdgeColor).convertLinearToSRGB().getHex(),
        "redHiddenEdgeColor": color.copy(redOutlineEffect.hiddenEdgeColor).convertLinearToSRGB().getHex(),
        "blueVisibleEdgeColor": color.copy(blueOutlineEffect.visibleEdgeColor).convertLinearToSRGB().getHex(),
        "blueHiddenEdgeColor": color.copy(blueOutlineEffect.hiddenEdgeColor).convertLinearToSRGB().getHex(),
        "useBlueOutline": false // 默认使用红色轮廓
    };

    // 创建左上角的开关面板
    const switchPane = new Pane({ container: switchContainer });
    switchPane.addBinding(params, "useBlueOutline", {
        label: "点击模型使用蓝色轮廓"
    })
        .on("change", (e) => {
            // 更新颜色指示器
            if (e.value) {
                colorSwatch.style.background = "#0000ff";
                colorSwatch.style.boxShadow = "0 0 5px rgba(0,0,255,0.8)";
            } else {
                colorSwatch.style.background = "#ff0000";
                colorSwatch.style.boxShadow = "0 0 5px rgba(255,0,0,0.8)";
            }
            console.log("轮廓颜色切换为:", e.value ? "蓝色" : "红色");
        });

    // 创建颜色指示器
    const colorIndicator = document.createElement("div");
    colorIndicator.style.display = "flex";
    colorIndicator.style.alignItems = "center";
    colorIndicator.style.justifyContent = "space-between";
    colorIndicator.style.marginTop = "10px";
    colorIndicator.style.padding = "5px";
    colorIndicator.style.borderRadius = "4px";
    colorIndicator.style.background = "rgba(255, 255, 255, 0.1)";

    const colorLabel = document.createElement("div");
    colorLabel.textContent = "当前轮廓颜色:";
    colorLabel.style.marginRight = "10px";

    const colorSwatch = document.createElement("div");
    colorSwatch.style.width = "20px";
    colorSwatch.style.height = "20px";
    colorSwatch.style.borderRadius = "50%";
    colorSwatch.style.background = "#ff0000"; // 默认红色
    colorSwatch.style.boxShadow = "0 0 5px rgba(255,0,0,0.8)";
    colorSwatch.style.transition = "all 0.3s ease";

    colorIndicator.appendChild(colorLabel);
    colorIndicator.appendChild(colorSwatch);

    // 添加颜色指示器到容器
    switchContainer.appendChild(colorIndicator);

    // 右侧主控制面板
    const mainPane = new Pane({ container: container.querySelector(".tp") });
    mainPane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folderShared = mainPane.addFolder({ title: "Shared Settings" });
    folderShared.addBinding(outlineManager, "resolutionScale", { label: "resolution", min: 0.5, max: 1, step: 0.05 })
        .on("change", () => {
            // Update size when resolution scale changes
            const width = container.clientWidth, height = container.clientHeight;
            outlineManager.setSize(width, height);
        });

    folderShared.addBinding(params, "multisampling")
        .on("change", (e) => {
            const value = e.value ? multisampling : 0;
            outlineManager.renderTargetMask.samples = value;
            outlineManager.renderTargetMask.dispose();
            outlineManager.setNeedsUpdate();
        });

    folderShared.addBinding(params, "patternTexture")
        .on("change", (e) => {
            const texture = e.value ? assets.get("pattern") : null;
            redOutlineEffect.patternTexture = texture;
            blueOutlineEffect.patternTexture = texture;
        });

    // Red outline settings
    const folderRed = mainPane.addFolder({ title: "Red Outline" });
    folderRed.addBinding(redOutlineEffect.blurPass, "kernelSize", { options: KernelSize });
    folderRed.addBinding(redOutlineEffect.blurPass, "enabled", { label: "blur" });
    folderRed.addBinding(redOutlineEffect, "patternScale", { min: 20, max: 100, step: 0.1 });
    folderRed.addBinding(redOutlineEffect, "edgeStrength", { min: 0, max: 10, step: 0.01 });
    folderRed.addBinding(redOutlineEffect, "pulseSpeed", { min: 0, max: 2, step: 0.01 });
    folderRed.addBinding(params, "redVisibleEdgeColor", { view: "color", label: "visibleEdgeColor" })
        .on("change", (e) => redOutlineEffect.visibleEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderRed.addBinding(params, "redHiddenEdgeColor", { view: "color", label: "hiddenEdgeColor" })
        .on("change", (e) => redOutlineEffect.hiddenEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderRed.addBinding(redOutlineEffect, "xRay");

    // Blue outline settings
    const folderBlue = mainPane.addFolder({ title: "Blue Outline" });
    folderBlue.addBinding(blueOutlineEffect.blurPass, "kernelSize", { options: KernelSize });
    folderBlue.addBinding(blueOutlineEffect.blurPass, "enabled", { label: "blur" });
    folderBlue.addBinding(blueOutlineEffect, "patternScale", { min: 20, max: 100, step: 0.1 });
    folderBlue.addBinding(blueOutlineEffect, "edgeStrength", { min: 0, max: 10, step: 0.01 });
    folderBlue.addBinding(blueOutlineEffect, "pulseSpeed", { min: 0, max: 2, step: 0.01 });
    folderBlue.addBinding(params, "blueVisibleEdgeColor", { view: "color", label: "visibleEdgeColor" })
        .on("change", (e) => blueOutlineEffect.visibleEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderBlue.addBinding(params, "blueHiddenEdgeColor", { view: "color", label: "hiddenEdgeColor" })
        .on("change", (e) => blueOutlineEffect.hiddenEdgeColor.setHex(e.value).convertSRGBToLinear());
    folderBlue.addBinding(blueOutlineEffect, "xRay");

    // Resize Handler

    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
        outlineManager.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // Stats for performance monitoring
    const perfStats = {
        depthPassTime: 0,
        maskPassTime: 0,
        redOutlineTime: 0,
        blueOutlineTime: 0,
        totalTime: 0
    };

    // Add performance stats folder
    const folderPerf = mainPane.addFolder({ title: "Performance" });
    folderPerf.addBinding(perfStats, "depthPassTime", { label: "Depth Pass (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "maskPassTime", { label: "Mask Pass (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "redOutlineTime", { label: "Red Outline (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "blueOutlineTime", { label: "Blue Outline (ms)", readonly: true });
    folderPerf.addBinding(perfStats, "totalTime", { label: "Total Outline (ms)", readonly: true });

    // Create our own timer system instead of using console._times which is browser-dependent
    const customTimers = new Map();

    // Override console.time to use our custom timers
    const originalTime = console.time;
    console.time = function (label) {
        customTimers.set(label, performance.now());
        return originalTime.apply(console, arguments);
    };

    // Override console.timeEnd to capture timings
    const originalTimeEnd = console.timeEnd;
    console.timeEnd = function (label) {
        const result = originalTimeEnd.apply(console, arguments);

        // Only proceed if we have a start time for this timer
        if (customTimers.has(label)) {
            const startTime = customTimers.get(label);
            const duration = performance.now() - startTime;
            customTimers.delete(label);

            // Capture the time for our stats
            if (label === "SharedOutline.depthPass") {
                perfStats.depthPassTime = duration;
            } else if (label === "SharedOutline.maskPass") {
                perfStats.maskPassTime = duration;
            } else if (label === "SharedOutlineEffect.outlinePass") {
                // Check which outline effect is active based on our custom markers
                if (customTimers.has("SharedOutlineEffect.update.redOutline")) {
                    perfStats.redOutlineTime = duration;
                } else if (customTimers.has("SharedOutlineEffect.update.blueOutline")) {
                    perfStats.blueOutlineTime = duration;
                }
            } else if (label === "SharedOutline.update") {
                perfStats.totalTime = duration;
            }
        }

        return result;
    };

    // Add custom timestamps to distinguish between red and blue outline updates
    const originalUpdate = redOutlineEffect.update;
    redOutlineEffect.update = function (renderer, inputBuffer, deltaTime) {
        console.time("SharedOutlineEffect.update.redOutline");
        const result = originalUpdate.call(this, renderer, inputBuffer, deltaTime);
        console.timeEnd("SharedOutlineEffect.update.redOutline");
        customTimers.delete("SharedOutlineEffect.update.redOutline");
        return result;
    };

    const originalUpdateBlue = blueOutlineEffect.update;
    blueOutlineEffect.update = function (renderer, inputBuffer, deltaTime) {
        console.time("SharedOutlineEffect.update.blueOutline");
        const result = originalUpdateBlue.call(this, renderer, inputBuffer, deltaTime);
        console.timeEnd("SharedOutlineEffect.update.blueOutline");
        customTimers.delete("SharedOutlineEffect.update.blueOutline");
        return result;
    };

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