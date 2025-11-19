import {
    Color,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    AmbientLight,
    DirectionalLight,
    Mesh,
    MeshStandardMaterial,
    SphereGeometry,
    BoxGeometry,
    TorusKnotGeometry,
    Raycaster,
    Vector2
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    LayerBasedGlowEffect,
    RenderPass
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
    const emissiveMat1 = new MeshStandardMaterial({
        color: 0x111122,
        emissive: new Color(0x2244ff),
        emissiveIntensity: 2.0,
        metalness: 0.2,
        roughness: 0.3
    });
    const emissiveMat2 = new MeshStandardMaterial({
        color: 0x221111,
        emissive: new Color(0xff2244),
        emissiveIntensity: 2.0,
        metalness: 0.2,
        roughness: 0.3
    });
    const emissiveMat3 = new MeshStandardMaterial({
        color: 0x112211,
        emissive: new Color(0x44ff22),
        emissiveIntensity: 2.0,
        metalness: 0.2,
        roughness: 0.3
    });

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
        loadingManager.itemEnd("layer-based-glow-demo-bootstrap");
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

    const glowEffect = new LayerBasedGlowEffect(scene, camera, {
        blendFunction: BlendFunction.ADD,
        strength: 1.5,
        radius: 0.4,
        threshold: 0.3,
        smoothWidth: 0.2,
        nMips: 5,
        useHighPass: true,
        bloomColor: 0xffffff
    });

    // 初始添加所有对象到选择中
    const glowSelection = glowEffect.selection;
    pickables.forEach((mesh) => glowSelection.add(mesh));

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, glowEffect));

    // Settings UI

    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "泛光设置" });
    folder.addBinding(glowEffect, "strength", {
        label: "强度",
        min: 0,
        max: 5,
        step: 0.1
    });
    folder.addBinding(glowEffect, "radius", {
        label: "半径",
        min: 0,
        max: 1,
        step: 0.01
    });
    folder.addBinding(glowEffect, "threshold", {
        label: "阈值",
        min: 0,
        max: 1,
        step: 0.01
    });
    folder.addBinding(glowEffect, "smoothWidth", {
        label: "平滑宽度",
        min: 0,
        max: 0.1,
        step: 0.001
    });
    folder.addBinding(glowEffect, "useHighPass", {
        label: "使用高通滤波"
    });

    const colorParams = { color: { r: 1, g: 1, b: 1 } };
    folder.addBinding(colorParams, "color", {
        color: { type: "float" },
        label: "泛光颜色"
    }).on("change", (e) => {
        glowEffect.bloomColor.setRGB(e.value.r, e.value.g, e.value.b);
    });

    folder.addBinding(glowEffect, "intensity", {
        label: "强度微调",
        min: 0,
        max: 3,
        step: 0.1
    });

    const blendFolder = pane.addFolder({ title: "混合模式" });
    blendFolder.addBinding(glowEffect.blendMode, "blendFunction", {
        options: BlendFunction,
        label: "混合函数"
    });
    blendFolder.addBinding(glowEffect.blendMode.opacity, "value", {
        label: "不透明度",
        min: 0,
        max: 1,
        step: 0.01
    });

    // Resize Handler

    function onResize() {

        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);

    }

    window.addEventListener("resize", onResize);
    onResize();

    // Click to toggle selection
    const raycaster = new Raycaster();
    const mouse = new Vector2();

    function onMouseClick(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(pickables, true);

        if (intersects.length > 0) {
            const object = intersects[0].object;
            glowSelection.toggle(object);
        }
    }

    renderer.domElement.addEventListener("click", onMouseClick);

    // Render Loop

    requestAnimationFrame(function render(timestamp) {

        fpsMeter.update(timestamp);
        controls.update(timestamp);
        composer.render();
        requestAnimationFrame(render);

    });

}));

