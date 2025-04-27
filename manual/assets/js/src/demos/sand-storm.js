import {
    CubeTextureLoader,
    FogExp2,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
    Color
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    SandStormEffect
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

    // 相机和控制
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 2;
    settings.translation.enabled = true;

    // 场景、光照、物体
    const scene = new Scene();
    scene.fog = new FogExp2(0x373134, 0.06);
    scene.background = assets.get("sky");
    scene.add(Domain.createLights());
    // scene.add(Domain.createEnvironment(scene.background));
    // scene.add(Domain.createActors(scene.background));

    // 后处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    // 创建沙尘暴效果
    const effect = new SandStormEffect({
        volumeDensity: 0.6,
        volumeAbsorbtion: 1.0,
        lightColor: 0xffba59, // 暖黄色光源
        shadowQuality: 1.5,
        numSteps: 32,
        enableDithering: true,
        enableVolumetricLighting: true,
        camera: camera // 传入相机，用于视角变换
    });

    const effectPass = new EffectPass(camera, effect);
    effectPass.fullscreenMaterial.dithering = true;
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置界面
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "沙尘暴设置" });

    // 添加体积相关控制
    folder.addBinding(effect, "volumeDensity", { min: 0, max: 2, step: 0.01, label: "体积密度" });
    folder.addBinding(effect, "volumeAbsorbtion", { min: 0, max: 2, step: 0.01, label: "体积吸收" });

    // 添加光照相关控制
    const lightColorParams = { color: effect.lightColor };
    folder.addBinding(lightColorParams, "color", {
        color: { type: "float" },
        label: "光源颜色"
    }).on("change", (e) => {
        effect.lightColor = e.value;
    });

    // 添加质量相关控制
    folder.addBinding(effect, "shadowQuality", { min: 0.5, max: 5, step: 0.1, label: "阴影质量" });
    folder.addBinding(effect, "numSteps", { min: 8, max: 64, step: 1, label: "采样步数" });

    // 添加功能开关
    folder.addBinding(effect, "enableDithering", { label: "启用抖动" });
    folder.addBinding(effect, "enableVolumetricLighting", { label: "启用体积光" });

    // 添加混合模式控制
    folder.addBinding(effectPass.fullscreenMaterial, "dithering", { label: "后期抖动" });
    folder.addBinding(effect.blendMode.opacity, "value", { label: "不透明度", min: 0, max: 1, step: 0.01 });
    folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction, label: "混合模式" });

    // 窗口大小变化处理
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