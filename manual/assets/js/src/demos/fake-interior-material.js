import {
    PerspectiveCamera,
    Scene,
    WebGLRenderer,
    Mesh,
    BoxGeometry,
    DirectionalLight,
    AmbientLight,
    TextureLoader,
    RepeatWrapping,
    Clock,
    Vector3,
    Color,
    ControlMode
} from "three";

import {
    FakeInteriorMaterial
} from "postprocessing";

import { Pane } from "tweakpane";
import { SpatialControls } from "spatial-controls";
import { calculateVerticalFoV, FPSMeter } from "../utils";

// 加载布局纹理
function loadTexture() {
    return new Promise((resolve) => {
        const textureLoader = new TextureLoader();
        // 加载布局纹理
        const layoutTexture = textureLoader.load("img/InteriorMappingMaterial/map.png", (texture) => {
            texture.wrapS = RepeatWrapping;
            texture.wrapT = RepeatWrapping;
            resolve(layoutTexture);
        });
    });
}

// 创建演示场景
function createScene(texture) {
    const scene = new Scene();
    scene.background = new Color(0x222222); // 更暗的背景，使室内亮度更明显

    // 添加更强的灯光以提高场景亮度
    const directionalLight = new DirectionalLight(0xffffff, 2.0); // 增加灯光强度
    directionalLight.position.set(1, 2, 3);
    scene.add(directionalLight);

    // 增加第二个方向光从另一个角度照亮
    const directionalLight2 = new DirectionalLight(0xffffff, 1.5);
    directionalLight2.position.set(-2, 1, -1);
    scene.add(directionalLight2);

    // 增加环境光强度
    const ambientLight = new AmbientLight(0x808080, 1.5); // 更亮的环境光
    scene.add(ambientLight);

    // 创建建筑物网格
    const buildingsGroup = new Mesh();
    scene.add(buildingsGroup);

    // 添加几个带有室内效果的立方体
    const buildings = [];

    // 创建主建筑 - 使用布局纹理
    const mainBuilding = createBuilding(
        new Vector3(0, 5, 0),
        new Vector3(10, 10, 10),
        texture,
        {
            roomSizeX: 2.5, // 增大房间尺寸
            roomSizeY: 2.5,
            roomSizeZ: 2.5,
            useLayoutTexture: true // 始终使用布局纹理
        }
    );
    buildings.push(mainBuilding);
    buildingsGroup.add(mainBuilding);

    // 创建几个周围的建筑
    const positions = [
        new Vector3(-15, 5, 0),
        new Vector3(15, 5, 0),
        new Vector3(-10, 3, 12),
        new Vector3(12, 5, 10)
    ];

    const sizes = [
        new Vector3(8, 12, 8),
        new Vector3(10, 10, 10),
        new Vector3(5, 6, 5),
        new Vector3(7, 10, 7)
    ];

    const roomSizes = [
        new Vector3(2.0, 2.0, 2.0),  // 为每个建筑指定不同的房间尺寸
        new Vector3(2.5, 2.0, 2.5),
        new Vector3(1.5, 1.5, 1.5),
        new Vector3(1.8, 2.2, 1.8)
    ];

    for (let i = 0; i < positions.length; i++) {
        const building = createBuilding(
            positions[i],
            sizes[i],
            texture,
            {
                roomSizeX: roomSizes[i].x,
                roomSizeY: roomSizes[i].y,
                roomSizeZ: roomSizes[i].z,
                useLayoutTexture: true // 始终使用布局纹理
            }
        );
        buildings.push(building);
        buildingsGroup.add(building);
    }

    return { scene, buildings };
}

// 创建单个建筑
function createBuilding(position, size, texture, options = {}) {
    const geometry = new BoxGeometry(size.x, size.y, size.z);

    // 创建假室内材质
    const material = new FakeInteriorMaterial(options);
    material.wallTexture = texture; // 设置为布局纹理

    const building = new Mesh(geometry, material);
    building.position.copy(position);

    return building;
}

window.addEventListener("load", () => {
    // 加载纹理
    loadTexture().then(texture => {
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
        controls.position.set(0, 10, 30);
        controls.lookAt(0, 0, 0);

        // 创建场景
        const { scene, buildings } = createScene(texture);

        // 设置时钟
        const clock = new Clock();

        // 配置GUI控制面板
        const fpsMeter = new FPSMeter();
        const pane = new Pane({ container: container.querySelector(".tp") });
        pane.addBinding(fpsMeter, "fps", { readonly: true, label: "FPS" });

        // 主建筑 (布局纹理)
        const mainBuilding = buildings[0];
        const layoutFolder = pane.addFolder({ title: "室内参数" });

        layoutFolder.addBinding(mainBuilding.material.uniforms.roomSize.value, "x", {
            label: "房间宽度",
            min: 0.5,
            max: 5.0,
            step: 0.1
        });

        layoutFolder.addBinding(mainBuilding.material.uniforms.roomSize.value, "y", {
            label: "房间高度",
            min: 0.5,
            max: 5.0,
            step: 0.1
        });

        layoutFolder.addBinding(mainBuilding.material.uniforms.roomSize.value, "z", {
            label: "房间深度",
            min: 0.5,
            max: 5.0,
            step: 0.1
        });

        // 颜色控制
        const colorFolder = pane.addFolder({ title: "墙面颜色" });

        colorFolder.addBinding(mainBuilding.material.uniforms.ceilingColor, "value", {
            label: "天花板颜色"
        });

        colorFolder.addBinding(mainBuilding.material.uniforms.floorColor, "value", {
            label: "地板颜色"
        });

        colorFolder.addBinding(mainBuilding.material.uniforms.leftWallColor, "value", {
            label: "左墙颜色"
        });

        colorFolder.addBinding(mainBuilding.material.uniforms.rightWallColor, "value", {
            label: "右墙颜色"
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
            controls.update(deltaTime);

            // 更新所有建筑的材质
            for (const building of buildings) {
                building.material.update(deltaTime, camera.position);
            }

            renderer.render(scene, camera);
            requestAnimationFrame(render);
        }

        window.addEventListener("resize", onResize);
        onResize();
        requestAnimationFrame(render);
    });
}); 