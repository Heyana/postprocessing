import {
    Color,
    CubeTextureLoader,
    FogExp2,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    LakesMountainsEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Domain from "../objects/Domain";

function load() {
    const assets = new Map();
    const loadingManager = new LoadingManager();
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

        cubeTextureLoader.load(urls, (t) => {
            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);
        });
    });
}

window.addEventListener("load", () => load().then((assets) => {
    // 渲染器
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: false,
        stencil: false,
        depth: false
    });

    renderer.debug.checkShaderErrors = (window.location.hostname === "localhost");
    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机与控制器
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;
    controls.position.set(5, 21, 123);

    window.addEventListener('click', () => {
        console.log('Log-- ', camera.position, controls.position, 'camera.position,controls.');
    })

    // 场景、灯光、物体
    const scene = new Scene();
    scene.background = assets.get("sky");
    scene.add(Domain.createLights());
    scene.add(Domain.createEnvironment(scene.background));

    // 后期处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    const effect = new LakesMountainsEffect({
        fogDensity: 0.6,
        fogColor: new Color(0xaaaacc),
        fogDecay: 1.0,
        fogMinDist: 0.1,
        quality: 0.5,
        useHeightFog: true,
        combineFog: true,
        fogMaxHeight: 60.0,
        fogMinHeight: -10.0,
        fogNoiseScale: 0.008,
        fogNoiseStrength: 15.0,
        heightFogStrength: 2.5,
        heightFogDecay: 0.5,
        heightFogMinDist: 0.0,
        heightFogMaxDist: 4000.0,
        heightFogTransition: 5.0,
        camera: camera
    });

    const effectPass = new EffectPass(camera, effect);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "雾气效果" });

    // 添加质量控制
    folder.addBinding(effect, "quality", {
        min: 0, max: 1, step: 0.1,
        label: "质量"
    });

    // 雾气参数控制
    const fogFolder = folder.addFolder({ title: "雾气参数" });

    // 添加雾密度控制
    fogFolder.addBinding(effect, "fogDensity", {
        min: 0, max: 3, step: 0.1,
        label: "雾气密度"
    });

    // 添加雾颜色控制
    const fogColorParams = { color: { r: effect.fogColor.r, g: effect.fogColor.g, b: effect.fogColor.b } };
    fogFolder.addBinding(fogColorParams, "color", {
        color: { type: "float" },
        label: "雾气颜色"
    }).on("change", (e) => {
        effect.fogColor = new Color(e.value.r, e.value.g, e.value.b);
    });

    // 添加雾衰减速度控制
    fogFolder.addBinding(effect, "fogDecay", {
        min: 0.1, max: 5, step: 0.1,
        label: "衰减速度"
    });

    // 添加雾最小距离控制
    fogFolder.addBinding(effect, "fogMinDist", {
        min: 0, max: 0.5, step: 0.01,
        label: "最小距离"
    });



    // 高度雾控制
    const heightFogFolder = folder.addFolder({ title: "高度雾参数" });

    // 添加高度雾启用选项
    heightFogFolder.addBinding(effect, "useHeightFog", {
        label: "启用高度雾"
    });

    // 添加雾叠加选项
    heightFogFolder.addBinding(effect, "combineFog", {
        label: "叠加显示",
        hint: "同时显示普通雾和高度雾"
    });

    // 高度范围控制
    const heightRangeFolder = heightFogFolder.addFolder({ title: "高度范围" });

    // 添加雾最小高度控制
    heightRangeFolder.addBinding(effect, "fogMinHeight", {
        min: -100, max: 100, step: 1,
        label: "雾最小高度"
    });

    // 添加雾最大高度控制
    heightRangeFolder.addBinding(effect, "fogMaxHeight", {
        min: 1, max: 200, step: 1,
        label: "雾最大高度"
    });

    // 噪声控制
    const noiseFolder = heightFogFolder.addFolder({ title: "噪声设置" });

    // 添加雾噪声缩放控制
    noiseFolder.addBinding(effect, "fogNoiseScale", {
        min: 0.001, max: 0.1, step: 0.001,
        label: "噪声缩放"
    });

    // 添加雾噪声强度控制
    noiseFolder.addBinding(effect, "fogNoiseStrength", {
        min: 0, max: 50, step: 1,
        label: "噪声强度"
    });

    // 强度和衰减控制
    const strengthFolder = heightFogFolder.addFolder({ title: "强度和衰减" });

    // 添加高度雾强度控制
    strengthFolder.addBinding(effect, "heightFogStrength", {
        min: 0, max: 10, step: 0.1,
        label: "高度雾强度"
    });

    // 添加高度雾衰减速度控制
    strengthFolder.addBinding(effect, "heightFogDecay", {
        min: 0.01, max: 20.0, step: 0.05,
        label: "高度雾衰减"
    });

    // 添加高度雾过渡距离控制
    strengthFolder.addBinding(effect, "heightFogTransition", {
        min: 0.1, max: 30.0, step: 0.1,
        label: "边缘过渡距离"
    });

    // 距离控制
    const distanceFolder = heightFogFolder.addFolder({ title: "距离设置" });

    // 添加高度雾最小距离控制
    distanceFolder.addBinding(effect, "heightFogMinDist", {
        min: 0, max: 1, step: 0.01,
        label: "最小距离"
    });

    // 添加高度雾最大距离控制
    distanceFolder.addBinding(effect, "heightFogMaxDist", {
        min: 10, max: 5000, step: 10,
        label: "最大距离"
    });

    // 添加混合模式控制
    folder.addBinding(effect.blendMode.opacity, "value", {
        label: "透明度",
        min: 0, max: 1, step: 0.01
    });

    folder.addBinding(effect.blendMode, "blendFunction", {
        options: BlendFunction,
        label: "混合模式"
    });

    // 大小调整处理
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        composer.setSize(width, height);
    }

    window.addEventListener("resize", onResize);
    onResize();

    // 渲染循环
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        controls.update(timestamp);
        composer.render();
        requestAnimationFrame(render);
    });
})); 