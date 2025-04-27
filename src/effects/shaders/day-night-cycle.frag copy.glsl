// 日夜循环天空效果着色器
// 基于László Matuska (@BitOfGold)的Shadertoy代码
// 原始着色器: https://www.shadertoy.com/view/ltlSWB

// uniform sampler2D inputBuffer; // 已由Effect基类定义
// uniform sampler2D depthBuffer; // 已由Effect基类定义
uniform sampler2D noiseTexture; // 噪声纹理
uniform float time; // 时间
uniform vec3 sunPosition; // 太阳位置
uniform vec3 moonPosition; // 月亮位置
uniform int animateClouds; // 云动画开关
uniform float cloudy; // 云密度
uniform float height; // 观察者高度
uniform float haze; // 雾霾程度
uniform float cloudyhigh; // 高层云密度
uniform int enableStars; // 启用星空
uniform float starThreshold; // 星星密度阈值
uniform float skyMaskThreshold; // 天空深度阈值
uniform float fov; // 视场角

// varying vec2 vUv; // 已由Effect基类定义

// 常量定义
const float M_PI = 3.1415926535;
const float DEGRAD = M_PI / 180.0;

// 渲染质量参数
const int steps = 32; // 采样步数，原来是80，降低以提高性能
const int stepss = 6; // 光线采样步数，原来是12，降低以提高性能

// 云层参数
const float cloudnear = 1.0; // 云层最近距离
const float cloudfar = 1e3;  // 云层最远距离

// 散射参数
const float I = 10.0; // 太阳光强度
const float g = 0.45; // 光线集中度
const float g2 = g * g;

// 瑞利散射 (天空色彩, 大气散射 - 8km)
const vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6); // 地球正常散射系数

// 米氏散射 (水分子, 雾 - 1km)
const vec3 bM = vec3(21e-6); // 正常米氏散射

// 大气层定义
const float Hr = 8000.0; // 瑞利散射顶层高度
const float Hm = 1000.0; // 米氏散射顶层高度
const float R0 = 6360e3; // 星球半径
const float Ra = 6380e3; // 大气层半径
const vec3 C = vec3(0.0, -R0, 0.0); // 星球中心

//--------------------------------------------------------------------------
// 星空随机函数

// 返回范围为[0.0, 1.0]的随机噪声
float Noise2d(in vec2 x) {
    float xhash = cos(x.x * 37.0);
    float yhash = cos(x.y * 57.0);
    return fract(415.92653 * (xhash + yhash));
}

// 将Noise2d转换为"星空", 通过阈值过滤低于fThreshhold的值
float NoisyStarField(in vec2 vSamplePos, float fThreshhold) {
    float StarVal = Noise2d(vSamplePos);
    if (StarVal >= fThreshhold)
        StarVal = pow((StarVal - fThreshhold) / (1.0 - fThreshhold), 6.0);
    else
        StarVal = 0.0;
    return StarVal;
}

// 通过仅在整数值位置采样来稳定NoisyStarField
float StableStarField(in vec2 vSamplePos, float fThreshhold) {
    // 四个样本之间的线性插值
    float fractX = fract(vSamplePos.x);
    float fractY = fract(vSamplePos.y);
    vec2 floorSample = floor(vSamplePos);    
    float v1 = NoisyStarField(floorSample, fThreshhold);
    float v2 = NoisyStarField(floorSample + vec2(0.0, 1.0), fThreshhold);
    float v3 = NoisyStarField(floorSample + vec2(1.0, 0.0), fThreshhold);
    float v4 = NoisyStarField(floorSample + vec2(1.0, 1.0), fThreshhold);

    float StarVal = v1 * (1.0 - fractX) * (1.0 - fractY)
        + v2 * (1.0 - fractX) * fractY
        + v3 * fractX * (1.0 - fractY)
        + v4 * fractX * fractY;
    return StarVal;
}

//--------------------------------------------------------------------------
// 云层噪声函数

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
// 云层和散射函数

float cloud(vec3 p, in float t) {
    float cld = fnoise(p * 2e-4, t) + cloudy * 0.1;
    cld = smoothstep(0.4 + 0.04, 0.6 + 0.04, cld);
    cld *= 70.0;
    return cld + haze;
}

void densities(in vec3 pos, out float rayleigh, out float mie, in float t) {
    float h = length(pos - C) - R0;
    rayleigh = exp(-h / Hr);
    vec3 d = pos;
    d.y = 0.0;
    float dist = length(d);
    
    // 云层处理
    float cld = 0.0;
    if (5e3 < h && h < 8e3) {
        cld = cloud(pos + vec3(23175.7, 0.0, -t * 3e3), t);
        cld *= sin(3.1415 * (h - 5e3) / 5e3) * cloudy;
    }
    
    // 高云层处理
    float cld2 = 0.0;
    if (12e3 < h && h < 15.5e3) {
        cld2 = fnoise(pos * 3e-4, t) * cloud(pos * 32.0 + vec3(27612.3, 0.0, -t * 15e3), t);
        cld2 *= sin(3.1413 * (h - 12e3) / 12e3) * cloudyhigh;
        cld2 = clamp(cld2, 0.0, 1.0);
    }

    // 云层距离处理
    if (dist < cloudfar) {
        float factor = clamp(1.0 - ((cloudfar - dist) / (cloudfar - cloudnear)), 0.0, 1.0);
        cld *= factor;
    }

    mie = exp(-h / Hm) + cld + haze + cld2;
}

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

// 大气散射函数
void scatter(vec3 o, vec3 d, out vec3 col, out float scatteringFactor, in float t) {
    float L = escape(o, d, Ra);
    // 计算太阳方向
    vec3 Ds = normalize(sunPosition);
    float mu = dot(d, Ds);
    float opmu2 = 1.0 + mu * mu;
    float phaseR = 0.0596831 * opmu2;
    float phaseM = 0.1193662 * (1.0 - g2) * opmu2 / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));

    float depthR = 0.0, depthM = 0.0;
    vec3 R = vec3(0.0), M = vec3(0.0);

    float dl = L / float(steps);
    for (int i = 0; i < steps; ++i) {
        float l = float(i) * dl;
        vec3 p = o + d * l;

        float dR, dM;
        densities(p, dR, dM, t);
        dR *= dl; dM *= dl;
        depthR += dR;
        depthM += dM;

        float Ls = escape(p, Ds, Ra);
        if (Ls > 0.0) {
            float dls = Ls / float(stepss);
            float depthRs = 0.0, depthMs = 0.0;
            for (int j = 0; j < stepss; ++j) {
                float ls = float(j) * dls;
                vec3 ps = p + Ds * ls;
                float dRs, dMs;
                densities(ps, dRs, dMs, t);
                depthRs += dRs * dls;
                depthMs += dMs * dls;
            }

            vec3 A = exp(-(bR * (depthRs + depthR) + bM * (depthMs + depthM)));
            vec3 dA = (A - exp(-(bR * depthR + bM * depthM))) * I;
            R += dA * dR * phaseR;
            M += dA * dM * phaseM;
        }
    }
    
    // 添加月亮光照
    vec3 Dm = normalize(moonPosition);
    float muM = dot(d, Dm);
    float moonPhase = 0.1193662 * (1.0 - g2) * (1.0 + muM * muM) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * muM, 1.5));
    float moonLight = 0.2 * smoothstep(0.9985, 0.9995, muM); // 月亮光斑
    
    // 直接计算最终颜色和散射系数
    vec3 moonCol = vec3(0.8, 0.8, 1.0) * moonPhase * 0.05; // 月光颜色
    col = (R * bR) + (M * bM) + moonCol; // 确保使用标量-向量乘法
    scatteringFactor = (1.0 - exp(-length(bM) * depthM)) - (moonLight * 2.0); // 使用bM的长度确保是标量计算
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // 读取深度缓冲区
    float depth = texture(depthBuffer, uv).r;
    
    // 计算UV方向
    vec2 q = uv * 2.0 - 1.0;
    q.x *= resolution.x / resolution.y;
    
    // 计算视图方向 - 修复天空方向
    // 注意我们使用相机的世界矩阵，所以需要反转方向
    vec3 vuv = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 vrgt = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 vfwd = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]); // 移除了负号
    
    // 根据FOV计算视线方向
    float rad = fov * DEGRAD / 2.0;
    float vtan = tan(rad);
    vec3 dir = normalize(vfwd + q.x * vrgt * vtan + q.y * vuv * vtan);
    
    // 计算观察者位置（加上高度）
    vec3 ro = vec3(0.0, height, 0.0);
    
    // 天空渲染
    vec3 sky = vec3(0.0);
    float scatteringFactor = 0.0;
    float t = time * 0.04 * float(animateClouds); // 云动画时间
    
    // 确保天空在上方而不是下方 - 如果dir.y为负，我们可能需要翻转
    if (dir.y < -0.02) {
        // 如果视线朝下，使用地面颜色
        sky = mix(
            vec3(0.1, 0.2, 0.4) * 0.2, // 地面颜色
            vec3(0.3, 0.4, 0.6) * 0.3, // 地平线颜色
            smoothstep(-0.1, -0.03, dir.y)
        );
    } else {
        // 大气散射计算
        scatter(ro, dir, sky, scatteringFactor, t);
        
        // 星空计算
        if (enableStars == 1) {
            // 计算夜空比例（根据太阳高度）
            float nightSky = smoothstep(-0.15, 0.05, -sunPosition.y);
            
            // 星空计算
            if (nightSky > 0.0) {
                // 使用球面投影扭曲坐标，使星星分布在球形天空上
                vec2 starCoord = vec2(
                    atan(dir.z, dir.x) / (2.0 * M_PI),
                    acos(dir.y) / M_PI
                );
                
                // 添加缓慢移动（跟随云层）
                starCoord.x += t * 0.002;
                starCoord.y += t * 0.001;
                
                // 计算星空密度
                float stars = StableStarField(starCoord * 500.0, starThreshold);
                
                // 只在天空较暗的部分显示星星
                float starsMask = 1.0 - min(1.0, length(sky * 25.0));
                starsMask *= smoothstep(0.0, 0.5, dir.y); // 靠近地平线减少星星
                
                // 添加星星到天空颜色
                sky += stars * vec3(0.8, 0.9, 1.0) * starsMask * nightSky;
            }
        }
    }
    
    // 添加月亮
    float moonDot = dot(dir, normalize(moonPosition));
    float moonSize = 0.004;
    float moonMask = smoothstep(0.9988 - moonSize, 0.9999 - moonSize * 0.5, moonDot);
    // 月亮只在夜晚可见（基于太阳位置）
    float moonVisibility = smoothstep(-0.1, -0.2, sunPosition.y);
    sky = mix(sky, vec3(0.9, 0.95, 1.0), moonMask * moonVisibility);
    
    // 根据深度混合天空和原始图像
    // 当深度值接近1.0（远处）时，使用天空颜色；否则使用原始图像颜色
    float skyMask = smoothstep(skyMaskThreshold, skyMaskThreshold + 0.0005, depth);
    
    // 输出结果：混合原始颜色和天空颜色
    outputColor = mix(inputColor, vec4(sky, 1.0), skyMask);
}

void main() {
    vec4 inputColor = texture(inputBuffer, vUv);
    vec4 outputColor = vec4(0.0);
    
    mainImage(inputColor, vUv, outputColor);
    
    gl_FragColor = outputColor;
} 