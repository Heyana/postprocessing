// 移除重复的vUv定义，仅保留特定于体积雾的变量
// varying vec2 vUv; - 已由基类定义，所以移除此行
varying vec3 vRayOrigin;
varying vec3 vRayDir;

uniform mat4 cameraMatrixWorld;
uniform mat4 projectionMatrixInv;

// 不定义main函数，而是使用基类提供的mainSupport函数
void mainSupport(const in vec2 uv) {
    // 计算世界空间中的光线原点和方向
    vec4 ndcRay = vec4(
        (uv.x - 0.5) * 2.0,
        (uv.y - 0.5) * 2.0,
        1.0,
        1.0
    );
    
    vec4 rayOrigin = cameraMatrixWorld * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 rayDir = projectionMatrixInv * ndcRay;
    rayDir = cameraMatrixWorld * vec4(normalize(rayDir.xyz), 0.0);
    
    vRayOrigin = rayOrigin.xyz;
    vRayDir = rayDir.xyz;
} 