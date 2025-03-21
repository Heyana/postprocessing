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
    WebGLRenderer,
    SphereGeometry,
    MeshPhongMaterial,
    Mesh,
    AmbientLight,
    DirectionalLight
} from "three";

import {
    BlendFunction,
    OverrideMaterialManager,
    EffectComposer,
    EffectPass,
    KernelSize,
    RenderPass,
    OutlineMultiEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { ControlMode, SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 定义可用的颜色集 - 简化为三种颜色
const COLOR_SETS = {
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

function load() {

    const assets = new Map();
    const loadingManager = new LoadingManager();
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

// 创建三个球体
function createSpheres() {
    const spheres = [];
    const sphereGeometry = new SphereGeometry(0.8, 32, 32);
    const sphereColors = [0xff8888, 0x88ff88, 0x8888ff]; // 红、绿、蓝

    for (let i = 0; i < 3; i++) {
        const material = new MeshPhongMaterial({
            color: sphereColors[i],
            flatShading: false
        });

        const sphere = new Mesh(sphereGeometry, material);

        // 将球体放置在一行中
        sphere.position.x = (i - 1) * 2.5;

        spheres.push(sphere);
    }

    return spheres;
}

// 创建灯光
function createLights() {
    const lights = [];

    const ambientLight = new AmbientLight(0x666666);
    const directionalLight = new DirectionalLight(0xffbbaa);
    directionalLight.position.set(-1, 1, 1);

    lights.push(ambientLight, directionalLight);

    return lights;
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

    // Camera & Controls

    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = false;
    controls.position.set(0, 0, 5);

    // Scene, Lights, Objects

    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加灯光
    const lights = createLights();
    lights.forEach(light => scene.add(light));

    // 创建并添加三个球体
    const spheres = createSpheres();
    spheres.forEach(sphere => scene.add(sphere));

    // Post Processing

    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });

    // 创建多颜色轮廓效果
    const effect = new OutlineMultiEffect(scene, camera, {
        blendFunction: BlendFunction.SCREEN,
        edgeStrength: 2.5,
        pulseSpeed: 0.5,
        kernelSize: KernelSize.SMALL,
        blur: true,
        xRay: true,
        multisampling
    });

    // 为每个球体设置不同的颜色层
    spheres.forEach((sphere, index) => {
        // 确保对象在默认层可见
        sphere.layers.enable(0);

        // 使用便捷方法设置不同的轮廓颜色
        switch (index) {
            case 0:
                effect.setRedOutline(sphere);
                console.log(`球体 ${index} 设置为红色轮廓，在层 ${effect.layers[0]}`);
                break;
            case 1:
                effect.setGreenOutline(sphere);
                console.log(`球体 ${index} 设置为绿色轮廓，在层 ${effect.layers[1]}`);
                break;
            case 2:
                effect.setBlueOutline(sphere);
                console.log(`球体 ${index} 设置为蓝色轮廓，在层 ${effect.layers[2]}`);
                break;
        }
    });

    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new EffectPass(camera, effect));

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

            if (effect.selection.has(object)) {
                // 如果已选中，则取消选择
                effect.selection.delete(object);
            } else {
                // 如果未选中，则添加它（保持原始颜色集）
                effect.selection.add(object);
            }
        }

    });

    // Settings

    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const params = {
        "patternTexture": false,
        "multisampling": true
    };

    const folder = pane.addFolder({ title: "Settings" });
    folder.addBinding(effect.resolution, "scale", { label: "resolution", min: 0.5, max: 1, step: 0.05 });
    folder.addBinding(params, "multisampling")
        .on("change", (e) => effect.multisampling = e.value ? multisampling : 0);
    folder.addBinding(effect.blurPass, "kernelSize", { options: KernelSize });
    folder.addBinding(effect.blurPass, "enabled", { label: "blur" });
    folder.addBinding(params, "patternTexture")
        .on("change", (e) => effect.patternTexture = (e.value ? assets.get("pattern") : null));
    folder.addBinding(effect, "patternScale", { min: 20, max: 100, step: 0.1 });
    folder.addBinding(effect, "edgeStrength", { min: 0, max: 10, step: 0.01 });
    folder.addBinding(effect, "pulseSpeed", { min: 0, max: 2, step: 0.01 });
    folder.addBinding(effect, "xRay");
    folder.addBinding(effect.blendMode.opacity, "value", { label: "opacity", min: 0, max: 1, step: 0.01 });
    folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction });

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

        // 添加球体旋转动画
        spheres.forEach(sphere => {
            sphere.rotation.y += deltaTime * 0.0005;
            sphere.rotation.x += deltaTime * 0.0002;
        });

        composer.render(deltaTime);
        requestAnimationFrame(render);

    });

})); 