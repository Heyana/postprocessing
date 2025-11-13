#ifdef FRAMEBUFFER_PRECISION_HIGH

	uniform mediump sampler2D map;

#else

	uniform lowp sampler2D map;

#endif

uniform float intensity;
uniform vec3 bloomColor;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

	// 获取泛光纹理
	// composite shader 的输出已经包含了 bloomStrength 和 bloomTintColors
	// 格式：bloomStrength * (lerpBloomFactor * tintColor * blurTexture for each MIP)
	vec4 bloomTexel = texture2D(map, uv);
	
	// 应用额外的颜色和强度调整（如果需要）
	// composite shader 已经应用了 bloomStrength，所以这里只做微调
	vec3 bloom = bloomTexel.rgb * bloomColor * intensity;

	// 输出泛光纹理，让 blendFunction 来处理混合
	// 使用 ADD blendFunction 时，会执行：inputColor + bloom
	// 这完全模拟了 UnrealBloomPass 的 AdditiveBlending 行为
	outputColor = vec4(bloom, bloomTexel.a);

}

