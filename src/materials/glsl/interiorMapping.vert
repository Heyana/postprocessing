uniform float roomScale;

varying vec2 vUv;
varying vec3 vViewDir;
varying vec3 vWorldPosition;
varying vec3 vNormal;
varying vec3 vPosition;

#ifdef USE_OBJECTSPACE
varying vec3 vObjectPosition;
#endif

void main() {
    vUv = uv;
    
    // 确保法线正确归一化 - 这对于平面旋转时至关重要
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    
    // 计算世界坐标和方向
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // 计算从顶点到相机的方向（而不是相机到顶点）
    // 这确保了视线方向在所有角度都正确
    vec3 cameraToVertex = normalize(worldPosition.xyz - cameraPosition);
    
    #ifdef USE_OBJECTSPACE
        // 对象空间模式
        vObjectPosition = position * roomScale;
        
        // 获取对象空间视线方向
        vec4 objCameraPos = inverse(modelMatrix) * vec4(cameraPosition, 1.0);
        vViewDir = normalize(position - objCameraPos.xyz) * roomScale;
    #else
        // 切线空间模式 - 确保TBN矩阵正确构建
        vec3 T = normalize(normalMatrix * tangent.xyz);
        vec3 B = normalize(cross(vNormal, T)) * tangent.w;
        
        // 构建TBN矩阵
        mat3 TBN = mat3(T, B, vNormal);
        
        // 转换视线方向到切线空间
        vViewDir = normalize(TBN * cameraToVertex) * roomScale;
    #endif
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 