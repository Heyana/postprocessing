// Frozen wasteland
// By Dave Hoskins
// https://www.shadertoy.com/view/Xls3D2
// License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
// 修改版：只保留天空和雾气效果，并支持深度测试

// 统一变量声明
uniform float time;       // 替代 iTime
uniform vec2 resolution;  // 替代 iResolution
uniform vec2 mouse;       // 替代 iMouse

// 相机参数 - 从Three.js传入
uniform vec3 cameraPosition;
uniform vec3 cameraForward;
uniform vec3 cameraUp;
uniform vec3 cameraRight;
uniform float cameraFov;

// 深度纹理，用于深度测试
uniform float cameraNear;
uniform float cameraFar;

// 效果参数
uniform float fogDensity; // 雾气浓度控制

#define ITR 40
#define FAR 110.
#define MOD3 vec3(.16532,.17369,.15787)
#define SUN_COLOUR  vec3(1., .95, .85)

#define TRIANGLE_NOISE	    // .. This
//#define TEXTURE_NOISE		// .. Or this (faster, but not as sharp edged)
//#define VALUE_NOISE 		// .. or more normal noise.
//#define FOUR_D_NOISE	    // ...Or movement

#define MOD2 vec2(.16632,.17369)

float tri(in float x){return abs(fract(x)-.5);}

float hash12(vec2 p)
{
	p  = fract(p * MOD2);
    p += dot(p.xy, p.yx+19.19);
    return fract(p.x * p.y);
}

//========================================================================
// ################ DIFFERENT NOISE FUNCTIONS ################
#ifdef TRIANGLE_NOISE
vec3 tri3(in vec3 p){return vec3( tri(p.z+tri(p.y)), tri(p.z+tri(p.x)), tri(p.y+tri(p.x)));}
float Noise3d(in vec3 p)
{
    float z=1.4;
	float rz = 0.;
    vec3 bp = p;
	for (float i=0.; i<= 2.; i++ )
	{
        vec3 dg = tri3(bp);
        p += (dg);

        bp *= 2.;
		z *= 1.5;
		p *= 1.3;
        
        rz+= (tri(p.z+tri(p.x+tri(p.y))))/z;
        bp += 0.14;
	}
	return rz;
}
#endif

//--------------------------------------------------------------------------------
#ifdef FOUR_D_NOISE
vec4 quad(in vec4 p){return abs(fract(p.yzwx+p.wzxy)-.5);}

float Noise3d(in vec3 q)
{
    float z=1.4;
    vec4 p = vec4(q, time*.1);
	float rz = 0.;
    vec4 bp = p;
	for (float i=0.; i<= 2.; i++ )
	{
        vec4 dg = quad(bp);
        p += (dg);

		z *= 1.5;
		p *= 1.3;
        
        rz+= (tri(p.z+tri(p.w+tri(p.y+tri(p.x)))))/z;
        
        bp = bp.yxzw*2.0+.14;
	}
	return rz;
}
#endif

//--------------------------------------------------------------------------------
#ifdef TEXTURE_NOISE
float Noise3d(in vec3 x)
{
    x*=10.0;
    float h = 0.0;
    float a = .28;
    for (int i = 0; i < 4; i++)
    {
        vec3 p = floor(x);
        vec3 f = fract(x);
        f = f*f*(3.0-2.0*f);

        vec2 uv = (p.xy+vec2(37.0,17.0)*p.z) + f.xy;
        vec2 rg = textureLod( iChannel0, (uv+ 0.5)/256.0, 0.0 ).yx;
        h += mix( rg.x, rg.y, f.z )*a;
        a*=.5;
        x+=x;
    }
    return h;
}
#endif

//--------------------------------------------------------------------------------
#ifdef VALUE_NOISE
float Hash(vec3 p)
{
	p  = fract(p * MOD3);
    p += dot(p.xyz, p.yzx + 19.19);
    return fract(p.x * p.y * p.z);
}

float Noise3d(in vec3 p)
{
    vec2 add = vec2(1.0, 0.0);
	p *= 10.0;
    float h = 0.0;
    float a = .3;
    for (int n = 0; n < 4; n++)
    {
        vec3 i = floor(p);
        vec3 f = fract(p); 
        f *= f * (3.0-2.0*f);

        h += mix(
            mix(mix(Hash(i), Hash(i + add.xyy),f.x),
                mix(Hash(i + add.yxy), Hash(i + add.xxy),f.x),
                f.y),
            mix(mix(Hash(i + add.yyx), Hash(i + add.xyx),f.x),
                mix(Hash(i + add.yxx), Hash(i + add.xxx),f.x),
                f.y),
            f.z)*a;
         a*=.5;
        p += p;
    }
    return h;
}
#endif

// 深度处理函数
float getLinearDepth(sampler2D depthBuffer, vec2 uv) {
    float depth = texture2D(depthBuffer, uv).r;
    
    // 转换为线性深度 (0-1)
    float linearDepth = 2.0 * cameraNear * cameraFar / (cameraFar + cameraNear - (2.0 * depth - 1.0) * (cameraFar - cameraNear));
    return linearDepth / cameraFar; // 归一化到0-1
}

// 雾气效果
float fogmap(in vec3 p)
{
    p.xz -= time*7.+sin(p.z*.3)*3.;
    p.y -= time*.5;
    return (max(Noise3d(p*.008+.1)-.1,0.0)*Noise3d(p*.1))*.3;
}

// 雾气颜色处理
vec3 fogColour(in vec3 col, float t)
{
    vec3 ext = exp2(-t*0.0001*vec3(1.,1.5,3.)); 
    return col*ext + (1.0-ext)*vec3(1.);
}

vec3 Clouds(vec3 sky, vec3 rd)
{
    rd.y = max(rd.y, 0.0);
    float ele = rd.y;
    float v = (200.0)/(abs(rd.y)+.01);

    rd.y = v;
    rd.xz = rd.xz * v - time*8.0;
	rd.xz *= .0004;
    
	float f = Noise3d(rd.xzz*3.) * Noise3d(rd.zxx*1.3)*2.5;
    f = f*pow(ele, .5)*2.;
  	f = clamp(f-.15, 0.01, 1.0);

    return mix(sky, vec3(1), f);
}

vec3 Sky(vec3 rd, vec3 ligt)
{
    rd.y = max(rd.y, 0.0);
    
    vec3 sky = mix(vec3(.1, .15, .25), vec3(.8), pow(.8-rd.y, 3.0));
    return mix(sky, SUN_COLOUR, min(pow(max(dot(rd, ligt), 0.0), 4.5)*1.2, 1.0));
}

// 收集沿射线方向的雾气
float collectFog(in vec3 ro, in vec3 rd, in float maxDist)
{
    float totalFog = 0.0;
    float stepSize = maxDist / float(ITR);
    
    for (int i = 0; i < ITR; i++)
    {
        float t = float(i) * stepSize;
        vec3 pos = ro + rd * t;
        totalFog += fogmap(pos);
    }
    
    // 应用雾气浓度控制
    return min(totalFog * 0.05 * fogDensity, 1.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord)
{	
	vec2 p = fragCoord.xy/resolution.xy-0.5;
    vec2 q = fragCoord.xy/resolution.xy;
	p.x*=resolution.x/resolution.y;
   
    
    // 深度测试：只在远处（接近背景）渲染效果
    // 当depth > 0.99时，认为是远景（没有前景物体）
  
    
    // 使用传入的相机参数
    vec3 ro = cameraPosition;
    vec3 rd = normalize((p.x*cameraRight + p.y*cameraUp) + cameraForward);
 
    vec3 ligt = normalize(vec3(1.5, .9, -.5));
	vec3 sky = Sky(rd, ligt);
    
    // 渲染天空和云
    vec3 col = sky;
    col = Clouds(col, rd);
    
    // 计算雾气
    float fg = collectFog(ro, rd, FAR);
    
    // 混合雾气 - 雾气密度受fogDensity影响
    col = mix(col, vec3(0.6, .65, .7), fg);
  
    // 后期处理
    col = fogColour(col, FAR);
    col = col*col * (3.0 - 2. * col);
	col = sqrt(col);
    
    // 边缘效果
    float f = smoothstep(0.0, 3.0, time)*.5;
    col *= f+f*pow(70. *q.x*q.y*(1.0-q.x)*(1.0-q.y), .2);
   
	fragColor = vec4(col, 1.0);
}

// 将mainImage函数转换为适应postprocessing框架的mainImage函数
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 fragCoord = uv * resolution.xy;
    vec4 color;
    mainImage(color, fragCoord);

    // 使用深度缓冲决定是否绘制天空
    // 读取深度值
    float depth = texture2D(depthBuffer, uv).r;
    // 在这里我们仅在深度值为1.0（远平面）的地方绘制天空
    float skyMask = step(0.9999, depth);
    // 修复：color已经是vec4类型，不需要再次构造vec4
    outputColor = mix(inputColor, color, skyMask);
} 