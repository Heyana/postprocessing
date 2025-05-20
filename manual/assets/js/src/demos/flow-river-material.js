import {
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    Mesh,
    PlaneGeometry,
    DirectionalLight,
    AmbientLight,
    Clock
} from "three";

import { FlowRiverMaterial } from "postprocessing";
import { Pane } from "tweakpane";
import { SpatialControls, ControlMode } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 创建河流演示场景
function createScene() {
    const scene = new Scene();

    // 添加灯光
    const directionalLight = new DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    const ambientLight = new AmbientLight(0x404040);
    scene.add(ambientLight);

    // 创建河流平面
    const geometry = new PlaneGeometry(10, 5, 50, 25);
    const material = new FlowRiverMaterial({
        flowSpeed: 0.5,
        waterColor: 0x0055ff,
        transparency: 0.8,
        waveHeight: 0.2,
        waveScale: 1.0,
        waveSpeed: 1.0
    });

    const river = new Mesh(geometry, material);
    river.rotation.x = -Math.PI / 2; // 水平放置
    scene.add(river);

    return { scene, river };
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
    controls.position.set(0, 5, 10);
    controls.lookAt(0, 0, 0);

    // 创建场景
    const { scene, river } = createScene();

    // 设置时钟
    const clock = new Clock();

    // 配置GUI控制面板
    const fpsMeter = new FPSMeter();
    const pane = new Pane({ container: container.querySelector(".tp") });
    pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

    // 创建参数对象
    const params = {
        flowSpeed: river.material.uniforms.flowSpeed.value,
        transparency: river.material.uniforms.transparency.value,
        waveHeight: river.material.uniforms.waveHeight.value,
        waveScale: river.material.uniforms.waveScale.value,
        waveSpeed: river.material.uniforms.waveSpeed.value,
        waterColor: {
            r: river.material.uniforms.waterColor.value.r,
            g: river.material.uniforms.waterColor.value.g,
            b: river.material.uniforms.waterColor.value.b
        }
    };
    console.log('Log-- ', params, 'params');
    const folder = pane.addFolder({ title: "河流材质参数" });
    folder.addBinding(params, "flowSpeed", {
        label: "流速",
        min: 0,
        max: 2.0,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.flowSpeed.value = ev.value;
    });

    folder.addBinding(params, "transparency", {
        label: "透明度",
        min: 0,
        max: 1.0,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.transparency.value = ev.value;
    });

    folder.addBinding(params, "waveHeight", {
        label: "波浪高度",
        min: 0,
        max: 1.0,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.waveHeight.value = ev.value;
    });

    folder.addBinding(params, "waveScale", {
        label: "波浪缩放",
        min: 0.1,
        max: 5.0,
        step: 0.1
    }).on("change", (ev) => {
        river.material.uniforms.waveScale.value = ev.value;
    });

    folder.addBinding(params, "waveSpeed", {
        label: "波浪速度",
        min: 0.1,
        max: 5.0,
        step: 0.1
    }).on("change", (ev) => {
        river.material.uniforms.waveSpeed.value = ev.value;
    });

    folder.addBinding(params.waterColor, "r", {
        label: "红色",
        min: 0,
        max: 1,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.waterColor.value.r = ev.value;
    });

    folder.addBinding(params.waterColor, "g", {
        label: "绿色",
        min: 0,
        max: 1,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.waterColor.value.g = ev.value;
    });

    folder.addBinding(params.waterColor, "b", {
        label: "蓝色",
        min: 0,
        max: 1,
        step: 0.01
    }).on("change", (ev) => {
        river.material.uniforms.waterColor.value.b = ev.value;
    });

    // 窗口大小调整处理
    function onResize() {
        const width = container.clientWidth, height = container.clientHeight;
        camera.aspect = width / height;
        camera.fov = calculateVerticalFoV(90, Math.max(camera.aspect, 16 / 9));
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }

    // 渲染循环
    function render() {
        const deltaTime = clock.getDelta();
        fpsMeter.update();
        controls.update();

        // 更新河流材质
        river.material.update(deltaTime);

        renderer.render(scene, camera);
        requestAnimationFrame(render);
    }

    window.addEventListener("resize", onResize);
    onResize();
    requestAnimationFrame(render);
}); 