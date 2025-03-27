// inputBuffer和vUv由Effect基类已定义，这里不再重复定义
// uniform sampler2D inputBuffer;
uniform sampler2D fog_depthBuffer;
uniform vec2 fog_resolution;
uniform vec3 fog_color;
uniform float fog_density;
uniform float fog_heightFalloff;
uniform float fog_baseHeight;
uniform vec3 fog_lightPosition;
uniform vec3 fog_lightColor;
uniform float fog_lightIntensity;
uniform float fog_scatteringCoefficient;
uniform float fog_extinction;
uniform mat4 fog_projectionMatrix;
uniform float fog_cameraNear;
uniform float fog_cameraFar;
uniform float fog_stepSize;
uniform float fog_time;
uniform float debug_mode; // 调试模式 0=正常, 1=深度纹理, 2=线性深度

// 不再重复定义vUv（由基类已定义）
// varying vec2 vUv;
varying vec3 vRayOrigin;
varying vec3 vRayDir;

// 深度值转换为线性深度
float getLinearDepth(float depth) {
    // 检查深度值是否有效
    if (depth == 1.0) return fog_cameraFar; // 如果是背景，返回远平面距离
    
    float z = depth * 2.0 - 1.0;
    return (2.0 * fog_cameraNear * fog_cameraFar) / (fog_cameraFar + fog_cameraNear - z * (fog_cameraFar - fog_cameraNear));
}

// 基于高度的雾密度
float getDensity(vec3 position) {
    float height = position.y;
    float heightFactor = exp(-fog_heightFalloff * max(0.0, height - fog_baseHeight));
    return fog_density * heightFactor;
}

// 简单噪声函数
float hash(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p, p.zxy + 19.19);
    return fract(p.x * p.y * p.z);
}

// 光线步进主函数
vec4 raymarch(vec3 rayOrigin, vec3 rayDir, float tMax) {
    // 减少最大步数以提高性能和兼容性
    const int MAX_STEPS = 16;
    
    vec3 totalScattering = vec3(0.0);
    float transmittance = 1.0;
    
    // 添加时间偏移以增加动态效果
    float timeOffset = fog_time * 0.05;
    
    // 调整步长，确保采样足够
    float stepSize = min(fog_stepSize, tMax / float(MAX_STEPS));
    
    // 简化的光线步进循环
    for (int i = 0; i < MAX_STEPS; i++) {
        // 计算当前采样点位置
        float t = float(i) * stepSize;
        
        // 跳过超出深度范围的采样
        if (t >= tMax) break;
        
        vec3 position = rayOrigin + rayDir * t;
        
        // 计算当前点的密度
        float density = getDensity(position);
        
        // 添加简单的噪声以使雾不均匀
        float noise = hash(position * 0.1 + timeOffset);
        density *= (0.7 + 0.3 * noise);
        
        if (density > 0.0) {
            // 计算到光源的方向和距离
            vec3 lightDir = normalize(fog_lightPosition - position);
            float lightDist = length(fog_lightPosition - position);
            
            // 简化光照计算，但保留基本的光源距离衰减
            float lightAttenuation = 1.0 / (1.0 + lightDist * 0.1);
            
            // 计算散射贡献 - 增加系数使效果更明显
            vec3 scattering = fog_lightColor * fog_lightIntensity * fog_scatteringCoefficient 
                            * density * lightAttenuation;
            
            // 增加散射强度，使效果更加明显
            scattering *= 8.0; 
            
            // 添加到累积散射中
            totalScattering += transmittance * scattering * stepSize;
            
            // 更新透射率 - 使用简化的衰减计算
            transmittance *= exp(-fog_extinction * density * stepSize);
            
            // 优化：如果透射率已经很低，提前退出
            if (transmittance < 0.01) break;
        }
    }
    
    // 确保散射不为零，并调整不透明度上限
    totalScattering = max(totalScattering, vec3(0.01));
    float fogOpacity = min(1.0 - transmittance, 0.7); // 降低最大不透明度以保持场景可见
    
    return vec4(totalScattering, fogOpacity);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 初始默认输出，避免未赋值的情况
    outputColor = inputColor;
    
    // 获取场景深度
    float depth = texture2D(fog_depthBuffer, uv).r;
    
    // 检查深度纹理是否有效
    if (depth <= 0.0 || depth >= 1.0) {
        // 深度无效，保持原始颜色并退出
        return;
    }
    
    // 调试模式 - 深度纹理可视化
    // 使用浮点数比较，提高WebGL兼容性
    if (debug_mode > 0.5 && debug_mode < 1.5) {
        outputColor = vec4(vec3(depth), 1.0);
        return;
    }
    
    // 计算线性深度
    float linearDepth = getLinearDepth(depth);
    
    // 调试模式 - 线性深度可视化
    if (debug_mode > 1.5) {
        float normalizedDepth = linearDepth / fog_cameraFar;
        outputColor = vec4(vec3(normalizedDepth), 1.0);
        return;
    }
    
    // 计算光线长度（从相机到场景表面）
    float tMax = linearDepth;
    
    // 执行光线步进
    vec4 fogResult = raymarch(vRayOrigin, vRayDir, tMax);
    
    // 确保雾气不会完全替换场景
    float fogStrength = min(fogResult.a, 0.75);  // 允许更高的雾气强度
    
    // 混合原始场景颜色和雾效果 - 增加混合强度
    outputColor = mix(inputColor, vec4(fog_color * 0.5 + fogResult.rgb, 1.0), fogStrength * 0.5);
    
    // 添加散射光贡献 - 增加因子使效果更明显
    outputColor.rgb += fogResult.rgb * 3.0;
    
    // 确保输出颜色有有效的Alpha值
    outputColor.a = inputColor.a;
} 