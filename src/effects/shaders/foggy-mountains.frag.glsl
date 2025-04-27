// Foggy Mountains 2
// 基于Shadertoy效果: https://www.shadertoy.com/view/MdsGzS
// 修改版：移除山脉，仅保留天空和雾气，添加相机矩阵支持

// 统一变量声明
uniform float time;       // 替代 iTime
uniform vec2 resolution;  // 替代 iResolution
uniform vec2 mouse;       // 替代 iMouse

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;  // 添加视图矩阵支持
uniform float cameraFov;
uniform float cameraNear;
uniform float cameraFar;

// 效果参数
uniform float fogDensity; // 雾气浓度控制

// 噪声纹理
uniform sampler2D noiseTexture; // 替代 iChannel0

// 辅助函数
vec3 rotate(vec3 r, float v){ 
    return vec3(r.x*cos(v)+r.z*sin(v), r.y, r.z*cos(v)-r.x*sin(v));
}

float noise(in vec3 x) {
    float z = x.z*64.0;
    vec2 offz = vec2(0.317,0.123);
    vec2 uv1 = x.xy + offz*floor(z); 
    vec2 uv2 = uv1 + offz;
    
    // 使用纹理采样
    float n1 = texture2D(noiseTexture, uv1).x;
    float n2 = texture2D(noiseTexture, uv2).x;
    
    return mix(n1, n2, fract(z)) - 0.5;
}

float noises(in vec3 p) {
    float a = 0.0;
    for(float i=1.0; i<6.0; i++) {
        a += noise(p)/i;
        p = p*2.0 + vec3(0.0, a*0.001/i, a*0.0001/i);
    }
    return a;
}

float clouds(in vec3 p) {
    float height = 500.0;
    p.y += height;
    return noises(vec3(p.x*0.3+((time+mouse.y)*30.0), p.y, p.z)*0.00002) - max(p.y, 0.0)*0.00009;
}

// 简化版本的mainImage函数，移除山脉部分，只保留天空和雾
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    float localTime = time*5.0 + floor(time*0.1)*150.0;
    
    // 计算观察方向向量，使用视图矩阵
    float fovFactor = tan(radians(cameraFov * 0.5));
    vec2 screenPos = (fragCoord / resolution) * 2.0 - 1.0;
    vec3 viewDir = normalize(vec3(screenPos.x * resolution.x / resolution.y * fovFactor, 
                             screenPos.y * fovFactor, -1.0));
    
    // 将视图方向转换到世界空间
    vec4 worldDir = viewMatrix * vec4(viewDir, 0.0);
    vec3 ray = normalize(worldDir.xyz);
    
    // 设置相机位置和太阳位置
    vec3 campos = cameraPosition + vec3(0.0, 0.0, localTime*8.0);
    vec3 sun = normalize(vec3(0.0, 0.6, -0.4));
    
    // 雾气和颜色计算
    float fog = 0.0;
    vec3 pos = campos;
    
    // 简化的雾气计算，不再进行地形碰撞检测
    for(float i=1.0; i<50.0; i++) {
        float step = i*i*0.5;
        vec3 p = pos + ray * step;
        fog += clouds(p) * 0.5;
    }
    
    float l = sin(dot(ray, sun));
    vec3 light = vec3(l, 0.0, -l) + ray.y*0.2;
    
    // 简化的颜色计算
    vec3 cloudColor = vec3(0.70, 0.72, 0.70) + light*0.05 + sin(fog*0.0002)*0.2;
    vec3 skyColor = cloudColor + ray.y*0.1 - 0.02;
    
    // 应用雾气浓度
    float f = smoothstep(0.0, 800.0, fog * fogDensity);
    
    // 最终颜色混合
    vec3 finalColor = mix(skyColor, cloudColor, f);
    
    // 添加边缘暗角效果
    vec2 uv = fragCoord / resolution;
    finalColor = sqrt(smoothstep(0.2, 1.0, finalColor - dot(uv*2.0-1.0, uv*2.0-1.0)*0.1));
    
    fragColor = vec4(finalColor, 1.0);
}

// 将mainImage函数转换为适应postprocessing框架的mainImage函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fragCoord = uv * resolution.xy;
    vec4 foggyMountainsColor;
    mainImage(foggyMountainsColor, fragCoord);

    // 读取深度值
    float depth = texture2D(depthBuffer, uv).r;
    
    // 将深度值转换为线性深度 (0-1)
    float linearDepth = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
    linearDepth = linearDepth / cameraFar; // 归一化到0-1
    
    // 基于深度的混合策略:
    // 1. 远处(深度接近1)：使用完整的天空和雾气效果
    // 2. 近处：根据距离逐渐应用雾气效果
    float skyMask = step(0.9999, depth); // 纯天空部分（最远处）
    
    // 基于线性深度的雾气混合因子
    float fogFactor = clamp(linearDepth * fogDensity * 2.0, 0.0, 1.0);
    
    // 两步混合:
    // 1. 先将输入颜色与雾气颜色基于深度混合，得到带雾的前景
    vec4 foggedColor = mix(inputColor, vec4(foggyMountainsColor.rgb, 1.0), fogFactor);
    
    // 2. 在天空区域（最远处）使用完整的天空+雾气效果
    outputColor = mix(foggedColor, foggyMountainsColor, skyMask);
} 