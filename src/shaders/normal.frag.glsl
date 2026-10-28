precision highp float;
in vec2 vUv;
uniform sampler2D uHeight;
uniform sampler2D uCoverage;
uniform vec2 uTexel;
uniform float uStrength;
out vec4 frag;
void main(){
 if(texture(uCoverage,vUv).a<.5){frag=vec4(0.);return;}
 vec3 c=texture(uHeight,vUv).rgb;
 float l=texture(uHeight,vUv-vec2(uTexel.x,0.)).r;
 float r=texture(uHeight,vUv+vec2(uTexel.x,0.)).r;
 float b=texture(uHeight,vUv-vec2(0.,uTexel.y)).r;
 float t=texture(uHeight,vUv+vec2(0.,uTexel.y)).r;
 // Flat 0.5 in unpainted regions; finite differences create material relief.
 vec3 n=normalize(vec3((l-r)*uStrength,(b-t)*uStrength,1.));
 frag=vec4(n*.5+.5,1.);
}
