import {
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    Mesh,
    PlaneGeometry,
    DirectionalLight,
    AmbientLight,
    Vector3,
    Color,
    Clock,
    BackSide,
    SphereGeometry,
    MeshBasicMaterial
} from "three";

import {
    OceanMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 创建海洋演示场景
function createScene() {
    const scene = new Scene();
    // scene.background = new Color(0x87CEEB); // 设置场景背景色为天蓝色

    // 添加灯光
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(0.5, 1, 0.5);
    scene.add(directionalLight);

    const ambientLight = new AmbientLight(0x555555);
    scene.add(ambientLight);

    // 创建海洋平面 - 增加细分
    const geometry = new PlaneGeometry(100, 100, 256, 256);
    const material = new OceanMaterial({
        waterDepth: 1.0,
        dragMult: 0.5,
        cameraHeight: 1.5,
        iterationsVertex: 16,
        iterationsRaymarch: 8,
        iterationsNormal: 24,
        waterColor: 0x0066ff
    });

    // 创建网格并水平放置
    const ocean = new Mesh(geometry, material);
    ocean.rotation.x = -Math.PI / 2; // 使平面水平
    scene.add(ocean);
    ocean.scale.set(0.1, 0.1, 0.1);

    return { scene, ocean };
}

window.addEventListener("load", () => {
    // 基本设置
    const renderer = new WebGLRenderer({
        powerPreference: "high-performance",
        antialias: true
    });
    renderer.setPixelRatio(window.devicePixelRatio);

    const container = document.querySelector(".viewport");
    container.prepend(renderer.domElement);

    // 相机和控制器
    const camera = new PerspectiveCamera();
    const controls = new SpatialControls(camera.position, camera.quaternion, renderer.domElement);
    const settings = controls.settings;
    settings.general.mode = ControlMode.THIRD_PERSON;
    settings.translation.enabled = true;
    settings.translation.sensitivity = 1.0;

    // 设置相机初始位置 - 更低一些，更好地观察水面
    controls.position.set(0, 5, 20);
    controls.lookAt(0, 0, 0);

    // 创建场景
    const { scene, ocean } = createScene();

    // 设置时钟
    const clock = new Clock();

    // 配置GUI控制面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    const folder = pane.addFolder({ title: "海洋材质参数" });

    // 水深控制
    folder.addBinding(ocean.material, "waterDepth", {
        label: "水深",
        min: 0.1,
        max: 3.0,
        step: 0.1
    });

    // 拖拽系数控制
    folder.addBinding(ocean.material, "dragMult", {
        label: "波浪拖拽",
        min: 0.1,
        max: 1.0,
        step: 0.01
    });

    // 相机高度控制
    folder.addBinding(ocean.material, "cameraHeight", {
        label: "相机高度",
        min: 0.5,
        max: 5.0,
        step: 0.1
    });

    // 顶点波浪迭代控制
    folder.addBinding(ocean.material, "iterationsVertex", {
        label: "顶点波浪迭代",
        min: 8,
        max: 24,
        step: 1
    }).on("change", (event) => {
        ocean.material.uniforms.iterationsVertex.value = Math.floor(event.value);
    });

    // 光线行进迭代控制
    folder.addBinding(ocean.material, "iterationsRaymarch", {
        label: "光线行进迭代",
        min: 4,
        max: 24,
        step: 1
    }).on("change", (event) => {
        ocean.material.uniforms.iterationsRaymarch.value = Math.floor(event.value);
    });

    // 法线计算迭代控制
    folder.addBinding(ocean.material, "iterationsNormal", {
        label: "法线计算迭代",
        min: 12,
        max: 48,
        step: 4
    }).on("change", (event) => {
        ocean.material.uniforms.iterationsNormal.value = Math.floor(event.value);
    });

    // 水颜色控制
    const waterColorParams = { color: "#0066ff" };
    folder.addBinding(waterColorParams, "color", {
        label: "水颜色"
    }).on("change", (event) => {
        ocean.material.waterColor = new Color(event.value);
    });

    // 太阳方向控制
    const sunDirectionParams = {
        x: 0.5,
        y: 1.0,
        z: 0.5
    };

    const sunFolder = folder.addFolder({
        title: "太阳方向",
        expanded: false
    });

    sunFolder.addBinding(sunDirectionParams, "x", {
        label: "X",
        min: -1,
        max: 1,
        step: 0.01
    }).on("change", updateSunDirection);

    sunFolder.addBinding(sunDirectionParams, "y", {
        label: "Y",
        min: 0,
        max: 1,
        step: 0.01
    }).on("change", updateSunDirection);

    sunFolder.addBinding(sunDirectionParams, "z", {
        label: "Z",
        min: -1,
        max: 1,
        step: 0.01
    }).on("change", updateSunDirection);

    function updateSunDirection() {
        const direction = new Vector3(
            sunDirectionParams.x,
            sunDirectionParams.y,
            sunDirectionParams.z
        ).normalize();

        ocean.material.sunDirection = direction;
    }

    // 窗口大小调整处理
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);

        // 更新材质的分辨率
        if (ocean.material.uniforms.resolution) {
            ocean.material.setResolution(width, height);
        }
    }

    // 渲染循环
    function render() {
        const deltaTime = clock.getDelta();
        fpsMeter.update();
        controls.update(deltaTime);

        // 更新海洋材质
        ocean.material.update(deltaTime);

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    window.addEventListener("resize", onResize);
    onResize();
    requestAnimationFrame(render);
}); 