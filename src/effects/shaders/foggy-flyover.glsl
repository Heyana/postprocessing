// Foggy Flyover by Kristian Sivonen (ruojake)
// 基于Shadertoy效果 - 适配到postprocessing框架
// CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)

// 统一变量声明 - 替代Shadertoy变量
uniform float time;         // 替代 iTime
uniform vec2 resolution;    // 替代 iResolution
uniform vec2 mouse;         // 替代 iMouse
uniform int frame;          // 替代 iFrame

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform mat4 viewMatrix;
uniform float cameraFov;
uniform float cameraNear;
uniform float cameraFar;

// 效果参数
uniform float fogDensity;   // 控制雾气浓度
uniform float enableLowCameraOptimization; // 低位置相机优化标志

// Hash without sine by Dave Hoskins
// https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p)
{
	vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3)
{
	p3  = fract(p3 * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}
// --

const vec2 o = vec2(1., 0.);

float noise(vec3 p)
{
	vec3 pi = floor(p);
    vec3 pf = smoothstep(0., 1., p - pi);
    return mix(
        mix(
        	mix(hash13(pi), hash13(pi+o.xyy), pf.x),
            mix(hash13(pi+o.yyx), hash13(pi+o.xyx), pf.x),
            pf.z
        ),
        mix(
        	mix(hash13(pi+o.yxy), hash13(pi+o.xxy), pf.x),
            mix(hash13(pi+o.yxx), hash13(pi+1.), pf.x),
            pf.z
        ),
    pf.y);
}

float noise(vec2 p)
{
	vec2 pi = floor(p);
    vec2 pf = smoothstep(0., 1., p - pi);
    vec2 r = mix(vec2(hash12(pi), hash12(pi+o.yx)), vec2(hash12(pi+o), hash12(pi+1.)), pf.x);
    return mix(r.x, r.y, pf.y);
}

const mat2 ROT = mat2(.98, -.198, .198, .98);

#define sat(v) clamp(v,0.,1.)

float fbm(vec2 p, float o)
{
	float res = 0.;
   	for(float i = 1.; i < o; i += i)
    {
        res += noise(p*i) / i;
    	p = p * ROT;
        o -= ROT[0][0] * .001 * sign(time);
    }
    return res;
}

float scene(vec3 p, float o)
{
	float res = fbm(p.xz, o) * .5;
    res *= 2.5 - res * res;
    return .4 * (p.y + res - 1.5);
}

vec3 normal(vec3 p, float o)
{
	float d = fbm(p.xz, o);
    vec2 e = vec2(.001, .0);
    return normalize(d - vec3(
        fbm(p.xz - e, o),
        d - 0.0011,
        fbm(p.xz - e.yx, o)));
}

float shadow(vec3 ro, vec3 rd, float maxDist, float k)
{
    float res = 1.;
    float d = 0.;
    float t = .01;
    for(int i = 0; i < 30; ++i)
    {
        d = scene(ro + rd * t, 16.);
        res = min(res, k * d / t);
        t += d;
    	if(abs(d) < .001 || t >= maxDist)
            break;
        if (res < .001)
        {
        	res = 0.;
            break;
        }
    }
    return res;
}

vec3 ray(vec3 ro, vec3 lookAt, vec2 uv, float zoom)
{
	vec3 f = normalize(lookAt - ro);
    vec3 r = cross(vec3(0., 1., 0.), f);
    vec3 u = cross(f, r);

    return normalize(uv.x * r + uv.y * u + f * zoom);
}

float clouds(vec3 p)
{
	float res = noise(p * 4.) * 2.;
    p.y -= time * .02;
    res -= noise(p * 11.);

    return sat(res * 4. * (1. - res));
}

vec3 material(vec3 p, vec3 n, float l, float t)
{
	float noise0 = fbm(p.xz * 20., 32.);
    float noise1 = fbm(p.xz * 310., 4.);
    noise1 = 2. * noise1 - 1.;
    float y = p.y;
    t = sat(t * .03 - .1);
    vec3 sunCol = vec3(1., .97, .85);
    
    vec3 forest = vec3(.03, .08, .01) + noise1 * .02;
    forest += l * .1 * sunCol;
    vec3 rock = vec3(.025) + noise1 * .01;
    rock += l * sunCol * .3;
    vec3 snow = vec3(.6, .6, .7);
    snow += l * .4 * sunCol;
    
    vec3 res = mix(rock, forest, smoothstep(.8, .5, y + .2 * noise0) * n.y * (2. - n.y));
    res = mix(res, snow, smoothstep(1.2 - t, 1.3 + t, y + .4 * noise0));
    return mix(res, res * vec3(.5, .55, .9), smoothstep(.3, 0., l));
}

// Shadertoy原始mainImage函数
void flyoverEffect(out vec4 fragColor, in vec2 fragCoord)
{
    vec2 uv = (fragCoord - resolution.xy * .5)/resolution.y;
	vec2 m = clamp((mouse / resolution.xy) * 2. - 1., vec2(-1.), vec2(1.));
    if (m == vec2(-1.,-1.)) m = vec2(0.);
    
    // 如果提供了相机信息，则使用相机位置和方向
    vec3 tgt, ro;
    
    if(length(cameraPosition) > 0.0) {
        // 使用相机位置作为起点
        ro = cameraPosition;
        
        // 计算目标点 - 使用视图矩阵获取前向方向
        vec3 viewForward = -normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
        tgt = ro + viewForward * 10.0;
        
        // 鼠标只作为微调，影响减小
        tgt.x += m.x * 0.5;
        tgt.y += m.y * 0.3;
    } else {
        // 使用原始Shadertoy相机设置
        tgt = vec3(m.x * 2. + 10., m.y + 1.4, 2. + time * .3 - max(abs(m.x), abs(m.y) * .5) * 2.);
        ro = vec3(10.,1.5, time * .3);
    }
    
    // 计算视点方向向量
    vec3 rd = ray(ro, tgt, uv, .8);
    float t = 0.;
    vec3 p;
    
    // 修改光线追踪逻辑：移除对rd.y的限制，让所有方向都可以渲染地形
    // 但保留对较高角度的优化处理
    float rdyThreshold = 0.6; // 约35度以上的视角可以直接判定为天空

    // 如果相机高度过低且启用了低位置优化，进一步降低阈值
    if (ro.y < 2.0 && enableLowCameraOptimization > 0.5) {
        rdyThreshold = min(rdyThreshold + (2.0 - ro.y) * 0.2, 0.95);
    }

    if (rd.y < rdyThreshold) // 只有非常陡峭向上的视线才判定为纯天空
    {
        for(int i = 0; i < 90; i++)
        {
            p = ro + rd * t;
            float d = scene(p, 16.);
            t += d * (1.25 - pow(abs(rd.y), 4.) + sat(t * .1 - 1.));
            if (abs(d) < .001 * (1.+t) || t > 30.) break;
        }
        t = t >= 30. ? 1000. : t;
    }
    else
    {
        t = 1000.;
        p = ro + rd * t;
    }
    
    float theta = .5 * 3.1415;
    vec3 lDir = normalize(vec3(-sin(theta), .25, cos(theta)));
    float dither = fract(13.013 * dot(fragCoord + float((frame & 7) * 17), vec2(.104212, .672709)));
    
    float maxl = .8;
    vec3 cFog = vec3(.1,.15,.2);
    vec4 fog = vec4(0.);
    float ft = max(ro.y - maxl, 0.) / (-rd.y + .0001);
    ft += dither * (.025 * ft + .1) * (1. - sat(-rd.y));
    vec3 v = vec3(0.,time * -.02,0.);
	float h = 1. - abs(rd.y);
    vec3 shadowCol = cFog * vec3(.4, .5, .7);
    float l = 0.;
    vec3 skyCol = mix(vec3(.7, .8, 1.), vec3(.1, .1, .4), sat(rd.y));
    
    vec3 col = vec3(0.);
	if (t < 500.)
    {
    
        if(p.y <= maxl)
            for(int i = 0; i < 35; i++)
            {
                float dt = .01 + h * .1;
                ft += dt;

                if (ft >= t) break;

                vec3 fp = (ro + rd * ft);

                if (rd.y >= 0. && fp.y > maxl) break;

                float d = clouds(fp + v) * (maxl + h) * dt * 10.;
                float fade = min(sat(maxl - fp.y), min(ft * .5, maxl - ft * .05));
                fade *= fade;
                d *= fade;
                ft += min(sat(h - fade) * .03, t - ft);
                if (d > .01)
                {
                    l = 0.;
                    float s = shadow(fp, lDir, 15. - fp.y, 20.);
                    if (s > .001)
                    {
                        s *= 2. - s;
                        l = sat(s * (1. - clouds(fp + lDir * .1 + v) * 3. * fade));
                    }
                    float w = sat((.1 * l + .91) - fog.a);
                    fog.rgb += mix(shadowCol, cFog + l, l) * d * w;
                    fog.a += d * w;

                    if (fog.a > .95) 
                    {
                        fog.a = 1.;
                        break;
                    }
                }
            }

        fog.rgb = mix(fog.rgb, skyCol, sat(t * .05 - .15));
        fog.a = min(fog.a, 1.);


        vec3 n = t < 10. ? t < 6. ? normal(p, 256.) : normal(p, 64.) : normal(p, 8.);
        l = sat(dot(n, lDir) * .8 + .2);
        float s = shadow(p + n * .1 + vec3(0.,.03,0.), lDir, 15., 14.);
        float sun = smoothstep(.9995, 1., dot(rd,lDir));	

        // 修改地形到天空的混合比例，考虑相机高度影响
        float heightMix = sat(t * .05 - .15);
        // 低位置相机时使用更渐进的混合
        if (ro.y < 1.0) {
            heightMix *= (1.0 - clamp(rd.y * 0.5 + 0.5, 0.0, 1.0));
        }

        col = rd.y <= rdyThreshold ? mix(
            vec3(material(p, n, l * s, t)), 
            skyCol, 
            heightMix) : skyCol;
        col += sun * 2. * smoothstep(1.,.9999, 30. - t);

        col = mix(col, fog.rgb, fog.a * fog.a);
    }
    else col = skyCol;
    
    col *= 1. - smoothstep(.45, .7, length((uv * resolution.y / resolution.xy))) * .5;
    col += (dither * .03 - .015) * col;
    fragColor = vec4(pow(col,vec3(1./2.2)),1.0);
}

// 适配到postprocessing框架的mainImage函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fragCoord = uv * resolution.xy;
    vec4 flyoverColor;
    flyoverEffect(flyoverColor, fragCoord);
    
    // 读取深度值
    float depth = texture2D(depthBuffer, uv).r;
    
    // 将深度值转换为线性深度 (0-1)
    float linearDepth = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
    linearDepth = linearDepth / cameraFar; // 归一化到0-1
    
    // 基于深度的混合策略:
    // 1. 远处(深度接近1)：使用完整的飞越效果
    // 2. 近处：根据距离逐渐应用雾气效果
    float skyMask = step(0.9999, depth); // 纯天空部分（最远处）
    
    // 基于线性深度的雾气混合因子
    float fogFactor = clamp(linearDepth * fogDensity * 2.0, 0.0, 1.0);
    
    // 两步混合:
    // 1. 先将输入颜色与雾气颜色基于深度混合，得到带雾的前景
    vec4 foggedColor = mix(inputColor, vec4(flyoverColor.rgb, 1.0), fogFactor);
    
    // 2. 在天空区域（最远处）使用完整的天空+雾气效果
    outputColor = mix(foggedColor, flyoverColor, skyMask);
} 