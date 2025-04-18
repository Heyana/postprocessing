---
layout: single
collection: sections
title: Snow Effect
draft: false
menu:
  effects:
    parent: utility
    weight: 36
---

# Snow Effect

The snow effect consists of two separate components that can be used independently or combined for a complete winter experience: `SnowOverlayEffect` and `SnowfallEffect`.

## Surface Snow (SnowOverlayEffect)

`SnowOverlayEffect` adds a convincing layer of snow to surfaces in your scene based on their orientation and height.

```javascript
import { SnowOverlayEffect } from "postprocessing";

// Requires depth and normal data
const depthPass = new DepthPass(scene, camera);
const normalPass = new NormalPass(scene, camera);

const snowOverlayEffect = new SnowOverlayEffect(camera, normalPass.texture, depthPass.texture, {
    snowAmount: 0.5,        // 0-1 range
    snowHeight: 20.0,       // Snow line height
    snowBrightness: 1.5,    // Snow brightness multiplier
    additiveBlending: false,// Use additive blending mode
    snowColor: 0xffffff     // Snow color
});

// Add to your composer with normal passes
composer.addPass(depthPass);
composer.addPass(normalPass);
composer.addPass(new EffectPass(camera, snowOverlayEffect));
```

### Implementation Details

The snow overlay effect works by sampling the depth buffer and normal buffer to determine:

1. Which surfaces are facing upward (using normal Y component)
2. Which surfaces are higher in the scene (using depth information)
3. How much snow should accumulate based on these factors

It then blends the original scene with snow color based on these calculations, creating a natural-looking snow coverage that follows the contours of your objects.

## Falling Snow (SnowfallEffect)

`SnowfallEffect` simulates falling snowflakes to create a dynamic winter atmosphere.

```javascript
import { SnowfallEffect, BlendFunction } from "postprocessing";

const snowfallEffect = new SnowfallEffect({
    blendFunction: BlendFunction.SCREEN, // Screen blend mode works well for snow
    density: 0.6,                        // Snow density (0-1)
    snowSpeed: 0.2,                      // Falling speed
    snowSize: 0.2,                       // Size of snowflakes
    windDirection: new Vector2(0.1, 0.0),// Wind direction (x,y)
    snowColor: 0xffffff                  // Snow color
});

composer.addPass(new EffectPass(camera, snowfallEffect));
```

### Implementation Details

The snowfall effect uses a multi-layered approach:

1. Creates several layers of procedural snow particles at different depths
2. Animates them based on time, speed and wind parameters
3. Uses noise textures for natural randomness in distribution
4. Handles smooth wrapping at screen edges for infinite snowfall

Each snowflake's position is animated based on time, with wind direction influencing the horizontal and vertical drift. The multiple layers create a sense of depth and parallax.

## Combining Both Effects

For a complete winter scene, both effects can be combined:

```javascript
// Setup passes
const depthPass = new DepthPass(scene, camera);
const normalPass = new NormalPass(scene, camera);

// Create surface snow effect 
const snowOverlayEffect = new SnowOverlayEffect(camera, normalPass.texture, depthPass.texture);

// Create snowfall effect
const snowfallEffect = new SnowfallEffect();

// Add all passes to the composer
composer.addPass(depthPass);
composer.addPass(normalPass);
composer.addPass(new EffectPass(camera, snowOverlayEffect));
composer.addPass(new EffectPass(camera, snowfallEffect));
```

## Performance Considerations

- The `SnowOverlayEffect` requires both depth and normal passes, which have some rendering overhead
- Consider using smaller resolution buffers for depth and normals on lower-end devices
- The `SnowfallEffect` is generally lightweight but can be adjusted by reducing density for better performance
- For mobile devices, consider using only the `SnowOverlayEffect` with simplified parameters

## Advanced Techniques

- **Footprints/Interaction**: Track character positions to create footprints in the snow
- **Dynamic Snow Accumulation**: Increase snow amount over time to simulate ongoing snowfall
- **Snow Melting**: Add parameters to simulate snow melting in certain areas (near heat sources)
- **Wind Gusts**: Animate wind direction parameters to create gusting effects in the snowfall 