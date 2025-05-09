import {
    Color,
    CubeTextureLoader,
    FogExp2,
    LoadingManager,
    PerspectiveCamera,
    Scene,
    SRGBColorSpace,
    WebGLRenderer,
    BoxGeometry,
    MeshStandardMaterial,
    Mesh,
    SphereGeometry,
    CylinderGeometry,
    TorusGeometry,
    DirectionalLight,
    AmbientLight,
    Vector3,
    Group
} from "three";

import {
    BlendFunction,
    EffectComposer,
    EffectPass,
    RenderPass,
    FoggyTerrainEffect
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";
import * as Domain from "../objects/Domain";

// 创建测试模型
function createTestObjects() {
    const group = new Group();

    // 添加一些基本几何体
    // 盒子
    const boxGeometry = new BoxGeometry(5, 5, 5);
    const boxMaterial = new MeshStandardMaterial({ color: 0x4488ff });
    const box = new Mesh(boxGeometry, boxMaterial);
    box.position.set(-10, 2.5, -20);
    group.add(box);

    // 球体
    const sphereGeometry = new SphereGeometry(3, 32, 32);
    const sphereMaterial = new MeshStandardMaterial({ color: 0xff8844 });
    const sphere = new Mesh(sphereGeometry, sphereMaterial);
    sphere.position.set(10, 3, -20);
    group.add(sphere);

    // 圆柱体
    const cylinderGeometry = new CylinderGeometry(2, 2, 8, 32);
    const cylinderMaterial = new MeshStandardMaterial({ color: 0x44ff88 });
    const cylinder = new Mesh(cylinderGeometry, cylinderMaterial);
    cylinder.position.set(0, 4, -30);
    group.add(cylinder);

    // 环面
    const torusGeometry = new TorusGeometry(3, 1, 16, 100);
    const torusMaterial = new MeshStandardMaterial({ color: 0xff44aa });
    const torus = new Mesh(torusGeometry, torusMaterial);
    torus.position.set(-15, 4, -40);
    torus.rotation.x = Math.PI / 2;
    group.add(torus);

    // 添加更多的对象，扩大场景范围
    for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 5; j++) {
            if (i === 0 && j === 0) continue; // 跳过中心位置

            const size = 2 + Math.random() * 3;
            const boxGeom = new BoxGeometry(size, size, size);
            const boxMat = new MeshStandardMaterial({
                color: new Color(Math.random(), Math.random(), Math.random())
            });
            const boxMesh = new Mesh(boxGeom, boxMat);
            boxMesh.position.set(
                -40 + i * 20,
                size / 2,
                -60 - j * 20
            );
            group.add(boxMesh);
        }
    }

    return group;
}

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

    // 相机和控制器
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.rotation.sensitivity = 2.2;
    settings.rotation.damping = 0.05;
    settings.zoom.damping = 0.1;
    settings.translation.enabled = true;

    // 场景、灯光、物体
    const scene = new Scene();
    scene.background = assets.get("sky");

    // 添加光源
    const ambientLight = new AmbientLight(0x404040, 1);
    scene.add(ambientLight);

    const directionalLight = new DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    // 添加环境和演员
    scene.add(Domain.createEnvironment(scene.background));
    scene.add(Domain.createActors(scene.background));

    // 添加测试模型
    scene.add(createTestObjects());

    // 设置初始相机位置 - 调整为更高的位置以便看到更多地形
    controls.position.set(0, 30, 30);
    controls.lookAt(0, 0, -40);

    // 后处理
    const composer = new EffectComposer(renderer, {
        multisampling: Math.min(4, renderer.capabilities.maxSamples)
    });

    const effect = new FoggyTerrainEffect({
        blendFunction: BlendFunction.NORMAL,
        fogDensity: 2.0,      // 增加雾气浓度
        terrainHeight: 4.0,   // 增加地形高度
        fogMinDistance: 0.0,  // 雾的最近距离
        fogFalloff: 0.05,     // 雾的衰减速度
        fogColor: 0xaabbff,   // 雾的颜色
        hideTerrainMesh: false, // 是否隐藏地形网格
        camera
    });

    const effectPass = new EffectPass(camera, effect);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(effectPass);

    // 设置面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "迷雾地形设置" });
    folder.addBinding(effect, "fogDensity", { min: 0, max: 10, step: 0.1, label: "雾气浓度" }); // 增加最大值
    folder.addBinding(effect, "terrainHeight", { min: 0.5, max: 15, step: 0.1, label: "地形高度" }); // 增加最大值
    folder.addBinding(effect, "fogMinDistance", { min: 0, max: 50, step: 0.5, label: "雾的最近距离" });
    folder.addBinding(effect, "fogFalloff", { min: 0.01, max: 0.2, step: 0.01, label: "雾的衰减速度" });
    folder.addBinding(effect, "fogColor", { label: "雾的颜色" });
    folder.addBinding(effect, "hideTerrainMesh", { label: "隐藏地形网格" });
    folder.addBinding(effect.blendMode.opacity, "value", { label: "不透明度", min: 0, max: 1, step: 0.01 });
    folder.addBinding(effect.blendMode, "blendFunction", { options: BlendFunction, label: "混合模式" });

    // 添加相机控制
    const cameraFolder = pane.addFolder({ title: "相机控制" });

    // 创建用于重置相机位置的按钮
    const cameraControl = {
        resetCamera: () => {
            controls.position.set(0, 30, 30);
            controls.lookAt(0, 0, -40);
        },
        highView: () => {
            controls.position.set(0, 80, 10);
            controls.lookAt(0, 0, -60);
        }
    };

    cameraFolder.addButton({
        title: "重置相机位置"
    }).on("click", cameraControl.resetCamera);

    cameraFolder.addButton({
        title: "高空视角"
    }).on("click", cameraControl.highView);

    // 窗口大小调整处理
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