// Sky and Fog Effect (修改自 Lakes and Mountains Effect)
// 基于Shadertoy效果，移除了山脉和湖泊部分，仅保留天空和雾气

uniform float time;           // 替代 iTime
uniform vec2 resolution;      // 替代 iResolution
uniform sampler2D noiseTexture; // 替代 iChannel0

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;      // 注意：这里实际存储的是相机的世界矩阵(matrixWorld)
uniform float cameraFov;

// 效果参数
uniform float fogDensity;     // 雾气密度
uniform vec3 fogColor;        // 雾气颜色
uniform float fogDecay;       // 雾气衰减速度
uniform float fogMinDist;     // 雾气最小距离
uniform float quality;        // 质量设置 (0-低, 1-中, 2-高)
uniform bool enableClouds;    // 是否启用云
uniform bool enableVolumeFog; // 是否启用体积雾
uniform float volumeDetail;   // 体积雾细节程度 
uniform float volumeSteps;    // 体积雾步进次数

// 噪声函数
float hash(float n) {
    return fract(sin(n)*43758.5453123);
}

float noise(in vec2 x) {
    vec2 p = floor(x);
    vec2 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0;
    float res = mix(mix(hash(n+  0.0), hash(n+  1.0), f.x),
                    mix(hash(n+ 57.0), hash(n+ 58.0), f.x), f.y);
    return res;
}

float noiseHigh(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    float n = p.x + p.y*57.0 + 113.0*p.z;
    float res = mix(mix(mix(hash(n+  0.0), hash(n+  1.0), f.x),
                        mix(hash(n+ 57.0), hash(n+ 58.0), f.x), f.y),
                    mix(mix(hash(n+113.0), hash(n+114.0), f.x),
                        mix(hash(n+170.0), hash(n+171.0), f.x), f.y), f.z);
    return res;
}

// 体积噪声函数 (使用纹理)
float volumeNoise(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f*f*(3.0-2.0*f);
    
    vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
    vec2 rg = texture2D(noiseTexture, (uv+0.5)/256.0).yx;
    return mix(rg.x, rg.y, f.z);
}

// FBM (分形布朗运动) - 从Foggy Terrain着色器移植
mat3 m = mat3(0.00, 1.60, 1.20, 
             -1.60, 0.72, -0.96, 
             -1.20, -0.96, 2.28);
             
float fbm(vec3 p) {
    float f = 0.5000 * volumeNoise(p); p = m * p * 0.72;
    f += 0.2500 * volumeNoise(p); p = m * p * 0.73;
    f += 0.1250 * volumeNoise(p); p = m * p * 0.74;
    
    if (volumeDetail > 0.5) {
        f += 0.0625 * volumeNoise(p); p = m * p * 0.75;
    }
    
    if (volumeDetail > 0.8) {
        f += 0.03125 * volumeNoise(p);
    }
    
    return f;
}

vec3 rotate(vec3 p, float theta) {
    float c = cos(theta), s = sin(theta);
    return vec3(p.x, p.y * c + p.z * s, p.z * c - p.y * s);
}

float clouds(vec2 p) {
    float final = noise(p);
    p *= 2.94; final += noise(p) * 0.4;
    p *= 2.87; final += noise(p) * 0.2;
    p *= 2.93; final += noise(p) * 0.1;
    return final;
}

const vec3 lightDir = vec3(0.819232, 0.573462, 0.0);

vec3 calculateSkyColor(vec3 rdir) {
    vec3 col = mix(vec3(0.3, 0.5, 0.7), vec3(0.0, 0.05, 0.1), clamp(rdir.y*2.5, 0.0, 1.0));
    col += pow(dot(lightDir, rdir) * 0.5 + 0.5, 2.0) * vec3(0.3, 0.2, 0.1);    
    return col;
}

vec3 renderSkyAndFog(vec3 rpos, vec3 rdir) {
    // 渲染天空基础颜色
    vec3 skyColor = calculateSkyColor(rdir);
    
    // 如果启用云层效果，添加云
    if (enableClouds) {
        float cloudst = (rpos.y + 130.0) / rdir.y;
        
        if (cloudst > 0.0) {
            float f = 1.0/exp(cloudst*0.0005);
            
            vec3 pos = rpos + rdir * cloudst;
            float c = clouds(pos.xz*0.005);
            float c2 = clouds((pos.xz+vec2(50.0, 0.0))*0.005);
            float dir = max((c-c2)+0.5, 0.0);
            
            c = max(c - 0.5, 0.0) * 1.8;
            c = c*c*(3.0-2.0*c);
            vec3 cloudColor = mix(vec3(0.4, 0.5, 0.6), vec3(1.0, 0.9, 0.8), dir);
            
            // 应用云层
            skyColor = mix(skyColor, cloudColor, clamp(f*c, 0.0, 1.0));
        }
    }
    
    return skyColor;
}

// 体积雾计算函数
vec4 volumetricFog(vec3 rayOrigin, vec3 rayDir, float maxDist) {
    // 调整采样步数基于质量
    int steps = int(mix(10.0, 24.0, volumeSteps));
    float stepSize = maxDist / float(steps);
    
    vec4 result = vec4(0.0);
    vec3 pos = rayOrigin;
    
    // 体积光追踪
    for (int i = 0; i < 24; i++) {
        if (i >= steps) break;
        
        // 移动采样点
        pos += rayDir * stepSize;
        
        // 计算噪声值
        float density = fbm(pos * 0.01) * fogDensity;
        
        // 高度因子 - 雾在低处更浓
        float heightFactor = exp(-max(0.0, pos.y) * 0.2);
        density *= heightFactor;
        
        // 计算当前采样点的颜色和透明度
        vec3 sampleColor = fogColor;
        float alpha = density * stepSize;
        
        // 光照效果 - 简单的散射模拟
        float light = max(0.0, dot(normalize(vec3(0.0, 1.0, 0.0)), lightDir));
        sampleColor *= mix(0.5, 1.5, light);
        
        // 前向混合
        result.rgb += (1.0 - result.a) * sampleColor * alpha;
        result.a += (1.0 - result.a) * alpha;
        
        // 提前终止以提高性能
        if (result.a >= 0.99) break;
    }
    
    return result;
}

// 使用相机参数的渲染函数
vec3 cameraBasedRender(vec2 fragCoord) {
    // 使用相机FOV和视图矩阵计算射线方向
    float fovFactor = tan(radians(cameraFov * 0.5));
    vec2 screenPos = (fragCoord / resolution) * 2.0 - 1.0;
    
    // 计算相机空间中的视线方向
    vec3 viewDir = normalize(vec3(
        screenPos.x * resolution.x / resolution.y * fovFactor, 
        screenPos.y * fovFactor, 
        -1.0
    ));
    
    // 将相机空间的视线方向转换到世界空间
    // 使用相机的世界矩阵(viewMatrix)来转换
    vec3 ray = normalize((viewMatrix * vec4(viewDir, 0.0)).xyz);
    
    // 使用实际相机位置
    vec3 rayPosition = cameraPosition;
    
    // 渲染天空和雾气
    vec3 skyColor = renderSkyAndFog(rayPosition, ray);
    
    // 体积雾渲染
    if (enableVolumeFog) {
        float maxDist = 200.0; // 最大渲染距离
        vec4 volumeFog = volumetricFog(rayPosition, ray, maxDist);
        
        // 混合天空和体积雾
        skyColor = mix(skyColor, volumeFog.rgb, volumeFog.a);
    }
    
    return skyColor;
}

// 计算雾因子的函数，应用自定义的雾参数
float calculateFogFactor(float linearDepth) {
    // 考虑最小距离
    float adjustedDepth = max(0.0, linearDepth - fogMinDist);
    
    // 应用雾密度和衰减速率
    // 使用指数函数模拟雾的衰减效果
    float fogAmount = 1.0 - exp(-adjustedDepth * fogDensity * fogDecay);
    
    return clamp(fogAmount, 0.0, 1.0);
}

// PostProcessing框架的主函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fragCoord = uv * resolution;
    
    // 质量高时使用抗锯齿
    vec3 col;
    if (quality > 0.8) {
        col = (cameraBasedRender(fragCoord) + 
               cameraBasedRender(fragCoord + vec2(0.0, 0.5))) * 0.5;
    } else {
        col = cameraBasedRender(fragCoord);
    }
    
    // 根据深度混合场景
    if (USE_DEPTH == 1) {
        // 读取深度
        float depth = texture2D(depthBuffer, uv).r;
        
        // 将深度转换为线性深度
        float linearDepth = 2.0 * cameraNear * cameraFar / 
            (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
        linearDepth = linearDepth / cameraFar; // 归一化到0-1
        
        // 基于深度的混合
        float skyMask = step(0.9999, depth); // 天空部分（最远处）
        
        if (enableVolumeFog) {
            // 体积雾模式下，使用简单混合
            vec3 finalColor = mix(inputColor.rgb, col, skyMask);
            outputColor = vec4(finalColor, inputColor.a);
        } else {
            // 标准雾模式
            // 计算自定义雾因子
            float fogFactor = calculateFogFactor(linearDepth);
            
            // 根据雾因子混合输入颜色和雾颜色
            vec3 foggedColor = mix(inputColor.rgb, fogColor, fogFactor);
            
            // 最终混合：将雾化后的颜色与天空颜色混合
            vec3 finalColor = mix(foggedColor, col, skyMask);
            
            outputColor = vec4(finalColor, inputColor.a);
        }
    } else {
        // 不使用深度时直接输出效果
        outputColor = vec4(pow(col, vec3(0.4545)), 1.0);
    }
} 