// 沙尘暴效果（修改版）
// 基于Shadertoy效果移植，提供体积雾、光线散射效果
// 暂时隐藏飞船模型，仅保留沙尘暴部分

// 统一变量声明 - 不需要重复定义已经由库提供的变量
// uniform sampler2D inputBuffer;
// uniform sampler2D depthBuffer;
// uniform vec2 vUv;

// 其他需要的统一变量
uniform float time;       // 替代 iTime
uniform vec2 resolution;  // 替代 iResolution
uniform vec2 mouse;       // 替代 iMouse

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;
uniform float cameraFov;
uniform float cameraNear;
uniform float cameraFar;

// 效果参数
uniform float volumeDensity;       // 体积密度
uniform float volumeAbsorbtion;    // 体积吸收率
uniform vec3 lightColor;           // 光源颜色
uniform float shadowQuality;       // 阴影质量
uniform float numSteps;            // 采样步数
uniform float enableDithering;     // 是否启用抖动
uniform float enableVolumetricLighting; // 是否启用体积光照
uniform float fogDensity;          // 雾气浓度
uniform float fogDecay;            // 雾气衰减速度
uniform float fogMinDist;          // 最小雾气距离

// 常量定义 PI无需反复定义
//#define PI 3.141592

// ACES 色调映射
vec3 ACES(vec3 x) { 
    float a = 2.51;
    float b = 0.03;
    float c = 2.43;
    float d = 0.59;
    float e = 0.14;
    return (x*(a*x+b))/(x*(c*x+d)+e);
}

// 2D旋转函数
mat2 rot(float a) {
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c);
}

// 3D旋转函数
mat3 rot(vec3 a) {
    float c = cos(a.x), s = sin(a.x);
    mat3 rx = mat3(1,0,0,0,c,-s,0,s,c);
    c = cos(a.y), s = sin(a.y);
    mat3 ry = mat3(c,0,-s,0,1,0,s,0,c);
    c = cos(a.z), s = sin(a.z);
    mat3 rz = mat3(c,-s,0,s,c,0,0,0,1);
    
    return rz * rx * ry;
}

// 浮点随机数
float hash(float n) {
    return fract(sin(n)*43758.5453123);
}

// 噪声函数 (by iq)
float noise(vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);

    float n = p.x + p.y*157.0 + 113.0*p.z;

    return mix(mix(mix(hash(n+  0.0), hash(n+  1.0),f.x),
                   mix(hash(n+157.0), hash(n+158.0),f.x),f.y),
               mix(mix(hash(n+113.0), hash(n+114.0),f.x),
                   mix(hash(n+270.0), hash(n+271.0),f.x),f.y),f.z);
}

// 分形噪声
float fbm(vec3 p) {
    float f = 0.0;
    f += 0.5*noise(p);
    f += 0.25*noise(2.0*p);
    f += 0.125*noise(4.0*p);
    f += 0.0625*noise(8.0*p);
    return f;
}

// 场景SDF (分形)
float map(vec3 p) {
    mat3 r = rot(vec3(1.57)); // 旋转
   
    p *= 6.0;
    vec3 q = p;
    float m = 1.0;
    
    for (int i=0; i<3; i++) {
        p = clamp(p, -1.0, 1.0) * 2.0 - p;
        float h = clamp(0.25/dot(p, p), 0.25, 1.0);
        p *= h;
        m *= h;
        if(i<2) p *= r;
        p = p*9.0 + q;
        m = m*9.0+1.0;
    }
    q = abs(p);
    return (max(q.x, max(q.y, q.z))-3.0) / (m*6.0);
}

// 光线行进函数
float intersect(vec3 ro, vec3 rd) {
    float t = 0.0; // 行进距离
    for (int i=0; i<128 && t<8.0; i++) {
        vec3 p = ro + rd*t; // 当前点
        
        float h = map(p); // 到场景的距离
        if (h<0.001) break; // 命中表面
        
        t += h; // 前进
    }
    // 返回距离
    return t;
}

// 法线估计
vec3 calcNormal(vec3 p) {
    float h = map(p);
    const vec2 e = vec2(0.0001, 0.0); // 偏移量
    
    return normalize(h - vec3(map(p-e.xyy),
                              map(p-e.yxy),
                              map(p-e.yyx)));
}

// 阴影函数
float shadow(vec3 ro, vec3 rd, float tmax) {
    for (float t=0.0; t<tmax;) {
        vec3 p = ro + rd*t;
        float h = map(p)*shadowQuality;
        if (h<0.001) return 0.0;
        t += h;
    }
    return 1.0;
}

// 光线函数
// 返回光线方向和光线向量的长度
vec4 getLight(vec3 ce, vec3 p) {
    vec3 lig = ce - p; // 光线向量
    float l = length(lig); // 光线向量的长度
    lig = normalize(lig); // 归一化
    return vec4(lig, l);
}

// 体积渲染 - 仅渲染沙尘暴
vec4 renderVolume(vec3 ro, vec3 rd, float tmax) {
    vec4 sum = vec4(0.0, 0.0, 0.0, 0.0); // 颜色和不透明度
    
    float s = tmax / float(int(numSteps)); // 步进大小
    float t = 0.0; // 行进距离
    if (enableDithering > 0.5) {
        // 抖动
        t += s*hash(gl_FragCoord.x*8315.9213/resolution.x+gl_FragCoord.y*2942.5192/resolution.y);
    }
    
    // 计算光源位置 - 随时间变化
    vec3 lightPos = vec3(1.5)*rot(vec3(0.5*time));
    
    for (int i=0; i<128; i++) { // 光线步进循环
        if (i >= int(numSteps)) break; // 限制步进次数
        
        vec3 p = ro + rd*t; // 当前点
        
        // 应用最小雾气距离 - 在cameraNear和fogMinDist之间的区域不会有雾气
        float distFromCamera = distance(p, ro);
        
        if (distFromCamera > fogMinDist) {
            // 应用衰减速度 - 使雾气随距离增加而变浓
            // 使用更加平滑的过渡函数
            float distFactor = 1.0 - exp(-0.1 * (1.0 - fogDecay) * (distFromCamera - fogMinDist));
            
            // 计算雾的密度，考虑距离因素和雾气浓度设置
            float h = volumeDensity * fbm(4.0*p) * distFactor * fogDensity;
            
            // 计算光照
            vec4 lig = getLight(lightPos, p); // 光线方向 + 光线向量的长度
            
            // 简化的阴影计算
            float sha = 1.0;
            if (enableVolumetricLighting > 0.5) {
                // 使用简化的阴影计算，根据距离衰减
                sha = clamp(1.0 - 0.2 * lig.w * shadowQuality, 0.0, 1.0);
            }
                      
            // 着色
            vec3 col = lightColor * sha / (lig.w * lig.w); // 光照衰减平方反比
                
            sum.rgb += h * s * exp(sum.a) * col; // 将颜色添加到最终结果
            sum.a += -h * s * volumeAbsorbtion; // 比尔定律
        }
        
        t += s; // 前进
    }
    
    // 输出
    return sum;
}

// 环境光遮蔽函数
float calcAO(vec3 p, vec3 n) { // 点和法线
    float res = 1.0; // 结果
    for (int i=0; i<5; i++) { // 采样5次
        float h = 0.1*float(i)/5.0;
        res *= clamp(0.5+0.5*map(p + n*h)/h, 0.0, 1.0);
    }    
    return res;
}

// 渲染
vec3 render(vec3 ro, vec3 rd) {
    vec3 col = vec3(0.0); // 背景
    
    float t = intersect(ro, rd); // 距离
    if (t<8.0) { // 命中表面
        vec3 p = ro + rd*t; // 命中点
        vec3 n = calcNormal(p); // 表面法线
        
        // 光源位置        
        vec3 lightPos = vec3(1.5)*rot(vec3(0.5*time)); // 光源位置
        vec4 lig = getLight(lightPos, p); // 光线方向 + 光线向量的长度
                
        float dif = clamp(dot(n, lig.xyz), 0.0, 1.0); // 漫反射光
        float sha = shadow(p+n*0.002, lig.xyz, lig.w*0.5); // 阴影
        float bac = clamp(dot(n, -lig.xyz), 0.0, 1.0); // 背光/反弹光
        float occ = calcAO(p, n); // 环境光遮蔽
        
        // 光与表面交互
        float lin = 0.0;
        lin += dif*sha; // 直射光
        lin += 0.1*occ*(1.0+bac); // 环境光
        lin /= lig.w*lig.w; // 平方反比定律
        
        col = lightColor*lin;
    }
    
    // 雾
    vec4 res = renderVolume(ro, rd, t);
    col = col*exp(res.a) + res.rgb; // 将颜色与雾气颜色混合
    
    // 输出
    return col;
}

// 相机函数
mat3 setCamera(vec3 ro, vec3 ta) {
    vec3 w = normalize(ta - ro);
    vec3 u = normalize(cross(w, vec3(0.0, 1.0, 0.0)));
    vec3 v = cross(u, w);
    return mat3(u, v, w);
}

// 深度转线性深度
float linearizeDepth(float depth) {
    return 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
}

// 主函数 - 适配为postprocessing库的接口
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fragCoord = uv * resolution.xy;
    
    // 获取深度值
    float depth = texture2D(depthBuffer, uv).r;
    
    // 将深度转换为线性深度 (0-1)
    float linearDepth = linearizeDepth(depth) / cameraFar;
    
    // 计算相机方向
    float fovFactor = tan(radians(cameraFov * 0.5));
    vec2 p = (2.0 * uv - 1.0) * vec2(resolution.x / resolution.y * fovFactor, fovFactor);
    
    // 转换为世界空间方向
    vec3 rayDir = normalize(vec3(p, -1.0));
    vec3 rd = normalize((inverse(viewMatrix) * vec4(rayDir, 0.0)).xyz);
    
    // 最大渲染距离
    float maxDist = 30.0;
    
    // 渲染沙尘暴效果
    vec4 volumeResult = renderVolume(cameraPosition, rd, maxDist);
    vec3 sandStormColor = volumeResult.rgb;
    
    // 后处理
    sandStormColor = ACES(sandStormColor); // 色调映射
    sandStormColor = pow(sandStormColor, vec3(0.4545)); // 伽马校正
    sandStormColor = sandStormColor*0.2+0.8*sandStormColor*sandStormColor*(3.0-2.0*sandStormColor); // 对比度
    
    // 边缘暗角
    vec2 q = fragCoord/resolution.xy;
    sandStormColor *= 0.5+0.5*pow(16.0 * q.x*q.y*(1.0-q.x)*(1.0-q.y), 0.1);
    
    // --------- 参考foggy-mountains.frag的混合逻辑 ---------
    
    // 天空掩码 - 标识最远处的天空部分
    float skyMask = step(0.9999, depth);
    
    // 基于线性深度的混合因子 - 控制沙尘暴效果的强度
    // 使用fogDensity、fogDecay和fogMinDist来修改混合计算
    float distFactor = max(0.0, linearDepth - fogMinDist/cameraFar);
    // 使用更加平滑的过渡函数
    float blendFactor = clamp(distFactor * fogDensity * 2.0 * (1.0 - exp(-0.5 * (1.0 - fogDecay) * distFactor * cameraFar)), 0.0, 1.0);
    
    // 两步混合:
    // 1. 先将输入颜色与沙尘暴颜色基于深度混合，得到带沙尘的前景
    vec3 blendedColor = mix(inputColor.rgb, sandStormColor, blendFactor);
    
    // 2. 在天空区域（最远处）使用完整的沙尘暴效果
    vec3 finalColor = mix(blendedColor, sandStormColor, skyMask);
    
    // 最终输出
    outputColor = vec4(finalColor, inputColor.a);
} 