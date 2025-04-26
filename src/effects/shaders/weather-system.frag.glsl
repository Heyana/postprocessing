// 天气系统着色器 - 直接基于StillTravelling的Shadertoy
// 原始版本: https://www.shadertoy.com/view/tdSXzD

uniform float time; // 替代iTime
uniform vec2 resolution; // 替代iResolution
uniform vec3 sunPosition; // 替代iMouse控制的太阳位置
uniform sampler2D noiseTexture; // 替代iChannel0
uniform float intensity; // 散射强度因子
uniform float cloudiness; // 云层密度
uniform int animateEffects; // 是否启用动画

// 原始Shadertoy参数
#define ORIG_CLOUD 0
#define ENABLE_RAIN 0
#define SIMPLE_SUN 0
#define NICE_HACK_SUN 1
#define SOFT_SUN 1
#define cloudy cloudiness // 使用cloudiness替代原来的cloudy
#define haze 0.01 * (cloudy*20.)
#define rainmulti 5.0 // 固定值，原始版本用这个值
#define rainy (10.0 - rainmulti)
#define t time // 替代原始的t
#define fov tan(radians(60.0)) // 使用原始fov值
#define xaxiscloud t*5e2 // 使用原始定义
#define yaxiscloud 0. // 使用原始定义
#define zaxiscloud t*6e2 // 使用原始定义

// 常量定义
#define S(x, y, z) smoothstep(x, y, z)
#define cameraheight 5e1 //50.
#define mincloudheight 5e3 //5e3
#define maxcloudheight 8e3 //8e3
#define cloudnoise 2e-4 //2e-4

// 性能相关常量
const int steps = 16; // 16 is fast, 128 or 256 is extreme high
const int stepss = 16; // 16 is fast, 16 or 32 is high 

// 环境常量
const float R0 = 6360e3; // 行星半径 //6360e3 actual 6371km
const float Ra = 6380e3; // 大气半径 //6380e3 troposphere 8 to 14.5km
const float I = 10.; // 太阳光强度，10.0 is normal
const float SI = 5.; // 太阳强度
const float g = 0.45; // 光聚集 .76 //.45 //.6  .45 is normal
const float g2 = g * g;

const float ts = (cameraheight / 2.5e5);

const float s = 0.999; // 光聚集 for sun
#if SOFT_SUN
const float s2 = s;
#else
const float s2 = s * s;
#endif
const float Hr = 8e3; // Rayleigh scattering top //8e3
const float Hm = 1.2e3; // Mie scattering top //1.3e3

vec3 bM = vec3(21e-6); // normal mie // vec3(21e-6)

// Rayleigh scattering (sky color, atmospheric up to 8km)
vec3 bR = vec3(5.8e-6, 13.5e-6, 33.1e-6); // normal earth

vec3 C = vec3(0., -R0, 0.); // 行星中心
vec3 Ds = normalize(vec3(0., 0., -1.)); // 默认太阳方向

float cloudyhigh = 0.05; // if cloud2 defined

#if ORIG_CLOUD
float cloudnear = 1.0; //9e3 12e3
float cloudfar = 1e3; //15e3 17e3
#else
float cloudnear = 1.0; //15e3 17e3
float cloudfar = 70e3; //160e3
#endif

// AURORA STUFF
mat2 mm2(in float a) {
    float c = cos(a);
    float s = sin(a);
    return mat2(c, s, -s, c);
}

mat2 m2 = mat2(0.95534, 0.29552, -0.29552, 0.95534);

float tri(in float x) {
    return clamp(abs(fract(x) - .5), 0.01, 0.49);
}

vec2 tri2(in vec2 p) {
    return vec2(tri(p.x) + tri(p.y), tri(p.y + tri(p.x)));
}

float triNoise2d(in vec2 p, float spd) {
    float z = 1.8;
    float z2 = 2.5;
    float rz = 0.;
    p *= mm2(p.x * 0.06);
    vec2 bp = p;
    for (float i = 0.; i < 5.; i++) {
        vec2 dg = tri2(bp * 1.85) * .75;
        dg *= mm2(t * spd * float(animateEffects));
        p -= dg / z2;

        bp *= 1.3;
        z2 *= 1.45;
        z *= .42;
        p *= 1.21 + (rz - 1.0) * .02;

        rz += tri(p.x + tri(p.y)) * z;
        p *= -m2;
    }
    return clamp(1. / pow(rz * 29., 1.3), 0., .55);
}

float hash21(in vec2 n) { return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453); }
vec4 aurora(vec3 ro, vec3 rd) {
    vec4 col = vec4(0);
    vec4 avgCol = vec4(0);
    ro *= 1e-5;
    float mt = 10.;
    for (float i = 0.; i < 5.; i++) {
        float of = 0.006 * hash21(gl_FragCoord.xy) * smoothstep(0., 15., i * mt);
        float pt = ((.8 + pow((i * mt), 1.2) * .001) - rd.y) / (rd.y * 2. + 0.4);
        pt -= of;
        vec3 bpos = (ro) + pt * rd;
        vec2 p = bpos.zx;
        float rzt = triNoise2d(p, 0.1);
        vec4 col2 = vec4(0, 0, 0, rzt);
        col2.rgb = (sin(1. - vec3(2.15, -.5, 1.2) + (i * mt) * 0.053) * (0.5 * mt)) * rzt;
        avgCol = mix(avgCol, col2, .5);
        col += avgCol * exp2((-i * mt) * 0.04 - 2.5) * smoothstep(0., 5., i * mt);
    }

    col *= (clamp(rd.y * 15. + .4, 0., 1.2));
    return col * 2.8;
}

float noise(in vec2 v) {
    return texture(noiseTexture, (v + .5) / 256., 0.).r;
}

// by iq
float Noise(in vec3 x) {
    vec3 p = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    vec2 uv = (p.xy + vec2(37.0, 17.0) * p.z) + f.xy;
    vec2 rg = texture(noiseTexture, (uv + 0.5) / 256.0, -100.0).yx;
    return mix(rg.x, rg.y, f.z);
}

float fnoise(vec3 p, in float t) {
    p *= .25;
    float f;

    f = 0.5000 * Noise(p);
    p = p * 3.02;
    p.y -= t * .1 * float(animateEffects);
    f += 0.2500 * Noise(p);
    p = p * 3.03;
    p.y += t * .06 * float(animateEffects);
    f += 0.1250 * Noise(p);
    p = p * 3.01;
    f += 0.0625 * Noise(p);
    p = p * 3.03;
    f += 0.03125 * Noise(p);
    p = p * 3.02;
    f += 0.015625 * Noise(p);
    return f;
}

float cloud(vec3 p, in float t) {
    float cld = fnoise(p * cloudnoise, t) + mix(0.05, 0.2, cloudiness);
    cld = smoothstep(0.35, 0.55, cld);
    cld *= cld * mix(25.0, 50.0, cloudiness);
    return cld + 0.1;
}

void densities(in vec3 pos, out float rayleigh, out float mie) {
    float h = length(pos - C) - R0;
    rayleigh = exp(-h / Hr);
    vec3 d = pos;
    d.y = 0.0;
    float dist = length(d);

    float cld = 0.;
    if (mincloudheight < h && h < maxcloudheight) {
        cld = cloud(pos + vec3(xaxiscloud * float(animateEffects), yaxiscloud, zaxiscloud * float(animateEffects)), t) * mix(0.5, 1.0, cloudiness);
        cld *= sin(3.1415 * (h - mincloudheight) / mincloudheight) * 0.5;
    }
    
    #if ORIG_CLOUD
    if (dist < cloudfar) {
        float factor = clamp(1.0 - ((cloudfar - dist) / (cloudfar - cloudnear)), 0.0, 1.0);
        cld *= factor;
    }
    #else
    if (dist > cloudfar) {
        float factor = clamp(1.0 - ((dist - cloudfar) / (cloudfar - cloudnear)), 0.0, 1.0);
        cld *= factor;
    }
    #endif

    mie = exp(-h / Hm) + cld + mix(0.1, 0.3, cloudiness);
}

float escape(in vec3 p, in vec3 d, in float R) {
    vec3 v = p - C;
    float b = dot(v, d);
    float c = dot(v, v) - R * R;
    float det2 = b * b - c;
    if (det2 < 0.) return -1.;
    float det = sqrt(det2);
    float t1 = -b - det, t2 = -b + det;
    return (t1 >= 0.) ? t1 : t2;
}

// 大气散射计算
void scatter(vec3 o, vec3 d, out vec3 col, out vec3 scat, in float t) {
    float L = escape(o, d, Ra);
    float mu = dot(d, Ds);
    float opmu2 = 1. + mu * mu;
    float phaseR = 0.0596831 * opmu2;
    float phaseM = 0.0951945 * opmu2 / (2.20250 * pow(1.20250 - 0.90000 * mu, 1.5));
    float phaseS = 0.00011936 * opmu2 / (2.99900 * pow(1.99900 - 1.99800 * mu, 1.5));

    float depthR = 0., depthM = 0.;
    vec3 R = vec3(0.), M = vec3(0.);

    float dl = L / float(steps);
    for (int i = 0; i < steps; ++i) {
        float l = float(i) * dl;
        vec3 p = (o + d * l);

        float dR, dM;
        densities(p, dR, dM);
        dR *= dl;
        dM *= dl;
        depthR += dR;
        depthM += dM;

        float Ls = escape(p, Ds, Ra);
        if (Ls > 0.) {
            float dls = Ls / float(stepss);
            float depthRs = 0., depthMs = 0.;
            for (int j = 0; j < stepss; ++j) {
                float ls = float(j) * dls;
                vec3 ps = (p + Ds * ls);
                float dRs, dMs;
                densities(ps, dRs, dMs);
                depthRs += dRs * dls;
                depthMs += dMs * dls;
            }

            vec3 A = exp(-(bR * (depthRs + depthR) + bM * (depthMs + depthM)));
            R += (A * dR);
            M += A * dM;
        }
    }

    col = (intensity * mix(1.0, 1.5, cloudiness)) * (M * bM * phaseM);
    #if NICE_HACK_SUN
    col += (SI) * (M * bM * phaseS);
    #endif
    col += (intensity * mix(1.0, 1.5, cloudiness)) * (R * bR * phaseR);
    scat = 0.1 * (bM * depthM);
}

vec3 hash33(vec3 p) {
    p = fract(p * vec3(443.8975, 397.2973, 491.1871));
    p += dot(p.zxy, p.yxz + 19.27);
    return fract(vec3(p.x * p.y, p.z * p.x, p.y * p.z));
}

vec3 stars(in vec3 p) {
    vec3 c = vec3(0.);
    float res = resolution.x * 2.5;

    for (float i = 0.; i < 4.; i++) {
        vec3 q = fract(p * (.15 * res)) - 0.5;
        vec3 id = floor(p * (.15 * res));
        vec2 rn = hash33(id).xy;
        float c2 = 1. - smoothstep(0., .6, length(q));
        c2 *= step(rn.x, .0005 + i * i * 0.001);
        c += c2 * (mix(vec3(1.0, 0.49, 0.1), vec3(0.75, 0.9, 1.), rn.y) * 0.1 + 0.9);
        p *= 1.3;
    }
    return c * c * .8;
}

// SIMPLE SUN STUFF
const float density = 0.5;
const float zenithOffset = 0.48;
const vec3 skyColor = vec3(0.37, 0.55, 1.0) * (1.0 + 0.0);

#define zenithDensity(x) density / pow(max(x - zenithOffset, 0.0035), 0.75)

float getSunPoint(vec2 p, vec2 lp) {
    return smoothstep(0.04 * (fov/2.0), 0.026 * (fov/2.0), distance(p, lp)) * 50.0;
}

float getMie(vec2 p, vec2 lp) {
    float mytest = lp.y < 0.5 ? (lp.y + 0.5) * pow(0.05, 20.0) : 0.05;
    float disk = clamp(1.0 - pow(distance(p, lp), mytest), 0.0, 1.0);
    return disk * disk * (3.0 - 2.0 * disk) * 0.25 * 3.14159265358979323846;
}

vec3 getSkyAbsorption(vec3 x, float y) {
    vec3 absorption = x * y;
    absorption = pow(absorption, 1.0 - (y + absorption) * 0.5) / x / y;
    return absorption;
}

vec3 jodieReinhardTonemap(vec3 c) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    vec3 tc = c / (c + 1.0);
    return mix(c / (l + 1.0), tc, tc);
}

vec3 getAtmosphericScattering(vec2 p, vec2 lp) {
    float zenithnew = zenithDensity(p.y);
    float sunPointDistMult = clamp(length(max(lp.y + 0.1 - zenithOffset, 0.0)), 0.0, 1.0);
    vec3 absorption = getSkyAbsorption(skyColor, zenithnew);
    vec3 sunAbsorption = getSkyAbsorption(skyColor, zenithDensity(lp.y + 0.1));
    vec3 sun3 = getSunPoint(p, lp) * absorption;
    vec3 totalSky = sun3;
    totalSky *= sunAbsorption * 0.5 + 0.5 * length(sunAbsorption);
    vec3 newSky = jodieReinhardTonemap(totalSky);
    return newSky;
}

// RAIN STUFF
vec3 N31(float p) {
    vec3 p3 = fract(vec3(p) * vec3(.1031, .11369, .13787));
    p3 += dot(p3, p3.yzx + 19.19);
    return fract(vec3((p3.x + p3.y) * p3.z, (p3.x + p3.z) * p3.y, (p3.y + p3.z) * p3.x));
}

float SawTooth(float t) {
    return cos(t + cos(t)) + sin(2. * t) * .2 + sin(4. * t) * .02;
}

float DeltaSawTooth(float t) {
    return 0.4 * cos(2. * t) + 0.08 * cos(4. * t) - (1. - sin(t)) * sin(t + cos(t));
}

vec2 GetDrops(vec2 uv, float seed, float m) {
    float t2 = time + m;
    vec2 o = vec2(0.);

    #ifndef DROP_DEBUG
    uv.y += t2 * .05 * float(animateEffects);
    #endif

    uv *= vec2(10., 2.5) * 2.;
    vec2 id = floor(uv);
    vec3 n = N31(id.x + (id.y + seed) * 546.3524);
    vec2 bd = fract(uv);

    vec2 uv2 = bd;

    bd -= 0.5;

    bd.y *= 4.;

    bd.x += (n.x - .5) * rainy;

    t2 += n.z * 6.28;
    float slide = SawTooth(t2);

    float ts = 1.5;
    vec2 trailPos = vec2(bd.x * ts, (fract(bd.y * ts * 2. - t2 * 2.) - .5) * .5);

    bd.y += slide * 2.;

    #ifdef HIGH_QUALITY
    float dropShape = bd.x * bd.x;
    dropShape *= DeltaSawTooth(t);
    bd.y += dropShape;
    #endif

    float d = length(bd);

    float trailMask = S(-.2, .2, bd.y);
    trailMask *= bd.y;
    float td = length(trailPos * max(.5, trailMask));

    float mainDrop = S(.2, .1, d);
    float dropTrail = S(.1, .02, td);

    dropTrail *= trailMask;
    o = mix(bd * mainDrop, trailPos, dropTrail);

    #ifdef DROP_DEBUG
    if (uv2.x < .02 || uv2.y < .01) o = vec2(1.);
    #endif

    return o;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    float AR = resolution.x / resolution.y;
    float M = 1.0; // canvas.innerWidth/M //canvas.innerHeight/M --res

    vec2 uvMouse = vec2(sunPosition.x * 0.5 + 0.5, sunPosition.y * 0.5 + 0.5);
    uvMouse.x *= AR;

    vec2 uv0 = uv;
    uv0 *= M;

    vec2 fragUV = uv * 2.0 - 1.0;
    fragUV.x *= AR;

    if (uvMouse.y == 0.) uvMouse.y = (0.7 - (0.05 * fov)); // initial view
    if (uvMouse.x == 0.) uvMouse.x = (1.0 - (0.05 * fov)); // initial view

    Ds = normalize(vec3(uvMouse.x - ((0.5 * AR)), uvMouse.y - 0.5, (fov / -2.0)));

    vec3 O = vec3(0., cameraheight, 0.);
    vec3 D = normalize(vec3(fragUV, -(fov)));

    vec3 color = vec3(0.);
    vec3 scat = vec3(0.);

    float att = 1.;
    float staratt = 1.;
    float scatatt = 1.;
    vec3 star = vec3(0.);
    vec4 aur = vec4(0.);

    float fade = smoothstep(0., 0.01, abs(D.y)) * 0.5 + 0.9;

    staratt = 1. - min(1.0, (uvMouse.y * 2.0));
    scatatt = 1. - min(1.0, (uvMouse.y * 2.2));

    if (D.y < -ts) {
        float L = -O.y / D.y;
        O = O + D * L;
        D.y = -D.y;
        D = normalize(D + vec3(0, .003 * sin(time + 6.2831 * noise(O.xz + vec2(0., -time * 1e3 * float(animateEffects)))), 0.));
        att = .6;
        star = stars(D);
        uvMouse.y < 0.5 ? aur = smoothstep(0.0, 2.5, aurora(O, D)) : aur = aur;
    } else {
        float L1 = O.y / D.y;
        vec3 O1 = O + D * L1;

        vec3 D1 = vec3(1.);
        D1 = normalize(D + vec3(1., 0.0009 * sin(time + 6.2831 * noise(O1.xz + vec2(0., time * 0.8 * float(animateEffects)))), 0.));
        star = stars(D1);
        uvMouse.y < 0.5 ? aur = smoothstep(0., 1.5, aurora(O, D)) * fade : aur = aur;
    }

    star *= att;
    star *= staratt;

    scatter(O, D, color, scat, time);
    color *= att;
    scat *= att;
    scat *= scatatt;

    #if SIMPLE_SUN
    vec2 uv1 = uv;
    uv1 *= M;
    uv1.x *= AR;

    vec3 sun2 = getAtmosphericScattering(uv1, vec2(uvMouse.x, uvMouse.y));
    color += sun2;
    #endif

    color += scat;
    color += star;
    color += aur.rgb * scatatt;

    #if ENABLE_RAIN
    vec2 drops = vec2(0.);
    if (rainmulti > 1.0) {
        drops = GetDrops(fragUV / 2.0, 1., 1.);
        color += drops.x + drops.y;
    }
    #endif

    vec3 finalColor = pow(color * mix(1.0, 1.3, cloudiness), vec3(0.454545));

    float skyMix = smoothstep(-0.05, 0.05, D.y);
    finalColor = mix(inputColor.rgb, finalColor, skyMix);

    outputColor = vec4(finalColor, inputColor.a);
}
