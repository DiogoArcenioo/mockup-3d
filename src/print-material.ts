import * as THREE from 'three';
import { MUG_COLORS, type MugColor } from './mug-colors';

/** Keep the ceramic lighting separate from the uploaded, display-referred sRGB ink. */
export function createPrintMaterial(texture: THREE.Texture) {
  const darkCeramic = { value: 0 };
  const material = new THREE.MeshPhysicalMaterial({
    map: texture,
    color: 0xffffff,
    roughness: 0.24,
    metalness: 0,
    clearcoat: 0.7,
    clearcoatRoughness: 0.18,
    envMapIntensity: 0.55,
  });

  material.onBeforeCompile = shader => {
    shader.uniforms.darkCeramic = darkCeramic;
    shader.fragmentShader = 'uniform float darkCeramic;\n' + shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        #ifdef USE_MAP
          vec4 originalPrintColor = sampledDiffuseColor;
          // Light the ceramic independently of the uploaded ink.
          diffuseColor = vec4(diffuse, opacity);
        #endif
      `)
      .replace('#include <opaque_fragment>', /* glsl */`
        // Recover neutral substrate illumination, even on the black ceramic.
        // Keep the original specular/clearcoat reflections on the actual mug.
        vec3 inkDiffuse = totalDiffuse / max(diffuseColor.rgb, vec3(0.00001));
        vec3 inkLightAdjustment = inkDiffuse - totalDiffuse;
        #ifdef USE_CLEARCOAT
          inkLightAdjustment *= 1.0 - material.clearcoat * Fcc;
        #endif
        vec3 inkLight = outgoingLight + inkLightAdjustment;
        #include <opaque_fragment>
      `)
      .replace('#include <colorspace_fragment>', /* glsl */`
        #include <colorspace_fragment>
        #ifdef USE_MAP
          // The texture stores premultiplied sRGB as data. Unpremultiply after
          // mipmap filtering, avoiding dark fringes while preserving PNG alpha.
          vec3 printSRGB = clamp(originalPrintColor.rgb / max(originalPrintColor.a, 0.00001), 0.0, 1.0);
          float minChannel = min(printSRGB.r, min(printSRGB.g, printSRGB.b));
          float maxChannel = max(printSRGB.r, max(printSRGB.g, printSRGB.b));
          // A neutral black background represents the dark ceramic itself.
          // Fade near-black neutrals smoothly, retaining its continuous gloss.
          // Saturated dark colours and white ink still keep their source colours.
          float relativeChroma = (maxChannel - minChannel) / max(maxChannel, 0.00001);
          float neutralBlack = 1.0 - smoothstep(0.15, 0.35, relativeChroma);
          float blackCoverage = mix(1.0,
            smoothstep(28.0 / 255.0, 56.0 / 255.0, maxChannel), neutralBlack);
          float whiteCoverage = 1.0 - smoothstep(0.97, 0.9999, minChannel);
          float inkCoverage = originalPrintColor.a * mix(whiteCoverage, blackCoverage, darkCeramic);
          #ifdef TONE_MAPPING
            inkLight = toneMapping(inkLight);
          #endif
          vec3 neutralLightSRGB = linearToOutputTexel(vec4(inkLight, 1.0)).rgb;
          float whiteLuminance = dot(neutralLightSRGB, vec3(0.2126, 0.7152, 0.0722));
          float lightShade = clamp(whiteLuminance * 1.12, 0.25, 1.0);
          float viewFacing = clamp(dot(normal, geometryViewDir), 0.0, 1.0);
          float curveShade = mix(0.78, 1.0, smoothstep(0.05, 0.82, viewFacing));
          // Only neutral darkening: reflections cannot add white or shift ink hues.
          gl_FragColor.rgb = mix(gl_FragColor.rgb,
            printSRGB * lightShade * curveShade, inkCoverage);
        #endif
      `);
  };
  material.customProgramCacheKey = () => 'forma-srgb-print-v3';
  return Object.assign(material, {
    setMugColor(color: MugColor) {
      material.color.set(MUG_COLORS[color]);
      darkCeramic.value = color === 'black' ? 1 : 0;
    },
  });
}
