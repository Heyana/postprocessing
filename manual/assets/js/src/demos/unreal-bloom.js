import {
    Color,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Vector2,
    Raycaster,
    Mesh,
    MeshStandardMaterial,
    SphereGeometry,
    BoxGeometry,
    TorusKnotGeometry
} from "three";

import {
    BlendFunction,
    EffectComposer,
    RenderPass,
    SelectiveBloomPass,
    UnrealBloomEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

function createSceneContent(scene) {

    // 基础环境光与方向光
    const amb = new AmbientLight(0xffffff, 0.3);
    const dir = new DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 5);
    scene.add(amb, dir);

    // 一些发亮材质的物体用来产生高亮区域
    const emissiveMat1 = new MeshStandardMaterial({ color: 0x111122, emissive: new Color(0x2244ff), emissiveIntensity: 2.0, metalness: 0.2, roughness: 0.3 });
    const emissiveMat2 = new MeshStandardMaterial({ color: 0x221111, emissive: new Color(0xff2244), emissiveIntensity: 2.0, metalness: 0.2, roughness: 0.3 });
    const emissiveMat3 = new MeshStandardMaterial({ color: 0x112211, emissive: new Color(0x44ff22), emissiveIntensity: 2.0, metalness: 0.2, roughness: 0.3 });

    const g1 = new SphereGeometry(0.6, 48, 48);
    const g2 = new BoxGeometry(0.8, 0.8, 0.8);
    const g3 = new TorusKnotGeometry(0.5, 0.16, 200, 32);

    const m1 = new Mesh(g1, emissiveMat1);
    const m2 = new Mesh(g2, emissiveMat2);
    const m3 = new Mesh(g3, emissiveMat3);

    m1.position.set(-1.2, 0.0, 0.0);
    m2.position.set(0.0, 0.0, 0.0);
    m3.position.set(1.2, 0.0, 0.0);

    scene.add(m1, m2, m3);

    return { m1, m2, m3 };
}

function load() {

    const assets = new Map();
    const loadingManager = new LoadingManager();

    return new Promise((resolve, reject) => {

        loadingManager.onLoad = () => resolve(assets);
        loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

        // 本 demo 无外部资源，直接触发 onLoad
        loadingManager.itemEnd("unreal-bloom-demo-bootstrap");
        loadingManager.onLoad();

    });

}

window.addEventListener("load", () => load().then(() => {

    // Renderer

    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // Camera & Controls

    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.rotation.sensitivity = 2.0;
    settings.rotation.damping = 0.05;
    settings.translation.damping = 0.1;
    controls.position.set(0, 0, 3);
    controls.lookAt(0, 0, 0);

    // Scene & Objects

    const scene = new Scene();
    scene.background = new Color(0x000000);
    const objects = createSceneContent(scene);
    const pickables = [objects.m1, objects.m2, objects.m3];

    // Post Processing

    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    const bloomPass = new SelectiveBloomPass(scene, camera, {
        effect: {
            blendFunction: BlendFunction.ADD,
            strength: 3.0,
            radius: 0.4,
            threshold: 0.3,
            smoothWidth: 0.2,
            nMips: 5,
            intensity: 1.5,
            bloomColor: 0xffffff,
            useHighPass: false
        },
        debug: {
            showSelection: false,
            inset: 0.28,
            padding: 18,
            minWidth: 160
        }
    });
    const unrealBloom = bloomPass.effect;
    const bloomSelection = unrealBloom.getSelection();
    bloomSelection.layer = 21;
    pickables.forEach((mesh) => bloomSelection.add(mesh));

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(bloomPass);

    // Settings UI

    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "Unreal Bloom" });
    const animParams = { animate: false };
    folder.addBinding(animParams, "animate", { label: "auto-rotate" });
    folder.addBinding(unrealBloom, "intensity", { min: 0.0, max: 5.0, step: 0.01 });
    folder.addBinding(unrealBloom.compositeMaterial.uniforms.bloomStrength, "value", { label: "strength", min: 0.0, max: 5.0, step: 0.01 });
    folder.addBinding(unrealBloom.compositeMaterial.uniforms.bloomRadius, "value", { label: "radius", min: 0.0, max: 1.0, step: 0.001 });
    const highPassBinding = folder.addBinding(unrealBloom, "useHighPass", { label: "useHighPass" });
    const thresholdBinding = folder.addBinding(
        unrealBloom.materialHighPassFilter.uniforms.luminosityThreshold,
        "value",
        { label: "threshold", min: 0.0, max: 1.5, step: 0.001 }
    );
    const smoothBinding = folder.addBinding(
        unrealBloom.materialHighPassFilter.uniforms.smoothWidth,
        "value",
        { label: "smoothWidth", min: 0.0, max: 0.5, step: 0.001 }
    );
    thresholdBinding.disabled = !unrealBloom.useHighPass;
    smoothBinding.disabled = !unrealBloom.useHighPass;
    highPassBinding.on("change", (event) => {
        const enabled = event.value;
        thresholdBinding.disabled = !enabled;
        smoothBinding.disabled = !enabled;
        if (!enabled && unrealBloom.debugMode === UnrealBloomEffect.DebugMode.HIGH_PASS) {
            unrealBloom.debugMode = UnrealBloomEffect.DebugMode.NONE;
        }
    });

    const colorParams = { color: { r: 1, g: 1, b: 1 } };
    folder.addBinding(colorParams, "color", { color: { type: "float" }, label: "bloomColor" })
        .on("change", (e) => {
            unrealBloom.bloomColor.setRGB(e.value.r, e.value.g, e.value.b);
        });

    const debugModes = [
        UnrealBloomEffect.DebugMode.NONE,
        UnrealBloomEffect.DebugMode.SELECTION_MASK,
        UnrealBloomEffect.DebugMode.HIGH_PASS
    ];
    let debugIndex = debugModes.indexOf(unrealBloom.debugMode);
    folder.addButton({ title: "cycle debug" }).on("click", () => {
        debugIndex = (debugIndex + 1) % debugModes.length;
        unrealBloom.debugMode = debugModes[debugIndex];
        debugModeBinding.refresh();
    });
    const debugModeBinding = folder.addBinding(unrealBloom, "debugMode", {
        label: "debugMode",
        options: {
            none: UnrealBloomEffect.DebugMode.NONE,
            "selection-mask": UnrealBloomEffect.DebugMode.SELECTION_MASK,
            "high-pass": UnrealBloomEffect.DebugMode.HIGH_PASS
        }
    });
    debugModeBinding.on("change", (event) => {
        debugIndex = debugModes.indexOf(event.value);
    });

    const depthParams = { epsilon: unrealBloom.depthEpsilon };
    folder.addBinding(depthParams, "epsilon", {
        label: "depthEpsilon",
        min: 1e-7,
        max: 1e-3,
        step: 1e-7
    }).on("change", (event) => {
        unrealBloom.depthEpsilon = event.value;
    });

    const viewParams = { showSelection: bloomPass.overlayVisible };
    folder.addBinding(viewParams, "showSelection", { label: "showSelection" }).on("change", (event) => {
        bloomPass.overlayVisible = event.value;
        unrealBloom.debugMode = event.value ? UnrealBloomEffect.DebugMode.SELECTION_MASK : UnrealBloomEffect.DebugMode.NONE;
    });

    pane.addBinding(bloomPass.effectPass, "dithering");
    pane.addBinding(unrealBloom.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });
    pane.addBinding(unrealBloom.blendMode, "blendFunction", { options: BlendFunction });

    // 添加多视图功能控制
    const outputFolder = pane.addFolder({ title: "多视图输出" });
    const outputParams = { 
        outputMode: "Default",
        cycleMode: false
    };
    
    // 输出模式选项
    const outputModeOptions = {
        "Default": "Default",
        "Beauty": "Beauty",
        "Brightness": "Brightness",
        "Blur1": "Blur1",
        "Blur2": "Blur2",
        "Blur3": "Blur3",
        "Blur4": "Blur4",
        "Blur5": "Blur5",
        "Composite": "Composite",
        "Selection": "Selection"
    };
    
    let outputModeBinding = outputFolder.addBinding(outputParams, "outputMode", { 
        label: "输出模式",
        options: outputModeOptions
    }).on("change", (event) => {
        const modeValue = UnrealBloomEffect.OUTPUT[event.value];
        unrealBloom.setOutputMode(modeValue);
    });
    
    outputFolder.addButton({ title: "循环切换输出模式" }).on("click", () => {
        unrealBloom.cycleOutputMode();
        // 更新UI显示当前模式
        const currentMode = Object.keys(UnrealBloomEffect.OUTPUT).find(key => 
            UnrealBloomEffect.OUTPUT[key] === unrealBloom.output
        );
        if (currentMode) {
            outputParams.outputMode = currentMode;
            outputModeBinding.refresh();
        }
    });
    

    
    // 键盘快捷键支持
    window.addEventListener("keydown", (event) => {
        switch (event.key) {
            case '1':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Default);
                outputParams.outputMode = "Default";
                outputModeBinding.refresh();
                console.log('输出模式: Default (完整泛光效果)');
                break;
            case '2':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Beauty);
                outputParams.outputMode = "Beauty";
                outputModeBinding.refresh();
                console.log('输出模式: Beauty (原始场景)');
                break;
            case '3':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Brightness);
                outputParams.outputMode = "Brightness";
                outputModeBinding.refresh();
                console.log('输出模式: Brightness (亮度提取)');
                break;
            case '4':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Blur1);
                outputParams.outputMode = "Blur1";
                outputModeBinding.refresh();
                console.log('输出模式: Blur1 (第一级模糊)');
                break;
            case '5':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Blur2);
                outputParams.outputMode = "Blur2";
                outputModeBinding.refresh();
                console.log('输出模式: Blur2 (第二级模糊)');
                break;
            case '6':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Blur3);
                outputParams.outputMode = "Blur3";
                outputModeBinding.refresh();
                console.log('输出模式: Blur3 (第三级模糊)');
                break;
            case '7':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Blur4);
                outputParams.outputMode = "Blur4";
                outputModeBinding.refresh();
                console.log('输出模式: Blur4 (第四级模糊)');
                break;
            case '8':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Blur5);
                outputParams.outputMode = "Blur5";
                outputModeBinding.refresh();
                console.log('输出模式: Blur5 (第五级模糊)');
                break;
            case '9':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Composite);
                outputParams.outputMode = "Composite";
                outputModeBinding.refresh();
                console.log('输出模式: Composite (合成结果)');
                break;
            case '0':
                unrealBloom.setOutputMode(UnrealBloomEffect.OUTPUT.Selection);
                outputParams.outputMode = "Selection";
                outputModeBinding.refresh();
                console.log('输出模式: Selection (选择区域)');
                break;
            case ' ':
                unrealBloom.cycleOutputMode();
                // 更新UI显示当前模式
                const currentMode = Object.keys(UnrealBloomEffect.OUTPUT).find(key => 
                    UnrealBloomEffect.OUTPUT[key] === unrealBloom.output
                );
                if (currentMode) {
                    outputParams.outputMode = currentMode;
                    outputModeBinding.refresh();
                }
                break;
        }
    });
    
    // 显示控制提示
    console.log('UnrealBloomEffect 多视图功能已启用');
    console.log('按键控制:');
    console.log('1: Default (完整泛光效果)');
    console.log('2: Beauty (原始场景)');
    console.log('3: Brightness (亮度提取)');
    console.log('4: Blur1 (第一级模糊)');
    console.log('5: Blur2 (第二级模糊)');
    console.log('6: Blur3 (第三级模糊)');
    console.log('7: Blur4 (第四级模糊)');
    console.log('8: Blur5 (第五级模糊)');
    console.log('9: Composite (合成结果)');
    console.log('0: Selection (选择区域)');
    console.log('空格键: 循环切换输出模式');

    // 点击切换选择：命中则加入/移除 bloomSelection
    const ndc = new Vector2();
    const raycaster = new Raycaster();
    renderer.domElement.addEventListener("pointerdown", (event) => {

        const clientRect = container.getBoundingClientRect();
        const clientX = event.clientX - clientRect.left;
        const clientY = event.clientY - clientRect.top;
        ndc.x = (clientX / container.clientWidth) * 2.0 - 1.0;
        ndc.y = -(clientY / container.clientHeight) * 2.0 + 1.0;

        raycaster.setFromCamera(ndc, camera);
        const intersects = raycaster.intersectObjects(pickables, true);
        if (intersects.length > 0) {
            bloomSelection.toggle(intersects[0].object);
        }

    });

    // Resize

    function onResize() {

        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        renderer.setSize(width, height, false);
        composer.setSize(width, height);

    }

    window.addEventListener("resize", onResize);
    onResize();

    // Animate

    requestAnimationFrame(function render(timestamp) {

        fpsMeter.update(timestamp);
        controls.update(timestamp);

        // 仅在开启时旋转，避免“扫光”观感
        if (animParams.animate) {
            objects.m1.rotation.y += 0.003;
            objects.m2.rotation.y -= 0.004;
            objects.m3.rotation.y += 0.005;
        }

        composer.render();

        requestAnimationFrame(render);

    });

}));


