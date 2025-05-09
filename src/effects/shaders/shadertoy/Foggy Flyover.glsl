// Foggy Flyover by Kristian Sivonen (ruojake)
// CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)

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
        o -= ROT[0][0] * .001 * sign(iTime);
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
    p.y -= iTime * .02;
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

void mainImage(out vec4 fragColor, in vec2 fragCoord )
{
    vec2 uv = (fragCoord - iResolution.xy * .5)/iResolution.y;
	vec2 m = clamp((iMouse.xy / iResolution.xy) * 2. - 1., vec2(-1.), vec2(1.));
    if (m == vec2(-1.,-1.)) m = vec2(0.);
    
    vec3 tgt = vec3(m.x * 2. + 10., m.y + 1.4, 2. + iTime * .3 - max(abs(m.x), abs(m.y) * .5) * 2.);
    vec3 ro = vec3(10.,1.5, iTime * .3);
    
    vec3 rd = ray(ro, tgt, uv, .8);
    float t = 0.;
    vec3 p;
    
    if (rd.y < 0.)
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
    float dither = fract(13.013 * dot(fragCoord + float((iFrame & 7) * 17), vec2(.104212, .672709)));
    
    float maxl = .8;
    vec3 cFog = vec3(.1,.15,.2);
    vec4 fog = vec4(0.);
    float ft = max(ro.y - maxl, 0.) / (-rd.y + .0001);
    ft += dither * (.025 * ft + .1) * (1. - sat(-rd.y));
    vec3 v = vec3(0.,iTime * -.02,0.);
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

        col = rd.y <= 0. ? mix(
            vec3(material(p, n, l * s, t)), 
            skyCol, 
            sat(t * .05 - .15)) : skyCol;
        col += sun * 2. * smoothstep(1.,.9999, 30. - t);

        col = mix(col, fog.rgb, fog.a * fog.a);
    }
    else col = skyCol;
    
    col *= 1. - smoothstep(.45, .7, length((uv * iResolution.y / iResolution.xy))) * .5;
    col += (dither * .03 - .015) * col;
    fragColor = vec4(pow(col,vec3(1./2.2)),1.0);
}