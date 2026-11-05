precision highp float;
uniform vec2 resolution;
uniform vec3 observer;
uniform float spin;
uniform float innerRadius;
uniform float elapsed;
uniform float fieldOfView;
uniform float cameraRoll;
uniform float lookYaw;
uniform float lookPitch;
uniform sampler2D grainTexture;
uniform sampler2D skyTexture;
uniform float exposure;
uniform float stepScale;
uniform int maxSteps;
uniform int debugMode;
const float PI = 3.141592653589793;

vec4 derivatives(vec4 state, float energy, float angularMomentum, out float azimuth) {
  float radius = state.x;
  float sine = max(sin(state.y), 0.0001);
  float cosine = cos(state.y);
  float sigma = radius * radius + spin * spin * cosine * cosine;
  float delta = radius * radius - 2.0 * radius + spin * spin;
  float deltaDerivative = 2.0 * radius - 2.0;
  float radialTerm = energy * (radius * radius + spin * spin) - spin * angularMomentum;
  float polarTerm = angularMomentum / sine - spin * energy * sine;
  float numerator = delta * state.z * state.z + state.w * state.w - radialTerm * radialTerm / delta + polarTerm * polarTerm;
  float radialGradient = deltaDerivative * state.z * state.z - 4.0 * radius * energy * radialTerm / delta + radialTerm * radialTerm * deltaDerivative / (delta * delta);
  float polarGradient = 2.0 * polarTerm * (-angularMomentum * cosine / (sine * sine) - spin * energy * cosine);
  azimuth = (spin * radialTerm / delta + angularMomentum / (sine * sine) - spin * energy) / sigma;
  return vec4(delta * state.z / sigma, state.w / sigma,
    -radialGradient / (2.0 * sigma) + numerator * radius / (sigma * sigma),
    -polarGradient / (2.0 * sigma) - numerator * spin * spin * sine * cosine / (sigma * sigma));
}

// lod < 0 selects analytic gradients from screen derivatives; supersampled rays run in divergent flow and pass an
// explicit level instead.
float grain(vec2 coordinate, vec2 dx, vec2 dy, float lod) {
  return lod < 0.0 ? textureGrad(grainTexture, coordinate, dx, dy).r : textureLod(grainTexture, coordinate, lod).r;
}

float turbulence(vec2 coordinate, vec2 dx, vec2 dy, float lod) {
  float coarser = lod < 0.0 ? 0.0 : 1.0;
  return grain(coordinate, dx, dy, lod) * 0.64
    + grain(coordinate * 2.0, dx * 2.0, dy * 2.0, lod + coarser) * 0.26
    + grain(coordinate * 4.0, dx * 4.0, dy * 4.0, lod + 2.0 * coarser) * 0.10;
}

// Neighbouring rays can disagree on azimuth by whole turns (paths on either side of the spin axis), so screen
// derivatives of an angle are taken modulo 2 pi.
float wrappedDerivative(float derivative) {
  return derivative - 2.0 * PI * floor(derivative / (2.0 * PI) + 0.5);
}

float plasmaLayer(float radius, float phase, vec2 seed, float lod) {
  // Azimuth runs straight along the wrapping texture axis. Sampling a small circle instead folds the texture back on
  // itself where the circle runs parallel to the radial axis (phase = +-pi/2), mirroring the plasma into a chevron.
  vec2 coordinate = vec2(log(radius) * 0.19, phase / (2.0 * PI)) + seed;
  vec2 dx = vec2(0.0);
  vec2 dy = vec2(0.0);
  if (lod < 0.0) {
    dx = vec2(dFdx(coordinate.x), wrappedDerivative(dFdx(phase)) / (2.0 * PI));
    dy = vec2(dFdy(coordinate.x), wrappedDerivative(dFdy(phase)) / (2.0 * PI));
  }
  float clouds = turbulence(coordinate, dx, dy, lod);
  float filamentPhase = radius * 4.5 + phase * 3.0 + clouds * 2.0;
  float filamentWidth = 4.0;
  if (lod < 0.0) {
    filamentWidth = abs(4.5 * dFdx(radius) + 3.0 * wrappedDerivative(dFdx(phase)) + 2.0 * dFdx(clouds))
      + abs(4.5 * dFdy(radius) + 3.0 * wrappedDerivative(dFdy(phase)) + 2.0 * dFdy(clouds));
  }
  float filament = sin(filamentPhase) * exp(-0.5 * filamentWidth * filamentWidth);
  float broad = 0.5 + 0.5 * sin(phase * 2.0 + radius * 0.8);
  return mix(0.35, 1.6, smoothstep(0.22, 0.78, clouds)) * (0.8 + 0.2 * broad) * (1.0 + 0.28 * filament);
}

float diskTexture(float radius, float azimuth, float lod) {
  float angularVelocity = 1.0 / (pow(radius, 1.5) + spin);
  // Overlapping finite-lived eddies prevent differential shear accumulating into subpixel rings.
  float age = mod(elapsed, 96.0);
  float otherAge = mod(elapsed + 48.0, 96.0);
  float blend = 0.5 - 0.5 * cos(age * (2.0 * PI / 96.0));
  // Distinct seeds keep the two generations from showing the same eddies a fixed angle apart (a ghosted double image).
  float first = plasmaLayer(radius, azimuth - age * angularVelocity, vec2(0.0), lod);
  float second = plasmaLayer(radius, azimuth - otherAge * angularVelocity, vec2(0.37, 0.31), lod);
  return mix(second, first, blend);
}

vec3 emission(float radius, float azimuth, float energy, float angularMomentum, float observerEnergy, float lod) {
  float angularVelocity = 1.0 / (pow(radius, 1.5) + spin);
  float textureValue = diskTexture(radius, azimuth, lod);
  float lapseOrbit = sqrt(max(1.0 - 3.0 / radius + 2.0 * spin / pow(radius, 1.5), 0.001)) / (1.0 + spin / pow(radius, 1.5));
  float shift = clamp(observerEnergy * lapseOrbit / max(-energy + angularVelocity * angularMomentum, 0.03), 0.15, 2.4);
  float heat = pow(innerRadius / radius, 0.75) * pow(max(1.0 - sqrt(innerRadius / radius), 0.0), 0.25);
  float fade = smoothstep(innerRadius, innerRadius + 0.8, radius) * (1.0 - smoothstep(12.0, 20.0, radius));
  vec3 blue = vec3(0.12, 0.34, 0.85);
  vec3 white = vec3(0.76, 0.90, 1.0);
  vec3 spectrum = mix(blue, white, smoothstep(0.10, 0.55, heat * shift));
  float intensity = pow(heat, 2.2) * 11.0 * fade * textureValue * pow(shift, 2.5);
  return spectrum * intensity;
}

vec3 sky(vec3 direction) {
  float longitude = atan(direction.z, direction.x) / (2.0 * PI);
  vec2 coordinate = vec2(longitude + 0.5, acos(clamp(direction.y, -1.0, 1.0)) / PI);
  // Take longitude derivatives from whichever parameterisation is continuous here, so the wrap seam does not select a blurry mip.
  float shifted = fract(longitude + 1.0);
  vec2 dx = vec2(dFdx(coordinate.x), dFdx(coordinate.y));
  vec2 dy = vec2(dFdy(coordinate.x), dFdy(coordinate.y));
  float shiftedDx = dFdx(shifted);
  float shiftedDy = dFdy(shifted);
  if (abs(shiftedDx) < abs(dx.x)) dx.x = shiftedDx;
  if (abs(shiftedDy) < abs(dy.x)) dy.x = shiftedDy;
  return textureGrad(skyTexture, coordinate, dx, dy).rgb * 0.26;
}

void main() {
  // Mode 2 is an unlensed material atlas for GPU advection and angular-seam tests.
  if (debugMode == 2) {
    float radius = mix(innerRadius, 20.0, gl_FragCoord.y / resolution.y);
    float azimuth = gl_FragCoord.x / resolution.x * 2.0 * PI;
    gl_FragColor = vec4(vec3(diskTexture(radius, azimuth, -1.0) * 0.5), 1.0);
    return;
  }
  vec2 screen = (gl_FragCoord.xy / resolution * 2.0 - 1.0);
  screen.x *= resolution.x / resolution.y;
  screen = mat2(cos(cameraRoll), -sin(cameraRoll), sin(cameraRoll), cos(cameraRoll)) * screen;
  vec3 localRay = normalize(vec3(screen * tan(fieldOfView * 0.5), -1.0));
  localRay.yz = mat2(cos(lookPitch), -sin(lookPitch), sin(lookPitch), cos(lookPitch)) * localRay.yz;
  localRay.xz = mat2(cos(lookYaw), -sin(lookYaw), sin(lookYaw), cos(lookYaw)) * localRay.xz;
  float radius = observer.x;
  float sine = sin(observer.y);
  float cosine = cos(observer.y);
  float sigma = radius * radius + spin * spin * cosine * cosine;
  float delta = radius * radius - 2.0 * radius + spin * spin;
  float area = pow(radius * radius + spin * spin, 2.0) - spin * spin * delta * sine * sine;
  float lapse = sqrt(sigma * delta / area);
  float dragging = 2.0 * spin * radius / area;
  float angularMomentum = sqrt(area / sigma) * sine * localRay.x;
  float energy = -lapse + dragging * angularMomentum;
  float polarMomentum = -sqrt(sigma) * localRay.y;
  float polarBarrier = angularMomentum / sine - spin * energy * sine;
  // Rays that would skim the spin axis turn at sin(theta) ~ |L| / sqrt(K), deep inside the coordinate singularity.
  // Integrate them as exactly polar rays; the path differs by far less than a pixel and crosses the pole cleanly.
  if (abs(angularMomentum) < 0.004 * sqrt(polarMomentum * polarMomentum + polarBarrier * polarBarrier)) {
    localRay = normalize(vec3(0.0, localRay.yz));
    angularMomentum = 0.0;
    energy = -lapse;
    polarMomentum = -sqrt(sigma) * localRay.y;
  }
  vec4 state = vec4(radius, observer.y, sqrt(sigma / delta) * localRay.z, polarMomentum);
  float azimuth = observer.z;
  float horizon = 1.0 + sqrt(1.0 - spin * spin);
  // Innermost (prograde) spherical photon orbit: an infalling photon inside it has no radial turning point left.
  float photonFloor = 2.0 * (1.0 + cos(2.0 / 3.0 * acos(-spin)));
  vec3 radiance = vec3(0.0);
  bool diskHit = false;
  bool escaped = false;
  vec3 skyDirection = vec3(1.0, 0.0, 0.0);
  float diskRadius = innerRadius + 1.0;
  float diskAzimuth = azimuth;
  bool resolved = false;
  float crossings = 0.0;
  for (int iteration = 0; iteration < 400; iteration++) {
    if (iteration >= maxSteps) break;
    vec4 previous = state;
    float previousAzimuth = azimuth;
    float angularFirst;
    vec4 first = derivatives(state, energy, angularMomentum, angularFirst);
    float stride = clamp(stepScale * (state.x - horizon), 0.004, 12.0);
    stride = min(stride, 0.1 / max(max(abs(first.y), abs(angularFirst)), 0.000001));
    stride = min(stride, 0.28 * max(sin(state.y), 0.001) / max(abs(first.y), 0.000001));
    float angularSecond;
    vec4 second = derivatives(state + first * stride * 0.5, energy, angularMomentum, angularSecond);
    float angularThird;
    vec4 third = derivatives(state + second * stride * 0.5, energy, angularMomentum, angularThird);
    float angularFourth;
    vec4 fourth = derivatives(state + third * stride, energy, angularMomentum, angularFourth);
    state += stride / 6.0 * (first + 2.0 * second + 2.0 * third + fourth);
    azimuth += stride / 6.0 * (angularFirst + 2.0 * angularSecond + 2.0 * angularThird + angularFourth);
    if (state.y < 0.0) { state.y = -state.y; state.w = -state.w; azimuth += PI; }
    if (state.y > PI) { state.y = 2.0 * PI - state.y; state.w = -state.w; azimuth += PI; }
    state.y = clamp(state.y, 0.0001, PI - 0.0001);
    // A product test misses steps that land exactly on the float equator and lets the ray tunnel through the disk.
    if ((previous.y < PI * 0.5) != (state.y < PI * 0.5)) {
      crossings += 1.0;
      float fraction = (PI * 0.5 - previous.y) / (state.y - previous.y);
      float hitRadius = mix(previous.x, state.x, fraction);
      if (hitRadius > innerRadius && hitRadius < 20.0) {
        diskHit = true;
        diskRadius = hitRadius;
        diskAzimuth = mix(previousAzimuth, azimuth, fraction);
        resolved = true;
        break;
      }
    }
    // Frame dragging makes BL azimuth diverge at the horizon, so crawling the last stretch would starve the step budget.
    if (state.x < horizon + 0.035 || (state.x < photonFloor && state.z < 0.0)) { resolved = true; break; }
    if (state.x > 180.0) {
      skyDirection = vec3(sin(state.y) * cos(azimuth), cos(state.y), sin(state.y) * sin(azimuth));
      escaped = true;
      resolved = true;
      break;
    }
  }
  // Evaluate all texture derivatives outside the divergent ray traversal, where they are well defined.
  vec3 diskLight = emission(diskRadius, diskAzimuth, energy, angularMomentum, 1.0, -1.0);
  // Each further photon-ring image is ~e^pi thinner; from the fourth crossing on they are far below a pixel and a
  // single sample can only make them sparkle, so fade them out (order three, the visible thin arc, is untouched).
  diskLight *= exp(-2.0 * PI * max(crossings - 3.0, 0.0));
  vec3 starLight = sky(skyDirection);
  if (escaped) radiance = debugMode == 1 ? vec3(0.0, 0.0, 0.5) : starLight;
  if (diskHit) radiance = debugMode == 1 ? vec3(0.0, 0.7, 0.0) : diskLight;
  if (!resolved && debugMode == 1) radiance = vec3(1.0, 0.0, 1.0);
  gl_FragColor = vec4(radiance * exposure, 1.0);
}