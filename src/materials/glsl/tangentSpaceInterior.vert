uniform float roomScale;

// 传递到片段着色器的变量
varying vec2 vUv;
varying vec3 vViewDir;
varying vec3 vNormal;
varying vec3 vWorldPosition;

void main() {
    // 计算顶点位置
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    
    // 传递UV坐标
    vUv = uv;
    
    // 计算法线
    vNormal = normalMatrix * normal;
    
    // 在切线空间中计算视线方向，优化大角度视角下的计算
    // 首先获取世界空间中的视线方向
    vec3 worldViewDir = normalize(cameraPosition - worldPosition.xyz);
    
    // 构建增强版TBN矩阵，确保切线与法线严格正交
    vec3 N = normalize(vNormal);
    vec3 T = normalize(normalMatrix * tangent.xyz);
    // 确保T完全与N正交，避免在边缘处的畸变
    T = normalize(T - dot(T, N) * N);
    vec3 B = normalize(cross(N, T) * tangent.w);
    
    // 将世界空间视线方向转换到切线空间，使用改进的TBN矩阵
    vViewDir = vec3(
        dot(worldViewDir, T),
        dot(worldViewDir, B),
        dot(worldViewDir, N)
    );
    
    // 应用房间尺寸缩放，但保持Z分量的比例更大，增强大角度视角下的效果
    vViewDir.xy *= roomScale;
    // 确保z分量在大角度视角下不会消失
    vViewDir.z *= max(1.0, roomScale * 0.75);
    
    // 设置最终顶点位置
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
} 