uniform float time;
uniform vec2 resolution;
uniform sampler2D interiorTexture;
uniform float roomDepth;

varying vec2 vUv;
varying vec3 vPosition;
varying vec3 vWorldPosition;
varying vec3 vViewDir;

// 室内立方体映射函数 - 计算射线与立方体的交点
vec3 interiorMapping(in vec2 p) {
    // 创建固定房间深度效果
    vec3 pdepth = vec3(p, -roomDepth);
    
    // 修正视线方向 - 简化计算，避免错误
    vec3 directv = normalize(vec3(vViewDir.xy, -abs(vViewDir.z)));
    
    // 射线相交计算 - 保证有效结果
    vec3 t = 1.0 / max(abs(directv), 0.001);
    vec3 k = abs(t) - pdepth * t;
    
    float kmin = min(min(k.x, k.y), k.z);
    vec3 cubep = kmin * directv + pdepth;
    
    return cubep;
}

// 立方体到2D纹理映射函数
vec2 twoDMapping(in vec3 cubep) {
    // 立方体到UV映射的简化实现
    // 确定哪个面被击中
    vec3 absCubep = abs(cubep);
    float maxComp = max(max(absCubep.x, absCubep.y), absCubep.z);
    
    vec2 uv;
    
    // 根据最大分量确定击中的面，并创建适当的UV映射
    if (maxComp == absCubep.x) {
        // X轴面 (左/右墙)
        uv = vec2(cubep.z, cubep.y) / roomDepth * 0.5 + 0.5;
        uv.x = cubep.x > 0.0 ? uv.x : 1.0 - uv.x;
    } else if (maxComp == absCubep.y) {
        // Y轴面 (上/下墙)
        uv = vec2(cubep.x, cubep.z) / roomDepth * 0.5 + 0.5;
        uv.y = cubep.y > 0.0 ? uv.y : 1.0 - uv.y;
    } else {
        // Z轴面 (前/后墙)
        uv = vec2(cubep.x, cubep.y) / roomDepth * 0.5 + 0.5;
        uv.x = cubep.z > 0.0 ? uv.x : 1.0 - uv.x;
    }
    
    return fract(uv);
}

void main() {
    // 使用归一化的UV坐标，确保比例正确
    vec2 p = vUv * 2.0 - 1.0;
    p.x *= resolution.x / resolution.y;
    
    vec2 p1 = vUv;
    
    // 计算晕影效果
    float vignetting = 16.0 * (p1.x * p1.y * (1.0 - p1.x) * (1.0 - p1.y));
    
    // 计算立方体映射坐标
    vec3 cubemapping = interiorMapping(p);
    
    // 计算2D纹理采样坐标
    vec2 twodsample = twoDMapping(cubemapping);
    
    // 调试 - 如果没有纹理，使用UV坐标作为颜色显示
    vec3 debugColor = vec3(twodsample, 0.0);
    
    // 采样室内纹理
    vec3 interiorColor = texture2D(interiorTexture, twodsample).rgb;
    if (length(interiorColor) < 0.01) {
        interiorColor = debugColor;
    }
    
    // 添加晕影效果
    vec3 finalColor = interiorColor * sqrt(vignetting);
    
    gl_FragColor = vec4(finalColor, 1.0);
} 