import {
    AnimationMixer,
    Color,
    CubeTextureLoader,
    GLTFLoader,
    Group,
    LoadingManager,
    Mesh,
    PerspectiveCamera,
    PointLight,
    Scene,
    SphereGeometry,
    MeshStandardMaterial,
    SRGBColorSpace,
    TextureLoader,
    Vector2,
    Vector3,
    VSMShadowMap,
    WebGLRenderer
} from "three";

import {
    BlendFunction,
    DenoiseEffect,
    SharpenEffect,
    SSAOEffect,
    GodRaysEffect,
    OverrideMaterialManager,
    EffectComposer,
    EffectPass,
    KernelSize,
    RenderPass
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

// 创建一个有噪点的材质球体
function createNoisyMaterial(color, roughness, metalness) {
    const material = new MeshStandardMaterial({
        color: color,
        roughness: roughness,
        metalness: metalness
    });

    // 添加微观几何细节来突出降噪效果
    material.roughness = roughness;
    material.metalness = metalness;

    return material;
}

// 创建带有不同材质的球体组
function createMaterialSpheres() {
    const group = new Group();

    // 金属球
    const metallicSphere = new Mesh(
        new SphereGeometry(0.7, 64, 64),
        createNoisyMaterial(0x3366ff, 0.2, 0.9)
    );
    metallicSphere.position.set(-2.5, 0, 0);
    metallicSphere.castShadow = metallicSphere.receiveShadow = true;

    // 粗糙球
    const roughSphere = new Mesh(
        new SphereGeometry(0.7, 64, 64),
        createNoisyMaterial(0xff6633, 0.9, 0.1)
    );
    roughSphere.position.set(0, 0, 0);
    roughSphere.castShadow = roughSphere.receiveShadow = true;

    // 玻璃球
    const glassSphere = new Mesh(
        new SphereGeometry(0.7, 64, 64),
        createNoisyMaterial(0x33ddaa, 0.1, 0.2)
    );
    glassSphere.material.transparent = true;
    glassSphere.material.opacity = 0.7;
    glassSphere.position.set(2.5, 0, 0);
    glassSphere.castShadow = glassSphere.receiveShadow = true;

    group.add(metallicSphere, roughSphere, glassSphere);
    return group;
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
    controls.position.set(0, 0, 8);

    // Scene, Lights, Objects
    const scene = new Scene();
    scene.background = assets.get("sky");
    scene.add(Shapes.createLights());

    // 添加材质球体
    const spheres = createMaterialSpheres();
    scene.add(spheres);

    // 添加额外的点光源以增强视觉效果
    const pointLight = new PointLight(0xffffff, 1.0);
    pointLight.position.set(0, 3, 2);
    pointLight.castShadow = true;
    scene.add(pointLight);

    // 添加动画角色
    const riggedSimple = assets.get("rigged-simple");
    riggedSimple.scene.scale.multiplyScalar(0.2);
    riggedSimple.scene.position.set(0, -2, 0);
    scene.add(riggedSimple.scene);

    const animationMixer = new AnimationMixer(riggedSimple.scene);
    const action = animationMixer.clipAction(riggedSimple.animations[0]);
    action.play();

    // Post Processing
    OverrideMaterialManager.workaroundEnabled = true;
    const multisampling = Math.min(4, renderer.capabilities.maxSamples);

    const composer = new EffectComposer(renderer, { multisampling });
    composer.addPass(new RenderPass(scene, camera));

    // 添加SSAO效果以产生一些噪点
    const ssaoEffect = new SSAOEffect(camera, null, {
        blendFunction: BlendFunction.MULTIPLY,
        samples: 9,
        rings: 7,
        distanceThreshold: 1.0,
        distanceFalloff: 0.0,
        rangeThreshold: 0.5,
        rangeFalloff: 0.1,
        luminanceInfluence: 0.9,
        radius: 20,
        bias: 0.5,
        intensity: 1.5,
        color: null,
        patternScale: 1.0
    });

    // 创建降噪效果
    const denoiseEffect = new DenoiseEffect({
        blendFunction: BlendFunction.NORMAL,
        radius: 4.0,
        strength: 0.5,
        luminanceOnly: false,
        edgePreservation: 0.5
    });

    // 创建锐化效果(用于对比)
    const sharpenEffect = new SharpenEffect({
        blendFunction: BlendFunction.NORMAL,
        intensity: 0.5,
        kernelSize: 1.0
    });

    // 添加SSAO通道 (产生噪点)
    composer.addPass(new EffectPass(camera, ssaoEffect));

    // 添加降噪通道
    composer.addPass(new EffectPass(camera, denoiseEffect));

    // 添加锐化通道 (可选，用于增强细节)
    composer.addPass(new EffectPass(camera, sharpenEffect));

    // GUI
    const pane = new Pane({ container: container.querySelector(".tp") });
    const fpsMeter = new FPSMeter();
    const clock = performance;

    const folder = pane.addFolder({ title: "Settings" });
    folder.addBinding(fpsMeter, "fps", { label: "FPS", readonly: true });

    // 降噪参数控制
    const denoiseFolder = folder.addFolder({ title: "降噪效果" });
    denoiseFolder.addBinding(denoiseEffect, "strength", { label: "强度", min: 0, max: 1, step: 0.01 });
    denoiseFolder.addBinding(denoiseEffect, "radius", { label: "半径", min: 1, max: 10, step: 0.1 });
    denoiseFolder.addBinding(denoiseEffect, "edgePreservation", { label: "边缘保留", min: 0, max: 1, step: 0.01 });
    denoiseFolder.addBinding(denoiseEffect, "luminanceOnly", { label: "仅亮度通道" });

    // SSAO参数控制(噪点来源)
    const ssaoFolder = folder.addFolder({ title: "SSAO效果" });
    ssaoFolder.addBinding(ssaoEffect, "intensity", { label: "强度", min: 0, max: 3, step: 0.1 });
    ssaoFolder.addBinding(ssaoEffect, "radius", { label: "半径", min: 0, max: 30, step: 1 });

    // 锐化参数控制
    const sharpenFolder = folder.addFolder({ title: "锐化效果" });
    sharpenFolder.addBinding(sharpenEffect, "intensity", { label: "强度", min: 0, max: 1, step: 0.01 });
    sharpenFolder.addBinding(sharpenEffect, "kernelSize", { label: "核大小", min: 0.1, max: 3, step: 0.1 });

    // 添加启用/禁用效果的选项
    const params = {
        enableDenoise: true,
        enableSharpen: true
    };

    folder.addBinding(params, "enableDenoise", { label: "启用降噪" }).on("change", (e) => {
        denoiseEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    folder.addBinding(params, "enableSharpen", { label: "启用锐化" }).on("change", (e) => {
        sharpenEffect.blendMode.opacity.value = e.value ? 1.0 : 0.0;
    });

    // 分成两半显示对比 (待添加)

    // Animation
    let lastTime = 0;

    function onResize() {
        const dpr = window.devicePixelRatio.toFixed(1);
        const width = container.clientWidth;
        const height = container.clientHeight;
        const aspect = width / height;

        // 更新相机
        camera.fov = calculateVerticalFoV(90, aspect);
        camera.aspect = aspect;
        camera.updateProjectionMatrix();

        // 更新渲染器和效果合成器
        renderer.setSize(width, height);
        renderer.setPixelRatio(dpr);

        // 修复: 移除不支持的setPixelRatio调用，
        // 使用正确的方式设置composer的大小
        composer.setSize(width, height);
        // 注意: 新版本的EffectComposer会自动使用renderer的像素比例
    }

    window.addEventListener("resize", () => onResize());
    onResize();

    // 渲染循环
    requestAnimationFrame(function render(timestamp) {
        fpsMeter.update(timestamp);
        const elapsed = clock.now() - lastTime;
        lastTime = clock.now();

        // 更新控制器和动画
        if (elapsed > 0) {
            const delta = elapsed * 0.001;
            controls.update(timestamp, delta);
            if (animationMixer !== undefined) {
                animationMixer.update(delta);
            }

            // 旋转材质球展示效果
            spheres.rotation.y += delta * 0.3;
        }

        // 渲染场景
        composer.render();
        requestAnimationFrame(render);
    });
})); 