uniform lowp sampler2D aoBuffer;
uniform float luminanceInfluence;
uniform float intensity;

#if defined(DEPTH_AWARE_UPSAMPLING) && defined(NORMAL_DEPTH)

	#ifdef GL_FRAGMENT_PRECISION_HIGH

		uniform highp sampler2D normalDepthBuffer;

	#else

		uniform mediump sampler2D normalDepthBuffer;

	#endif

#endif

#ifdef COLORIZE

	uniform vec3 color;

#endif

void mainImage(const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor) {

	// SSDO缓冲区包含遮蔽度(r)和间接光照(gba)
	vec4 ssdoData = texture2D(aoBuffer, uv);
	float aoLinear = ssdoData.r;
	vec3 indirectLight = ssdoData.gba;

	#if defined(DEPTH_AWARE_UPSAMPLING) && defined(NORMAL_DEPTH) && __VERSION__ == 300

		// 在2x2邻域中采集法线和深度
		vec4 normalDepth[4];
		normalDepth[0] = textureOffset(normalDepthBuffer, uv, ivec2(0, 0));
		normalDepth[1] = textureOffset(normalDepthBuffer, uv, ivec2(0, 1));
		normalDepth[2] = textureOffset(normalDepthBuffer, uv, ivec2(1, 0));
		normalDepth[3] = textureOffset(normalDepthBuffer, uv, ivec2(1, 1));

		// 确定片段周围表面的平滑度
		float dot01 = dot(normalDepth[0].rgb, normalDepth[1].rgb);
		float dot02 = dot(normalDepth[0].rgb, normalDepth[2].rgb);
		float dot03 = dot(normalDepth[0].rgb, normalDepth[3].rgb);

		float minDot = min(dot01, min(dot02, dot03));
		float s = step(THRESHOLD, minDot);

		// 根据深度找到最佳AO和间接光
		float smallestDistance = 1.0;
		int index;

		for(int i = 0; i < 4; ++i) {
			float distance = abs(depth - normalDepth[i].a);
			if(distance < smallestDistance) {
				smallestDistance = distance;
				index = i;
			}
		}
 
		// 获取与最佳深度对应的确切SSDO数据
		ivec2 offsets[4];
		offsets[0] = ivec2(0, 0); offsets[1] = ivec2(0, 1);
		offsets[2] = ivec2(1, 0); offsets[3] = ivec2(1, 1);

		ivec2 coord = ivec2(uv * vec2(textureSize(aoBuffer, 0))) + offsets[index];
		vec4 ssdoNearest = texelFetch(aoBuffer, coord, 0);
		float aoNearest = ssdoNearest.r;
		vec3 indirectNearest = ssdoNearest.gba;

		// 平滑表面更适合线性过滤
		float ao = mix(aoNearest, aoLinear, s);
		indirectLight = mix(indirectNearest, indirectLight, s);

	#else

		float ao = aoLinear;

	#endif

	// 基于亮度衰减AO
	float l = luminance(inputColor.rgb);
	ao = mix(ao, 0.0, l * luminanceInfluence);
	ao = clamp(ao * intensity, 0.0, 1.0);

	// 合并间接光和AO效果
	#ifdef COLORIZE
		vec3 aoColor = 1.0 - ao * (1.0 - color);
		vec3 finalColor = inputColor.rgb * aoColor + indirectLight;
		outputColor = vec4(finalColor, inputColor.a);
	#else
		vec3 aoColor = vec3(1.0 - ao);
		vec3 finalColor = inputColor.rgb * aoColor + indirectLight;
		outputColor = vec4(finalColor, inputColor.a);
	#endif
} 