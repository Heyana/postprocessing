import {
    Color,
    CubeTextureLoader,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    FoggyMountainsEffect
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
        loadingManager.onError = (url) => reject(new Error(`加载失败 ${url}`));

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

    renderer.debug.checkShaderErrors = true;
    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机 & 控制器
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;
    controls.position.set(0, 3, 10);

    // 设置初始相机位置
    controls.position.set(0, 5, -140);
    controls.lookAt(0, 0, -150);

    // 场景, 灯光, 物体
    const scene = new Scene();
    scene.background = new Color(0x444444);
    scene.add(Domain.createLights());
    scene.add(Domain.createEnvironment());
    scene.add(Domain.createActors(scene.background));

    // 后处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    // 使用雾山效果
    const effect = new FoggyMountainsEffect({
        speed: 0.5,
        fogDensity: 1.0,
        composer,
        // 指定噪声纹理路径，使用相对路径
        noiseTexturePath: document.baseURI + "img/textures/noise/FoggyMountains2.png",
        blendFunction: BlendFunction.NORMAL
    });

    // 设置相机
    effect.setCamera(camera);

    const effectPass = new EffectPass(camera, effect);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置界面
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "雾天效果设置" });
    folder.addBinding(effect, "speed", { min: 0.1, max: 5.0, step: 0.1, label: "动画速度" });
    folder.addBinding(effect, "fogDensity", { min: 0.0, max: 15.0, step: 0.1, label: "雾气浓度" });

    // 添加鼠标位置控制
    const mouseControl = {
        x: 0.5,
        y: 0.5,
        updateMouse: function () {
            effect.setMousePosition(this.x, this.y);
        }
    };

    folder.addBinding(mouseControl, "x", { min: 0.0, max: 1.0, step: 0.01, label: "鼠标X" })
        .on("change", () => mouseControl.updateMouse());
    folder.addBinding(mouseControl, "y", { min: 0.0, max: 1.0, step: 0.01, label: "鼠标Y" })
        .on("change", () => mouseControl.updateMouse());

    // 添加相机控制
    const cameraFolder = pane.addFolder({ title: "相机控制" });

    // 创建一个用于重置相机位置的按钮
    const cameraControl = {
        resetCamera: () => {
            controls.position.set(0, 5, -140);
            controls.lookAt(0, 0, -150);
        }
    };

    cameraFolder.addButton({
        title: "重置相机位置"
    }).on("click", cameraControl.resetCamera);

    folder.addBinding(effect.blendMode.opacity, "value", { label: "不透明度", min: 0, max: 1, step: 0.01 });
    folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction, label: "混合模式" });

    // 调整大小处理
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