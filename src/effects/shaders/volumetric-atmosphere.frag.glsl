// 体积大气散射着色器
// 基于László Matuska的Shadertoy代码，专注于体积雾和大气散射效果

uniform sampler2D noiseTexture; // 噪声纹理
uniform vec2 resolution; // 分辨率
uniform float time; // 时间
uniform vec3 sunPosition; // 太阳/光源位置
uniform int animateClouds; // 云/雾动画开关
uniform float fogDensity; // 雾密度（替代原cloudy参数）
uniform float height; // 观察者高度
uniform float hazeDensity; // 雾霾密度（替代原haze参数）
uniform float scatteringStrength; // 散射强度（新参数）
uniform float fogColor; // 雾颜色色调（新参数，0-1之间，0=蓝色，1=暖色）
uniform float fogDepthMask; // 雾的深度阈值
uniform mat4 viewMatrix; // 视图矩阵
uniform float fov; // 视场角

// 常量定义
const float M_PI = 3.1415926535;
const float DEGRAD = M_PI / 180.0;

// 渲染质量参数 - 可以提高步数以获得更好的质量
const int steps = 20; // 散射采样步数
const int stepss = 4; // 次级光线采样步数

// 散射参数
const float I = 12.0; // 光源强度
const float g = 0.45; // 光线集中度参数（Mie相位函数参数）
const float g2 = g * g;

// 瑞利散射和米氏散射基础系数
const vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6); // 瑞利散射系数（控制颜色）
const vec3 bM = vec3(21e-6); // 米氏散射系数（控制体积雾密度）

// 大气参数
const float Hr = 8000.0; // 瑞利散射高度
const float Hm = 1200.0; // 米氏散射高度
const float R0 = 6360e3; // 星球半径
const float Ra = 6380e3; // 大气层半径
const vec3 C = vec3(0.0, -R0, 0.0); // 星球中心

//--------------------------------------------------------------------------
// 噪声相关函数

float Noise(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
    vec2 rg = texture(noiseTexture, (uv + 0.5) / 256.0).yx;
    return mix(rg.x, rg.y, f.z);
}

float fnoise(vec3 p, in float t) {
    p *= 0.25;
    float f;

    f = 0.5000 * Noise(p); p = p * 3.02; p.y -= t * 0.2;
    f += 0.2500 * Noise(p); p = p * 3.03; p.y += t * 0.06;
    f += 0.1250 * Noise(p); p = p * 3.01;
    f += 0.0625 * Noise(p); p = p * 3.03;
    f += 0.03125 * Noise(p); p = p * 3.02;
    f += 0.015625 * Noise(p);
    return f;
}

//--------------------------------------------------------------------------
// 云雾和散射函数

float volumetricFog(vec3 p, in float t) {
    // 使用噪声创建非均匀雾效果
    float fog = fnoise(p * 2e-4, t) + fogDensity * 0.1;
    fog = smoothstep(0.4 + 0.04, 0.6 + 0.04, fog);
    fog *= 70.0; // 增加雾的强度
    return fog + hazeDensity; // 加上均匀雾霾
}

// 密度计算函数，计算散射介质的密度
void densities(in vec3 pos, out float rayleigh, out float mie, in float t) {
    float h = length(pos - C) - R0; // 当前点到地表的高度
    rayleigh = exp(-h / Hr); // 瑞利密度随高度指数衰减
    
    vec3 d = pos;
    d.y = 0.0;
    float dist = length(d); // 水平距离
    
    // 体积雾处理
    float fog = 0.0;
    if (1e3 < h && h < 8e3) {
        fog = volumetricFog(pos + vec3(23175.7, 0.0, -t * 3e3), t);
        fog *= sin(3.1415 * (h - 1e3) / 7e3) * fogDensity;
    }
    
    // 高层雾处理
    float fog2 = 0.0;
    if (9e3 < h && h < 15e3) {
        fog2 = fnoise(pos * 3e-4, t) * volumetricFog(pos * 32.0 + vec3(27612.3, 0.0, -t * 15e3), t);
        fog2 *= sin(3.1413 * (h - 9e3) / 6e3) * fogDensity * 0.7;
        fog2 = clamp(fog2, 0.0, 1.0);
    }

    // 距离衰减
    const float fogNear = 10.0;
    const float fogFar = 1000.0;
    if (dist < fogFar) {
        float factor = clamp(1.0 - ((fogFar - dist) / (fogFar - fogNear)), 0.0, 1.0);
        fog *= factor;
    }

    mie = exp(-h / Hm) + fog + hazeDensity + fog2;
}

// 求交函数，计算射线与球面相交
float escape(in vec3 p, in vec3 d, in float R) {
    vec3 v = p - C;
    float b = dot(v, d);
    float c = dot(v, v) - R * R;
    float det2 = b * b - c;
    if (det2 < 0.0) return -1.0;
    float det = sqrt(det2);
    float t1 = -b - det, t2 = -b + det;
    return (t1 >= 0.0) ? t1 : t2;
}

// 大气散射主函数
void scatter(vec3 o, vec3 d, out vec3 col, out float scattering, in float t) {
    float L = escape(o, d, Ra); // 计算光线穿过大气层的长度
    
    // 计算光源方向
    vec3 Ds = normalize(sunPosition);
    float mu = dot(d, Ds); // 视线与光源方向的夹角余弦
    float opmu2 = 1.0 + mu * mu;
    
    // 相位函数计算
    float phaseR = 0.0596831 * opmu2; // 瑞利散射相位函数
    float phaseM = 0.1193662 * (1.0 - g2) * opmu2 / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5)); // 米氏散射相位函数

    float depthR = 0.0, depthM = 0.0;
    vec3 R = vec3(0.0), M = vec3(0.0);

    // 主射线步进
    float dl = L / float(steps);
    for (int i = 0; i < steps; ++i) {
        float l = float(i) * dl;
        vec3 p = o + d * l; // 当前采样点

        float dR, dM;
        densities(p, dR, dM, t); // 获取当前点的散射介质密度
        dR *= dl; dM *= dl;
        depthR += dR;
        depthM += dM;

        // 从当前点到光源的光线计算
        float Ls = escape(p, Ds, Ra);
        if (Ls > 0.0) {
            float dls = Ls / float(stepss);
            float depthRs = 0.0, depthMs = 0.0;
            
            // 次级光线步进
            for (int j = 0; j < stepss; ++j) {
                float ls = float(j) * dls;
                vec3 ps = p + Ds * ls;
                float dRs, dMs;
                densities(ps, dRs, dMs, t);
                depthRs += dRs * dls;
                depthMs += dMs * dls;
            }

            // 散射计算
            vec3 A = exp(-(bR * (depthRs + depthR) + bM * (depthMs + depthM)));
            vec3 dA = (A - exp(-(bR * depthR + bM * depthM))) * I;
            R += dA * dR * phaseR;
            M += dA * dM * phaseM;
        }
    }
    
    // 调整颜色色调（根据fogColor参数）
    vec3 fogTint = mix(
        vec3(0.6, 0.8, 1.0), // 蓝色雾调
        vec3(1.0, 0.8, 0.6), // 暖色雾调
        fogColor
    );
    
    // 应用散射强度
    col = ((R * bR) + (M * bM * fogTint)) * scatteringStrength;
    scattering = (1.0 - exp(-length(bM) * depthM)) * scatteringStrength;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 读取深度缓冲区
    float depth = texture(depthBuffer, uv).r;
    
    // 计算UV方向
    vec2 q = uv * 2.0 - 1.0;
    q.x *= resolution.x / resolution.y;
    
    // 计算视图方向
    vec3 vuv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 vrgt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 vfwd = -vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    
    // 根据FOV计算视线方向
    float rad = fov * DEGRAD / 2.0;
    float vtan = tan(rad);
    vec3 dir = normalize(vfwd + q.x * vrgt * vtan + q.y * vuv * vtan);
    
    // 计算观察者位置
    vec3 ro = vec3(0.0, height, 0.0);
    
    // 渲染大气散射
    vec3 atmosphere = vec3(0.0);
    float scattering = 0.0;
    float t = time * 0.04 * float(animateClouds); // 动画时间
    
    // 计算地平线以上的天空
    if (dir.y > -0.05) {
        // 大气散射计算
        scatter(ro, dir, atmosphere, scattering, t);
    } else {
        // 对于地平线以下，使用简单渐变
        atmosphere = mix(
            vec3(0.05, 0.1, 0.2) * hazeDensity, // 地面颜色
            vec3(0.1, 0.15, 0.25) * hazeDensity, // 地平线颜色
            smoothstep(-0.2, -0.05, dir.y)
        );
    }
    
    // 根据深度混合大气和原始图像 - 改进版，防止边缘锐利变化
    // 增加软边界混合和噪声扰动
    float fogMaskBase = smoothstep(fogDepthMask, fogDepthMask + 0.01, depth);
    
    // 使用水平位置添加一些随机变化，打破硬边界
    vec2 screenPos = gl_FragCoord.xy / resolution;
    float noiseOffset = fnoise(vec3(screenPos * 100.0, time * 0.5), t) * 0.005;
    
    // 更平滑的边缘
    float fogMask = smoothstep(0.0, 1.0, fogMaskBase + noiseOffset);
    
    // 确保在深度接近1.0时始终有雾效果（远处）
    float farFog = smoothstep(0.998, 0.9999, depth);
    fogMask = max(fogMask, farFog);
    
    // 输出结果：混合原始颜色和大气颜色
    outputColor = mix(inputColor, vec4(atmosphere, 1.0), fogMask);
}

void main() {
    vec4 inputColor = texture(inputBuffer, vUv);
    vec4 outputColor = vec4(0.0);
    
    mainImage(inputColor, vUv, outputColor);
    
    gl_FragColor = outputColor;
} 