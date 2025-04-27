import {
    Color,
    CubeTextureLoader,
    FogExp2,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
    TextureLoader,
    RepeatWrapping
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
    const textureLoader = new TextureLoader(loadingManager);

    const path = document.baseURI + "img/textures/skies/sunset/";
    const format = ".png";
    const urls = [
        path + "px" + format, path + "nx" + format,
        path + "py" + format, path + "ny" + format,
        path + "pz" + format, path + "nz" + format
    ];

    // 添加噪声纹理加载
    const noisePath = document.baseURI + "img/textures/noise/FoggyMountains2.png";

    return new Promise((resolve, reject) => {
        loadingManager.onLoad = () => resolve(assets);
        loadingManager.onError = (url) => reject(new Error(`Failed to load ${url}`));

        cubeTextureLoader.load(urls, (t) => {
            t.colorSpace = SRGBColorSpace;
            assets.set("sky", t);
        });

        // 加载噪声纹理
        textureLoader.load(noisePath, (t) => {
            t.wrapS = t.wrapT = RepeatWrapping;
            assets.set("noise", t);
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
    controls.position.set(0, 3, 10);

    // 场景、灯光、物体
    const scene = new Scene();
    scene.fog = new FogExp2(0x373134, 0.06);
    scene.background = assets.get("sky");
    scene.add(Domain.createLights());
    scene.add(Domain.createEnvironment(scene.background));
    scene.add(Domain.createActors(scene.background));

    // 后期处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    // 使用加载的噪声纹理，添加体积雾参数
    const effect = new LakesMountainsEffect({
        fogDensity: 0.6,
        fogColor: new Color(0xaaaacc),
        fogDecay: 1.0,
        fogMinDist: 0.1,
        quality: 0.5,
        enableClouds: false,
        enableVolumeFog: true,
        volumeDetail: 0.6,
        volumeSteps: 0.5,
        camera: camera,         // 传递相机对象
        noiseTexture: assets.get("noise") // 传递噪声纹理
    });

    const effectPass = new EffectPass(camera, effect);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "天空和雾气效果" });

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
        effect.fogColor.setRGB(e.value.r, e.value.g, e.value.b);
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

    // 添加云层开关
    folder.addBinding(effect, "enableClouds", {
        label: "启用云"
    });

    // 添加体积雾控制文件夹
    const volumeFogFolder = folder.addFolder({ title: "体积雾参数" });

    // 添加体积雾开关
    volumeFogFolder.addBinding(effect, "enableVolumeFog", {
        label: "启用体积雾"
    });

    // 添加体积雾细节控制
    volumeFogFolder.addBinding(effect, "volumeDetail", {
        min: 0, max: 1, step: 0.1,
        label: "细节程度"
    });

    // 添加体积雾采样步数控制
    volumeFogFolder.addBinding(effect, "volumeSteps", {
        min: 0, max: 1, step: 0.1,
        label: "采样步数"
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