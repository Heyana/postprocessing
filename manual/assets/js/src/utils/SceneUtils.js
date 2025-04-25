/**
 * SceneUtils.js - 场景工具函数集合
 * 包含通用的场景创建、材质处理等与业务无关的代码
 */

import {
    BoxGeometry,
    Color,
    ConeGeometry,
    CubeTextureLoader,
    Fog,
    Group,
    HemisphereLight,
    IcosahedronGeometry,
    Mesh,
    MeshPhysicalMaterial,
    MeshStandardMaterial,
    PlaneGeometry,
    SphereGeometry,
    Scene,
    SpotLight,
    SRGBColorSpace,
    TorusGeometry,
    TorusKnotGeometry,
    Vector3,
    WebGLRenderTarget,
    LinearFilter,
    HalfFloatType
} from "run-scene-core";

/**
 * 加载环境贴图
 * @param {string} basePath - 环境贴图的基础路径
 * @param {string} format - 图片格式，如 ".png"
 * @returns {Promise} - 加载完成的环境贴图
 */
export function loadEnvironmentMap(basePath, format = ".png") {
    return new Promise((resolve, reject) => {
        const cubeTextureLoader = new CubeTextureLoader();
        const urls = [
            basePath + "px" + format, basePath + "nx" + format,
            basePath + "py" + format, basePath + "ny" + format,
            basePath + "pz" + format, basePath + "nz" + format
        ];

        cubeTextureLoader.load(urls,
            (texture) => {
                texture.colorSpace = SRGBColorSpace;
                resolve(texture);
            },
            undefined,
            (err) => reject(err)
        );
    });
}

/**
 * 创建基础场景
 * @param {Object} options - 场景配置选项
 * @returns {Object} - 包含场景、相机、灯光等对象
 */
export function createBasicScene(options = {}) {
    const {
        fogColor = 0x443333,
        fogNear = 1,
        fogFar = 4,
        planeSize = 8,
        planeColor = 0xcbcbcb,
        hemiLightIntensity = 5,
        spotLightIntensity = 12,
        spotLightPosition = new Vector3(-1, 1, 1),
        spotLightAngle = Math.PI / 16,
        spotLightPenumbra = 0.5,
        enableShadows = true
    } = options;

    const scene = new Scene();
    scene.background = new Color(fogColor);
    scene.fog = new Fog(fogColor, fogNear, fogFar);

    // 创建地面
    const plane = new Mesh(
        new PlaneGeometry(planeSize, planeSize),
        new MeshStandardMaterial({ color: planeColor })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.0001;
    plane.receiveShadow = true;
    scene.add(plane);

    // 创建半球光
    const hemiLight = new HemisphereLight(0xffffff, 0x8d7c7c, hemiLightIntensity);
    scene.add(hemiLight);

    // 创建聚光灯
    const spotLight = new SpotLight(0xffffff, spotLightIntensity);
    spotLight.position.copy(spotLightPosition);
    spotLight.angle = spotLightAngle;
    spotLight.penumbra = spotLightPenumbra;
    spotLight.castShadow = enableShadows;
    spotLight.shadow.bias = -0.0001;
    scene.add(spotLight);

    return {
        scene,
        hemiLight,
        spotLight,
        plane
    };
}

/**
 * 创建标准测试对象
 * @returns {Group} - 测试对象组
 */
export function createTestObjects() {
    const objects = new Group();
    objects.name = "testObjects";

    // 绿色立方体
    const boxGeometry = new BoxGeometry(0.05, 0.05, 0.05);
    const boxMaterial = new MeshStandardMaterial({
        color: 'green',
        roughness: 0.2,
        metalness: 0.8,
        envMapIntensity: 1.5
    });
    const boxMesh = new Mesh(boxGeometry, boxMaterial);
    boxMesh.position.set(-0.12, 0.025, 0.015);
    boxMesh.castShadow = boxMesh.receiveShadow = true;
    objects.add(boxMesh);

    // 青色二十面体
    const icosaGeometry = new IcosahedronGeometry(0.025, 4);
    const icosaMaterial = new MeshStandardMaterial({
        color: 'cyan',
        roughness: 0.2,
        metalness: 0.8,
        envMapIntensity: 1.5
    });
    const icosaMesh = new Mesh(icosaGeometry, icosaMaterial);
    icosaMesh.position.set(-0.05, 0.025, 0.08);
    icosaMesh.castShadow = icosaMesh.receiveShadow = true;
    objects.add(icosaMesh);

    // 黄色圆锥
    const coneGeometry = new ConeGeometry(0.025, 0.05, 64);
    const coneMaterial = new MeshStandardMaterial({
        color: 'yellow',
        roughness: 0.2,
        metalness: 0.8,
        envMapIntensity: 1.5
    });
    const coneMesh = new Mesh(coneGeometry, coneMaterial);
    coneMesh.position.set(-0.05, 0.025, -0.055);
    coneMesh.castShadow = coneMesh.receiveShadow = true;
    objects.add(coneMesh);

    // 添加一组具有不同金属度和粗糙度的球体
    for (let i = 0; i < 50; i++) {
        const sphereGeometry = new SphereGeometry(0.025, 64, 64);
        const sphereMaterial = new MeshStandardMaterial({
            color: new Color().setHSL(i / 5, 0.7, 0.5),
            metalness: 0.7 + (i * 0.05),
            roughness: 0.1 + (i / 20),
            envMapIntensity: 2.0
        });
        const sphereMesh = new Mesh(sphereGeometry, sphereMaterial);
        sphereMesh.position.set(0.1 + i * 0.06, 0.025, 0);
        sphereMesh.castShadow = sphereMesh.receiveShadow = true;
        objects.add(sphereMesh);
    }

    // 添加更多测试模型
    createAdditionalModels(objects);

    return objects;
}

/**
 * 创建附加的测试模型
 * @param {Group} parent - 父组，用于添加创建的模型
 */
export function createAdditionalModels(parent) {
    // ==== 添加一个金属环面 ====
    const torusGeometry = new TorusGeometry(0.03, 0.01, 16, 50);
    const torusMaterial = new MeshStandardMaterial({
        color: 0xffffff,
        metalness: 1.0,
        roughness: 0.07
    });
    const torusMesh = new Mesh(torusGeometry, torusMaterial);
    torusMesh.position.set(-0.15, 0.05, -0.1);
    torusMesh.rotation.x = Math.PI / 4;
    torusMesh.castShadow = torusMesh.receiveShadow = true;
    parent.add(torusMesh);

    // ==== 添加一个半透明球体 ====
    const glassGeometry = new SphereGeometry(0.03, 64, 64);
    const glassMaterial = new MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.1,
        transmission: 0.8,
        thickness: 0.01,
        envMapIntensity: 1.0,
        clearcoat: 0.5,
        clearcoatRoughness: 0.2
    });
    const glassMesh = new Mesh(glassGeometry, glassMaterial);
    glassMesh.position.set(0.3, 0.05, -0.1);
    glassMesh.castShadow = true;
    glassMesh.receiveShadow = true;
    parent.add(glassMesh);

    // ==== 添加一个金属材质立方体 ====
    const metalBoxGeometry = new BoxGeometry(0.05, 0.05, 0.05);
    const metalBoxMaterial = new MeshStandardMaterial({
        color: 0xC0C0C0,
        metalness: 1.0,
        roughness: 0.05,
        envMapIntensity: 1.0
    });
    const metalBoxMesh = new Mesh(metalBoxGeometry, metalBoxMaterial);
    metalBoxMesh.position.set(0.2, 0.025, 0.1);
    metalBoxMesh.rotation.y = Math.PI / 4;
    metalBoxMesh.castShadow = metalBoxMesh.receiveShadow = true;
    parent.add(metalBoxMesh);

    // ==== 添加一个扭曲的几何体 ====
    const twistedGeometry = new TorusKnotGeometry(0.02, 0.007, 50, 16);
    const twistedMaterial = new MeshStandardMaterial({
        color: 0xFF00FF,
        metalness: 0.8,
        roughness: 0.2,
    });
    const twistedMesh = new Mesh(twistedGeometry, twistedMaterial);
    twistedMesh.position.set(-0.2, 0.05, 0.1);
    twistedMesh.castShadow = twistedMesh.receiveShadow = true;
    parent.add(twistedMesh);
}

/**
 * 通过金属度选择对象
 * @param {Group} objects - 对象组
 * @param {number} threshold - 金属度阈值
 * @returns {Array} - 超过阈值的对象数组
 */
export function selectObjectsByMetalness(objects, threshold = 0.7) {
    const selected = [];

    objects.traverse((object) => {
        if (object.isMesh && object.material) {
            const material = object.material;
            // 检查材质是否有金属度属性
            if (material.metalness !== undefined && material.metalness >= threshold) {
                selected.push(object);
            }
        }
    });

    return selected;
}

/**
 * 创建用于遮罩的渲染目标
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @returns {WebGLRenderTarget} - 渲染目标
 */
export function createMaskRenderTarget(width, height) {
    return new WebGLRenderTarget(width, height, {
        minFilter: LinearFilter,
        magFilter: LinearFilter,
        type: HalfFloatType,
        depthBuffer: true
    });
}

/**
 * 更新材质的环境贴图强度
 * @param {Scene} scene - 场景
 * @param {number} intensity - 环境贴图强度
 */
export function updateEnvMapIntensity(scene, intensity) {
    scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
            // 对于标准材质和物理材质
            if (obj.material.envMap !== undefined || obj.material.envMapIntensity !== undefined) {
                obj.material.envMapIntensity = intensity;
                obj.material.needsUpdate = true;
            }
        }
    });
}

/**
 * 优化球体反射效果
 * @param {Array} spheres - 球体对象数组
 * @param {boolean} enhance - 是否增强反射效果
 */
export function optimizeSphereReflections(spheres, enhance = true) {
    spheres.forEach((sphere, i) => {
        if (enhance) {
            // 增强模式：更高金属度，更低粗糙度
            sphere.material.metalness = 0.95;
            sphere.material.roughness = Math.max(0.05, 0.08 + (i / 50));
        } else {
            // 正常模式：恢复更适中的值
            sphere.material.metalness = 0.9;
            sphere.material.roughness = 0.1 + (i / 20);
        }
        sphere.material.needsUpdate = true;
    });
}

/**
 * 优化曲面对象反射效果
 * @param {Array} objects - 要优化的对象数组
 * @param {boolean} enhance - 是否增强反射效果
 */
export function optimizeCurvedSurfaceReflections(objects, enhance = true) {
    objects.forEach(obj => {
        if (enhance) {
            // 优化曲面物体的材质参数
            obj.material.roughness = Math.max(0.05, obj.material.roughness * 0.7);
            obj.material.metalness = Math.min(0.98, obj.material.metalness * 1.1);
        } else {
            // 根据几何体类型还原基本材质参数
            if (obj.geometry instanceof TorusGeometry) {
                obj.material.roughness = 0.07;
                obj.material.metalness = 1.0;
            } else if (obj.geometry instanceof TorusKnotGeometry) {
                obj.material.roughness = 0.2;
                obj.material.metalness = 0.8;
            } else if (obj.geometry instanceof IcosahedronGeometry) {
                obj.material.roughness = 0.2;
                obj.material.metalness = 0.8;
            }
        }
        obj.material.needsUpdate = true;
    });
}

/**
 * 获取指定几何体类型的对象
 * @param {Group} group - 对象组
 * @param {Function} geometryType - 几何体类型构造函数
 * @returns {Array} - 符合条件的对象数组
 */
export function getObjectsByGeometryType(group, geometryType) {
    const result = [];

    group.traverse((object) => {
        if (object.isMesh && object.geometry instanceof geometryType) {
            result.push(object);
        }
    });

    return result;
}

export const sceneUtils = {
    loadEnvironmentMap,
    createBasicScene,
    createTestObjects,
    createMaskRenderTarget,
    updateEnvMapIntensity,
    optimizeSphereReflections,
    optimizeCurvedSurfaceReflections,
    getObjectsByGeometryType,
    selectObjectsByMetalness,
    setMatrixAutoUpdate: (object, state) => {
        object.matrixAutoUpdate = state;
    },

}
