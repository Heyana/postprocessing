// 顶点着色器主要负责将顶点位置转换到裁剪空间
// 并传递必要的数据给片段着色器

// 传递时间和相机位置
uniform float time;

// 必要的输出变量
varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vNormal;
varying vec3 vWorldPosition;
varying vec3 vViewDirection;

void main() {
    // 计算世界空间位置
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    
    // 计算从顶点到相机的方向（视线方向）
    vViewDirection = normalize(cameraPosition - vWorldPosition);
    
    // 传递UV坐标
    vUv = uv;
    
    // 传递位置和法线
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    
    // 设置最终的顶点位置
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
} 